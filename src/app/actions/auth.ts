'use server';

import { SignJWT, jwtVerify } from 'jose';
import { cookies, headers } from 'next/headers';
import { randomUUID } from 'crypto';
import { checkRateLimit } from '@/lib/with-rate-limit';
import { BUCKETS } from '@/lib/rate-limit-buckets';
import { getClientIp } from '@/lib/rate-limit';
import * as authAdmin from '@/app/actions/auth-admin';

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
  // Primary branch the session is currently scoped to. Multi-branch stylists
  // (see migration 036) can hop between branches via switchBranch() — this
  // field is what per-branch queries filter on. Older callers still read
  // `branchId`, which is kept as an alias that mirrors primaryBranchId so the
  // whole codebase doesn't have to churn in one PR.
  primaryBranchId: string;
  /** @deprecated alias for primaryBranchId — kept for backward compat. */
  branchId: string;
  // Every branch this session is allowed to access. For owner/partner this is
  // every branch in the salon; for staff it's the rows from staff_branches
  // joined on staff_id (plus the staff's primary_branch_id). Stamped once at
  // sign time so authorization reads cost zero.
  branchIds: string[];
  // Effective permissions, resolved at sign time: role_presets row shallow-
  // merged with staff.permissions_override. Owner/partner/super_admin get
  // { "*": true }; sales_agent + admin sub-roles pass through with { "*": true }
  // since their auth is domain-separate (they never touch tenant surfaces).
  permissions: Record<string, boolean>;
  name: string;
  agentId?: string;
  /**
   * For role='agency_admin' sessions — the agency the admin belongs to and
   * the admin row id. Both required when role === 'agency_admin' and unused
   * otherwise. The proxy gate on /agency/* reads these to confirm scope.
   */
  agencyId?: string;
  agencyAdminId?: string;
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

/**
 * Input shape accepted by signSession. Looser than SessionPayload so callers
 * can omit branchIds/permissions (resolved from the DB) and can supply either
 * `primaryBranchId` or the legacy `branchId` alias.
 */
export type SignSessionInput =
  Omit<SessionPayload, 'primaryBranchId' | 'branchId' | 'branchIds' | 'permissions'>
  & {
    primaryBranchId?: string;
    branchId?: string;
    branchIds?: string[];
    permissions?: Record<string, boolean>;
  };

/**
 * Resolve the effective permission set for a given (salon, role) pair, with an
 * optional per-staff override shallow-merged on top.
 *
 * Introduced in migration 036 alongside the `role_presets` table. Called from
 * signSession so every JWT carries its own frozen permissions map — dashboard
 * gates read it straight off the session instead of re-querying the DB.
 *
 * Semantics:
 *   - owner/partner/super_admin get { "*": true } (full access; no preset row).
 *   - admin sub-roles (technical_support, customer_support, leads_team) and
 *     sales_agent also return { "*": true } — their access is policed by
 *     requireAdminRole() / agent checks, not by this permission map, so we
 *     pass through rather than force the migration to seed preset rows for
 *     out-of-tenant identities.
 *   - For any other role (staff, manager, stylist, …) we fetch
 *     role_presets(salon_id, role_name) and, if `permissionsOverride` is a
 *     non-null object, shallow-merge override on top. Missing preset + no
 *     override yields `{}` (deny-by-default).
 */
export async function resolvePermissions(
  salonId: string | undefined,
  role: string,
  permissionsOverride: Record<string, boolean> | null | undefined,
): Promise<Record<string, boolean>> {
  if (role === 'owner' || role === 'partner' || role === 'super_admin') {
    return { '*': true };
  }
  // Admin sub-roles + sales agents live outside the tenant permission model;
  // their access is gated by requireAdminRole() / agent checks rather than by
  // this map. Pass through with full access so no caller accidentally denies
  // them on a permission key that doesn't apply.
  if (role === 'technical_support' || role === 'customer_support' || role === 'leads_team' || role === 'sales_agent') {
    return { '*': true };
  }
  if (!salonId || salonId === 'super-admin') return {};

  const { createServerClient } = await import('@/lib/supabase');
  const supabase = createServerClient();
  const { data: preset } = await supabase
    .from('role_presets')
    .select('permissions')
    .eq('salon_id', salonId)
    .eq('role_name', role)
    .maybeSingle();

  const base: Record<string, boolean> = (preset?.permissions && typeof preset.permissions === 'object')
    ? (preset.permissions as Record<string, boolean>)
    : {};
  if (permissionsOverride && typeof permissionsOverride === 'object') {
    return { ...base, ...permissionsOverride };
  }
  return base;
}

/**
 * Look up every branch this session is allowed to access.
 *   - owner/partner: all branches of the salon.
 *   - everyone else (staff/manager/…): rows from staff_branches keyed by
 *     staff_id, plus whatever primaryBranchId was passed in (so a newly-
 *     created staff row without any staff_branches entries still sees their
 *     own primary branch). Duplicates de-duped.
 * Returns [] for sessions without a salon (super_admin, sales_agent stub).
 */
async function resolveBranchIds(
  salonId: string | undefined,
  staffId: string | undefined,
  role: string,
  primaryBranchId: string | undefined,
): Promise<string[]> {
  if (!salonId || salonId === 'super-admin') return [];
  const { createServerClient } = await import('@/lib/supabase');
  const supabase = createServerClient();

  if (role === 'owner' || role === 'partner') {
    const { data } = await supabase
      .from('branches')
      .select('id')
      .eq('salon_id', salonId);
    return (data || []).map((b: { id: string }) => b.id);
  }

  if (!staffId) return primaryBranchId ? [primaryBranchId] : [];

  const { data } = await supabase
    .from('staff_branches')
    .select('branch_id')
    .eq('staff_id', staffId);
  const ids = new Set<string>((data || []).map((r: { branch_id: string }) => r.branch_id));
  if (primaryBranchId) ids.add(primaryBranchId);
  return Array.from(ids);
}

export async function signSession(payload: SignSessionInput) {
  const subActive = payload.sub_active ?? await lookupSubActive(payload.salonId, payload.role);
  // Normalize primaryBranchId/branchId aliases. Callers may supply either
  // field (older login paths still write `branchId`); whichever is set wins,
  // and we mirror it to the other for backward compat.
  const primaryBranchId = payload.primaryBranchId ?? payload.branchId ?? '';

  // If the caller already resolved branchIds/permissions, respect them — e.g.
  // switchBranch() reuses the existing arrays. Otherwise resolve from the DB.
  const branchIds = payload.branchIds
    ?? await resolveBranchIds(payload.salonId, payload.staffId, payload.role, primaryBranchId);

  let permissions = payload.permissions;
  if (!permissions) {
    // Pull the staff row's permissions_override if we're signing for a staff
    // identity — owners/partners/etc. skip this and go straight to the
    // role-based fallback in resolvePermissions.
    let override: Record<string, boolean> | null = null;
    if (payload.salonId && payload.salonId !== 'super-admin' && payload.staffId
        && payload.role !== 'owner' && payload.role !== 'partner'
        && payload.role !== 'super_admin' && payload.role !== 'sales_agent'
        && payload.role !== 'technical_support' && payload.role !== 'customer_support' && payload.role !== 'leads_team') {
      const { createServerClient } = await import('@/lib/supabase');
      const supabase = createServerClient();
      const { data: staffRow } = await supabase
        .from('staff')
        .select('permissions_override')
        .eq('id', payload.staffId)
        .maybeSingle();
      const raw = staffRow?.permissions_override;
      if (raw && typeof raw === 'object') override = raw as Record<string, boolean>;
    }
    permissions = await resolvePermissions(payload.salonId, payload.role, override);
  }

  const claims: Record<string, unknown> = {
    ...payload,
    primaryBranchId,
    branchId: primaryBranchId,
    branchIds,
    permissions,
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
    // Backward-compat shim: tokens minted before migration 036 don't carry
    // primaryBranchId / branchIds / permissions. Fill sensible defaults from
    // the legacy `branchId` claim so existing callers don't NPE. The next
    // signSession call (e.g. on dashboard mount) re-stamps a fresh token.
    const raw = payload as unknown as SessionPayload & { branchId?: string };
    if (!raw.primaryBranchId && raw.branchId) raw.primaryBranchId = raw.branchId;
    if (!raw.branchId && raw.primaryBranchId) raw.branchId = raw.primaryBranchId;
    if (!Array.isArray(raw.branchIds)) {
      raw.branchIds = raw.primaryBranchId ? [raw.primaryBranchId] : [];
    }
    if (!raw.permissions || typeof raw.permissions !== 'object') {
      raw.permissions = (raw.role === 'owner' || raw.role === 'partner' || raw.role === 'super_admin') ? { '*': true } : {};
    }
    return raw;
  } catch {
    throw new Error('Invalid or expired session');
  }
}

/**
 * Switch the session's active branch. The target must already be in the
 * session's branchIds allow-list (stamped at login from staff_branches). On
 * success, re-signs the JWT with primaryBranchId=targetBranchId; branchIds,
 * permissions, and every other claim are preserved.
 *
 * Throws 'FORBIDDEN' if the branch isn't in the session's allow-list — never
 * leaks whether the branch exists in some other salon.
 */
export async function switchBranch(targetBranchId: string): Promise<{ success: true }> {
  if (!targetBranchId || typeof targetBranchId !== 'string') {
    throw new Error('FORBIDDEN');
  }
  const session = await verifySession();
  if (!session.branchIds.includes(targetBranchId)) {
    throw new Error('FORBIDDEN');
  }
  // Reuse the resolved branchIds + permissions — we don't need to re-query
  // the DB just to pivot the primary branch pointer. sub_active is also kept
  // as-is so paywall state doesn't bounce on a branch switch.
  await signSession({
    ...session,
    primaryBranchId: targetBranchId,
    branchId: targetBranchId,
    branchIds: session.branchIds,
    permissions: session.permissions,
  });
  return { success: true };
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
  permissions: Record<string, boolean>;
  branchIds: string[];
  memberBranches: Array<{ id: string; name: string }>;
  primaryBranchId: string | null;
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
  // Also re-resolves branchIds + permissions, picking up any role_presets or
  // staff_branches changes an admin pushed since last login.
  const { branchIds: _bIds, permissions: _perms, ...refreshInput } = session;
  void _bIds; void _perms;
  await signSession({ ...refreshInput, sub_active: undefined });

  // Re-read the session we just signed so we hand the client the freshly-
  // resolved permissions/branchIds, not the stale pre-remint values.
  const refreshed = await verifySession();

  // memberBranches = the subset of salon branches the session can actually
  // operate on. Filter the already-fetched `list` by the session's branchIds
  // so we don't round-trip the DB a second time. If branchIds is empty (old
  // JWT grandfathered without the claim) fall back to the full list for
  // owner/partner-ish sessions so the branch picker isn't empty.
  const branchIdSet = new Set(refreshed.branchIds || []);
  const memberBranches = (branchIdSet.size > 0
    ? list.filter((b: { id: string }) => branchIdSet.has(b.id))
    : list
  ).map((b: { id: string; name: string }) => ({ id: b.id, name: b.name }));

  return {
    salon,
    branches: list,
    mainBranch,
    isImpersonating: !!session.impersonatedBy,
    role: session.role,
    permissions: refreshed.permissions,
    branchIds: refreshed.branchIds,
    memberBranches,
    primaryBranchId: refreshed.primaryBranchId ?? null,
  };
}

/**
 * Lightweight read for the agent layout to confirm the caller is signed in
 * as a sales agent. Returns null if not.
 */
export async function getAgentSessionInfo(): Promise<{ agentId: string | null } | null> {
  try {
    const session = await verifySession();
    if (session.role !== 'sales_agent') return null;
    return { agentId: session.agentId ?? null };
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
  primaryBranchId: string;
  branchIds: string[];
  permissions: Record<string, boolean>;
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
      primaryBranchId: session.primaryBranchId,
      branchIds: session.branchIds,
      permissions: session.permissions,
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
 *
 * Rate-limited: signInWithPassword in @/app/actions/auth-credentials already
 * rate-limits the credential check itself, but every successful login is
 * followed by this resolve call. Gating here throttles automated credential
 * stuffing one layer deeper. Keyed on IP + email so an attacker can't mask
 * their rate by rotating emails from a single IP.
 */
export async function resolveUserRole(authUserId: string, authEmail: string) {
  try {
    const h = await headers();
    const ip = getClientIp(new Request('http://x', { headers: h }));
    const rl = await checkRateLimit(
      'login',
      `${ip}:${authEmail.toLowerCase()}`,
      BUCKETS.LOGIN_ATTEMPTS.max,
      BUCKETS.LOGIN_ATTEMPTS.windowMs,
    );
    if (!rl.ok) {
      throw new Error(rl.error ?? 'Too many login attempts, please try again later.');
    }
  } catch (err) {
    // Headers may be unavailable in non-request contexts; only re-throw the
    // explicit rate-limit error so tests without headers() can still resolve.
    if (err instanceof Error && err.message.startsWith('Too many')) throw err;
  }
  const { createServerClient } = await import('@/lib/supabase');
  const supabase = createServerClient();

  const normalizedEmail = authEmail?.trim().toLowerCase() || '';

  // Gate email-based linking on Supabase email verification.
  let emailVerified = false;
  try {
    const { data: userData } = await authAdmin.getUserById(authUserId);
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

  // 5. Check if agency admin. Their login routes to /agency, not a salon
  //    dashboard — agency admins manage their own sales team + see their
  //    commissions from the platform, they never touch tenant data.
  const { data: agencyAdmin } = await supabase
    .from('agency_admins')
    .select('*, agency:agencies(*)')
    .eq('user_id', authUserId)
    .eq('active', true)
    .maybeSingle();

  if (agencyAdmin) {
    return {
      type: 'agency_admin' as const,
      salon: null,
      branches: [],
      staff: null,
      partner: null,
      agent: null,
      agencyAdmin: agencyAdmin as { id: string; agency_id: string; name: string; email: string; agency: { id: string; name: string; status: string } | null },
    };
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

  // Primary path: admin_users table (invited admins + sub-roles).
  const { data } = await supabase
    .from('admin_users')
    .select('role, active')
    .eq('user_id', authUserId)
    .maybeSingle();
  if (data?.active) return data.role as string;

  // Bootstrap fallback: SUPERADMIN_EMAILS env var. Matches the dual-source
  // logic in isSuperAdminEmail() so the founding super admin — who may not
  // have a row in admin_users — can still be re-verified on impersonation exit.
  const allowed = process.env.SUPERADMIN_EMAILS || '';
  if (!allowed) return null;
  try {
    const { data: userRes } = await authAdmin.getUserById(authUserId);
    const email = userRes?.user?.email?.toLowerCase();
    if (!email) return null;
    const envList = allowed.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (envList.includes(email)) return 'super_admin';
  } catch {
    // getUserById failed — treat as not-authorized. Never throw; callers
    // check for null/role mismatch.
  }
  return null;
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

/**
 * Server-side guard for agency admins. Returns the session + the scoped
 * agency_id from the JWT claim. Actions that operate on agency-owned data
 * (sales_agents where agency_id = X, agency commissions, etc.) should
 * filter every query by this value — never trust a client-supplied id.
 */
export async function requireAgencyAdmin(): Promise<SessionPayload & { agencyId: string }> {
  const session = await verifySession();
  if (!session || session.role !== 'agency_admin' || !session.agencyId) {
    throw new Error('Unauthorized');
  }
  return session as SessionPayload & { agencyId: string };
}
