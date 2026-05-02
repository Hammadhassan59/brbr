import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createServerClient } from '@/lib/supabase';
import { sendEmail } from '@/lib/email-sender';
import { planRenewalReminderEmail } from '@/lib/email-templates';
import * as authAdmin from '@/app/actions/auth-admin';

// Constant-time comparison so the secret can't be recovered by measuring
// how fast the naive `!==` check bails out on the first differing byte.
function secretsEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// Run daily via systemd timer on the Hetzner box.
// Call: curl -H "X-Cron-Secret: <secret>" https://icut.pk/api/cron/renewal-reminders
// The shared secret lives in env as CRON_SECRET. Any request without a matching
// header is rejected, so the route is safe to expose publicly.

export const dynamic = 'force-dynamic';

interface SalonRow {
  id: string;
  name: string | null;
  owner_id: string | null;
  subscription_plan: string | null;
  subscription_status: string | null;
  subscription_expires_at: string | null;
  renewal_reminder_sent_t7: string | null;
  renewal_reminder_sent_t3: string | null;
  renewal_reminder_sent_t0: string | null;
}

const PLAN_DEFAULTS: Record<string, number> = {
  basic: 2500,
  growth: 5000,
  pro: 9000,
};

async function lookupPlanPrice(plan: string): Promise<number> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'plans')
    .maybeSingle();
  if (data?.value) {
    const plans = data.value as Record<string, { price?: number }>;
    const price = Number(plans[plan]?.price);
    if (!Number.isNaN(price) && price > 0) return price;
  }
  return PLAN_DEFAULTS[plan] ?? 0;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const provided = req.headers.get('x-cron-secret');
  if (!provided || !secretsEqual(provided, secret)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createServerClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10); // YYYY-MM-DD UTC

  const { data: salons, error } = await supabase
    .from('salons')
    .select('id, name, owner_id, subscription_plan, subscription_status, subscription_expires_at, renewal_reminder_sent_t7, renewal_reminder_sent_t3, renewal_reminder_sent_t0')
    .in('subscription_status', ['active', 'expired'])
    .not('subscription_expires_at', 'is', null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{ salonId: string; stage: string; sent: boolean; error: string | null }> = [];

  for (const salon of (salons ?? []) as SalonRow[]) {
    if (!salon.owner_id || !salon.subscription_expires_at || !salon.subscription_plan) continue;
    if (salon.subscription_plan === 'none') continue;

    const expiresAt = new Date(salon.subscription_expires_at);
    const expiryDate = expiresAt.toISOString().slice(0, 10);
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysUntilExpiry = Math.ceil((expiresAt.getTime() - now.getTime()) / msPerDay);

    // Decide which stage, if any, should fire today.
    let stage: 't7' | 't3' | 't0' | null = null;
    if (daysUntilExpiry === 7 && salon.renewal_reminder_sent_t7 !== expiryDate) {
      stage = 't7';
    } else if (daysUntilExpiry <= 3 && daysUntilExpiry > 0 && salon.renewal_reminder_sent_t3 !== expiryDate) {
      stage = 't3';
    } else if (daysUntilExpiry <= 0 && salon.renewal_reminder_sent_t0 !== expiryDate) {
      stage = 't0';
    }

    if (!stage) continue;

    try {
      const { data: authData } = await authAdmin.getUserById(salon.owner_id);
      const ownerEmail = authData?.user?.email;
      if (!ownerEmail) {
        results.push({ salonId: salon.id, stage, sent: false, error: 'No owner email' });
        continue;
      }

      const priceRs = await lookupPlanPrice(salon.subscription_plan);
      const expiresOn = expiresAt.toLocaleDateString('en-PK', { year: 'numeric', month: 'long', day: 'numeric' });
      const renewUrl = process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?tab=billing`
        : 'https://icut.pk/dashboard/settings?tab=billing';

      const subject = daysUntilExpiry > 0
        ? `iCut — Your ${salon.subscription_plan} plan renews in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'}`
        : `iCut — Your ${salon.subscription_plan} plan has expired`;

      const res = await sendEmail(
        ownerEmail,
        subject,
        planRenewalReminderEmail({
          salonName: salon.name || 'your salon',
          planName: salon.subscription_plan,
          priceRs,
          daysUntilExpiry,
          expiresOn,
          renewUrl,
        }),
      );

      if (res.sent) {
        const column =
          stage === 't7' ? 'renewal_reminder_sent_t7'
          : stage === 't3' ? 'renewal_reminder_sent_t3'
          : 'renewal_reminder_sent_t0';
        await supabase.from('salons').update({ [column]: expiryDate }).eq('id', salon.id);
      }

      results.push({ salonId: salon.id, stage, sent: res.sent, error: res.error });
    } catch (err) {
      results.push({
        salonId: salon.id,
        stage,
        sent: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return NextResponse.json({
    today,
    processed: results.length,
    sent: results.filter((r) => r.sent).length,
    failed: results.filter((r) => !r.sent).length,
    results,
  });
}
