'use server';

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

// Lazy secret binding: during `next build` page-data collection, SESSION_SECRET
// may be absent (it's a runtime-only var, not a build arg). Throwing at module
// load blocks the build. Resolve on first use instead.
function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('Missing SESSION_SECRET environment variable');
  return new TextEncoder().encode(secret);
}
const COOKIE_NAME = 'icut-token';

export interface SessionPayload {
  salonId: string;
  staffId: string;
  role: string;
  branchId: string;
  name: string;
  agentId?: string;
}

export async function signSession(payload: SessionPayload) {
  const token = await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getSecret());

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
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    throw new Error('Invalid or expired session');
  }
}

/**
 * Verify session AND check that the salon subscription allows writes.
 * Use this instead of verifySession() for any action that creates/updates/deletes data.
 * Only salons with status='active' can write. All others are read-only.
 *
 * Returns the session on success. On subscription failure, throws a
 * SubscriptionError that server actions should catch and return as
 * { data: null, error: 'SUBSCRIPTION_REQUIRED' }.
 */
export async function verifyWriteAccess(): Promise<SessionPayload> {
  const session = await verifySession();

  // Super admin and setup flows bypass subscription checks
  if (session.role === 'super_admin' || !session.salonId || session.salonId === 'super-admin') {
    return session;
  }

  const { createServerClient } = await import('@/lib/supabase');
  const supabase = createServerClient();
  const { data: salon } = await supabase
    .from('salons')
    .select('subscription_status')
    .eq('id', session.salonId)
    .maybeSingle();

  if (!salon || salon.subscription_status !== 'active') {
    throw new Error('SUBSCRIPTION_REQUIRED');
  }

  return session;
}

/**
 * Wraps verifyWriteAccess() and catches SUBSCRIPTION_REQUIRED,
 * returning it as { session: null, error } instead of throwing.
 * All other errors (auth failures) still throw.
 */
export async function checkWriteAccess(): Promise<{ session: SessionPayload; error: null } | { session: null; error: string }> {
  try {
    const session = await verifyWriteAccess();
    return { session, error: null };
  } catch (e) {
    if (e instanceof Error && e.message === 'SUBSCRIPTION_REQUIRED') {
      return { session: null, error: 'SUBSCRIPTION_REQUIRED' };
    }
    throw e;
  }
}

/**
 * Refresh salon data from the DB. Called by the dashboard layout on mount
 * so the client always has fresh subscription status.
 */
export async function refreshSalonData(): Promise<{ salon: Record<string, unknown> } | null> {
  const session = await verifySession();
  if (!session.salonId || session.salonId === 'super-admin') return null;

  const { createServerClient } = await import('@/lib/supabase');
  const supabase = createServerClient();
  const { data: salon } = await supabase
    .from('salons')
    .select('*')
    .eq('id', session.salonId)
    .maybeSingle();

  return salon ? { salon } : null;
}

/** Plan limits from platform_settings (fallback to hardcoded defaults) */
export interface PlanLimits {
  branches: number;
  staff: number;  // 0 = unlimited
  price: number;
}

const DEFAULT_PLAN_LIMITS: Record<string, PlanLimits> = {
  none: { branches: 0, staff: 0, price: 0 },
  basic: { branches: 1, staff: 3, price: 2500 },
  growth: { branches: 1, staff: 0, price: 5000 },
  pro: { branches: 3, staff: 0, price: 9000 },
};

export async function getPlanLimits(plan: string): Promise<PlanLimits> {
  if (plan === 'none') return DEFAULT_PLAN_LIMITS.none;

  const { createServerClient } = await import('@/lib/supabase');
  const supabase = createServerClient();
  const { data } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'plans')
    .maybeSingle();

  if (data?.value) {
    const plans = data.value as Record<string, { price?: number; branches?: number; staff?: number }>;
    const p = plans[plan];
    if (p) {
      return {
        branches: Number(p.branches) || 1,
        staff: Number(p.staff) || 0,
        price: Number(p.price) || 0,
      };
    }
  }

  return DEFAULT_PLAN_LIMITS[plan] || DEFAULT_PLAN_LIMITS.basic;
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
    return { type: 'owner' as const, salon, branches: branches || [], staff: null, partner: null, agent: null };
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
    return { type: 'partner' as const, salon: partnerSalon, branches: branches || [], staff: null, partner, agent: null };
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

    return { type: 'staff' as const, salon: staffSalon, branches: branches || [], staff: staffMember, partner: null, agent: null };
  }

  // 4. Check if sales agent (active only)
  const { data: agent } = await supabase
    .from('sales_agents')
    .select('*')
    .eq('user_id', authUserId)
    .eq('active', true)
    .maybeSingle();

  if (agent) {
    return { type: 'sales_agent' as const, salon: null, branches: [], staff: null, partner: null, agent };
  }

  return { type: 'none' as const, salon: null, branches: [], staff: null, partner: null, agent: null };
}

/**
 * Check if the given email is a platform super admin.
 */
export async function isSuperAdminEmail(email: string): Promise<boolean> {
  const allowed = process.env.SUPERADMIN_EMAILS || '';
  if (!allowed) return false;
  return allowed.split(',').map(e => e.trim().toLowerCase()).includes(email.toLowerCase());
}
