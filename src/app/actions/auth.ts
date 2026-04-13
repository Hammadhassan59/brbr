'use server';

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

if (!process.env.SESSION_SECRET) {
  throw new Error('Missing SESSION_SECRET environment variable');
}
const SECRET = new TextEncoder().encode(process.env.SESSION_SECRET);
const COOKIE_NAME = 'icut-token';

export interface SessionPayload {
  salonId: string;
  staffId: string;
  role: string;
  branchId: string;
  name: string;
}

export async function signSession(payload: SessionPayload) {
  const token = await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(SECRET);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24,
    path: '/',
  });

  return { success: true };
}

export async function verifySession(): Promise<SessionPayload> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    throw new Error('Not authenticated');
  }

  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    throw new Error('Invalid or expired session');
  }
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  return { success: true };
}

/**
 * After Supabase Auth login, resolve the user's role by checking DB tables.
 * Returns the user type, their record, salon, and branches.
 */
export async function resolveUserRole(authUserId: string, authEmail: string) {
  const { createServerClient } = await import('@/lib/supabase');
  const supabase = createServerClient();

  // 1. Check if owner (salon.owner_id matches auth user)
  const { data: salon } = await supabase
    .from('salons')
    .select('*')
    .eq('owner_id', authUserId)
    .maybeSingle();

  if (salon) {
    const { data: branches } = await supabase
      .from('branches')
      .select('*')
      .eq('salon_id', salon.id)
      .order('is_main', { ascending: false });
    return { type: 'owner' as const, salon, branches: branches || [], staff: null, partner: null };
  }

  // 2. Check if partner (by auth_user_id or email)
  const { data: partner } = await supabase
    .from('salon_partners')
    .select('*')
    .or(`auth_user_id.eq.${authUserId},email.eq.${authEmail}`)
    .eq('is_active', true)
    .maybeSingle();

  if (partner) {
    // Link auth_user_id if not yet linked
    if (!partner.auth_user_id) {
      await supabase.from('salon_partners').update({ auth_user_id: authUserId }).eq('id', partner.id);
    }
    const { data: partnerSalon } = await supabase.from('salons').select('*').eq('id', partner.salon_id).single();
    const { data: branches } = await supabase
      .from('branches')
      .select('*')
      .eq('salon_id', partner.salon_id)
      .order('is_main', { ascending: false });
    return { type: 'partner' as const, salon: partnerSalon, branches: branches || [], staff: null, partner };
  }

  // 3. Check if staff (by auth_user_id or email)
  const { data: staffMember } = await supabase
    .from('staff')
    .select('*')
    .or(`auth_user_id.eq.${authUserId},email.eq.${authEmail}`)
    .eq('is_active', true)
    .maybeSingle();

  if (staffMember) {
    // Link auth_user_id if not yet linked
    if (!staffMember.auth_user_id) {
      await supabase.from('staff').update({ auth_user_id: authUserId }).eq('id', staffMember.id);
    }
    const { data: staffSalon } = await supabase.from('salons').select('*').eq('id', staffMember.salon_id).single();
    const { data: branches } = await supabase
      .from('branches')
      .select('*')
      .eq('salon_id', staffMember.salon_id)
      .order('is_main', { ascending: false });

    // Update last_login_at
    await supabase.from('staff').update({ last_login_at: new Date().toISOString() }).eq('id', staffMember.id);

    return { type: 'staff' as const, salon: staffSalon, branches: branches || [], staff: staffMember, partner: null };
  }

  return { type: 'none' as const, salon: null, branches: [], staff: null, partner: null };
}

/**
 * Check if the given email is a platform super admin.
 */
export async function isSuperAdminEmail(email: string): Promise<boolean> {
  const allowed = process.env.SUPERADMIN_EMAILS || '';
  if (!allowed) return false;
  return allowed.split(',').map(e => e.trim().toLowerCase()).includes(email.toLowerCase());
}
