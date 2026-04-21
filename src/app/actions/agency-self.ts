'use server';

import { createServerClient } from '@/lib/supabase';
import { requireAgencyAdmin } from './auth';
import type { Agency, SalesAgent, AgencyCommission, AgencyPayout } from '@/types/sales';

/**
 * Self-service reads for agency_admin role. Every query scopes on the
 * session's agencyId so an agency admin can only ever see their own data,
 * even though we run with the service-role client that bypasses RLS.
 */

export async function getMyAgency(): Promise<{
  data: { agency: Agency | null; balance: { commissionEarned: number; commissionPaid: number; unpaidLiability: number; depositBalance: number } };
  error: string | null;
}> {
  const session = await requireAgencyAdmin();
  const supabase = createServerClient();

  const [{ data: agency, error: agencyErr }, { data: comms }, { data: depositLedger }, { data: unremitted }] = await Promise.all([
    supabase.from('agencies').select('*').eq('id', session.agencyId).maybeSingle(),
    supabase.from('agency_commissions').select('amount, status').eq('agency_id', session.agencyId),
    supabase.from('agency_deposit_ledger').select('kind, amount').eq('agency_id', session.agencyId),
    supabase
      .from('payment_requests')
      .select('amount, collected_by_agency_id, remitted_at, status')
      .eq('collected_by_agency_id', session.agencyId)
      .is('remitted_at', null)
      .eq('status', 'approved'),
  ]);
  if (agencyErr) return { data: { agency: null, balance: { commissionEarned: 0, commissionPaid: 0, unpaidLiability: 0, depositBalance: 0 } }, error: agencyErr.message };

  let commissionEarned = 0, commissionPaid = 0;
  for (const c of (comms || []) as { amount: number; status: string }[]) {
    const amt = Number(c.amount || 0);
    if (c.status === 'approved' || c.status === 'paid') commissionEarned += amt;
    if (c.status === 'paid') commissionPaid += amt;
  }

  let depositBalance = 0;
  for (const d of (depositLedger || []) as { kind: string; amount: number }[]) {
    if (d.kind === 'collected') depositBalance += Number(d.amount);
    else depositBalance -= Number(d.amount);
  }

  // Unpaid liability: approximation using the agency's stored rates on the
  // current agency row. Exact per-payment computation lives in the super_admin
  // getAgencyBalance; this read is for the agency's informational dashboard.
  const ag = agency as Agency | null;
  let unpaidLiability = 0;
  if (ag) {
    for (const p of (unremitted || []) as { amount: number }[]) {
      const share = Math.round((Number(p.amount) * Number(ag.first_sale_pct)) / 100 * 100) / 100;
      unpaidLiability += Number(p.amount) - share;
    }
    unpaidLiability = Math.round(unpaidLiability * 100) / 100;
  }

  return {
    data: {
      agency: ag,
      balance: { commissionEarned, commissionPaid, unpaidLiability, depositBalance },
    },
    error: null,
  };
}

export async function listMyAgents(): Promise<{ data: SalesAgent[]; error: string | null }> {
  const session = await requireAgencyAdmin();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('sales_agents')
    .select('*')
    .eq('agency_id', session.agencyId)
    .order('created_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data || []) as SalesAgent[], error: null };
}

export async function listMyCommissions(): Promise<{ data: AgencyCommission[]; error: string | null }> {
  const session = await requireAgencyAdmin();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('agency_commissions')
    .select('*')
    .eq('agency_id', session.agencyId)
    .order('created_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data || []) as AgencyCommission[], error: null };
}

export async function listMyPayouts(): Promise<{ data: AgencyPayout[]; error: string | null }> {
  const session = await requireAgencyAdmin();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('agency_payouts')
    .select('*')
    .eq('agency_id', session.agencyId)
    .order('requested_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data || []) as AgencyPayout[], error: null };
}
