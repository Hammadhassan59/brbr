'use server';

import { checkWriteAccess, getPlanLimits } from './auth';
import { createServerClient } from '@/lib/supabase';
import { staffUpdateSchema } from '@/lib/schemas';
import { assertStaffOwned, assertBranchOwned, tenantErrorMessage } from '@/lib/tenant-guard';

const ROLE_WRITABLE_BY: ReadonlyArray<string> = ['owner', 'partner', 'manager'];

export async function createStaff(data: {
  branchId: string;
  name: string;
  email: string;
  password: string;
  phone: string;
  role: string;
  joinDate?: string;
  baseSalary?: number;
  commissionType?: string;
  commissionRate?: number;
}) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { data: null, error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  if (!data.phone?.trim()) return { data: null, error: 'Phone is required' };

  // Branch must belong to this salon — otherwise the staff row gets created
  // pointing at someone else's branch.
  try {
    await assertBranchOwned(data.branchId, session.salonId);
  } catch (e) {
    return { data: null, error: tenantErrorMessage(e) };
  }

  // Enforce staff limit based on plan
  const { data: salon } = await supabase
    .from('salons')
    .select('subscription_plan')
    .eq('id', session.salonId)
    .single();

  if (salon) {
    const limits = await getPlanLimits(salon.subscription_plan);
    if (limits.staff > 0) {
      const { count } = await supabase
        .from('staff')
        .select('id', { count: 'exact', head: true })
        .eq('salon_id', session.salonId)
        .eq('is_active', true);

      if ((count ?? 0) >= limits.staff) {
        return { data: null, error: `Your ${salon.subscription_plan} plan allows ${limits.staff} staff members. Upgrade your plan to add more.` };
      }
    }
  }

  // Create Supabase Auth account for the staff member
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true,
  });

  if (authError) return { data: null, error: authError.message };

  const { data: result, error } = await supabase
    .from('staff')
    .insert({
      salon_id: session.salonId,
      branch_id: data.branchId,
      name: data.name.trim(),
      email: data.email,
      auth_user_id: authUser.user.id,
      phone: data.phone.trim(),
      role: data.role,
      join_date: data.joinDate,
      base_salary: data.baseSalary || 0,
      commission_type: data.commissionType,
      commission_rate: data.commissionRate || 0,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: result, error: null };
}

export async function updateStaff(id: string, data: unknown) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  // Mass-assignment guard: strip any keys not in the allow-list.
  const parsed = staffUpdateSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Invalid input' };
  }
  const update: Record<string, unknown> = { ...parsed.data };

  // Role changes require owner/partner/manager (session.role comes from the
  // JWT, so it's trusted).
  if ('role' in update && !ROLE_WRITABLE_BY.includes(session.role)) {
    return { error: 'Only owners, partners, or managers can change staff roles' };
  }

  // If branch is changing, it must belong to this salon.
  if (typeof update.branch_id === 'string') {
    try {
      await assertBranchOwned(update.branch_id, session.salonId);
    } catch (e) {
      return { error: tenantErrorMessage(e) };
    }
  }

  // Make absolutely sure the row being updated is ours — both via salon_id
  // filter AND by pre-checking (so a missing row doesn't silently succeed
  // on a zero-row update).
  try {
    await assertStaffOwned(id, session.salonId);
  } catch (e) {
    return { error: tenantErrorMessage(e) };
  }

  const { error } = await supabase
    .from('staff')
    .update(update)
    .eq('id', id)
    .eq('salon_id', session.salonId);

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
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  // Both the staff member AND the branch must be ours — attendance has no
  // salon_id column, so these ownership checks are the only isolation.
  try {
    await assertStaffOwned(data.staffId, session.salonId);
    await assertBranchOwned(data.branchId, session.salonId);
  } catch (e) {
    return { error: tenantErrorMessage(e) };
  }

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
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { data: null, error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  // advances has no salon_id column — staff ownership is the only isolation.
  try {
    await assertStaffOwned(staffId, session.salonId);
  } catch (e) {
    return { data: null, error: tenantErrorMessage(e) };
  }

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
