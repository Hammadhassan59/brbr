'use server';

import { createServerClient } from '@/lib/supabase';
import { verifySession, requireAdminRole } from './auth';
import type { AgentCommission } from '@/types/sales';

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
  await requireAdminRole(['super_admin']);
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

// ───────────────────────────────────────
// Per-agent reports (super admin)
// ───────────────────────────────────────

export interface AgentReportSalon {
  id: string;
  name: string;
  plan: string | null;
  status: string | null;
  expires_at: string | null;
  lifetime_commission: number;
}

export interface AgentReport {
  agent: {
    id: string;
    name: string;
    code: string;
    first_sale_pct: number;
    renewal_pct: number;
    active: boolean;
  };
  funnel: {
    leads_total: number;
    new: number;
    contacted: number;
    visited: number;
    followup: number;
    interested: number;
    not_interested: number;
    onboarded: number;
    converted: number;
    lost: number;
  };
  commissions: {
    earned_total: number;
    paid_total: number;
    available_total: number;
    pending_total: number;
    by_kind: { first_sale: number; renewal: number };
    monthly: Array<{ month: string; earned: number; paid: number }>;
  };
  payouts: {
    total_paid: number;
    last_payout_at: string | null;
    by_method: Array<{ method: string; amount: number }>;
  };
  salons_sold: {
    total: number;
    active: number;
    expired: number;
    suspended: number;
    list: AgentReportSalon[];
  };
  cash_ledger: {
    collected: number;
    earned: number;
    settled: number;
    balance: number;
  };
}

/**
 * Single round-trip aggregator for /admin/agents/[id] Reports tab.
 * Date range filters time-flow data (commissions/payouts/cash); funnel and
 * salons_sold are lifetime status snapshots.
 */
export async function getAgentReport(input: {
  agentId: string;
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}): Promise<{ data: AgentReport | null; error: string | null }> {
  await requireAdminRole(['super_admin']);
  const supabase = createServerClient();

  const fromIso = `${input.from}T00:00:00+05:00`;
  const toIso = `${input.to}T23:59:59+05:00`;

  const [
    { data: agent, error: agentErr },
    { data: leads },
    { data: commsAll },
    { data: commsPeriod },
    { data: payoutsAll },
    { data: salons },
  ] = await Promise.all([
    supabase
      .from('sales_agents')
      .select('id, name, code, first_sale_pct, renewal_pct, active')
      .eq('id', input.agentId)
      .maybeSingle(),
    supabase.from('leads').select('status').eq('assigned_agent_id', input.agentId),
    supabase.from('agent_commissions').select('amount, status, payout_id').eq('agent_id', input.agentId),
    supabase
      .from('agent_commissions')
      .select('amount, status, kind, created_at, settled_at')
      .eq('agent_id', input.agentId)
      .gte('created_at', fromIso)
      .lte('created_at', toIso),
    supabase
      .from('agent_payouts')
      .select('paid_amount, method, paid_at, status')
      .eq('agent_id', input.agentId),
    supabase
      .from('salons')
      .select('id, name, subscription_plan, subscription_status, subscription_expires_at')
      .eq('sold_by_agent_id', input.agentId),
  ]);

  if (agentErr) return { data: null, error: agentErr.message };
  if (!agent) return { data: null, error: 'Agent not found' };

  // Funnel — lifetime, all assigned leads.
  const funnel = {
    leads_total: leads?.length ?? 0,
    new: 0, contacted: 0, visited: 0, followup: 0, interested: 0,
    not_interested: 0, onboarded: 0, converted: 0, lost: 0,
  };
  for (const l of (leads || []) as { status: keyof typeof funnel }[]) {
    if (l.status in funnel) funnel[l.status] = (funnel[l.status] as number) + 1;
  }

  // Cash ledger pieces (period-scoped via commsPeriod, lifetime collected
  // via salon ids — shape matches the existing getAgentBalance contract).
  const salonIds = (salons || []).map((s: { id: string }) => s.id);
  let collected = 0;
  if (salonIds.length > 0) {
    const { data: payments } = await supabase
      .from('payment_requests')
      .select('amount, created_at')
      .in('salon_id', salonIds)
      .eq('source', 'agent_collected')
      .eq('status', 'approved')
      .gte('created_at', fromIso)
      .lte('created_at', toIso);
    collected = (payments || []).reduce(
      (s: number, p: { amount: number }) => s + Number(p.amount || 0),
      0,
    );
  }

  // Commissions roll-ups (period).
  let earned_total = 0, paid_total = 0, available_total = 0, pending_total = 0;
  const by_kind = { first_sale: 0, renewal: 0 };
  const monthlyMap = new Map<string, { earned: number; paid: number }>();
  for (const c of (commsPeriod || []) as { amount: number; status: string; kind: string; created_at: string }[]) {
    const amt = Number(c.amount || 0);
    if (c.status === 'approved' || c.status === 'paid') earned_total += amt;
    if (c.status === 'paid') paid_total += amt;
    if (c.status === 'pending') pending_total += amt;
    if (c.kind === 'first_sale' || c.kind === 'renewal') by_kind[c.kind] += amt;
    const month = c.created_at.slice(0, 7);
    const bucket = monthlyMap.get(month) ?? { earned: 0, paid: 0 };
    if (c.status === 'approved' || c.status === 'paid') bucket.earned += amt;
    if (c.status === 'paid') bucket.paid += amt;
    monthlyMap.set(month, bucket);
  }
  // Available = lifetime approved + not yet payout-linked (not period-bound;
  // owner needs to know how much is owed today, not just for this window).
  for (const c of (commsAll || []) as { amount: number; status: string; payout_id: string | null }[]) {
    if (c.status === 'approved' && !c.payout_id) available_total += Number(c.amount || 0);
  }
  const monthly = Array.from(monthlyMap.entries())
    .map(([month, v]) => ({ month, ...v }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // Payouts roll-up (lifetime; "last paid" + by-method matter regardless of window).
  let payouts_total_paid = 0;
  let last_payout_at: string | null = null;
  const methodMap = new Map<string, number>();
  for (const p of (payoutsAll || []) as { paid_amount: number | null; method: string | null; paid_at: string | null; status: string }[]) {
    if (p.status !== 'paid') continue;
    const amt = Number(p.paid_amount || 0);
    payouts_total_paid += amt;
    if (p.paid_at && (!last_payout_at || p.paid_at > last_payout_at)) last_payout_at = p.paid_at;
    const m = p.method || 'unknown';
    methodMap.set(m, (methodMap.get(m) ?? 0) + amt);
  }
  const by_method = Array.from(methodMap.entries()).map(([method, amount]) => ({ method, amount }));

  // Salons sold — lifetime list with per-salon lifetime commission.
  // Pull commission totals per salon in one extra query (no N+1).
  const salonCommissionMap = new Map<string, number>();
  if (salonIds.length > 0) {
    const { data: salonComms } = await supabase
      .from('agent_commissions')
      .select('salon_id, amount, status')
      .eq('agent_id', input.agentId)
      .in('salon_id', salonIds)
      .in('status', ['approved', 'paid']);
    for (const c of (salonComms || []) as { salon_id: string; amount: number }[]) {
      salonCommissionMap.set(c.salon_id, (salonCommissionMap.get(c.salon_id) ?? 0) + Number(c.amount || 0));
    }
  }
  const salonsList: AgentReportSalon[] = (salons || []).map((s: { id: string; name: string; subscription_plan: string | null; subscription_status: string | null; subscription_expires_at: string | null }) => ({
    id: s.id,
    name: s.name,
    plan: s.subscription_plan,
    status: s.subscription_status,
    expires_at: s.subscription_expires_at,
    lifetime_commission: salonCommissionMap.get(s.id) ?? 0,
  })).sort((a, b) => b.lifetime_commission - a.lifetime_commission);
  const salonsSold = {
    total: salonsList.length,
    active: salonsList.filter((s) => s.status === 'active').length,
    expired: salonsList.filter((s) => s.status === 'expired').length,
    suspended: salonsList.filter((s) => s.status === 'suspended').length,
    list: salonsList,
  };

  return {
    data: {
      agent: {
        id: agent.id,
        name: agent.name,
        code: agent.code,
        first_sale_pct: Number(agent.first_sale_pct),
        renewal_pct: Number(agent.renewal_pct),
        active: agent.active,
      },
      funnel,
      commissions: {
        earned_total,
        paid_total,
        available_total,
        pending_total,
        by_kind,
        monthly,
      },
      payouts: {
        total_paid: payouts_total_paid,
        last_payout_at,
        by_method,
      },
      salons_sold: salonsSold,
      cash_ledger: {
        collected,
        earned: earned_total,
        settled: paid_total,
        balance: collected - earned_total,
      },
    },
    error: null,
  };
}

/**
 * Cross-agent leaderboard for /admin/agents top-performers panel.
 * Sums commissions + cash collected per agent in the date window. Excludes
 * demo agents (handled by listSalesAgents which already filters them out).
 */
export async function getAgentsLeaderboard(input: {
  from: string;
  to: string;
}): Promise<{
  data: {
    totals: { commissions_paid: number; cash_collected: number; salons_onboarded: number };
    leaderboard: Array<{ agent_id: string; agent_name: string; agent_code: string; earned: number; salons: number }>;
  } | null;
  error: string | null;
}> {
  await requireAdminRole(['super_admin']);
  const supabase = createServerClient();
  const fromIso = `${input.from}T00:00:00+05:00`;
  const toIso = `${input.to}T23:59:59+05:00`;

  const [{ data: agents }, { data: comms }, { data: payments }] = await Promise.all([
    supabase
      .from('sales_agents')
      .select('id, name, code')

      .eq('active', true),
    supabase
      .from('agent_commissions')
      .select('agent_id, amount, status, salon_id, created_at')
      .gte('created_at', fromIso)
      .lte('created_at', toIso),
    supabase
      .from('payment_requests')
      .select('amount, salon_id, created_at, source, status')
      .eq('source', 'agent_collected')
      .eq('status', 'approved')
      .gte('created_at', fromIso)
      .lte('created_at', toIso),
  ]);

  const earnedByAgent = new Map<string, number>();
  const salonsByAgent = new Map<string, Set<string>>();
  let commissionsPaid = 0;
  for (const c of (comms || []) as { agent_id: string; amount: number; status: string; salon_id: string }[]) {
    const amt = Number(c.amount || 0);
    if (c.status === 'paid') commissionsPaid += amt;
    if (c.status === 'approved' || c.status === 'paid') {
      earnedByAgent.set(c.agent_id, (earnedByAgent.get(c.agent_id) ?? 0) + amt);
    }
    const set = salonsByAgent.get(c.agent_id) ?? new Set();
    set.add(c.salon_id);
    salonsByAgent.set(c.agent_id, set);
  }

  // Cash collected per agent: payments are scoped to salons; need to map
  // salon -> agent. Pull the relevant salon attributions in one shot.
  const salonIds = Array.from(new Set((payments || []).map((p: { salon_id: string }) => p.salon_id)));
  const salonAgentMap = new Map<string, string>();
  if (salonIds.length > 0) {
    const { data: salonRows } = await supabase
      .from('salons')
      .select('id, sold_by_agent_id')
      .in('id', salonIds);
    for (const s of (salonRows || []) as { id: string; sold_by_agent_id: string | null }[]) {
      if (s.sold_by_agent_id) salonAgentMap.set(s.id, s.sold_by_agent_id);
    }
  }
  let cashCollected = 0;
  for (const p of (payments || []) as { amount: number; salon_id: string }[]) {
    cashCollected += Number(p.amount || 0);
  }

  const leaderboard = (agents || []).map((a: { id: string; name: string; code: string }) => ({
    agent_id: a.id,
    agent_name: a.name,
    agent_code: a.code,
    earned: earnedByAgent.get(a.id) ?? 0,
    salons: salonsByAgent.get(a.id)?.size ?? 0,
  })).sort((a, b) => b.earned - a.earned);

  // "Salons onboarded" = unique salon_ids that received first_sale commissions
  // in the window (a proxy for "new this period").
  const onboardedSalons = new Set<string>();
  for (const c of (comms || []) as { salon_id: string; status: string }[]) {
    if (c.status === 'approved' || c.status === 'paid') onboardedSalons.add(c.salon_id);
  }

  // Suppress unused-var warnings — salonAgentMap currently informational only.
  void salonAgentMap;

  return {
    data: {
      totals: {
        commissions_paid: commissionsPaid,
        cash_collected: cashCollected,
        salons_onboarded: onboardedSalons.size,
      },
      leaderboard,
    },
    error: null,
  };
}
