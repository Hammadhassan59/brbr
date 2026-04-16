'use server';

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';

// JWT issuer/audience — the proxy must verify these exactly. Anything signed
// with different iss/aud values is treated as invalid.
const JWT_ISS = 'icut.pk';
const JWT_AUD = 'icut-app';
const JWT_KID = 'v1';

// Lazy secret binding: during `next build` page-data collection, SESSION_SECRET
// may be absent (it's a runtime-only var, not a build arg). Throwing at module
// load blocks the build. Resolve on first use instead.
//
// Hardening: require >=32 chars. A short/guessable secret makes the JWT
// forgeable, which is the same failure mode the proxy rewrite is trying to
// close. Fail loudly rather than run with a weak key.
function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('Missing SESSION_SECRET environment variable');
  if (secret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters');
  }
  return new TextEncoder().encode(secret);
}
const COOKIE_NAME = 'icut-token';

// Legacy cookie names the proxy used to read. They're still cleared on logout
// to scrub any state lingering from the pre-JWT gate. New writes happen only
// through the HttpOnly icut-token JWT.
const LEGACY_SESSION_COOKIE = 'icut-session';
const LEGACY_ROLE_COOKIE = 'icut-role';
const LEGACY_SUB_COOKIE = 'icut-sub';

/**
 * Look up salons.subscription_status and subscription_expires_at, and fold
 * them into a boolean suitable for embedding in the JWT's `sub_active` claim.
 *
 * "Active" means status='active' AND (expires_at is null OR expires_at > now()).
 * Super admin, sales agents, and salons mid-setup bypass — they don't have a
 * subscription to check and must be able to use the app.
 */
async function lookupSubActive(salonId: string | undefined, role: string): Promise<boolean> {
  if (role === 'super_admin') return true;
  if (!salonId || salonId === 'super-admin') return true;
  if (role === 'sales_agent') return true;

  const { createServerClient } = await import('@/lib/supabase');
  const supabase = createServerClient();
  const { data } = await supabase
    .from('salons')
    .select('subscription_status, subscription_expires_at')
    .eq('id', salonId)
    .maybeSingle();
  if (!data) return false;
  if (data.subscription_status !== 'active') return false;
  if (data.subscription_expires_at) {
    const exp = new Date(data.subscription_expires_at).getTime();
    if (!Number.isNaN(exp) && exp <= Date.now()) return false;
  }
  return true;
}

export interface SessionPayload {
  salonId: string;
  staffId: string;
  role: string;
  branchId: string;
  name: string;
  agentId?: string;
  // True when this session belongs to a demo sales-agent identity. Used to
  // show the "demo mode" banner and to gate destructive actions.
  isDemo?: boolean;
  // Subscription gate bit. Computed at sign time from
  // salons.subscription_status + subscription_expires_at so the proxy can
  // decide /paywall vs /dashboard without a DB roundtrip. The DB remains the
  // source of truth — verifyWriteAccess() re-checks on every mutation.
  sub_active?: boolean;
  // When a super admin impersonates a tenant, this captures the super admin's
  // original identity so we can exit back to the admin session afterwards.
  // staffId here is the super admin's *auth user id* (row in admin_users.user_id).
  impersonatedBy?: {
    staffId: string;
    name: string;
    // Once the admin_impersonation_sessions table ships, this will carry the
    // row id we use to verify the admin role on exit. Until then the proxy
    // falls back to re-checking admin_users by auth user id.
    adminAuthUserId?: string;
  };
  // Revocation hook. Not yet checked anywhere; populated so we can switch on
  // a jti-blocklist table without breaking existing tokens.
  jti?: string;
}

export async function signSession(payload: SessionPayload) {
  const subActive = payload.sub_active ?? await lookupSubActive(payload.salonId, payload.role);
  const claims: Record<string, unknown> = {
    ...payload,
    sub_active: subActive,
    jti: payload.jti ?? randomUUID(),
  };

  const token = await new SignJWT(claims)
    // kid lets us rotate the signing secret without invalidating every
    // in-flight token — future tokens carry kid=v2, proxy can verify both.
    .setProtectedHeader({ alg: 'HS256', kid: JWT_KID })
    .setIssuer(JWT_ISS)
    .setAudience(JWT_AUD)
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getSecret());

  const cookieStore = await cookies();
  // 24h cookie. Next step is sliding refresh: on each verifySession, if the
  // token is over 12h old, reissue a fresh one. Kept out of this PR to keep
  // the blast radius small.
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
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: JWT_ISS,
      audience: JWT_AUD,
    });
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

  // Super admin and setup flows bypass subscription checks.
  // Super admins impersonating a tenant also bypass — otherwise an expired
  // tenant would be un-fixable through the admin impersonation workflow.
  if (session.role === 'super_admin' || !session.salonId || session.salonId === 'super-admin' || session.impersonatedBy) {
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

/**
 * Fetch everything the /dashboard needs to bootstrap the Zustand store
 * from the current server session. Used as a safety net — e.g. when an
 * admin just impersonated a salon and the client-side setters didn't
 * flush before the hard navigation. Returns null if the session has no
 * salon (super admin, no tenant, etc.).
 */
export async function getDashboardBootstrap(): Promise<{
  salon: Record<string, unknown>;
  branches: Array<Record<string, unknown>>;
  mainBranch: Record<string, unknown> | null;
  isImpersonating: boolean;
  role: string;
} | null> {
  const session = await verifySession();
  if (!session.salonId || session.salonId === 'super-admin') return null;

  const { createServerClient } = await import('@/lib/supabase');
  const supabase = createServerClient();
  const [{ data: salon }, { data: branches }] = await Promise.all([
    supabase.from('salons').select('*').eq('id', session.salonId).maybeSingle(),
    supabase.from('branches').select('*').eq('salon_id', session.salonId).order('is_main', { ascending: false }),
  ]);
  if (!salon) return null;
  const list = branches || [];
  const mainBranch = list.find((b: { is_main?: boolean }) => b.is_main) || list[0] || null;

  // Re-mint the JWT so sub_active reflects the latest DB state. Without this,
  // an owner whose admin just approved their plan would still carry
  // sub_active=false in their token and bounce back to /paywall until their
  // next login. Reissuing here keeps the gate accurate on every dashboard load.
  await signSession({ ...session, sub_active: undefined });

  return {
    salon,
    branches: list,
    mainBranch,
    isImpersonating: !!session.impersonatedBy,
    role: session.role,
  };
}

/**
 * Lightweight read for the agent layout to know whether to show the demo
 * banner. Returns null if not signed in as an agent.
 */
export async function getAgentSessionInfo(): Promise<{ isDemo: boolean } | null> {
  try {
    const session = await verifySession();
    if (session.role !== 'sales_agent') return null;
    return { isDemo: !!session.isDemo };
  } catch {
    return null;
  }
}

/**
 * Small helper for client UI that used to read role/salonId/subActive from
 * non-HttpOnly cookies. Returns null if the session cookie is missing or
 * fails verification — caller should treat that as "logged out".
 */
export async function getSessionInfo(): Promise<{
  role: string;
  salonId: string;
  staffId: string;
  branchId: string;
  name: string;
  subActive: boolean;
  isImpersonating: boolean;
  agentId?: string;
  isDemo?: boolean;
} | null> {
  try {
    const session = await verifySession();
    return {
      role: session.role,
      salonId: session.salonId,
      staffId: session.staffId,
      branchId: session.branchId,
      name: session.name,
      subActive: !!session.sub_active,
      isImpersonating: !!session.impersonatedBy,
      agentId: session.agentId,
      isDemo: session.isDemo,
    };
  } catch {
    return null;
  }
}

/**
 * Used by the /paywall page poll. Reads salon.subscription_status, reissues
 * the JWT with a fresh sub_active claim, and reports the current status so
 * the client can decide whether to redirect to /dashboard.
 */
export async function checkSubscriptionStatus(): Promise<{ status: 'active' | 'pending' | 'expired' | 'suspended' | 'none' }> {
  const session = await verifySession();
  if (!session.salonId || session.salonId === 'super-admin') {
    return { status: 'active' };
  }
  const { createServerClient } = await import('@/lib/supabase');
  const supabase = createServerClient();
  const { data } = await supabase
    .from('salons')
    .select('subscription_status')
    .eq('id', session.salonId)
    .maybeSingle();
  const raw = data?.subscription_status;
  const status = (raw === 'active' || raw === 'pending' || raw === 'expired' || raw === 'suspended')
    ? raw : 'none';

  // Reissue the JWT so sub_active reflects the latest DB row. The client polls
  // this endpoint until it sees 'active' — without the reissue, the proxy gate
  // would still bounce them to /paywall on the next navigation.
  await signSession({ ...session, sub_active: undefined });

  return { status };
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
  // Scrub legacy cookies too — they're no longer trusted by the proxy but any
  // still-present value would be confusing during the transition.
  cookieStore.delete(LEGACY_SESSION_COOKIE);
  cookieStore.delete(LEGACY_ROLE_COOKIE);
  cookieStore.delete(LEGACY_SUB_COOKIE);
  return { success: true };
}

/**
 * After Supabase Auth login, resolve the user's role by checking DB tables.
 * Returns the user type, their record, salon, and branches.
 *
 * Lookup rules (tightened vs the previous `.or(auth_user_id.eq.X,email.eq.Y)`
 * pattern, which had two problems: PostgREST filter-string injection of the
 * user-controlled email, and an email-only hijack where an attacker who could
 * register an auth account with a pre-existing staff email would inherit
 * that staff's row):
 *
 *   1. Try to match by auth_user_id. If found, this user is already linked —
 *      use the row as-is.
 *   2. Else, only if the auth user has confirmed their email, try to match by
 *      email where auth_user_id is NULL (unlinked — a partner/staff row
 *      created by the owner but never signed in before). On match, link the
 *      row to this auth_user_id so subsequent logins take path 1.
 *
 * The email-match path is gated on email_confirmed_at so an attacker can't
 * simply register an unconfirmed auth.users row with a victim's email and
 * hijack their staff/partner record.
 */
export async function resolveUserRole(authUserId: string, authEmail: string) {
  const { createServerClient } = await import('@/lib/supabase');
  const supabase = createServerClient();

  const normalizedEmail = authEmail?.trim().toLowerCase() || '';

  // Gate email-based linking on Supabase email verification.
  let emailVerified = false;
  try {
    const { data: userData } = await supabase.auth.admin.getUserById(authUserId);
    emailVerified = !!userData?.user?.email_confirmed_at;
  } catch {
    emailVerified = false;
  }

  // 1. Check if owner (salon.owner_id matches auth user). Owners are always
  //    linked by auth_user_id — there's no email-fallback for them.
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

  // 2. Partner — try auth_user_id first, then (only if email is verified)
  //    an unlinked row by email.
  const linkedPartner = await supabase
    .from('salon_partners')
    .select('*')
    .eq('auth_user_id', authUserId)
    .eq('is_active', true)
    .maybeSingle();

  let partner = linkedPartner.data;
  if (!partner && emailVerified && normalizedEmail) {
    const { data: byEmail } = await supabase
      .from('salon_partners')
      .select('*')
      .eq('email', normalizedEmail)
      .is('auth_user_id', null)
      .eq('is_active', true)
      .maybeSingle();
    if (byEmail) {
      await supabase
        .from('salon_partners')
        .update({ auth_user_id: authUserId })
        .eq('id', byEmail.id);
      partner = { ...byEmail, auth_user_id: authUserId };
    }
  }

  if (partner) {
    const { data: partnerSalon } = await supabase.from('salons').select('*').eq('id', partner.salon_id).single();
    const { data: branches } = await supabase
      .from('branches')
      .select('*')
      .eq('salon_id', partner.salon_id)
      .order('is_main', { ascending: false });
    return { type: 'partner' as const, salon: partnerSalon, branches: branches || [], staff: null, partner, agent: null };
  }

  // 3. Staff — same two-step: auth_user_id, then verified-email fallback.
  const linkedStaff = await supabase
    .from('staff')
    .select('*')
    .eq('auth_user_id', authUserId)
    .eq('is_active', true)
    .maybeSingle();

  let staffMember = linkedStaff.data;
  if (!staffMember && emailVerified && normalizedEmail) {
    const { data: byEmail } = await supabase
      .from('staff')
      .select('*')
      .eq('email', normalizedEmail)
      .is('auth_user_id', null)
      .eq('is_active', true)
      .maybeSingle();
    if (byEmail) {
      await supabase
        .from('staff')
        .update({ auth_user_id: authUserId })
        .eq('id', byEmail.id);
      staffMember = { ...byEmail, auth_user_id: authUserId };
    }
  }

  if (staffMember) {
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

  // 4. Check if sales agent (active only). Demo identities live in the same
  //    table with is_demo=true; we let them log in too — they see seeded data.
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
 *
 * Two paths:
 *  1. admin_users table: an active row with role='super_admin' (the normal path
 *     once the team page has been used to invite admins).
 *  2. SUPERADMIN_EMAILS env var: bootstrap fallback so the very first super
 *     admin can always log in even if the table is empty or wiped.
 */
export async function isSuperAdminEmail(email: string): Promise<boolean> {
  const role = await resolveAdminRole(email);
  if (role === 'super_admin') return true;
  const allowed = process.env.SUPERADMIN_EMAILS || '';
  if (!allowed) return false;
  return allowed.split(',').map(e => e.trim().toLowerCase()).includes(email.toLowerCase());
}

/**
 * Look up a user's admin role from the admin_users table. Returns the role
 * string if the user is an active admin, or null if they're not in the table
 * (or are deactivated). This is the source of truth for sub-roles
 * (technical_support, customer_support, leads_team) and the primary path for
 * super_admin too — env var is only the bootstrap fallback (see isSuperAdminEmail).
 */
export async function resolveAdminRole(email: string): Promise<string | null> {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return null;
  const { createServerClient } = await import('@/lib/supabase');
  const supabase = createServerClient();
  const { data } = await supabase
    .from('admin_users')
    .select('role, active')
    .eq('email', normalized)
    .maybeSingle();
  if (!data || !data.active) return null;
  return data.role as string;
}

/**
 * Same as resolveAdminRole but keyed by auth user id. Used by exitImpersonation
 * to re-verify that the stashed admin identity still has super_admin — the
 * JWT claim alone isn't trustworthy once we rely on it to elevate roles.
 */
export async function resolveAdminRoleByAuthId(authUserId: string): Promise<string | null> {
  if (!authUserId) return null;
  const { createServerClient } = await import('@/lib/supabase');
  const supabase = createServerClient();
  const { data } = await supabase
    .from('admin_users')
    .select('role, active')
    .eq('user_id', authUserId)
    .maybeSingle();
  if (!data || !data.active) return null;
  return data.role as string;
}

/**
 * Server-side guard for admin actions. Pass the list of roles that may run
 * the action; throws Unauthorized otherwise. Generalizes the requireSuperAdmin
 * pattern that's currently duplicated across 8 action files.
 */
export async function requireAdminRole(allowed: string[]): Promise<SessionPayload> {
  const session = await verifySession();
  if (!session || !allowed.includes(session.role)) {
    throw new Error('Unauthorized');
  }
  return session;
}
