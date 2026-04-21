'use server';

import { createServerClient } from '@/lib/supabase';
import { requireAdminRole } from './auth';
import type {
  Agency,
  AgencyStatus,
  AgencyDepositEvent,
  AgencyRemittance,
  AgencyCommission,
  DepositEventKind,
  RemittanceMethod,
} from '@/types/sales';

// ───────────────────────────────────────
// Liability math helpers
// ───────────────────────────────────────

/**
 * Deposit balance = SUM(collected) - SUM(refunded) - SUM(clawed).
 * Unpaid liability = SUM over unremitted payment_requests collected by this
 * agency of (amount - commission due to agency).
 */
export interface AgencyBalance {
  deposit_balance: number;
  deposit_threshold: number;
  liability_threshold: number;
  unpaid_liability: number;
  unremitted_payment_count: number;
  total_remitted: number;
}

export async function getAgencyBalance(
  agencyId: string,
): Promise<{ data: AgencyBalance | null; error: string | null }> {
  await requireAdminRole(['super_admin']);
  const supabase = createServerClient();

  const [
    { data: agency },
    { data: ledger },
    { data: unremitted },
    { data: remittances },
  ] = await Promise.all([
    supabase.from('agencies').select('deposit_amount, liability_threshold, first_sale_pct, renewal_pct').eq('id', agencyId).maybeSingle(),
    supabase.from('agency_deposit_ledger').select('kind, amount').eq('agency_id', agencyId),
    // Unremitted payment_requests collected by this agency, for liability math
    supabase
      .from('payment_requests')
      .select('amount, salon_id, id')
      .eq('collected_by_agency_id', agencyId)
      .is('remitted_at', null)
      .eq('status', 'approved'),
    supabase.from('agency_remittances').select('amount').eq('agency_id', agencyId),
  ]);

  if (!agency) return { data: null, error: 'Agency not found' };

  let balance = 0;
  for (const e of (ledger || []) as { kind: DepositEventKind; amount: number }[]) {
    if (e.kind === 'collected') balance += Number(e.amount);
    else balance -= Number(e.amount);
  }

  // Unpaid liability: for each unremitted approved payment_request collected by
  // this agency, platform is owed (amount - agency_commission_due).
  // Commission rate depends on whether the request is first_sale or renewal
  // for its salon — determined by whether any prior approved request exists.
  let unpaidLiability = 0;
  const unremittedBySalon = new Map<string, typeof unremitted>();
  for (const p of (unremitted || []) as { amount: number; salon_id: string; id: string }[]) {
    const arr = unremittedBySalon.get(p.salon_id) ?? [];
    arr.push(p as never);
    unremittedBySalon.set(p.salon_id, arr);
  }
  if (unremitted && unremitted.length > 0) {
    const salonIds = Array.from(unremittedBySalon.keys());
    const { data: priorApprovedCounts } = await supabase
      .from('payment_requests')
      .select('salon_id, id')
      .in('salon_id', salonIds)
      .eq('status', 'approved');
    // For each salon, determine how many approved requests exist BEFORE the
    // unremitted ones. Here we simplify: treat the first approved request per
    // salon (by created_at order) as first_sale, rest as renewals. For
    // liability calc precision, we pull created_at too.
    const { data: allApproved } = await supabase
      .from('payment_requests')
      .select('id, salon_id, created_at')
      .in('salon_id', salonIds)
      .eq('status', 'approved')
      .order('created_at', { ascending: true });
    const firstApprovedPerSalon = new Map<string, string>();
    for (const r of (allApproved || []) as { id: string; salon_id: string; created_at: string }[]) {
      if (!firstApprovedPerSalon.has(r.salon_id)) firstApprovedPerSalon.set(r.salon_id, r.id);
    }

    for (const p of unremitted as { id: string; amount: number; salon_id: string }[]) {
      const isFirst = firstApprovedPerSalon.get(p.salon_id) === p.id;
      const pct = isFirst ? Number(agency.first_sale_pct) : Number(agency.renewal_pct);
      const agencyShare = Math.round((Number(p.amount) * pct) / 100 * 100) / 100;
      unpaidLiability += Number(p.amount) - agencyShare;
    }
    // Suppress unused var warning
    void priorApprovedCounts;
  }

  const totalRemitted = (remittances || []).reduce(
    (s: number, r: { amount: number }) => s + Number(r.amount || 0),
    0,
  );

  return {
    data: {
      deposit_balance: balance,
      deposit_threshold: Number(agency.deposit_amount),
      liability_threshold: Number(agency.liability_threshold),
      unpaid_liability: Math.round(unpaidLiability * 100) / 100,
      unremitted_payment_count: unremitted?.length ?? 0,
      total_remitted: totalRemitted,
    },
    error: null,
  };
}

// ───────────────────────────────────────
// Agency CRUD
// ───────────────────────────────────────

export async function listAgencies(): Promise<{ data: Agency[]; error: string | null }> {
  await requireAdminRole(['super_admin']);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('agencies')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data || []) as Agency[], error: null };
}

export async function getAgency(id: string): Promise<{ data: Agency | null; error: string | null }> {
  await requireAdminRole(['super_admin']);
  const supabase = createServerClient();
  const { data, error } = await supabase.from('agencies').select('*').eq('id', id).maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data: (data as Agency) || null, error: null };
}

export interface CreateAgencyInput {
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  firstSalePct: number;
  renewalPct: number;
  depositAmount: number;
  liabilityThreshold: number;
  terms: string | null;
}

export async function createAgency(
  input: CreateAgencyInput,
): Promise<{ data: Agency | null; error: string | null }> {
  await requireAdminRole(['super_admin']);
  if (!input.name?.trim()) return { data: null, error: 'Name is required' };
  if (input.firstSalePct < 0 || input.firstSalePct > 100) return { data: null, error: 'First-sale % out of range' };
  if (input.renewalPct < 0 || input.renewalPct > 100) return { data: null, error: 'Renewal % out of range' };
  if (input.depositAmount < 0) return { data: null, error: 'Deposit must be >= 0' };
  if (input.liabilityThreshold < 0) return { data: null, error: 'Liability threshold must be >= 0' };

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('agencies')
    .insert({
      name: input.name.trim(),
      contact_name: input.contactName,
      phone: input.phone,
      email: input.email,
      city: input.city,
      first_sale_pct: input.firstSalePct,
      renewal_pct: input.renewalPct,
      deposit_amount: input.depositAmount,
      liability_threshold: input.liabilityThreshold || input.depositAmount,
      terms: input.terms,
    })
    .select()
    .single();
  if (error) return { data: null, error: error.message };
  return { data: data as Agency, error: null };
}

export async function updateAgency(
  id: string,
  fields: Partial<Pick<Agency,
    'name' | 'contact_name' | 'phone' | 'email' | 'city' |
    'first_sale_pct' | 'renewal_pct' | 'deposit_amount' | 'liability_threshold' | 'terms'
  >>,
): Promise<{ error: string | null }> {
  await requireAdminRole(['super_admin']);
  const supabase = createServerClient();
  const { error } = await supabase.from('agencies').update(fields).eq('id', id);
  return { error: error?.message ?? null };
}

// ───────────────────────────────────────
// Status transitions: freeze / unfreeze / terminate
// ───────────────────────────────────────

async function setStatus(id: string, status: AgencyStatus): Promise<{ error: string | null }> {
  const supabase = createServerClient();
  const patch: Record<string, unknown> = { status };
  if (status === 'terminated') patch.deactivated_at = new Date().toISOString();
  if (status === 'active') patch.deactivated_at = null;
  const { error } = await supabase.from('agencies').update(patch).eq('id', id);
  return { error: error?.message ?? null };
}

export async function freezeAgency(id: string, notes: string): Promise<{ error: string | null }> {
  await requireAdminRole(['super_admin']);
  if (!notes?.trim()) return { error: 'Reason is required (audit trail)' };
  const { error } = await setStatus(id, 'frozen');
  return { error };
}

export async function unfreezeAgency(id: string): Promise<{ error: string | null }> {
  await requireAdminRole(['super_admin']);
  return setStatus(id, 'active');
}

/**
 * Terminate: deduct unpaid liability from deposit (clawed event), refund
 * remainder (refunded event), set status=terminated, deactivate all
 * associated sales_agents and agency_admins.
 */
export async function terminateAgency(
  id: string,
  notes: string,
): Promise<{ error: string | null; clawed: number; refunded: number }> {
  const session = await requireAdminRole(['super_admin']);
  if (!notes?.trim()) return { error: 'Reason is required (audit trail)', clawed: 0, refunded: 0 };

  const supabase = createServerClient();
  const { data: balance, error: balanceErr } = await getAgencyBalance(id);
  if (balanceErr || !balance) return { error: balanceErr || 'Failed to compute balance', clawed: 0, refunded: 0 };

  const clawAmount = Math.min(balance.unpaid_liability, balance.deposit_balance);
  const refundAmount = balance.deposit_balance - clawAmount;

  if (clawAmount > 0) {
    const { error } = await supabase.from('agency_deposit_ledger').insert({
      agency_id: id,
      kind: 'clawed',
      amount: clawAmount,
      notes: `Termination clawback: ${notes.trim()}`,
      created_by: session.staffId,
    });
    if (error) return { error: error.message, clawed: 0, refunded: 0 };
  }
  if (refundAmount > 0) {
    const { error } = await supabase.from('agency_deposit_ledger').insert({
      agency_id: id,
      kind: 'refunded',
      amount: refundAmount,
      notes: `Termination refund: ${notes.trim()}`,
      created_by: session.staffId,
    });
    if (error) return { error: error.message, clawed: clawAmount, refunded: 0 };
  }

  const { error: statusErr } = await setStatus(id, 'terminated');
  if (statusErr) return { error: statusErr, clawed: clawAmount, refunded: refundAmount };

  // Deactivate associated agents and admins.
  await supabase.from('sales_agents').update({ active: false, deactivated_at: new Date().toISOString() }).eq('agency_id', id);
  await supabase.from('agency_admins').update({ active: false, deactivated_at: new Date().toISOString() }).eq('agency_id', id);

  return { error: null, clawed: clawAmount, refunded: refundAmount };
}

// ───────────────────────────────────────
// Freeze-trigger check (called after every payment approval + remittance)
// ───────────────────────────────────────

/**
 * If the agency's unpaid liability >= its liability_threshold, flip status
 * to 'frozen'. Idempotent — re-running on an already-frozen agency is a no-op.
 * Intended to be called from approvePaymentRequest (after approval) and from
 * recordAgencyRemittance (after the remittance clears some liability).
 */
export async function checkAgencyFreeze(agencyId: string): Promise<void> {
  const supabase = createServerClient();
  const { data: agency } = await supabase
    .from('agencies')
    .select('status, liability_threshold')
    .eq('id', agencyId)
    .maybeSingle();
  if (!agency || agency.status === 'terminated') return;

  const { data: balance } = await getAgencyBalance(agencyId);
  if (!balance) return;

  const shouldFreeze = balance.unpaid_liability >= Number(agency.liability_threshold) && Number(agency.liability_threshold) > 0;
  if (shouldFreeze && agency.status === 'active') {
    await supabase.from('agencies').update({ status: 'frozen' }).eq('id', agencyId);
  }
}

// ───────────────────────────────────────
// Deposit events
// ───────────────────────────────────────

export async function recordDepositEvent(input: {
  agencyId: string;
  kind: DepositEventKind;
  amount: number;
  method: RemittanceMethod | null;
  reference: string | null;
  notes: string | null;
}): Promise<{ data: AgencyDepositEvent | null; error: string | null }> {
  const session = await requireAdminRole(['super_admin']);
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { data: null, error: 'Amount must be > 0' };
  }
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('agency_deposit_ledger')
    .insert({
      agency_id: input.agencyId,
      kind: input.kind,
      amount: input.amount,
      method: input.method,
      reference: input.reference,
      notes: input.notes,
      created_by: session.staffId,
    })
    .select()
    .single();
  if (error) return { data: null, error: error.message };
  return { data: data as AgencyDepositEvent, error: null };
}

export async function listDepositLedger(
  agencyId: string,
): Promise<{ data: AgencyDepositEvent[]; error: string | null }> {
  await requireAdminRole(['super_admin']);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('agency_deposit_ledger')
    .select('*')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data || []) as AgencyDepositEvent[], error: null };
}

// ───────────────────────────────────────
// Remittances (agency → platform)
// ───────────────────────────────────────

export async function listAgencyRemittances(
  agencyId: string,
): Promise<{ data: AgencyRemittance[]; error: string | null }> {
  await requireAdminRole(['super_admin']);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('agency_remittances')
    .select('*')
    .eq('agency_id', agencyId)
    .order('received_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data || []) as AgencyRemittance[], error: null };
}

export async function recordAgencyRemittance(input: {
  agencyId: string;
  amount: number;
  method: RemittanceMethod;
  reference: string | null;
  notes: string | null;
  paymentRequestIds: string[];
}): Promise<{ data: AgencyRemittance | null; error: string | null }> {
  const session = await requireAdminRole(['super_admin']);
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { data: null, error: 'Amount must be > 0' };
  }
  const supabase = createServerClient();

  const { data: remittance, error } = await supabase
    .from('agency_remittances')
    .insert({
      agency_id: input.agencyId,
      amount: input.amount,
      method: input.method,
      reference: input.reference,
      notes: input.notes,
      received_by: session.staffId,
    })
    .select()
    .single();
  if (error || !remittance) return { data: null, error: error?.message ?? 'Failed to create remittance' };

  if (input.paymentRequestIds.length > 0) {
    const items = input.paymentRequestIds.map((id) => ({
      remittance_id: (remittance as AgencyRemittance).id,
      payment_request_id: id,
    }));
    const { error: itemsErr } = await supabase.from('agency_remittance_items').insert(items);
    if (itemsErr) {
      // Rollback: delete the remittance so we don't leave a phantom.
      await supabase.from('agency_remittances').delete().eq('id', (remittance as AgencyRemittance).id);
      return { data: null, error: itemsErr.message };
    }
  }

  // After remittance, re-evaluate freeze status — possibly unfreeze-eligible.
  await checkAgencyFreeze(input.agencyId);

  return { data: remittance as AgencyRemittance, error: null };
}

// ───────────────────────────────────────
// Unremitted payment list (for "record remittance" picker)
// ───────────────────────────────────────

export interface UnremittedPayment {
  id: string;
  amount: number;
  created_at: string;
  salon_id: string;
  salon_name: string;
}

export async function listUnremittedPayments(
  agencyId: string,
): Promise<{ data: UnremittedPayment[]; error: string | null }> {
  await requireAdminRole(['super_admin']);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('payment_requests')
    .select('id, amount, created_at, salon_id, salon:salons(name)')
    .eq('collected_by_agency_id', agencyId)
    .eq('status', 'approved')
    .is('remitted_at', null)
    .order('created_at', { ascending: true });
  if (error) return { data: [], error: error.message };
  return {
    data: (data || []).map((r) => {
      const row = r as unknown as {
        id: string;
        amount: number;
        created_at: string;
        salon_id: string;
        salon: { name: string } | { name: string }[] | null;
      };
      const salon = Array.isArray(row.salon) ? row.salon[0] : row.salon;
      return {
        id: row.id,
        amount: Number(row.amount),
        created_at: row.created_at,
        salon_id: row.salon_id,
        salon_name: salon?.name ?? '—',
      };
    }),
    error: null,
  };
}

// ───────────────────────────────────────
// Agency commissions (audit / list)
// ───────────────────────────────────────

export async function listAgencyCommissions(
  agencyId: string,
): Promise<{ data: AgencyCommission[]; error: string | null }> {
  await requireAdminRole(['super_admin']);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('agency_commissions')
    .select('*')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data || []) as AgencyCommission[], error: null };
}
