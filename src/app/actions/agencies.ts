'use server';

import { createServerClient } from '@/lib/supabase';
import { requireAdminRole } from './auth';
import { sendEmail } from '@/lib/email-sender';
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
  nicNumber: string | null;
  address: string | null;
  area: string | null;
  firstSalePct: number;
  renewalPct: number;
  depositAmount: number;
  liabilityThreshold: number;
  terms: string | null;
  // When provided, an agency_admins + auth.users row is created and a
  // welcome email is sent so the agency owner can set their own password.
  adminEmail?: string | null;
  adminName?: string | null;
}

export async function createAgency(
  input: CreateAgencyInput,
): Promise<{ data: Agency | null; error: string | null; adminEmailSent: boolean }> {
  await requireAdminRole(['super_admin']);
  if (!input.name?.trim()) return { data: null, error: 'Name is required', adminEmailSent: false };
  if (input.firstSalePct < 0 || input.firstSalePct > 100) return { data: null, error: 'First-sale % out of range', adminEmailSent: false };
  if (input.renewalPct < 0 || input.renewalPct > 100) return { data: null, error: 'Renewal % out of range', adminEmailSent: false };
  if (input.depositAmount < 0) return { data: null, error: 'Deposit must be >= 0', adminEmailSent: false };
  if (input.liabilityThreshold < 0) return { data: null, error: 'Liability threshold must be >= 0', adminEmailSent: false };

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('agencies')
    .insert({
      name: input.name.trim(),
      contact_name: input.contactName,
      phone: input.phone,
      email: input.email,
      city: input.city,
      nic_number: input.nicNumber,
      address: input.address,
      area: input.area,
      first_sale_pct: input.firstSalePct,
      renewal_pct: input.renewalPct,
      deposit_amount: input.depositAmount,
      liability_threshold: input.liabilityThreshold || input.depositAmount,
      terms: input.terms,
    })
    .select()
    .single();
  if (error) return { data: null, error: error.message, adminEmailSent: false };

  const agency = data as Agency;
  let adminEmailSent = false;
  const adminEmail = (input.adminEmail ?? input.email ?? '').trim().toLowerCase();
  const adminName = (input.adminName ?? input.contactName ?? input.name ?? '').trim();
  if (adminEmail && adminName) {
    const result = await provisionAgencyAdmin(agency.id, { email: adminEmail, name: adminName, phone: input.phone });
    adminEmailSent = result.emailSent;
  }

  return { data: agency, error: null, adminEmailSent };
}

/**
 * Creates the Supabase auth user + agency_admins row for a new agency and
 * sends the welcome email with a password-reset link. Internal helper —
 * callers (createAgency, approveAgencyRequest) already checked authorization.
 * Idempotent: if the auth user already exists we reuse it and just ensure
 * the agency_admins row is in place.
 */
export async function provisionAgencyAdmin(
  agencyId: string,
  input: { email: string; name: string; phone: string | null },
): Promise<{ emailSent: boolean; error: string | null }> {
  const supabase = createServerClient();
  const email = input.email.trim().toLowerCase();

  // 1. Find or create the auth user.
  let userId: string | null = null;
  const { data: authCreate } = await supabase.auth.admin.createUser({
    email,
    password: crypto.randomUUID() + 'A1!',
    email_confirm: true,
  });
  if (authCreate?.user) {
    userId = authCreate.user.id;
  } else {
    // Likely already exists — look it up.
    const { data: listed } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
    userId = listed?.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
  }
  if (!userId) return { emailSent: false, error: 'Could not resolve auth user' };

  // 2. Upsert the agency_admins row.
  await supabase.from('agency_admins').insert({
    agency_id: agencyId,
    user_id: userId,
    name: input.name,
    phone: input.phone,
    email,
  });

  // 3. Send welcome email with recovery link.
  try {
    const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://icut.pk';
    const { data: linkData } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${origin}/reset-password` },
    });
    const link = linkData?.properties?.action_link;
    if (link) {
      await sendEmail(
        email,
        'Welcome to iCut — your agency account is ready',
        `<p>Hi ${input.name},</p>
         <p>Your agency has been onboarded on iCut. Set your password here to access your dashboard:</p>
         <p><a href="${link}">Set password</a></p>
         <p>Then log in at ${origin}/login. Your agency dashboard will show your sales agents, leads, commissions, and the money you collect from tenants.</p>
         <p>Questions? Reply to this email.</p>
         <p>— The iCut team</p>`,
      );
      return { emailSent: true, error: null };
    }
  } catch {
    // Non-fatal — super_admin can retry the invite.
  }
  return { emailSent: false, error: null };
}

export async function updateAgency(
  id: string,
  fields: Partial<Pick<Agency,
    'name' | 'contact_name' | 'phone' | 'email' | 'city' | 'nic_number' | 'address' | 'area' |
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

// ───────────────────────────────────────
// Agency owner password generation (super_admin)
// ───────────────────────────────────────

/**
 * Generates a fresh strong password for the agency's primary admin account.
 * If no agency_admins row exists yet (agency was created without the
 * "send welcome email" option), auto-creates one from agencies.email +
 * agencies.contact_name so super_admin can hand off login creds to any
 * agency regardless of how it was onboarded.
 *
 * Returns { email, password } in one shot; super_admin shares both with the
 * agency owner via WhatsApp / phone / whatever channel they prefer. Mirrors
 * the generateSalonOwnerPassword flow in admin-users.ts.
 */
export async function generateAgencyOwnerPassword(
  agencyId: string,
): Promise<{ success: true; email: string; password: string } | { success: false; error: string }> {
  await requireAdminRole(['super_admin']);
  const supabase = createServerClient();

  const { data: agency, error: agencyErr } = await supabase
    .from('agencies')
    .select('id, name, email, contact_name, phone')
    .eq('id', agencyId)
    .maybeSingle();
  if (agencyErr || !agency) return { success: false, error: 'Agency not found' };

  // Prefer the existing admin row; fall back to agency.email for a self-heal
  // path when super_admin skipped the welcome-email flow at creation.
  const { data: existingAdmin } = await supabase
    .from('agency_admins')
    .select('user_id, email, name')
    .eq('agency_id', agencyId)
    .eq('active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  let userId: string | null = existingAdmin?.user_id ?? null;
  let email: string | null = existingAdmin?.email ?? null;

  if (!userId) {
    if (!agency.email) {
      return { success: false, error: 'Agency has no email on file — edit the Profile tab first' };
    }
    const result = await provisionAgencyAdmin(agencyId, {
      email: agency.email,
      name: agency.contact_name ?? agency.name,
      phone: agency.phone,
    });
    if (result.error) return { success: false, error: result.error };
    // Re-fetch to get the freshly-created user_id.
    const { data: created } = await supabase
      .from('agency_admins')
      .select('user_id, email')
      .eq('agency_id', agencyId)
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    userId = created?.user_id ?? null;
    email = created?.email ?? agency.email;
  }

  if (!userId || !email) return { success: false, error: 'Could not resolve agency admin account' };

  // Generate a 16-char unambiguous password — same alphabet + strength used
  // for generateSalonOwnerPassword.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%*?';
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const password = Array.from(bytes).map((b) => alphabet[b % alphabet.length]).join('');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const updateRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password }),
  });
  if (!updateRes.ok) return { success: false, error: 'Failed to update password' };

  return { success: true, email, password };
}
