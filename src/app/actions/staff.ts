'use server';

import { checkWriteAccess, getPlanLimits, verifySession } from './auth';
import { createServerClient } from '@/lib/supabase';
import { staffUpdateSchema } from '@/lib/schemas';
import {
  assertStaffOwned,
  assertBranchOwned,
  assertBranchMembership,
  hasPermission,
  requirePermission,
  tenantErrorMessage,
} from '@/lib/tenant-guard';

export async function createStaff(data: {
  branchIds: string[];
  name: string;
  email?: string;
  password?: string;
  phone: string;
  role: string;
  joinDate?: string;
  baseSalary?: number;
  commissionType?: string;
  commissionRate?: number;
}) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { data: null, error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  if (!data.phone?.trim()) return { data: null, error: 'Phone is required' };

  const emailProvided = !!data.email?.trim();
  const passwordProvided = !!data.password?.trim();
  if (emailProvided !== passwordProvided) {
    return { data: null, error: 'Provide both email and password, or leave both blank for staff who won\u2019t log in' };
  }

  const branchIds = Array.from(new Set(data.branchIds ?? []));
  if (branchIds.length === 0) {
    return { data: null, error: 'At least one branch is required' };
  }

  // Every branch must belong to this salon AND be in the caller's allow-list
  // (so a manager in branch A can't sneak a staff row into branch B).
  try {
    for (const bId of branchIds) {
      await assertBranchOwned(bId, session.salonId);
      assertBranchMembership(session, bId);
    }
  } catch (e) {
    return { data: null, error: tenantErrorMessage(e) };
  }

  const primaryBranchId = branchIds[0];

  // Enforce staff limit based on plan
  const { data: salon } = await supabase
    .from('salons')
    .select('subscription_plan')
    .eq('id', session.salonId)
    .single();

  if (salon) {
    const limits = await getPlanLimits(salon.subscription_plan);
    if (limits.staff > 0) {
      const { count } = await supabase
        .from('staff')
        .select('id', { count: 'exact', head: true })
        .eq('salon_id', session.salonId)
        .eq('is_active', true);

      if ((count ?? 0) >= limits.staff) {
        return { data: null, error: `Your ${salon.subscription_plan} plan allows ${limits.staff} staff members. Upgrade your plan to add more.` };
      }
    }
  }

  // Only create a Supabase Auth account when the owner supplied credentials.
  // Staff left without email + password are "resource" rows (stylist name on
  // appointments) who can't log in — staff.email and staff.auth_user_id are
  // both nullable, so this is a supported state.
  let authUserId: string | null = null;
  if (emailProvided && passwordProvided) {
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: data.email!.trim(),
      password: data.password!,
      email_confirm: true,
    });
    if (authError) {
      const msg = authError.message || '';
      if (/already.*registered|already exists/i.test(msg)) {
        return { data: null, error: 'This email is already registered. Use a different email, or leave email blank for a no-login staff member.' };
      }
      return { data: null, error: msg };
    }
    authUserId = authUser.user.id;
  }

  // Migration 036 renamed staff.branch_id -> staff.primary_branch_id. Stamp
  // the new column; the first branch in the list is the primary.
  const { data: result, error } = await supabase
    .from('staff')
    .insert({
      salon_id: session.salonId,
      primary_branch_id: primaryBranchId,
      name: data.name.trim(),
      email: emailProvided ? data.email!.trim() : null,
      auth_user_id: authUserId,
      phone: data.phone.trim(),
      role: data.role,
      join_date: data.joinDate,
      base_salary: data.baseSalary || 0,
      commission_type: data.commissionType,
      commission_rate: data.commissionRate || 0,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  // Bulk-insert the multi-branch grants. The staff_branches row for the
  // primary branch is redundant with primary_branch_id, but we insert it
  // anyway so reads can use the join table uniformly.
  const { error: branchLinkErr } = await supabase
    .from('staff_branches')
    .insert(branchIds.map((branchId) => ({
      staff_id: (result as { id: string }).id,
      branch_id: branchId,
    })));

  if (branchLinkErr) {
    // Roll back the staff row so we don't leak an orphan that can't log in.
    await supabase.from('staff').delete().eq('id', (result as { id: string }).id);
    return { data: null, error: branchLinkErr.message };
  }

  return { data: result, error: null };
}

export async function updateStaff(id: string, data: unknown) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  // Mass-assignment guard: strip any keys not in the allow-list.
  const parsed = staffUpdateSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Invalid input' };
  }
  const update: Record<string, unknown> = { ...parsed.data };

  // Role changes require the `manage_staff` permission. Owners/partners are
  // lockout-safe (always allowed); any other role needs the permission bit
  // set in the resolved map on the JWT.
  if ('role' in update) {
    try {
      requirePermission(session, 'manage_staff');
    } catch {
      return { error: 'You do not have permission to change staff roles' };
    }
  }

  // staffUpdateSchema still exposes `branch_id` which after migration 036
  // maps to `primary_branch_id`. Rewrite if present, and verify ownership +
  // membership.
  if (typeof update.branch_id === 'string') {
    const target = update.branch_id as string;
    try {
      await assertBranchOwned(target, session.salonId);
      assertBranchMembership(session, target);
    } catch (e) {
      return { error: tenantErrorMessage(e) };
    }
    update.primary_branch_id = target;
    delete update.branch_id;
  }

  // Make absolutely sure the row being updated is ours — both via salon_id
  // filter AND by pre-checking (so a missing row doesn't silently succeed
  // on a zero-row update).
  try {
    await assertStaffOwned(id, session.salonId);
  } catch (e) {
    return { error: tenantErrorMessage(e) };
  }

  const { error } = await supabase
    .from('staff')
    .update(update)
    .eq('id', id)
    .eq('salon_id', session.salonId);

  if (error) return { error: error.message };
  return { error: null };
}

/**
 * Replace the set of branches a staff member is assigned to. Owners/partners
 * can grant any branch in the salon; other roles can only grant branches they
 * themselves belong to (enforced by assertBranchMembership).
 */
export async function updateStaffBranches(staffId: string, branchIds: string[]) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  const targets = Array.from(new Set(branchIds ?? []));
  if (targets.length === 0) {
    return { error: 'At least one branch is required' };
  }

  try {
    await assertStaffOwned(staffId, session.salonId);
    for (const bId of targets) {
      await assertBranchOwned(bId, session.salonId);
      assertBranchMembership(session, bId);
    }
  } catch (e) {
    return { error: tenantErrorMessage(e) };
  }

  // Diff current vs target and apply the delta so we don't disturb unchanged
  // rows (keeps created_at stable for audit purposes).
  const { data: current } = await supabase
    .from('staff_branches')
    .select('id, branch_id')
    .eq('staff_id', staffId);

  const currentSet = new Set(
    (current ?? []).map((r: { branch_id: string }) => r.branch_id),
  );
  const targetSet = new Set(targets);

  const toAdd = targets.filter((b) => !currentSet.has(b));
  const toRemove = (current ?? [])
    .filter((r: { branch_id: string }) => !targetSet.has(r.branch_id))
    .map((r: { id: string }) => r.id);

  if (toAdd.length > 0) {
    const { error: addErr } = await supabase
      .from('staff_branches')
      .insert(toAdd.map((branch_id) => ({ staff_id: staffId, branch_id })));
    if (addErr) return { error: addErr.message };
  }

  if (toRemove.length > 0) {
    const { error: delErr } = await supabase
      .from('staff_branches')
      .delete()
      .in('id', toRemove);
    if (delErr) return { error: delErr.message };
  }

  // If the primary branch was removed from the set, point it at the first
  // remaining target — otherwise the JWT signer would hand out a
  // primaryBranchId the staff no longer belongs to.
  const { data: staffRow } = await supabase
    .from('staff')
    .select('primary_branch_id')
    .eq('id', staffId)
    .maybeSingle();
  const currentPrimary = (staffRow as { primary_branch_id: string | null } | null)?.primary_branch_id;
  if (currentPrimary && !targetSet.has(currentPrimary)) {
    const { error: repErr } = await supabase
      .from('staff')
      .update({ primary_branch_id: targets[0] })
      .eq('id', staffId)
      .eq('salon_id', session.salonId);
    if (repErr) return { error: repErr.message };
  }

  return { error: null };
}

/**
 * List staff assigned to a specific branch via staff_branches (with a fallback
 * to primary_branch_id match, so rows created pre-staff_branches still show).
 * Pass `allBranches=true` for a salon-wide list; requires the
 * `view_other_branches` permission.
 */
export async function getStaffForBranch(
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
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .eq('salon_id', session.salonId)
      .eq('is_active', true)
      .order('name');
    if (error) return { data: null, error: error.message };
    return { data: data ?? [], error: null };
  }

  try {
    assertBranchMembership(session, branchId);
  } catch (e) {
    return { data: null, error: tenantErrorMessage(e) };
  }

  // Two queries: grants from staff_branches and the legacy primary_branch_id
  // path. Union-dedupe in-memory so staff assigned solely via the join table
  // still appear alongside single-branch rows created pre-036.
  const [{ data: joinRows, error: joinErr }, { data: primaryRows, error: primaryErr }] = await Promise.all([
    supabase
      .from('staff_branches')
      .select('staff_id')
      .eq('branch_id', branchId),
    supabase
      .from('staff')
      .select('*')
      .eq('salon_id', session.salonId)
      .eq('primary_branch_id', branchId)
      .eq('is_active', true),
  ]);
  if (joinErr) return { data: null, error: joinErr.message };
  if (primaryErr) return { data: null, error: primaryErr.message };

  const staffIds = Array.from(new Set(
    (joinRows ?? []).map((r: { staff_id: string }) => r.staff_id),
  ));
  let fromJoin: Array<Record<string, unknown>> = [];
  if (staffIds.length > 0) {
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .in('id', staffIds)
      .eq('salon_id', session.salonId)
      .eq('is_active', true);
    if (error) return { data: null, error: error.message };
    fromJoin = (data ?? []) as Array<Record<string, unknown>>;
  }

  const byId = new Map<string, Record<string, unknown>>();
  for (const r of fromJoin) byId.set(r.id as string, r);
  for (const r of (primaryRows ?? []) as Array<Record<string, unknown>>) {
    byId.set(r.id as string, r);
  }
  const merged = Array.from(byId.values()).sort((a, b) =>
    String(a.name ?? '').localeCompare(String(b.name ?? ''))
  );
  return { data: merged, error: null };
}

export async function upsertAttendance(data: {
  staffId: string;
  branchId: string;
  date: string;
  status: string;
  checkIn?: string | null;
  checkOut?: string | null;
  notes?: string | null;
  lateMinutes?: number;
  deductionAmount?: number;
}) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  // Both the staff member AND the branch must be ours — attendance has no
  // salon_id column, so these ownership checks are the only isolation.
  try {
    await assertStaffOwned(data.staffId, session.salonId);
    await assertBranchOwned(data.branchId, session.salonId);
    assertBranchMembership(session, data.branchId);
  } catch (e) {
    return { error: tenantErrorMessage(e) };
  }

  const { error } = await supabase
    .from('attendance')
    .upsert({
      staff_id: data.staffId,
      branch_id: data.branchId,
      date: data.date,
      status: data.status,
      check_in: data.checkIn || null,
      check_out: data.checkOut || null,
      notes: data.notes || null,
      late_minutes: data.lateMinutes || 0,
      deduction_amount: data.deductionAmount || 0,
    }, { onConflict: 'staff_id,date' })
    .select()
    .single();

  if (error) return { error: error.message };
  return { error: null };
}

/**
 * Lightweight staff list for the permissions editor. Returns only the
 * columns the editor cares about (plus `permissions_override` so the UI can
 * render the tri-state without a second fetch). Gated by `manage_permissions`
 * so a staff member without edit rights can't silently dump the roster.
 */
export async function getStaffForPermissions(branchId?: string) {
  const session = await verifySession();
  if (!session.salonId) return { data: null, error: 'No salon context' };
  if (!hasPermission(session, 'manage_permissions')) {
    return { data: null, error: 'Not allowed' };
  }

  const supabase = createServerClient();

  // Scope to staff assigned to the current branch via staff_branches. A
  // multi-branch stylist appears in every branch view they're a member of;
  // single-branch staff only show up in their own. Permissions_override
  // still lives on the staff row (one set per person, not per branch).
  if (branchId) {
    assertBranchMembership(session, branchId);
    const { data: memberRows } = await supabase
      .from('staff_branches')
      .select('staff_id')
      .eq('branch_id', branchId);
    const ids = (memberRows || []).map((r: { staff_id: string }) => r.staff_id);
    if (ids.length === 0) {
      return { data: [] as StaffRowForPermissions[], error: null };
    }
    const { data, error } = await supabase
      .from('staff')
      .select('id, name, role, photo_url, primary_branch_id, permissions_override, is_active')
      .eq('salon_id', session.salonId)
      .eq('is_active', true)
      .in('id', ids)
      .order('role')
      .order('name');
    if (error) return { data: null, error: error.message };
    return { data: (data ?? []) as StaffRowForPermissions[], error: null };
  }

  // Fallback: no branchId passed — return salon-wide (legacy callers).
  const { data, error } = await supabase
    .from('staff')
    .select('id, name, role, photo_url, primary_branch_id, permissions_override, is_active')
    .eq('salon_id', session.salonId)
    .eq('is_active', true)
    .order('role')
    .order('name');

  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as StaffRowForPermissions[], error: null };
}

type StaffRowForPermissions = {
  id: string;
  name: string;
  role: string;
  photo_url: string | null;
  primary_branch_id: string | null;
  permissions_override: Record<string, boolean> | null;
  is_active: boolean;
};

export async function recordAdvance(staffId: string, amount: number, reason?: string | null) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { data: null, error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  // advances has no salon_id column — staff ownership is the only isolation.
  try {
    await assertStaffOwned(staffId, session.salonId);
  } catch (e) {
    return { data: null, error: tenantErrorMessage(e) };
  }

  const { data: result, error } = await supabase
    .from('advances')
    .insert({
      staff_id: staffId,
      amount,
      reason: reason || null,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: result, error: null };
}
