'use server';

import { verifyWriteAccess } from './auth';
import { createServerClient } from '@/lib/supabase';

export async function updateSalon(data: Record<string, unknown>) {
  const session = await verifyWriteAccess();
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
  const session = await verifyWriteAccess();
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
  const session = await verifyWriteAccess();
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
  const session = await verifyWriteAccess();
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
  const session = await verifyWriteAccess();
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
  const session = await verifyWriteAccess();
  if (session.role !== 'owner') return { data: null, error: 'Only the owner can add branches' };
  const supabase = createServerClient();

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
  const session = await verifyWriteAccess();
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
  const session = await verifyWriteAccess();
  if (session.role !== 'owner') return { error: 'Only the owner can delete branches' };
  const supabase = createServerClient();

  // Prevent deleting the main branch
  const { data: branch } = await supabase
    .from('branches')
    .select('is_main')
    .eq('id', branchId)
    .eq('salon_id', session.salonId)
    .single();

  if (branch?.is_main) return { error: 'Cannot delete the main branch' };

  const { error } = await supabase
    .from('branches')
    .delete()
    .eq('id', branchId)
    .eq('salon_id', session.salonId);

  if (error) return { error: error.message };
  return { error: null };
}
