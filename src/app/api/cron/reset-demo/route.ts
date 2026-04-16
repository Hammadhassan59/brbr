import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createServerClient } from '@/lib/supabase';
import { getDemoSeed } from '@/lib/demo-agent-seed';

// Constant-time comparison so the secret can't be recovered by measuring
// how fast the naive `!==` check bails out on the first differing byte.
function secretsEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
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

  const { data: demoAgents, error: lookupErr } = await supabase
    .from('sales_agents')
    .select('id')
    .eq('is_demo', true)
    .eq('active', true);

  if (lookupErr) {
    return NextResponse.json({ error: lookupErr.message }, { status: 500 });
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
  });
}
