import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createServerClient } from '@/lib/supabase';
import { getDemoSeed } from '@/lib/demo-agent-seed';
import { getDemoSalonSeed } from '@/lib/demo-salon-seed';
import { DEMO_SALON_ID, DEMO_BRANCH_ID } from '@/lib/demo-salon-constants';

// Constant-time comparison so the secret can't be recovered by measuring
// how fast the naive `!==` check bails out on the first differing byte.
function secretsEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Wipes and reseeds the shared demo salon's operational data (appointments,
 * bills, cash drawer, attendance, expenses, udhaar/advances, stock
 * movements). Catalog rows (salon, branch, staff, clients, services,
 * products) are left alone — they were bootstrapped by
 * migration 032_demo_salon.sql and intentionally stay stable across ticks.
 *
 * Runs once per cron tick, independent of the per-agent wipe below, so the
 * demo salon reseeds even when no demo agents exist.
 */
async function resetDemoSalon(
  supabase: ReturnType<typeof createServerClient>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    // ── Wipe ──────────────────────────────────────────────────────────
    // Order matters: children before parents so NO ACTION FKs clear cleanly.
    // Pull product + staff + client ids once; we scope a few tables via them.
    const [{ data: productRows }, { data: staffRows }, { data: clientRows }] = await Promise.all([
      supabase.from('products').select('id').eq('salon_id', DEMO_SALON_ID),
      supabase.from('staff').select('id').eq('salon_id', DEMO_SALON_ID),
      supabase.from('clients').select('id').eq('salon_id', DEMO_SALON_ID),
    ]);
    const productIds = (productRows || []).map((r: { id: string }) => r.id);
    const staffIds = (staffRows || []).map((r: { id: string }) => r.id);
    const clientIds = (clientRows || []).map((r: { id: string }) => r.id);

    // tips → bills (bill FK), appointment_services → appointments cascade.
    if (staffIds.length) {
      await supabase.from('tips').delete().in('staff_id', staffIds);
      await supabase.from('advances').delete().in('staff_id', staffIds);
    }
    await supabase.from('bills').delete().eq('salon_id', DEMO_SALON_ID);
    await supabase.from('appointments').delete().eq('salon_id', DEMO_SALON_ID);
    await supabase.from('cash_drawers').delete().eq('branch_id', DEMO_BRANCH_ID);
    await supabase.from('attendance').delete().eq('branch_id', DEMO_BRANCH_ID);
    await supabase.from('expenses').delete().eq('branch_id', DEMO_BRANCH_ID);
    if (clientIds.length) {
      await supabase.from('udhaar_payments').delete().in('client_id', clientIds);
    }
    if (productIds.length) {
      await supabase.from('stock_movements').delete().in('product_id', productIds);
    }

    // ── Reseed ────────────────────────────────────────────────────────
    const seed = getDemoSalonSeed();
    if (seed.appointments.length) await supabase.from('appointments').insert(seed.appointments);
    if (seed.appointmentServices.length) await supabase.from('appointment_services').insert(seed.appointmentServices);
    if (seed.bills.length) await supabase.from('bills').insert(seed.bills);
    if (seed.billItems.length) await supabase.from('bill_items').insert(seed.billItems);
    if (seed.tips.length) await supabase.from('tips').insert(seed.tips);
    if (seed.cashDrawers.length) await supabase.from('cash_drawers').insert(seed.cashDrawers);
    if (seed.attendance.length) await supabase.from('attendance').insert(seed.attendance);
    if (seed.expenses.length) await supabase.from('expenses').insert(seed.expenses);
    if (seed.udhaarPayments.length) await supabase.from('udhaar_payments').insert(seed.udhaarPayments);
    if (seed.advances.length) await supabase.from('advances').insert(seed.advances);
    if (seed.stockMovements.length) await supabase.from('stock_movements').insert(seed.stockMovements);

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' };
  }
}

/**
 * Wipes and reseeds every active demo sales-agent's dataset. Triggered by a
 * systemd timer on the VPS every 10 minutes (mirrors the renewal-reminders
 * pattern; same X-Cron-Secret header). Idempotent — running twice in a row
 * produces the same final state.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const secret = req.headers.get('x-cron-secret');
  if (!expected || !secret || !secretsEqual(secret, expected)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const supabase = createServerClient();

  // Shared demo salon reset runs independently of the per-agent loop below —
  // the demo salon must be fresh even if there are no demo agents today.
  const demoSalonResult = await resetDemoSalon(supabase);

  const { data: demoAgents, error: lookupErr } = await supabase
    .from('sales_agents')
    .select('id')
    .eq('is_demo', true)
    .eq('active', true);

  if (lookupErr) {
    return NextResponse.json({ error: lookupErr.message, demoSalon: demoSalonResult }, { status: 500 });
  }

  const results: Array<{ agentId: string; ok: boolean; error?: string }> = [];

  for (const agent of demoAgents || []) {
    const agentId = agent.id;
    try {
      // Wipe in FK-safe order. Anything pointing at the demo agent (or its
      // seeded salons) goes first; the salons + leads themselves go last.
      await supabase.from('agent_payouts').delete().eq('agent_id', agentId);
      await supabase.from('agent_commissions').delete().eq('agent_id', agentId);
      const { data: oldSalons } = await supabase
        .from('salons')
        .select('id')
        .eq('sold_by_agent_id', agentId);
      const oldSalonIds = (oldSalons || []).map((s: { id: string }) => s.id);
      if (oldSalonIds.length) {
        await supabase.from('payment_requests').delete().in('salon_id', oldSalonIds);
        await supabase.from('salons').delete().in('id', oldSalonIds);
      }
      await supabase.from('leads').delete().eq('assigned_agent_id', agentId);

      // Reseed
      const seed = getDemoSeed(agentId);
      if (seed.salons.length) await supabase.from('salons').insert(seed.salons);
      if (seed.paymentRequests.length) await supabase.from('payment_requests').insert(seed.paymentRequests);
      if (seed.commissions.length) await supabase.from('agent_commissions').insert(seed.commissions);
      if (seed.payouts.length) await supabase.from('agent_payouts').insert(seed.payouts);
      if (seed.leads.length) await supabase.from('leads').insert(seed.leads);

      results.push({ agentId, ok: true });
    } catch (err) {
      results.push({ agentId, ok: false, error: err instanceof Error ? err.message : 'unknown' });
    }
  }

  return NextResponse.json({
    ok: true,
    count: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
    demoSalon: demoSalonResult,
  });
}
