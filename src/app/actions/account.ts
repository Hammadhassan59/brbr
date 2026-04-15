'use server';

import { createClient } from '@supabase/supabase-js';
import { verifySession } from './auth';

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

const MIN_PASSWORD_LENGTH = 6;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Resolve the Supabase auth user id for the signed-in actor.
// - owner: session.staffId was set to the auth user id on login.
// - partner/staff: look up the row by session.staffId and read auth_user_id.
// - super_admin / sales_agent: not supported by this flow.
async function resolveAuthUserId(): Promise<
  | { authUserId: string; role: 'owner' | 'partner' | 'staff'; session: Awaited<ReturnType<typeof verifySession>> }
  | { error: string }
> {
  const session = await verifySession();

  if (session.role === 'owner') {
    if (!session.staffId) return { error: 'Account not linked' };
    return { authUserId: session.staffId, role: 'owner', session };
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

  if (session.role === 'staff' || ['manager', 'stylist', 'receptionist', 'cashier'].includes(session.role)) {
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
