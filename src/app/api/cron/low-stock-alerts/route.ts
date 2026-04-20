import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createServerClient } from '@/lib/supabase';
import { sendEmail } from '@/lib/email-sender';
import { lowStockAlertEmail, type LowStockBranch } from '@/lib/email-templates';

// Daily cron. Systemd timer on the VPS calls:
//   curl -H "X-Cron-Secret: $CRON_SECRET" https://icut.pk/api/cron/low-stock-alerts
// Shared secret from env. Any request without a matching header is 403.

export const dynamic = 'force-dynamic';

function secretsEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

interface Row {
  branch_id: string;
  current_stock: number;
  low_stock_threshold: number;
  product: { id: string; name: string; salon_id: string } | null;
  branch: { id: string; name: string; salon_id: string } | null;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  const provided = req.headers.get('x-cron-secret');
  if (!provided || !secretsEqual(provided, secret)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createServerClient();

  // Respect the super-admin kill switch.
  const { data: emailSettings } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'email')
    .maybeSingle();
  const settings = (emailSettings?.value ?? {}) as {
    enabled?: boolean;
    enabledTemplates?: Record<string, boolean>;
  };
  if (!settings.enabled || settings.enabledTemplates?.low_stock_alert === false) {
    return NextResponse.json({ skipped: true, reason: 'low_stock_alert disabled in platform_settings' });
  }

  // Pull every branch_products row at or below its threshold. Client-side
  // filter (vs. a comparison between two columns) keeps the query simple.
  const { data: rows, error } = await supabase
    .from('branch_products')
    .select(`
      branch_id,
      current_stock,
      low_stock_threshold,
      product:products!inner (id, name, salon_id),
      branch:branches!inner (id, name, salon_id)
    `)
    .order('current_stock', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const lowRows = ((rows ?? []) as unknown as Row[]).filter(
    (r) => Number(r.current_stock) <= Number(r.low_stock_threshold),
  );
  if (lowRows.length === 0) {
    return NextResponse.json({ processed: 0, sent: 0, message: 'No low-stock items anywhere' });
  }

  // Group: salon_id -> Map<branchId, {name, products}>
  const bySalon = new Map<string, Map<string, LowStockBranch>>();
  for (const r of lowRows) {
    if (!r.product || !r.branch) continue;
    const salonId = r.branch.salon_id;
    if (!bySalon.has(salonId)) bySalon.set(salonId, new Map());
    const branches = bySalon.get(salonId)!;
    const branchKey = r.branch.id;
    if (!branches.has(branchKey)) {
      branches.set(branchKey, { branchName: r.branch.name, products: [] });
    }
    branches.get(branchKey)!.products.push({
      name: r.product.name,
      stock: Number(r.current_stock),
      threshold: Number(r.low_stock_threshold),
    });
  }

  // Load salon rows for name + owner_id.
  const salonIds = Array.from(bySalon.keys());
  const { data: salons } = await supabase
    .from('salons')
    .select('id, name, owner_id, last_low_stock_alert_at')
    .in('id', salonIds);

  const today = new Date().toISOString().slice(0, 10);
  const results: Array<{ salonId: string; sent: boolean; error: string | null; productCount: number }> = [];

  for (const salon of (salons ?? []) as Array<{ id: string; name: string; owner_id: string; last_low_stock_alert_at: string | null }>) {
    if (!salon.owner_id) { results.push({ salonId: salon.id, sent: false, error: 'No owner', productCount: 0 }); continue; }
    if (salon.last_low_stock_alert_at === today) {
      results.push({ salonId: salon.id, sent: false, error: 'Already alerted today', productCount: 0 });
      continue;
    }

    const branchMap = bySalon.get(salon.id);
    if (!branchMap) continue;
    const branches = Array.from(branchMap.values());
    const totalCount = branches.reduce((n, b) => n + b.products.length, 0);

    try {
      const { data: authData } = await supabase.auth.admin.getUserById(salon.owner_id);
      const ownerEmail = authData?.user?.email;
      if (!ownerEmail) {
        results.push({ salonId: salon.id, sent: false, error: 'No owner email', productCount: totalCount });
        continue;
      }
      const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/inventory`
        : 'https://icut.pk/dashboard/inventory';
      const res = await sendEmail(
        ownerEmail,
        `iCut \u2014 ${totalCount} product${totalCount === 1 ? '' : 's'} below stock at ${salon.name}`,
        lowStockAlertEmail({ salonName: salon.name, dashboardUrl, branches, totalCount }),
      );
      if (res.sent) {
        await supabase.from('salons').update({ last_low_stock_alert_at: today }).eq('id', salon.id);
      }
      results.push({ salonId: salon.id, sent: res.sent, error: res.error, productCount: totalCount });
    } catch (err) {
      results.push({
        salonId: salon.id,
        sent: false,
        error: err instanceof Error ? err.message : 'Unknown',
        productCount: totalCount,
      });
    }
  }

  return NextResponse.json({
    processed: results.length,
    sent: results.filter((r) => r.sent).length,
    failed: results.filter((r) => !r.sent && r.error !== 'Already alerted today').length,
    results,
  });
}
