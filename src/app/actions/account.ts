'use server';

import { createClient } from '@supabase/supabase-js';
import { verifySession } from './auth';

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

const MIN_PASSWORD_LENGTH = 6;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AccountRole = 'owner' | 'partner' | 'staff' | 'super_admin' | 'sales_agent';

const STAFF_ROLES = ['staff', 'manager', 'stylist', 'senior_stylist', 'junior_stylist', 'receptionist', 'cashier'];

// Resolve the Supabase auth user id for the signed-in actor.
// - owner / super_admin / sales_agent: session.staffId IS the auth user id (login flow).
// - partner / staff: look up the row by session.staffId and read auth_user_id.
async function resolveAuthUserId(): Promise<
  | { authUserId: string; role: AccountRole; session: Awaited<ReturnType<typeof verifySession>> }
  | { error: string }
> {
  const session = await verifySession();

  if (session.role === 'owner' || session.role === 'super_admin' || session.role === 'sales_agent') {
    if (!session.staffId) return { error: 'Account not linked' };
    return { authUserId: session.staffId, role: session.role as AccountRole, session };
  }

  const { createServerClient } = await import('@/lib/supabase');
  const supabase = createServerClient();

  if (session.role === 'partner') {
    const { data } = await supabase
      .from('salon_partners')
      .select('auth_user_id, salon_id')
      .eq('id', session.staffId)
      .maybeSingle();
    if (!data?.auth_user_id) return { error: 'Account not linked' };
    if (data.salon_id !== session.salonId) return { error: 'Access denied' };
    return { authUserId: data.auth_user_id, role: 'partner', session };
  }

  if (STAFF_ROLES.includes(session.role)) {
    const { data } = await supabase
      .from('staff')
      .select('auth_user_id, salon_id')
      .eq('id', session.staffId)
      .maybeSingle();
    if (!data?.auth_user_id) return { error: 'Account not linked' };
    if (data.salon_id !== session.salonId) return { error: 'Access denied' };
    return { authUserId: data.auth_user_id, role: 'staff', session };
  }

  return { error: 'Account management not available for this role' };
}

function anonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface AccountProfile {
  email: string;
  role: AccountRole;
  name: string | null;        // null where not stored (owner, super_admin)
  phone: string | null;       // null where not stored (super_admin)
  phoneEditable: boolean;     // false for owner (phone is on salons.phone) and super_admin
  nameEditable: boolean;      // false for owner (name is on salons.name) and super_admin
}

export async function getAccountProfile(): Promise<ActionResult<AccountProfile>> {
  const resolved = await resolveAuthUserId();
  if ('error' in resolved) return { data: null, error: resolved.error };

  const { createServerClient } = await import('@/lib/supabase');
  const supabase = createServerClient();
  const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(resolved.authUserId);
  if (userErr || !userData.user) return { data: null, error: userErr?.message || 'User not found' };

  const email = userData.user.email || '';

  if (resolved.role === 'partner') {
    const { data: p } = await supabase.from('salon_partners').select('name, phone').eq('id', resolved.session.staffId).maybeSingle();
    return { data: { email, role: 'partner', name: p?.name ?? null, phone: p?.phone ?? null, phoneEditable: true, nameEditable: true }, error: null };
  }
  if (resolved.role === 'staff') {
    const { data: s } = await supabase.from('staff').select('name, phone').eq('id', resolved.session.staffId).maybeSingle();
    return { data: { email, role: 'staff', name: s?.name ?? null, phone: s?.phone ?? null, phoneEditable: true, nameEditable: true }, error: null };
  }
  if (resolved.role === 'sales_agent') {
    const { data: a } = await supabase.from('sales_agents').select('name, phone').eq('user_id', resolved.authUserId).maybeSingle();
    return { data: { email, role: 'sales_agent', name: a?.name ?? null, phone: a?.phone ?? null, phoneEditable: true, nameEditable: true }, error: null };
  }

  // owner / super_admin — no editable row
  return { data: { email, role: resolved.role, name: null, phone: null, phoneEditable: false, nameEditable: false }, error: null };
}

export async function updateAccountProfile(
  input: { name?: string; phone?: string }
): Promise<ActionResult<{ name: string | null; phone: string | null }>> {
  const resolved = await resolveAuthUserId();
  if ('error' in resolved) return { data: null, error: resolved.error };

  const name = input.name?.trim();
  const phone = input.phone?.trim();

  if (name !== undefined && name.length === 0) return { data: null, error: 'Name cannot be empty' };
  if (phone !== undefined && phone.length === 0) return { data: null, error: 'Phone cannot be empty' };
  if (name === undefined && phone === undefined) return { data: null, error: 'Nothing to update' };

  const { createServerClient } = await import('@/lib/supabase');
  const supabase = createServerClient();

  const patch: Record<string, string> = {};
  if (name !== undefined) patch.name = name;
  if (phone !== undefined) patch.phone = phone;

  if (resolved.role === 'partner') {
    const { error } = await supabase.from('salon_partners').update(patch).eq('id', resolved.session.staffId);
    if (error) return { data: null, error: error.message };
    return { data: { name: name ?? null, phone: phone ?? null }, error: null };
  }
  if (resolved.role === 'staff') {
    const { error } = await supabase.from('staff').update(patch).eq('id', resolved.session.staffId);
    if (error) return { data: null, error: error.message };
    return { data: { name: name ?? null, phone: phone ?? null }, error: null };
  }
  if (resolved.role === 'sales_agent') {
    const { error } = await supabase.from('sales_agents').update(patch).eq('user_id', resolved.authUserId);
    if (error) return { data: null, error: error.message };
    return { data: { name: name ?? null, phone: phone ?? null }, error: null };
  }

  return { data: null, error: 'Name and phone are not editable from here for this role' };
}

export async function getAccountEmail(): Promise<ActionResult<{ email: string }>> {
  const resolved = await resolveAuthUserId();
  if ('error' in resolved) return { data: null, error: resolved.error };

  const { createServerClient } = await import('@/lib/supabase');
  const supabase = createServerClient();
  const { data, error } = await supabase.auth.admin.getUserById(resolved.authUserId);
  if (error || !data.user) return { data: null, error: error?.message || 'User not found' };
  return { data: { email: data.user.email || '' }, error: null };
}

export async function changeAccountPassword(
  input: { currentPassword: string; newPassword: string }
): Promise<ActionResult<{ success: true }>> {
  const { currentPassword, newPassword } = input;

  if (!currentPassword) return { data: null, error: 'Current password is required' };
  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    return { data: null, error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  if (currentPassword === newPassword) {
    return { data: null, error: 'New password must differ from current password' };
  }

  const resolved = await resolveAuthUserId();
  if ('error' in resolved) return { data: null, error: resolved.error };

  const { createServerClient } = await import('@/lib/supabase');
  const supabase = createServerClient();

  const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(resolved.authUserId);
  if (userErr || !userData.user?.email) {
    return { data: null, error: userErr?.message || 'User not found' };
  }

  // Verify current password by attempting sign-in on a throwaway anon client.
  const anon = anonClient();
  const { error: signInErr } = await anon.auth.signInWithPassword({
    email: userData.user.email,
    password: currentPassword,
  });
  if (signInErr) return { data: null, error: 'Current password is incorrect' };
  await anon.auth.signOut();

  const { error: updErr } = await supabase.auth.admin.updateUserById(resolved.authUserId, {
    password: newPassword,
  });
  if (updErr) return { data: null, error: updErr.message };

  return { data: { success: true }, error: null };
}

export async function changeAccountEmail(
  input: { currentPassword: string; newEmail: string }
): Promise<ActionResult<{ email: string }>> {
  const currentPassword = input.currentPassword;
  const newEmail = input.newEmail?.trim().toLowerCase();

  if (!currentPassword) return { data: null, error: 'Current password is required' };
  if (!newEmail || !EMAIL_RE.test(newEmail)) return { data: null, error: 'Enter a valid email address' };

  const resolved = await resolveAuthUserId();
  if ('error' in resolved) return { data: null, error: resolved.error };

  const { createServerClient } = await import('@/lib/supabase');
  const supabase = createServerClient();

  const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(resolved.authUserId);
  if (userErr || !userData.user?.email) {
    return { data: null, error: userErr?.message || 'User not found' };
  }
  const currentEmail = userData.user.email;
  if (newEmail === currentEmail.toLowerCase()) {
    return { data: null, error: 'New email is the same as current email' };
  }

  // Verify current password before changing email.
  const anon = anonClient();
  const { error: signInErr } = await anon.auth.signInWithPassword({
    email: currentEmail,
    password: currentPassword,
  });
  if (signInErr) return { data: null, error: 'Current password is incorrect' };
  await anon.auth.signOut();

  const { error: updErr } = await supabase.auth.admin.updateUserById(resolved.authUserId, {
    email: newEmail,
    email_confirm: true,
  });
  if (updErr) return { data: null, error: updErr.message };

  // Mirror email on staff / salon_partners rows so lookups by email still work.
  if (resolved.role === 'partner') {
    await supabase.from('salon_partners').update({ email: newEmail }).eq('id', resolved.session.staffId);
  } else if (resolved.role === 'staff') {
    await supabase.from('staff').update({ email: newEmail }).eq('id', resolved.session.staffId);
  }

  return { data: { email: newEmail }, error: null };
}
