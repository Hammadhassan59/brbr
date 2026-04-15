'use server';

import { createServerClient } from '@/lib/supabase';
import { verifySession } from './auth';
import type { AgentCommission } from '@/types/sales';

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

export interface AccrueInput {
  paymentRequestId: string;
  salonId: string;
  amount: number;
}

/**
 * Called from approvePaymentRequest AFTER the payment is approved.
 * If the salon has sold_by_agent_id, inserts an agent_commissions row.
 * first_sale vs renewal is determined by whether this is the first approved
 * payment_request for that salon (count <= 1 means this is the first).
 */
export async function accrueCommissionForPaymentRequest(
  input: AccrueInput,
): Promise<{ data: AgentCommission | null; error: string | null }> {
  const supabase = createServerClient();

  const { data: salon, error: salonErr } = await supabase
    .from('salons')
    .select('id, sold_by_agent_id')
    .eq('id', input.salonId)
    .maybeSingle();
  if (salonErr) return { data: null, error: salonErr.message };
  if (!salon?.sold_by_agent_id) return { data: null, error: null };

  const { data: agent, error: agentErr } = await supabase
    .from('sales_agents')
    .select('first_sale_pct, renewal_pct')
    .eq('id', salon.sold_by_agent_id)
    .maybeSingle();
  if (agentErr) return { data: null, error: agentErr.message };
  if (!agent) return { data: null, error: null };

  const { count } = await supabase
    .from('payment_requests')
    .select('id', { count: 'exact', head: true })
    .eq('salon_id', input.salonId)
    .eq('status', 'approved');

  const kind: 'first_sale' | 'renewal' = (count ?? 0) <= 1 ? 'first_sale' : 'renewal';
  const pct = kind === 'first_sale' ? Number(agent.first_sale_pct) : Number(agent.renewal_pct);
  const amount = Math.round((input.amount * pct) / 100 * 100) / 100;

  const { data, error } = await supabase
    .from('agent_commissions')
    .insert({
      agent_id: salon.sold_by_agent_id,
      salon_id: input.salonId,
      payment_request_id: input.paymentRequestId,
      kind,
      base_amount: input.amount,
      pct,
      amount,
      status: 'approved',
    })
    .select()
    .single();
  if (error) return { data: null, error: error.message };
  return { data: data as AgentCommission, error: null };
}

export interface AgentCommissionWithSalon extends AgentCommission {
  salon: { name: string } | null;
}

export async function listMyCommissions(): Promise<{ data: AgentCommissionWithSalon[]; error: string | null }> {
  const session = await requireSalesAgent();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('agent_commissions')
    .select('*, salon:salons(name)')
    .eq('agent_id', session.agentId!)
    .order('created_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data || []) as AgentCommissionWithSalon[], error: null };
}

export interface MySalonRow {
  id: string;
  name: string;
  subscription_plan: string | null;
  subscription_status: string | null;
  subscription_expires_at: string | null;
  lifetime_commission: number;
}

export async function listMySalons(): Promise<{ data: MySalonRow[]; error: string | null }> {
  const session = await requireSalesAgent();
  const supabase = createServerClient();
  const { data: salons, error } = await supabase
    .from('salons')
    .select('id, name, subscription_plan, subscription_status, subscription_expires_at')
    .eq('sold_by_agent_id', session.agentId!);
  if (error) return { data: [], error: error.message };

  const { data: commissions } = await supabase
    .from('agent_commissions')
    .select('salon_id, amount, status')
    .eq('agent_id', session.agentId!)
    .in('status', ['approved', 'paid']);

  const totals: Record<string, number> = {};
  for (const c of commissions || []) {
    const row = c as { salon_id: string; amount: number };
    totals[row.salon_id] = (totals[row.salon_id] || 0) + Number(row.amount);
  }
  return {
    data: (salons || []).map(s => ({
      id: (s as MySalonRow).id,
      name: (s as MySalonRow).name,
      subscription_plan: (s as MySalonRow).subscription_plan,
      subscription_status: (s as MySalonRow).subscription_status,
      subscription_expires_at: (s as MySalonRow).subscription_expires_at,
      lifetime_commission: totals[(s as MySalonRow).id] || 0,
    })),
    error: null,
  };
}

export interface AgentCommissionAudit extends AgentCommission {
  salon: { name: string } | null;
  agent: { name: string } | null;
}

export async function listAllCommissions(
  filter?: { agentId?: string; status?: AgentCommission['status'] | 'all' },
): Promise<{ data: AgentCommissionAudit[]; error: string | null }> {
  await requireSuperAdmin();
  const supabase = createServerClient();
  let q = supabase
    .from('agent_commissions')
    .select('*, salon:salons(name), agent:sales_agents(name)')
    .order('created_at', { ascending: false });
  if (filter?.agentId) q = q.eq('agent_id', filter.agentId);
  if (filter?.status && filter.status !== 'all') q = q.eq('status', filter.status);
  const { data, error } = await q;
  if (error) return { data: [], error: error.message };
  return { data: (data || []) as AgentCommissionAudit[], error: null };
}

/**
 * Called when a payment is reversed. Marks any commission rows tied to that
 * payment_request as reversed. For rows already paid, the reversal is
 * informational — they stay in the paid payout but the row status flips to
 * 'reversed', producing a visible negative balance in the agent's ledger.
 */
export async function reverseCommissionsForPaymentRequest(
  paymentRequestId: string,
): Promise<{ error: string | null }> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from('agent_commissions')
    .update({ status: 'reversed' })
    .eq('payment_request_id', paymentRequestId);
  return { error: error?.message ?? null };
}
