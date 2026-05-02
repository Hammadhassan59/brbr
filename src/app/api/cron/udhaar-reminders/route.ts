import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createServerClient } from '@/lib/supabase';
import { sendEmail } from '@/lib/email-sender';
import { udhaarOwnerSummaryEmail, type UdhaarClient } from '@/lib/email-templates';
import * as authAdmin from '@/app/actions/auth-admin';

// Weekly cron (Mondays). Systemd timer on the VPS calls:
//   curl -H "X-Cron-Secret: $CRON_SECRET" https://icut.pk/api/cron/udhaar-reminders
// Owner-facing: one summary per salon listing clients with udhaar_balance > 0,
// flagging those 2+ days away from the typical 30-day payment window.

export const dynamic = 'force-dynamic';

function secretsEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  const provided = req.headers.get('x-cron-secret');
  if (!provided || !secretsEqual(provided, secret)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createServerClient();

  const { data: emailSettings } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'email')
    .maybeSingle();
  const settings = (emailSettings?.value ?? {}) as {
    enabled?: boolean;
    enabledTemplates?: Record<string, boolean>;
  };
  if (!settings.enabled || settings.enabledTemplates?.udhaar_reminder === false) {
    return NextResponse.json({ skipped: true, reason: 'udhaar_reminder disabled in platform_settings' });
  }

  // Pull clients with a balance + their oldest udhaar-adding bill (to decide
  // "due soon" flag). A single query with a correlated subquery via the
  // bills join would be cleaner but PostgREST forces us to fetch bills
  // separately; we group in memory.
  const { data: clients, error: cErr } = await supabase
    .from('clients')
    .select('id, name, phone, salon_id, udhaar_balance')
    .gt('udhaar_balance', 0);
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  if (!clients || clients.length === 0) {
    return NextResponse.json({ processed: 0, sent: 0, message: 'No clients with udhaar' });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientIds = clients.map((c: any) => c.id);
  const { data: oldestBills } = await supabase
    .from('bills')
    .select('client_id, created_at')
    .in('client_id', clientIds)
    .gt('udhaar_added', 0)
    .order('created_at', { ascending: true });

  // Map client_id -> earliest created_at of a bill with udhaar_added > 0.
  const oldestMap = new Map<string, string>();
  for (const b of (oldestBills ?? []) as Array<{ client_id: string; created_at: string }>) {
    if (!oldestMap.has(b.client_id)) oldestMap.set(b.client_id, b.created_at);
  }
  const now = Date.now();
  const daysSince = (ts: string | undefined) => ts
    ? Math.floor((now - new Date(ts).getTime()) / (24 * 60 * 60 * 1000))
    : 0;

  // Group clients by salon.
  const bySalon = new Map<string, UdhaarClient[]>();
  for (const c of clients as Array<{ id: string; name: string; phone: string | null; salon_id: string; udhaar_balance: number }>) {
    const entry: UdhaarClient = {
      name: c.name || 'Client',
      phone: c.phone,
      balance: Number(c.udhaar_balance),
      oldestDays: daysSince(oldestMap.get(c.id)),
    };
    if (!bySalon.has(c.salon_id)) bySalon.set(c.salon_id, []);
    bySalon.get(c.salon_id)!.push(entry);
  }

  const salonIds = Array.from(bySalon.keys());
  const { data: salons } = await supabase
    .from('salons')
    .select('id, name, owner_id, last_udhaar_reminder_at')
    .in('id', salonIds);

  const today = new Date().toISOString().slice(0, 10);
  const results: Array<{ salonId: string; sent: boolean; error: string | null; clientCount: number }> = [];

  for (const salon of (salons ?? []) as Array<{ id: string; name: string; owner_id: string; last_udhaar_reminder_at: string | null }>) {
    if (!salon.owner_id) { results.push({ salonId: salon.id, sent: false, error: 'No owner', clientCount: 0 }); continue; }

    // Only fire once per 6 days per salon to avoid weekly drift when the
    // cron slips a day.
    if (salon.last_udhaar_reminder_at) {
      const daysSinceLast = daysSince(salon.last_udhaar_reminder_at);
      if (daysSinceLast < 6) {
        results.push({ salonId: salon.id, sent: false, error: `Last sent ${daysSinceLast}d ago`, clientCount: 0 });
        continue;
      }
    }

    const list = bySalon.get(salon.id) ?? [];
    // Sort: due-soon first, then by balance descending.
    list.sort((a, b) => (b.oldestDays - a.oldestDays) || (b.balance - a.balance));
    const totalBalance = list.reduce((n, c) => n + c.balance, 0);

    try {
      const { data: authData } = await authAdmin.getUserById(salon.owner_id);
      const ownerEmail = authData?.user?.email;
      if (!ownerEmail) {
        results.push({ salonId: salon.id, sent: false, error: 'No owner email', clientCount: list.length });
        continue;
      }
      const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/clients`
        : 'https://icut.pk/dashboard/clients';
      const res = await sendEmail(
        ownerEmail,
        `iCut \u2014 Udhaar summary: ${list.length} client${list.length === 1 ? '' : 's'} owe Rs ${totalBalance.toLocaleString('en-PK')}`,
        udhaarOwnerSummaryEmail({ salonName: salon.name, dashboardUrl, clients: list, totalBalance }),
      );
      if (res.sent) {
        await supabase.from('salons').update({ last_udhaar_reminder_at: today }).eq('id', salon.id);
      }
      results.push({ salonId: salon.id, sent: res.sent, error: res.error, clientCount: list.length });
    } catch (err) {
      results.push({
        salonId: salon.id,
        sent: false,
        error: err instanceof Error ? err.message : 'Unknown',
        clientCount: list.length,
      });
    }
  }

  return NextResponse.json({
    processed: results.length,
    sent: results.filter((r) => r.sent).length,
    failed: results.filter((r) => !r.sent && !(r.error ?? '').includes('Last sent')).length,
    results,
  });
}
