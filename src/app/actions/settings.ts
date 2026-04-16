'use server';

import { checkWriteAccess, getPlanLimits } from './auth';
import { createServerClient } from '@/lib/supabase';

export async function updateSalon(data: Record<string, unknown>) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { data: null, error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  const { data: result, error } = await supabase
    .from('salons')
    .update(data)
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

  const { data: result, error } = await supabase
    .from('services')
    .insert({
      salon_id: session.salonId,
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

export async function updateService(id: string, data: Record<string, unknown>) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { data: null, error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  const { data: result, error } = await supabase
    .from('services')
    .update(data)
    .eq('id', id)
    .eq('salon_id', session.salonId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: result, error: null };
}

export async function deleteService(id: string) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  const { error } = await supabase
    .from('services')
    .delete()
    .eq('id', id)
    .eq('salon_id', session.salonId);

  if (error) return { error: error.message };
  return { error: null };
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
  if (session.role !== 'owner') return { data: null, error: 'Only the owner can add branches' };
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

export async function deleteBranch(branchId: string) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
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
