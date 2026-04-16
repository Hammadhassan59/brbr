'use server';

import { checkWriteAccess } from './auth';
import { createServerClient } from '@/lib/supabase';
import { assertBranchOwned, tenantErrorMessage } from '@/lib/tenant-guard';

export async function openCashDrawer(data: {
  branchId: string;
  date: string;
  openingBalance: number;
  openedBy?: string | null;
}) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  // cash_drawers has no salon_id — branch ownership is the only guard.
  try {
    await assertBranchOwned(data.branchId, session.salonId);
  } catch (e) {
    return { error: tenantErrorMessage(e) };
  }

  const { error } = await supabase
    .from('cash_drawers')
    .insert({
      branch_id: data.branchId,
      date: data.date,
      opening_balance: data.openingBalance,
      opened_by: data.openedBy || null,
      status: 'open',
    });

  if (error) return { error: error.message };
  return { error: null };
}

export async function closeCashDrawer(drawerId: string, data: {
  closingBalance: number;
  closedBy?: string | null;
  totalExpenses: number;
}) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  // Look up the drawer and verify its branch belongs to this salon before
  // allowing the close. Otherwise a leaked drawer ID from another tenant
  // would let the caller mutate it.
  const { data: drawer } = await supabase
    .from('cash_drawers')
    .select('id, branch_id')
    .eq('id', drawerId)
    .maybeSingle();
  if (!drawer) return { error: 'Not found' };

  try {
    if (!drawer.branch_id) return { error: 'Not allowed' };
    await assertBranchOwned(drawer.branch_id, session.salonId);
  } catch (e) {
    return { error: tenantErrorMessage(e) };
  }

  const { error } = await supabase
    .from('cash_drawers')
    .update({
      closing_balance: data.closingBalance,
      closed_by: data.closedBy || null,
      status: 'closed',
      total_expenses: data.totalExpenses,
    })
    .eq('id', drawerId)
    .eq('branch_id', drawer.branch_id);

  if (error) return { error: error.message };
  return { error: null };
}
