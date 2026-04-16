'use server';

import { createServerClient } from '@/lib/supabase';
import { sendEmail } from '@/lib/email-sender';
import { requireAdminRole } from './auth';
import { ADMIN_ROLES, type AdminRole } from '@/lib/admin-roles';

export interface AdminUserRow {
  id: string;
  user_id: string;
  email: string;
  role: AdminRole;
  active: boolean;
  invited_by: string | null;
  created_at: string;
  deactivated_at: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Super-admin only: invite a new admin user with a specific role. Creates a
 * Supabase Auth user, sends a password-reset link so they can set their own
 * password, and inserts the admin_users row. Mirrors createSalesAgent.
 */
export async function inviteAdmin(input: {
  email: string;
  role: AdminRole;
}): Promise<{ data: AdminUserRow | null; error: string | null }> {
  const session = await requireAdminRole(['super_admin']);

  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { data: null, error: 'Invalid email' };
  if (!(ADMIN_ROLES as readonly string[]).includes(input.role)) {
    return { data: null, error: 'Invalid role' };
  }

  const supabase = createServerClient();

  // Reject duplicates up-front so we don't half-create the auth user.
  const { data: existing } = await supabase
    .from('admin_users')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (existing) return { data: null, error: 'This email is already an admin' };

  // 1. Create auth user with random password.
  const tmpPassword = crypto.randomUUID() + 'A1!';
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password: tmpPassword,
    email_confirm: true,
  });
  if (authErr || !authData.user) {
    return { data: null, error: authErr?.message ?? 'Failed to create auth user' };
  }

  // 2. Insert admin_users row.
  const { data, error } = await supabase
    .from('admin_users')
    .insert({
      user_id: authData.user.id,
      email,
      role: input.role,
      invited_by: session.staffId,
      active: true,
    })
    .select()
    .single();

  if (error) {
    await supabase.auth.admin.deleteUser(authData.user.id).catch(() => {});
    return { data: null, error: error.message };
  }

  // 3. Send password-reset link so the new admin can set their own password.
  try {
    const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://icut.pk';
    const { data: linkData } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${origin}/reset-password` },
    });
    const link = linkData?.properties?.action_link;
    if (link) {
      await sendEmail(
        email,
        'iCut — Your admin account',
        `<p>You have been invited to the iCut admin panel as <strong>${input.role.replace('_', ' ')}</strong>.</p>
         <p><a href="${link}">Set your password</a> to get started.</p>
         <p>Then log in at ${origin}/login.</p>`,
      );
    }
  } catch {
    // Non-critical — super admin can resend via reset flow.
  }

  return { data: data as AdminUserRow, error: null };
}

export async function listAdminUsers(): Promise<{ data: AdminUserRow[]; error: string | null }> {
  await requireAdminRole(['super_admin']);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('admin_users')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data || []) as AdminUserRow[], error: null };
}

export async function setAdminActive(
  adminUserId: string,
  active: boolean,
): Promise<{ error: string | null }> {
  const session = await requireAdminRole(['super_admin']);
  const supabase = createServerClient();

  // Defense in depth: super admin can't deactivate themselves and lock everyone
  // out. The bootstrap env var path would still let them back in, but this
  // surface error is friendlier than a midnight-incident page.
  const { data: row } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('id', adminUserId)
    .maybeSingle();
  if (row && row.user_id === session.staffId && !active) {
    return { error: 'You cannot deactivate yourself' };
  }

  const { error } = await supabase
    .from('admin_users')
    .update({
      active,
      deactivated_at: active ? null : new Date().toISOString(),
    })
    .eq('id', adminUserId);
  return { error: error?.message ?? null };
}

export async function updateAdminRole(
  adminUserId: string,
  role: AdminRole,
): Promise<{ error: string | null }> {
  const session = await requireAdminRole(['super_admin']);
  if (!(ADMIN_ROLES as readonly string[]).includes(role)) {
    return { error: 'Invalid role' };
  }
  const supabase = createServerClient();

  // Don't let a super admin demote themselves — same lock-out concern as above.
  const { data: row } = await supabase
    .from('admin_users')
    .select('user_id, role')
    .eq('id', adminUserId)
    .maybeSingle();
  if (row && row.user_id === session.staffId && row.role === 'super_admin' && role !== 'super_admin') {
    return { error: 'You cannot demote yourself' };
  }

  const { error } = await supabase.from('admin_users').update({ role }).eq('id', adminUserId);
  return { error: error?.message ?? null };
}
