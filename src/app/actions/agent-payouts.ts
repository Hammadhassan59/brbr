'use server';

import { createServerClient } from '@/lib/supabase';
import { verifySession } from './auth';
import type { AgentPayout } from '@/types/sales';

async function requireSuperAdmin() {
  const s = await verifySession();
  if (!s || s.role !== 'super_admin') throw new Error('Unauthorized');
  return s;
}
async function requireSalesAgent() {
  const s = await verifySession();
  if (!s || s.role !== 'sales_agent' || !s.agentId) throw new Error('Unauthorized');
  return s;
}

export async function requestPayout(): Promise<{ data: AgentPayout | null; error: string | null }> {
  const session = await requireSalesAgent();
  const supabase = createServerClient();

  // 1. Find all available commissions (status='approved' AND payout_id IS NULL)
  const { data: rows, error: selErr } = await supabase
    .from('agent_commissions')
    .select('id, amount')
    .eq('agent_id', session.agentId!)
    .eq('status', 'approved')
    .is('payout_id', null);
  if (selErr) return { data: null, error: selErr.message };
  if (!rows || rows.length === 0) return { data: null, error: 'No commissions available to request' };

  const total = rows.reduce((s, r) => s + Number((r as { amount: number }).amount), 0);

  // 2. Create the payout row (partial unique index prevents duplicate open requests)
  const { data: payout, error: poErr } = await supabase
    .from('agent_payouts')
    .insert({
      agent_id: session.agentId!,
      requested_amount: total,
      status: 'requested',
    })
    .select()
    .single();
  if (poErr) {
    if (poErr.message.toLowerCase().includes('duplicate')) {
      return { data: null, error: 'You already have an open payout request' };
    }
    return { data: null, error: poErr.message };
  }

  // 3. Link commission rows to the payout
  const { error: linkErr } = await supabase
    .from('agent_commissions')
    .update({ payout_id: (payout as { id: string }).id })
    .eq('agent_id', session.agentId!)
    .eq('status', 'approved')
    .is('payout_id', null);
  if (linkErr) {
    // Best-effort rollback of the payout insert
    try { await supabase.from('agent_payouts').delete().eq('id', (payout as { id: string }).id); } catch {}
    return { data: null, error: linkErr.message };
  }

  return { data: payout as AgentPayout, error: null };
}

export async function listMyPayouts(): Promise<{ data: AgentPayout[]; error: string | null }> {
  const session = await requireSalesAgent();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('agent_payouts')
    .select('*')
    .eq('agent_id', session.agentId!)
    .order('requested_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data || []) as AgentPayout[], error: null };
}

export interface PayoutWithAgent extends AgentPayout {
  agent: { id: string; name: string } | null;
}

export async function listAllPayouts(
  filter?: { status?: AgentPayout['status'] | 'all' },
): Promise<{ data: PayoutWithAgent[]; error: string | null }> {
  await requireSuperAdmin();
  const supabase = createServerClient();
  let q = supabase
    .from('agent_payouts')
    .select('*, agent:sales_agents(id, name)')
    .order('requested_at', { ascending: false });
  if (filter?.status && filter.status !== 'all') q = q.eq('status', filter.status);
  const { data, error } = await q;
  if (error) return { data: [], error: error.message };
  return { data: (data || []) as PayoutWithAgent[], error: null };
}

export interface MarkPaidInput {
  paidAmount: number;
  method: 'bank' | 'jazzcash' | 'cash';
  reference: string | null;
  notes: string | null;
}

export async function markPayoutPaid(payoutId: string, input: MarkPaidInput): Promise<{ error: string | null }> {
  const session = await requireSuperAdmin();
  const supabase = createServerClient();

  const now = new Date().toISOString();

  const { error: poErr } = await supabase
    .from('agent_payouts')
    .update({
      status: 'paid',
      paid_amount: input.paidAmount,
      method: input.method,
      reference: input.reference,
      notes: input.notes,
      paid_at: now,
      paid_by: session.staffId,
    })
    .eq('id', payoutId);
  if (poErr) return { error: poErr.message };

  const { error: cErr } = await supabase
    .from('agent_commissions')
    .update({ status: 'paid', settled_at: now })
    .eq('payout_id', payoutId);
  return { error: cErr?.message ?? null };
}

export async function rejectPayout(payoutId: string, reason: string | null): Promise<{ error: string | null }> {
  await requireSuperAdmin();
  const supabase = createServerClient();

  const { error: poErr } = await supabase
    .from('agent_payouts')
    .update({ status: 'rejected', notes: reason })
    .eq('id', payoutId);
  if (poErr) return { error: poErr.message };

  // Unlink commission rows so they become available again
  const { error: cErr } = await supabase
    .from('agent_commissions')
    .update({ payout_id: null })
    .eq('payout_id', payoutId);
  return { error: cErr?.message ?? null };
}
