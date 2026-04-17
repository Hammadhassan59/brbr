'use server';

import { checkWriteAccess, getPlanLimits, verifySession } from './auth';
import { createServerClient } from '@/lib/supabase';
import { salonUpdateSchema } from '@/lib/schemas';
import {
  assertBranchMembership,
  assertBranchOwned,
  hasPermission,
  requirePermission,
  tenantErrorMessage,
} from '@/lib/tenant-guard';

export async function updateSalon(data: unknown) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { data: null, error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  // Only callers with `manage_salon` can touch salon-wide settings. Owners
  // and partners are lockout-safe (always permitted). Everyone else needs the
  // permission bit set via role preset or staff override.
  try {
    requirePermission(session, 'manage_salon');
  } catch {
    return { data: null, error: 'You do not have permission to update salon settings' };
  }

  // Strict whitelist — drops any extra keys. Critical: id, owner_id,
  // subscription_*, setup_complete, created_at, slug, sold_by_agent_id,
  // admin_notes are all rejected silently so a compromised client can't
  // hand themselves a free subscription or steal the salon.
  const parsed = salonUpdateSchema.safeParse(data);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message || 'Invalid input' };
  }

  const { data: result, error } = await supabase
    .from('salons')
    .update(parsed.data)
    .eq('id', session.salonId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: result, error: null };
}

export async function updateBranchWorkingHours(branchId: string, workingHours: Record<string, unknown>) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { data: null, error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  const { data: result, error } = await supabase
    .from('branches')
    .update({ working_hours: workingHours })
    .eq('id', branchId)
    .eq('salon_id', session.salonId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: result, error: null };
}

export async function createService(data: {
  branchId: string;
  name: string;
  category: string;
  durationMinutes?: number;
  basePrice: number;
  sortOrder?: number;
}) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { data: null, error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  // Branch must belong to this salon and be in the session allow-list.
  try {
    await assertBranchOwned(data.branchId, session.salonId);
    assertBranchMembership(session, data.branchId);
  } catch (e) {
    return { data: null, error: tenantErrorMessage(e) };
  }

  const { data: result, error } = await supabase
    .from('services')
    .insert({
      salon_id: session.salonId,
      branch_id: data.branchId,
      name: data.name.trim(),
      category: data.category,
      duration_minutes: data.durationMinutes || 30,
      base_price: data.basePrice,
      is_active: true,
      sort_order: data.sortOrder || 0,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: result, error: null };
}

export async function updateService(id: string, branchId: string, data: Record<string, unknown>) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { data: null, error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  try {
    assertBranchMembership(session, branchId);
  } catch (e) {
    return { data: null, error: tenantErrorMessage(e) };
  }

  const { data: result, error } = await supabase
    .from('services')
    .update(data)
    .eq('id', id)
    .eq('salon_id', session.salonId)
    .eq('branch_id', branchId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: result, error: null };
}

export async function deleteService(id: string, branchId: string) {
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
    .from('services')
    .delete()
    .eq('id', id)
    .eq('salon_id', session.salonId)
    .eq('branch_id', branchId);

  if (error) return { error: error.message };
  return { error: null };
}

/**
 * List services for a specific branch. Pass `allBranches=true` (requires the
 * `view_other_branches` permission) to skip the branch filter for cross-branch
 * catalog views in reports.
 */
export async function getServicesForBranch(
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
    .from('services')
    .select('*')
    .eq('salon_id', session.salonId)
    .eq('is_active', true)
    .order('sort_order');
  if (!allBranches) q = q.eq('branch_id', branchId);

  const { data, error } = await q;
  if (error) return { data: null, error: error.message };
  return { data: data ?? [], error: null };
}

const DEFAULT_WORKING_HOURS = {
  mon: { open: '09:00', close: '21:00', off: false },
  tue: { open: '09:00', close: '21:00', off: false },
  wed: { open: '09:00', close: '21:00', off: false },
  thu: { open: '09:00', close: '21:00', off: false },
  fri: { open: '09:00', close: '21:00', off: false, jummah_break: true },
  sat: { open: '09:00', close: '21:00', off: false },
  sun: { open: '09:00', close: '21:00', off: false },
};

export async function createBranch(data: { name: string; address?: string; phone?: string }) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { data: null, error: writeCheck.error };
  const session = writeCheck.session;
  // Adding a branch is a salon-wide change — gate on `manage_salon`.
  try {
    requirePermission(session, 'manage_salon');
  } catch {
    return { data: null, error: 'You do not have permission to add branches' };
  }
  const supabase = createServerClient();

  // Enforce branch limit based on plan
  const { data: salon } = await supabase
    .from('salons')
    .select('subscription_plan')
    .eq('id', session.salonId)
    .single();

  if (salon) {
    const limits = await getPlanLimits(salon.subscription_plan);
    if (limits.branches > 0) {
      const { count } = await supabase
        .from('branches')
        .select('id', { count: 'exact', head: true })
        .eq('salon_id', session.salonId);

      if ((count ?? 0) >= limits.branches) {
        return { data: null, error: `Your ${salon.subscription_plan} plan allows ${limits.branches} branch${limits.branches > 1 ? 'es' : ''}. Upgrade your plan to add more.` };
      }
    }
  }

  const { data: result, error } = await supabase
    .from('branches')
    .insert({
      salon_id: session.salonId,
      name: data.name.trim(),
      address: data.address || null,
      phone: data.phone || null,
      is_main: false,
      working_hours: DEFAULT_WORKING_HOURS,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: result, error: null };
}

export async function updateBranch(branchId: string, data: { name?: string; address?: string; phone?: string }) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { data: null, error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  const updates: Record<string, unknown> = {};
  if (data.name !== undefined) updates.name = data.name.trim();
  if (data.address !== undefined) updates.address = data.address || null;
  if (data.phone !== undefined) updates.phone = data.phone || null;

  const { data: result, error } = await supabase
    .from('branches')
    .update(updates)
    .eq('id', branchId)
    .eq('salon_id', session.salonId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: result, error: null };
}

/**
 * Counts of child rows tied to a branch. Used by the delete-branch modal so
 * the owner can see exactly what will be moved before they confirm.
 */
export async function getBranchUsage(branchId: string): Promise<{
  data: { bills: number; appointments: number; staff: number; attendance: number; expenses: number; cashDrawers: number; purchaseOrders: number; stockMovements: number; total: number } | null;
  error: string | null;
}> {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { data: null, error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  // Make sure the branch belongs to this salon.
  const { data: branch } = await supabase
    .from('branches')
    .select('id')
    .eq('id', branchId)
    .eq('salon_id', session.salonId)
    .maybeSingle();
  if (!branch) return { data: null, error: 'Branch not found' };

  const tables = [
    'bills', 'appointments', 'staff', 'attendance', 'expenses',
    'cash_drawers', 'purchase_orders', 'stock_movements',
  ] as const;
  const counts = await Promise.all(
    tables.map((t) =>
      supabase.from(t).select('id', { count: 'exact', head: true }).eq('branch_id', branchId),
    ),
  );
  const get = (i: number) => counts[i].count ?? 0;
  const data = {
    bills: get(0),
    appointments: get(1),
    staff: get(2),
    attendance: get(3),
    expenses: get(4),
    cashDrawers: get(5),
    purchaseOrders: get(6),
    stockMovements: get(7),
    total: counts.reduce((s, r) => s + (r.count ?? 0), 0),
  };
  return { data, error: null };
}

export async function deleteBranch(branchId: string, reassignToBranchId?: string) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  // Deleting a branch is catastrophic (wipes/relocates bills, staff, attendance,
  // etc). Require `manage_salon` AND additionally constrain to owner — partners
  // or any other role with `manage_salon` granted still can't nuke a branch.
  try {
    requirePermission(session, 'manage_salon');
  } catch {
    return { error: 'You do not have permission to delete branches' };
  }
  if (session.role !== 'owner') return { error: 'Only the owner can delete branches' };
  const supabase = createServerClient();

  // Pull every branch for the salon so we can validate + decide whether the
  // delete needs to promote a new main.
  const { data: branches } = await supabase
    .from('branches')
    .select('id, is_main')
    .eq('salon_id', session.salonId);

  const target = (branches || []).find((b: { id: string }) => b.id === branchId);
  if (!target) return { error: 'Branch not found' };

  if ((branches || []).length <= 1) {
    return { error: 'Cannot delete the only branch — every salon needs at least one' };
  }

  // Validate the reassignment destination if provided.
  if (reassignToBranchId) {
    if (reassignToBranchId === branchId) {
      return { error: 'Reassign target must be a different branch' };
    }
    const dest = (branches || []).find((b: { id: string }) => b.id === reassignToBranchId);
    if (!dest) return { error: 'Reassign target branch not found' };
  }

  // Check what's tied to this branch. If anything is and we don't have a
  // reassign target, refuse — otherwise the FK delete would just fail with
  // a cryptic Postgres error.
  const usage = await getBranchUsage(branchId);
  if (usage.data && usage.data.total > 0 && !reassignToBranchId) {
    return {
      error: `This branch has ${usage.data.total} linked records (bills, staff, etc). Pick another branch to move them to before deleting.`,
    };
  }

  // Reassign all child rows to the target branch BEFORE the parent delete.
  // cash_drawers has a UNIQUE (branch_id, date) constraint, so we can't blindly
  // re-point — drop the source-branch drawers (per-day operational records;
  // the bills they tracked move with the bills table).
  if (reassignToBranchId && usage.data && usage.data.total > 0) {
    const { error: dropDrawersErr } = await supabase
      .from('cash_drawers')
      .delete()
      .eq('branch_id', branchId);
    if (dropDrawersErr) return { error: `cash_drawers: ${dropDrawersErr.message}` };

    const movableTables = ['bills', 'appointments', 'staff', 'attendance', 'expenses', 'purchase_orders', 'stock_movements'] as const;
    for (const t of movableTables) {
      const { error: moveErr } = await supabase
        .from(t)
        .update({ branch_id: reassignToBranchId })
        .eq('branch_id', branchId);
      if (moveErr) return { error: `${t}: ${moveErr.message}` };
    }
  }

  // If we're deleting the current main, promote any other branch to main
  // FIRST so there's never a window where the salon has zero main branches.
  if (target.is_main) {
    const successor = (branches || []).find((b: { id: string; is_main: boolean }) => b.id !== branchId);
    if (successor) {
      const { error: promoteErr } = await supabase
        .from('branches')
        .update({ is_main: true })
        .eq('id', successor.id);
      if (promoteErr) return { error: `Failed to promote successor branch: ${promoteErr.message}` };
    }
  }

  const { error } = await supabase
    .from('branches')
    .delete()
    .eq('id', branchId)
    .eq('salon_id', session.salonId);

  if (error) return { error: error.message };
  return { error: null };
}
