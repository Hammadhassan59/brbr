'use server';

import { checkWriteAccess } from './auth';
import { createServerClient } from '@/lib/supabase';
import { assertBranchMembership, assertBranchOwned, tenantErrorMessage } from '@/lib/tenant-guard';

export async function createExpense(data: {
  branchId: string;
  category?: string | null;
  amount: number;
  description?: string | null;
  date: string;
  createdBy?: string | null;
}) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  // Branch must belong to this salon AND be in the session's allow-list.
  try {
    await assertBranchOwned(data.branchId, session.salonId);
    assertBranchMembership(session, data.branchId);
  } catch (e) {
    return { error: tenantErrorMessage(e) };
  }

  // expenses.salon_id is now populated (migration 036). Stamp it alongside
  // branch_id so cross-branch reports can filter by salon cheaply.
  const { error } = await supabase
    .from('expenses')
    .insert({
      salon_id: session.salonId,
      branch_id: data.branchId,
      category: data.category || null,
      amount: data.amount,
      description: data.description || null,
      date: data.date,
      created_by: data.createdBy || null,
    });

  if (error) return { error: error.message };
  return { error: null };
}

export async function createExpenses(items: Array<{
  branchId: string;
  category: string;
  amount: number;
  description: string;
  date: string;
  createdBy?: string | null;
}>) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  // Validate every branch in the batch belongs to this salon AND is in the
  // session allow-list. The latter check is new in PR 2 — keeps a manager in
  // branch A from batch-stamping expenses into branch B.
  const branchIds = Array.from(new Set(items.map((i) => i.branchId)));
  if (branchIds.length === 0) return { error: null };
  const { data: branches } = await supabase
    .from('branches')
    .select('id')
    .in('id', branchIds)
    .eq('salon_id', session.salonId);
  const mine = new Set((branches || []).map((b: { id: string }) => b.id));
  for (const id of branchIds) {
    if (!mine.has(id)) return { error: 'Not allowed' };
    try {
      assertBranchMembership(session, id);
    } catch (e) {
      return { error: tenantErrorMessage(e) };
    }
  }

  const { error } = await supabase
    .from('expenses')
    .insert(items.map(i => ({
      salon_id: session.salonId,
      branch_id: i.branchId,
      category: i.category,
      amount: i.amount,
      description: i.description,
      date: i.date,
      created_by: i.createdBy || null,
    })));

  if (error) return { error: error.message };
  return { error: null };
}

export async function updateExpense(id: string, branchId: string, data: {
  category?: string | null;
  amount: number;
  description?: string | null;
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

  // expenses now carries salon_id (migration 036). Filter on both so a
  // caller can't mutate another tenant's row by guessing an id, and can't
  // cross-branch edit without going through the per-branch path.
  const { error } = await supabase
    .from('expenses')
    .update({
      category: data.category || null,
      amount: data.amount,
      description: data.description || null,
    })
    .eq('id', id)
    .eq('salon_id', session.salonId)
    .eq('branch_id', branchId);

  if (error) return { error: error.message };
  return { error: null };
}

export async function deleteExpense(id: string, branchId: string) {
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
    .from('expenses')
    .delete()
    .eq('id', id)
    .eq('salon_id', session.salonId)
    .eq('branch_id', branchId);

  if (error) return { error: error.message };
  return { error: null };
}

/**
 * Delete salary expenses for the given description + date range. Requires
 * a branchId so we scope deletes tightly — otherwise a caller on one salon
 * could craft a description that collided with another salon's salary
 * entries (descriptions are free-text). We now verify the branch is ours
 * AND filter by it, so the delete can't escape the caller's tenant.
 */
export async function deleteSalaryExpenses(
  description: string,
  startDate: string,
  endDate: string,
  branchId: string,
) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  if (!branchId) return { error: 'Branch is required' };
  try {
    await assertBranchOwned(branchId, session.salonId);
    assertBranchMembership(session, branchId);
  } catch (e) {
    return { error: tenantErrorMessage(e) };
  }

  const { error } = await supabase
    .from('expenses')
    .delete()
    .eq('category', 'salary')
    .eq('description', description)
    .eq('salon_id', session.salonId)
    .eq('branch_id', branchId)
    .gte('date', startDate)
    .lte('date', endDate);

  if (error) return { error: error.message };
  return { error: null };
}

export async function updateCashDrawerExpenses(branchId: string, date: string, totalExpenses: number) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  try {
    await assertBranchOwned(branchId, session.salonId);
    assertBranchMembership(session, branchId);
  } catch (e) {
    return { error: tenantErrorMessage(e) };
  }

  const { data: drawer } = await supabase
    .from('cash_drawers')
    .select('*')
    .eq('branch_id', branchId)
    .eq('date', date)
    .eq('status', 'open')
    .single();

  if (drawer) {
    const { error } = await supabase
      .from('cash_drawers')
      .update({ total_expenses: totalExpenses })
      .eq('id', drawer.id)
      .eq('branch_id', branchId);
    if (error) return { error: error.message };
  }

  return { error: null };
}
