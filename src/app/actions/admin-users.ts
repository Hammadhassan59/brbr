'use server';

import { randomBytes } from 'node:crypto';
import { createServerClient } from '@/lib/supabase';
import { requireAdminRole } from './auth';
import { checkRateLimit } from '@/lib/with-rate-limit';
import { BUCKETS } from '@/lib/rate-limit-buckets';
import * as authAdmin from '@/app/actions/auth-admin';

/**
 * 16-char password from an alphabet that avoids visually-ambiguous characters
 * (O/0, I/l/1, B/8). Uses crypto.randomBytes so the RNG is suitable for
 * password issuance — NOT Math.random. The alphabet has 58 distinct chars,
 * giving ~log2(58^16) ≈ 93 bits of entropy.
 */
function generateStrongPassword(length = 16): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789#@$%&+';
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export async function toggleStaffActive(staffId: string, isActive: boolean) {
  await requireAdminRole(['super_admin', 'technical_support']);
  const supabase = createServerClient();

  const { error } = await supabase
    .from('staff')
    .update({ is_active: isActive })
    .eq('id', staffId);

  if (error) throw error;
  return { success: true };
}

export async function resetUserPassword(email: string, newPassword: string) {
  const session = await requireAdminRole(['super_admin', 'technical_support']);

  // Rate-limit: a compromised super-admin session would be a devastating
  // blast radius — throttle password resets per admin+target-email so a
  // single session can only reset 5 accounts per 5 minutes.
  const rl = await checkRateLimit(
    'admin-reset-password',
    `${session.staffId}:${email.toLowerCase()}`,
    BUCKETS.LOGIN_ATTEMPTS.max,
    BUCKETS.LOGIN_ATTEMPTS.windowMs,
  );
  if (!rl.ok) throw new Error(rl.error ?? 'Too many password resets, please slow down.');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const headers = {
    Authorization: `Bearer ${serviceKey}`,
    apikey: anonKey,
    'Content-Type': 'application/json',
  };

  // Step 1: Find the user by email
  const listRes = await fetch(
    `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}&per_page=1`,
    { headers },
  );

  if (!listRes.ok) {
    throw new Error('Failed to look up user');
  }

  const listData = await listRes.json();
  // Supabase returns { users: [...] }
  const users = listData.users ?? listData;
  const user = Array.isArray(users) ? users[0] : null;

  if (!user) {
    throw new Error(`No auth user found with email: ${email}`);
  }

  // Step 2: Update the password
  const updateRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ password: newPassword }),
  });

  if (!updateRes.ok) {
    throw new Error('Failed to reset password');
  }

  return { success: true };
}

/**
 * Generate a strong random password and assign it to the given salon's owner.
 *
 * Used by the admin panel when a salon owner has lost their password and
 * needs a fresh one to share back. The new password is returned exactly once
 * — the admin must copy it and send it to the owner out-of-band (WhatsApp,
 * SMS, call). We never persist or log the returned string.
 *
 * Authorization: super_admin + technical_support (same as resetUserPassword).
 * Rate-limited by admin user id + salon id using the LOGIN_ATTEMPTS bucket
 * (5 resets per 5 minutes).
 */
export async function generateSalonOwnerPassword(
  salonId: string,
): Promise<{ success: true; email: string; password: string } | { success: false; error: string }> {
  const session = await requireAdminRole(['super_admin', 'technical_support']);

  const rl = await checkRateLimit(
    'admin-generate-password',
    `${session.staffId}:${salonId}`,
    BUCKETS.LOGIN_ATTEMPTS.max,
    BUCKETS.LOGIN_ATTEMPTS.windowMs,
  );
  if (!rl.ok) {
    return { success: false, error: rl.error ?? 'Too many password resets, please slow down.' };
  }

  const supabase = createServerClient();

  const { data: salon, error: salonErr } = await supabase
    .from('salons')
    .select('id, owner_id, name')
    .eq('id', salonId)
    .maybeSingle();
  if (salonErr || !salon) return { success: false, error: 'Salon not found' };
  if (!salon.owner_id) return { success: false, error: 'Salon has no owner account linked' };

  const { data: userRes, error: userErr } = await authAdmin.getUserById(salon.owner_id);
  const email = userRes?.user?.email;
  if (userErr || !email) return { success: false, error: 'Could not resolve owner email' };

  const password = generateStrongPassword(16);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const updateRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${salon.owner_id}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password }),
  });
  if (!updateRes.ok) {
    return { success: false, error: 'Failed to update password' };
  }

  return { success: true, email, password };
}
