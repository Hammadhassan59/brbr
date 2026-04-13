'use server';

import { verifySession } from './auth';
import { createServerClient } from '@/lib/supabase';

export async function updateSalon(data: Record<string, unknown>) {
  const session = await verifySession();
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
  const session = await verifySession();
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
  const session = await verifySession();
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
  const session = await verifySession();
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
  const session = await verifySession();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('services')
    .delete()
    .eq('id', id)
    .eq('salon_id', session.salonId);

  if (error) return { error: error.message };
  return { error: null };
}
