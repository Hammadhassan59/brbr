'use server';

import { checkWriteAccess, verifySession } from './auth';
import { createServerClient } from '@/lib/supabase';
import { clientUpdateSchema } from '@/lib/schemas';
import {
  assertBranchMembership,
  assertBranchOwned,
  assertClientOwned,
  hasPermission,
  tenantErrorMessage,
} from '@/lib/tenant-guard';

export async function createClient(data: {
  branchId: string;
  name: string;
  phone?: string | null;
  whatsapp?: string | null;
  gender?: string | null;
  notes?: string | null;
  hairNotes?: string | null;
  allergyNotes?: string | null;
  isVip?: boolean;
  isBlacklisted?: boolean;
  udhaarLimit?: number;
}) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { data: null, error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  // Branch must (a) belong to this salon and (b) be in the session's
  // allow-list. The first check catches cross-tenant IDs, the second stops
  // a staff member from writing into another branch in their own salon.
  try {
    await assertBranchOwned(data.branchId, session.salonId);
    assertBranchMembership(session, data.branchId);
  } catch (e) {
    return { data: null, error: tenantErrorMessage(e) };
  }

  const { data: result, error } = await supabase
    .from('clients')
    .insert({
      salon_id: session.salonId,
      branch_id: data.branchId,
      name: data.name,
      phone: data.phone || null,
      whatsapp: data.whatsapp || null,
      gender: data.gender || null,
      notes: data.notes || null,
      hair_notes: data.hairNotes || null,
      allergy_notes: data.allergyNotes || null,
      is_vip: data.isVip ?? false,
      is_blacklisted: data.isBlacklisted ?? false,
      udhaar_limit: data.udhaarLimit ?? 5000,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: result, error: null };
}

export async function updateClient(id: string, branchId: string, data: unknown) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  try {
    assertBranchMembership(session, branchId);
  } catch (e) {
    return { error: tenantErrorMessage(e) };
  }

  const parsed = clientUpdateSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Invalid input' };
  }

  const { error } = await supabase
    .from('clients')
    .update(parsed.data)
    .eq('id', id)
    .eq('salon_id', session.salonId)
    .eq('branch_id', branchId);

  if (error) return { error: error.message };
  return { error: null };
}

export async function updateClientNotes(
  clientId: string,
  branchId: string,
  field: 'notes' | 'hair_notes' | 'allergy_notes',
  value: string,
) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  try {
    assertBranchMembership(session, branchId);
  } catch (e) {
    return { error: tenantErrorMessage(e) };
  }

  const { error } = await supabase
    .from('clients')
    .update({ [field]: value })
    .eq('id', clientId)
    .eq('salon_id', session.salonId)
    .eq('branch_id', branchId);

  if (error) return { error: error.message };
  return { error: null };
}

export async function recordUdhaarPayment(
  clientId: string,
  branchId: string,
  amount: number,
  paymentMethod: string,
) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  try {
    assertBranchMembership(session, branchId);
  } catch (e) {
    return { error: tenantErrorMessage(e) };
  }

  // Verify the client belongs to this salon AND the target branch BEFORE any
  // insert — udhaar_payments has no salon_id column, so this is the only
  // tenant guard on the insert.
  let client: { id: string; salon_id: string; udhaar_balance: number | null };
  try {
    client = await assertClientOwned(clientId, session.salonId, branchId);
  } catch (e) {
    return { error: tenantErrorMessage(e) };
  }

  const { error: paymentErr } = await supabase
    .from('udhaar_payments')
    .insert({
      client_id: clientId,
      amount,
      payment_method: paymentMethod,
    });

  if (paymentErr) return { error: paymentErr.message };

  // Compute new balance from the row we already fetched, then update.
  const current = Number(client.udhaar_balance ?? 0);
  const { error: updErr } = await supabase
    .from('clients')
    .update({ udhaar_balance: Math.max(0, current - amount) })
    .eq('id', clientId)
    .eq('salon_id', session.salonId)
    .eq('branch_id', branchId);

  if (updErr) return { error: updErr.message };
  return { error: null };
}

export async function updateClientStats(clientId: string, branchId: string, data: {
  loyaltyPoints: number;
  totalVisits: number;
  totalSpent: number;
  udhaarBalance: number;
}) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  try {
    assertBranchMembership(session, branchId);
  } catch (e) {
    return { error: tenantErrorMessage(e) };
  }

  const { error } = await supabase
    .from('clients')
    .update({
      loyalty_points: data.loyaltyPoints,
      total_visits: data.totalVisits,
      total_spent: data.totalSpent,
      udhaar_balance: data.udhaarBalance,
    })
    .eq('id', clientId)
    .eq('salon_id', session.salonId)
    .eq('branch_id', branchId);

  if (error) return { error: error.message };
  return { error: null };
}

// ───────────────────────────────────────
// Branch-scoped reads
// ───────────────────────────────────────

/**
 * List clients for a specific branch. Pass `allBranches=true` to skip the
 * branch filter — only available to sessions with `view_other_branches`.
 */
export async function getClientsForBranch(
  branchId: string,
  opts: { allBranches?: boolean } = {},
) {
  const session = await verifySession();
  if (!session.salonId) return { data: null, error: 'No salon context' };
  const supabase = createServerClient();

  const allBranches = !!opts.allBranches;
  if (allBranches) {
    if (!hasPermission(session, 'view_other_branches')) {
      return { data: null, error: 'Not allowed' };
    }
  } else {
    try {
      assertBranchMembership(session, branchId);
    } catch (e) {
      return { data: null, error: tenantErrorMessage(e) };
    }
  }

  let q = supabase
    .from('clients')
    .select('*')
    .eq('salon_id', session.salonId)
    .order('name');
  if (!allBranches) q = q.eq('branch_id', branchId);

  const { data, error } = await q;
  if (error) return { data: null, error: error.message };
  return { data: data ?? [], error: null };
}

/**
 * Search clients by name/phone, scoped to a branch. See getClientsForBranch
 * for the cross-branch toggle.
 */
export async function searchClientsForBranch(
  branchId: string,
  query: string,
  opts: { allBranches?: boolean } = {},
) {
  const session = await verifySession();
  if (!session.salonId) return { data: null, error: 'No salon context' };
  const supabase = createServerClient();

  const allBranches = !!opts.allBranches;
  if (allBranches) {
    if (!hasPermission(session, 'view_other_branches')) {
      return { data: null, error: 'Not allowed' };
    }
  } else {
    try {
      assertBranchMembership(session, branchId);
    } catch (e) {
      return { data: null, error: tenantErrorMessage(e) };
    }
  }

  const trimmed = query.trim().slice(0, 100);
  if (!trimmed) return { data: [], error: null };
  const pattern = `%${trimmed}%`;

  const buildNameQ = () => {
    let q = supabase
      .from('clients')
      .select('*')
      .eq('salon_id', session.salonId)
      .ilike('name', pattern)
      .order('name')
      .limit(20);
    if (!allBranches) q = q.eq('branch_id', branchId);
    return q;
  };
  const buildPhoneQ = () => {
    let q = supabase
      .from('clients')
      .select('*')
      .eq('salon_id', session.salonId)
      .ilike('phone', pattern)
      .order('name')
      .limit(20);
    if (!allBranches) q = q.eq('branch_id', branchId);
    return q;
  };

  const [nameRes, phoneRes] = await Promise.all([buildNameQ(), buildPhoneQ()]);
  if (nameRes.error) return { data: null, error: nameRes.error.message };
  if (phoneRes.error) return { data: null, error: phoneRes.error.message };

  const merged = new Map<string, Record<string, unknown>>();
  for (const row of (nameRes.data || []) as Array<{ id: string }>) {
    merged.set(row.id, row as unknown as Record<string, unknown>);
  }
  for (const row of (phoneRes.data || []) as Array<{ id: string }>) {
    merged.set(row.id, row as unknown as Record<string, unknown>);
  }
  return { data: Array.from(merged.values()).slice(0, 20), error: null };
}

/**
 * Fetch a single client by id and verify it belongs to the caller's branch.
 * Owners/partners bypass via hasPermission('view_other_branches').
 */
export async function getClientForBranch(clientId: string, branchId: string) {
  const session = await verifySession();
  if (!session.salonId) return { data: null, error: 'No salon context' };
  const supabase = createServerClient();

  try {
    assertBranchMembership(session, branchId);
  } catch (e) {
    return { data: null, error: tenantErrorMessage(e) };
  }

  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .eq('salon_id', session.salonId)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: 'Not found' };

  const row = data as { branch_id?: string | null };
  if (row.branch_id && row.branch_id !== branchId
      && !hasPermission(session, 'view_other_branches')) {
    return { data: null, error: 'Not allowed' };
  }

  return { data, error: null };
}
