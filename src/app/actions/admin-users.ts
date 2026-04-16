'use server';

import { createServerClient } from '@/lib/supabase';
import { verifySession } from './auth';
import { checkRateLimit } from '@/lib/with-rate-limit';
import { BUCKETS } from '@/lib/rate-limit-buckets';

async function requireSuperAdmin() {
  const session = await verifySession();
  if (!session || session.role !== 'super_admin') {
    throw new Error('Unauthorized');
  }
  return session;
}

export async function toggleStaffActive(staffId: string, isActive: boolean) {
  await requireSuperAdmin();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('staff')
    .update({ is_active: isActive })
    .eq('id', staffId);

  if (error) throw error;
  return { success: true };
}

export async function resetUserPassword(email: string, newPassword: string) {
  const session = await requireSuperAdmin();

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
