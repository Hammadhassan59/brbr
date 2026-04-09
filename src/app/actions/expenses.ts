'use server';

import { verifySession } from './auth';
import { createServerClient } from '@/lib/supabase';

export async function createExpense(data: {
  branchId: string;
  category?: string | null;
  amount: number;
  description?: string | null;
  date: string;
  createdBy?: string | null;
}) {
  await verifySession();
  const supabase = createServerClient();

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
  await verifySession();
  const supabase = createServerClient();

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
  await verifySession();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('expenses')
    .update({
      category: data.category || null,
      amount: data.amount,
      description: data.description || null,
    })
    .eq('id', id);

  if (error) return { error: error.message };
  return { error: null };
}

export async function deleteExpense(id: string) {
  await verifySession();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('expenses')
    .delete()
    .eq('id', id);

  if (error) return { error: error.message };
  return { error: null };
}

export async function deleteSalaryExpenses(description: string, startDate: string, endDate: string) {
  await verifySession();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('expenses')
    .delete()
    .eq('category', 'salary')
    .eq('description', description)
    .gte('date', startDate)
    .lte('date', endDate);

  if (error) return { error: error.message };
  return { error: null };
}

export async function updateCashDrawerExpenses(branchId: string, date: string, totalExpenses: number) {
  await verifySession();
  const supabase = createServerClient();

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
      .eq('id', drawer.id);
    if (error) return { error: error.message };
  }

  return { error: null };
}
