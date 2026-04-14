'use server';

import { verifyWriteAccess } from './auth';
import { createServerClient } from '@/lib/supabase';

export async function openCashDrawer(data: {
  branchId: string;
  date: string;
  openingBalance: number;
  openedBy?: string | null;
}) {
  await verifyWriteAccess();
  const supabase = createServerClient();

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
  await verifyWriteAccess();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('cash_drawers')
    .update({
      closing_balance: data.closingBalance,
      closed_by: data.closedBy || null,
      status: 'closed',
      total_expenses: data.totalExpenses,
    })
    .eq('id', drawerId);

  if (error) return { error: error.message };
  return { error: null };
}
