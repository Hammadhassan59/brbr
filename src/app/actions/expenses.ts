'use server';

import { checkWriteAccess } from './auth';
import { createServerClient } from '@/lib/supabase';
import { assertBranchOwned, tenantErrorMessage } from '@/lib/tenant-guard';

/**
 * Fetch the set of branch_ids belonging to the current salon. Used by
 * expense read/delete paths that need a salon_id filter — expenses has no
 * salon_id column, only branch_id, so we scope by "branch_id IN (...)".
 */
async function getSalonBranchIds(
  supabase: ReturnType<typeof createServerClient>,
  salonId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from('branches')
    .select('id')
    .eq('salon_id', salonId);
  return (data || []).map((b: { id: string }) => b.id);
}

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

  // Branch must belong to this salon — expenses has no salon_id column.
  try {
    await assertBranchOwned(data.branchId, session.salonId);
  } catch (e) {
    return { error: tenantErrorMessage(e) };
  }

  const { error } = await supabase
    .from('expenses')
    .insert({
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

  // Validate every branch in the batch belongs to this salon.
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
  }

  const { error } = await supabase
    .from('expenses')
    .insert(items.map(i => ({
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

export async function updateExpense(id: string, data: {
  category?: string | null;
  amount: number;
  description?: string | null;
}) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  // expenses has no salon_id — scope via branch_id IN salon branches.
  const branchIds = await getSalonBranchIds(supabase, session.salonId);
  if (branchIds.length === 0) return { error: 'Not allowed' };

  const { error } = await supabase
    .from('expenses')
    .update({
      category: data.category || null,
      amount: data.amount,
      description: data.description || null,
    })
    .eq('id', id)
    .in('branch_id', branchIds);

  if (error) return { error: error.message };
  return { error: null };
}

export async function deleteExpense(id: string) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  const branchIds = await getSalonBranchIds(supabase, session.salonId);
  if (branchIds.length === 0) return { error: 'Not allowed' };

  const { error } = await supabase
    .from('expenses')
    .delete()
    .eq('id', id)
    .in('branch_id', branchIds);

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
  } catch (e) {
    return { error: tenantErrorMessage(e) };
  }

  const { error } = await supabase
    .from('expenses')
    .delete()
    .eq('category', 'salary')
    .eq('description', description)
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
