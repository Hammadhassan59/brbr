'use server';

import { verifySession } from './auth';
import { createServerClient } from '@/lib/supabase';

export async function createStaff(data: {
  branchId: string;
  name: string;
  phone?: string | null;
  role: string;
  joinDate?: string;
  baseSalary?: number;
  commissionType?: string;
  commissionRate?: number;
  pinCode: string;
}) {
  const session = await verifySession();
  const supabase = createServerClient();

  const { data: result, error } = await supabase
    .from('staff')
    .insert({
      salon_id: session.salonId,
      branch_id: data.branchId,
      name: data.name.trim(),
      phone: data.phone || null,
      role: data.role,
      join_date: data.joinDate,
      base_salary: data.baseSalary || 0,
      commission_type: data.commissionType,
      commission_rate: data.commissionRate || 0,
      pin_code: data.pinCode,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: result, error: null };
}

export async function updateStaff(id: string, data: Record<string, unknown>) {
  const session = await verifySession();
  const supabase = createServerClient();

  // Ensure salon_id matches session
  data.salon_id = session.salonId;

  const { error } = await supabase
    .from('staff')
    .update(data)
    .eq('id', id);

  if (error) return { error: error.message };
  return { error: null };
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
  await verifySession();
  const supabase = createServerClient();

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

export async function recordAdvance(staffId: string, amount: number, reason?: string | null) {
  await verifySession();
  const supabase = createServerClient();

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
