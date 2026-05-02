'use server';

import { createServerClient } from '@/lib/supabase';
import { sendEmail } from '@/lib/email-sender';
import { requireAdminRole } from './auth';
import { ADMIN_ROLES, type AdminRole } from '@/lib/admin-roles';
import { checkRateLimit } from '@/lib/with-rate-limit';
import { BUCKETS } from '@/lib/rate-limit-buckets';
import { safeError } from '@/lib/action-error';
import * as authAdmin from '@/app/actions/auth-admin';

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

  // Rate-limit: inviting 5 admins/day per inviter is already unusual. This
  // catches a compromised super-admin session before it mass-invites backdoor
  // accounts (which would each need their own email to accept, but rotating
  // emails is cheaper than people realize).
  const rl = await checkRateLimit(
    'invite-admin',
    session.staffId,
    BUCKETS.INVITE_ADMIN.max,
    BUCKETS.INVITE_ADMIN.windowMs,
  );
  if (!rl.ok) return { data: null, error: rl.error ?? 'Too many invites, please try again later.' };

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
  const { data: authData, error: authErr } = await authAdmin.createUser({
    email,
    password: tmpPassword,
    email_confirm: true,
  });
  if (authErr || !authData.user) {
    return { data: null, error: authErr ? safeError(authErr) : 'Failed to create auth user' };
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
    await authAdmin.deleteUser(authData.user.id).catch(() => {});
    return { data: null, error: safeError(error) };
  }

  // 3. Send password-reset link so the new admin can set their own password.
  try {
    const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://icut.pk';
    const { data: linkData } = await authAdmin.generateLink({
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
  if (error) return { data: [], error: safeError(error) };
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
  return { error: error ? safeError(error) : null };
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
  return { error: error ? safeError(error) : null };
}
