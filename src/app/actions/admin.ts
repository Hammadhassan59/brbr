'use server';

import { createServerClient } from '@/lib/supabase';
import { verifySession, signSession, resolveAdminRoleByAuthId, requireAdminRole } from './auth';
import { safeError } from '@/lib/action-error';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/database';

export async function getAdminDashboardData() {
  await requireAdminRole(['super_admin', 'technical_support', 'customer_support', 'leads_team']);
  const supabase = createServerClient();

  const { data: salons, error: salonErr } = await supabase
    .from('salons')
    .select('*')
    .order('created_at', { ascending: false });
  if (salonErr) throw salonErr;

  const allSalons = salons || [];
  const liveSalonIds = allSalons.map((s) => s.id);

  // Only count staff/clients whose salon_id points at a salon that still
  // exists. If FK cascades get bypassed (e.g. session_replication_role =
  // replica during a bulk wipe) orphan rows can survive; without this
  // filter they\u2019d inflate the KPI tiles on the admin dashboard.
  let staffCount = 0;
  let clientCount = 0;
  if (liveSalonIds.length > 0) {
    const [staffRes, clientRes] = await Promise.all([
      supabase.from('staff').select('*', { count: 'exact', head: true }).in('salon_id', liveSalonIds),
      supabase.from('clients').select('*', { count: 'exact', head: true }).in('salon_id', liveSalonIds),
    ]);
    staffCount = staffRes.count ?? 0;
    clientCount = clientRes.count ?? 0;
  }
  const liveSalons = allSalons;

  // Platform revenue = subscription MRR (what iCut earns from tenant plans),
  // not the combined tenant GMV (what tenants bill their own customers).
  // Mirrors the MRR calc in getAnalyticsData below.
  const { data: plansSetting } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'plans')
    .maybeSingle();
  const planPrices: Record<string, number> = {};
  if (plansSetting?.value) {
    const plans = plansSetting.value as Record<string, { price?: number }>;
    Object.entries(plans).forEach(([key, p]) => {
      planPrices[key] = Number(p?.price) || 0;
    });
  }
  let monthlyRevenue = 0;
  let activeSubscribers = 0;
  liveSalons.forEach((s) => {
    if (s.subscription_status === 'active' && s.subscription_plan && s.subscription_plan !== 'none') {
      monthlyRevenue += planPrices[s.subscription_plan] ?? 0;
      activeSubscribers += 1;
    }
  });

  // Top city — real tenants only.
  const cityCounts: Record<string, number> = {};
  liveSalons.forEach((s) => {
    const city = s.city || 'Unknown';
    cityCounts[city] = (cityCounts[city] || 0) + 1;
  });
  const topCity = Object.entries(cityCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

  const activeSalons = liveSalons.filter((s) => s.subscription_status === 'active').length;
  const trialSalons = liveSalons.filter((s) => s.subscription_status === 'pending').length;
  const expiredSalons = liveSalons.filter((s) => s.subscription_status === 'expired' || s.subscription_status === 'suspended').length;
  const pendingSetup = liveSalons.filter((s) => !s.setup_complete).length;

  return {
    salons: allSalons,
    stats: {
      totalSalons: liveSalons.length,
      activeSalons,
      pendingSetup,
      totalStaff: staffCount ?? 0,
      totalClients: clientCount ?? 0,
      monthlyRevenue,
      activeSubscribers,
      trialSalons,
      paidSalons: activeSalons,
      churnedSalons: expiredSalons,
      topCity,
    },
  };
}

export async function getAdminUsers() {
  await requireAdminRole(['super_admin', 'customer_support', 'technical_support']);
  const supabase = createServerClient();

  const [
    { data: staff },
    { data: salons },
    { data: partners },
  ] = await Promise.all([
    supabase.from('staff').select('*, salon:salons(name)').order('created_at', { ascending: false }),
    supabase.from('salons').select('id, name, owner_id, created_at'),
    supabase.from('salon_partners').select('*, salon:salons(name)').order('created_at', { ascending: false }),
  ]);

  // Build owner list from salons (owners aren't in staff table)
  const ownerIds = (salons || []).map((s: { owner_id: string | null }) => s.owner_id).filter(Boolean) as string[];
  let authUsers: { id: string; email: string; created_at: string }[] = [];

  if (ownerIds.length > 0) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const res = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=100`, {
      headers: { 'Authorization': `Bearer ${serviceKey}`, 'apikey': anonKey },
    });
    if (res.ok) {
      const data = await res.json();
      authUsers = (data.users || data || []).map((u: { id: string; email: string; created_at: string }) => ({
        id: u.id, email: u.email, created_at: u.created_at,
      }));
    }
  }

  // Map owners
  const owners = (salons || [])
    .filter((s: { owner_id: string | null }) => s.owner_id)
    .map((s: { id: string; name: string; owner_id: string; created_at: string }) => {
      const authUser = authUsers.find((u) => u.id === s.owner_id);
      return {
        id: s.owner_id,
        name: s.name + ' Owner',
        email: authUser?.email || '',
        salon_name: s.name,
        created_at: s.created_at,
      };
    });

  return { staff: staff || [], salons: salons || [], partners: partners || [], owners };
}

export async function getAdminSalons() {
  await requireAdminRole(['super_admin', 'customer_support', 'technical_support']);
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('salons')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getAdminAnalytics() {
  await requireAdminRole(['super_admin', 'technical_support']);
  const supabase = createServerClient();

  const { data: salonsData } = await supabase
    .from('salons')
    .select('*')
    .order('created_at', { ascending: false });

  const salons = salonsData || [];

  // City distribution
  const cityCounts: Record<string, number> = {};
  salons.forEach((s) => {
    const city = s.city || 'Unknown';
    cityCounts[city] = (cityCounts[city] || 0) + 1;
  });
  const cityDist = Object.entries(cityCounts).map(([name, value]) => ({ name, value }));

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const { data: billsData } = await supabase
    .from('bills')
    .select('total_amount, salon_id, created_at')
    .gte('created_at', sixMonthsAgo.toISOString())
    .order('created_at', { ascending: true });

  // Build salon name map
  const salonNameMap: Record<string, string> = {};
  salons.forEach((s) => { salonNameMap[s.id] = s.name; });

  // Subscription MRR: sum of active salons' plan prices from platform_settings.plans
  const { data: plansSetting } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'plans')
    .maybeSingle();

  const planPrices: Record<string, number> = {};
  if (plansSetting?.value) {
    const plans = plansSetting.value as Record<string, { price?: number }>;
    Object.entries(plans).forEach(([key, p]) => {
      planPrices[key] = Number(p?.price) || 0;
    });
  }

  let subscriptionMrr = 0;
  let activeSubscribers = 0;
  const mrrByPlan: Record<string, { count: number; revenue: number }> = {};
  salons.forEach((s) => {
    if (s.subscription_status === 'active' && s.subscription_plan && s.subscription_plan !== 'none') {
      const price = planPrices[s.subscription_plan] ?? 0;
      subscriptionMrr += price;
      activeSubscribers += 1;
      const bucket = mrrByPlan[s.subscription_plan] ?? { count: 0, revenue: 0 };
      bucket.count += 1;
      bucket.revenue += price;
      mrrByPlan[s.subscription_plan] = bucket;
    }
  });

  return {
    salons,
    cityDist,
    bills: billsData || [],
    salonNameMap,
    subscriptionMrr,
    activeSubscribers,
    mrrByPlan,
  };
}

export async function getAdminBranchForSalon(salonId: string) {
  await requireAdminRole(['super_admin', 'customer_support', 'technical_support']);
  const supabase = createServerClient();

  const { data } = await supabase
    .from('branches')
    .select('*')
    .eq('salon_id', salonId)
    .eq('is_main', true)
    .single();

  return data;
}

export async function getAdminSalonDetail(salonId: string) {
  await requireAdminRole(['super_admin', 'customer_support', 'technical_support']);
  const supabase = createServerClient();

  const [
    { data: salon },
    { data: branches },
    { data: staff },
    { data: clients },
  ] = await Promise.all([
    supabase.from('salons').select('*').eq('id', salonId).single(),
    supabase.from('branches').select('*').eq('salon_id', salonId),
    supabase.from('staff').select('*').eq('salon_id', salonId),
    supabase.from('clients').select('*').eq('salon_id', salonId),
  ]);

  return { salon, branches: branches || [], staff: staff || [], clients: clients || [] };
}

export async function updateSalon(
  salonId: string,
  updates: {
    name?: string;
    city?: string;
    phone?: string;
    address?: string;
    type?: string;
    admin_notes?: string;
  },
) {
  await requireAdminRole(['super_admin']);
  const supabase = createServerClient();

  const { error } = await supabase
    .from('salons')
    .update(updates)
    .eq('id', salonId);

  if (error) throw error;
  return { success: true };
}

export async function updateSubscription(
  salonId: string,
  updates: {
    subscription_plan?: SubscriptionPlan;
    subscription_status?: SubscriptionStatus;
    subscription_expires_at?: string | null;
  },
) {
  await requireAdminRole(['super_admin']);
  const supabase = createServerClient();

  const { error } = await supabase
    .from('salons')
    .update(updates)
    .eq('id', salonId);

  if (error) throw error;
  return { success: true };
}

/**
 * Activate a salon's subscription manually — the admin path that bypasses the
 * owner's /paywall flow. Unlike the bare updateSubscription call the Activate
 * button used to make, this:
 *
 *   1. Always sets `subscription_expires_at` to now + durationDays (30 by
 *      default). No more infinite free subscriptions.
 *   2. Inserts a `payment_requests` row with `status='approved'`,
 *      `method='admin_override'` so the admin payments list reflects the
 *      activation history.
 *   3. Writes an `admin_audit_log` row attributing the action to the calling
 *      super admin.
 *
 * super_admin only. Returns { error } on failure.
 */
export async function activateSalonManually(
  salonId: string,
  opts: { plan: 'basic' | 'growth' | 'pro'; durationDays?: number; notes?: string },
): Promise<{ error: string | null }> {
  const session = await requireAdminRole(['super_admin']);
  const supabase = createServerClient();

  const days = Math.max(1, Math.min(3650, opts.durationDays ?? 30));
  const now = new Date();
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

  // Look up plan price so the dummy payment_requests row reflects what the
  // owner would have paid if they'd gone through the normal flow.
  const { lookupPlanPrice } = await import('./payment-requests');
  const amount = await lookupPlanPrice(opts.plan);

  // Flip the salon into active + write a real expiry.
  const { error: salonErr } = await supabase
    .from('salons')
    .update({
      subscription_plan: opts.plan,
      subscription_status: 'active',
      subscription_expires_at: expiresAt,
      subscription_started_at: now.toISOString(),
    })
    .eq('id', salonId);
  if (salonErr) return { error: safeError(salonErr) };

  // History row in payment_requests — approved on insert, clearly marked
  // as an admin override. payment_source stays 'salon_self' (default) since
  // the enum only knows salon_self + agent_collected.
  const { error: prErr } = await supabase.from('payment_requests').insert({
    salon_id: salonId,
    plan: opts.plan,
    amount,
    method: 'admin_override',
    reference: `Manual activation by admin ${session.staffId.slice(0, 8)}`,
    status: 'approved',
    duration_days: days,
    reviewed_by: session.staffId,
    reviewed_at: now.toISOString(),
    reviewer_notes: opts.notes ?? 'Activated without payment by super_admin',
  });
  // Don't unwind the activation if the history row fails — the salon is
  // already active and the audit log below still records the action. Just
  // surface the error for visibility.
  if (prErr) {
    console.error('activateSalonManually: payment_requests history insert failed', prErr);
  }

  await supabase.from('admin_audit_log').insert({
    admin_auth_user_id: session.staffId,
    action: 'activate_subscription_manually',
    target_table: 'salons',
    target_id: salonId,
    salon_id: salonId,
    metadata: {
      plan: opts.plan,
      durationDays: days,
      expiresAt,
      notes: opts.notes ?? null,
    },
  });

  return { error: null };
}

export async function getAdminSalonMetrics(salonId: string) {
  await requireAdminRole(['super_admin', 'customer_support', 'technical_support']);
  const supabase = createServerClient();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    { count: staffCount },
    { count: clientCount },
    { data: monthBills },
    { data: allBills },
  ] = await Promise.all([
    supabase.from('staff').select('*', { count: 'exact', head: true }).eq('salon_id', salonId),
    supabase.from('clients').select('*', { count: 'exact', head: true }).eq('salon_id', salonId),
    supabase
      .from('bills')
      .select('total_amount, payment_method')
      .eq('salon_id', salonId)
      .gte('created_at', monthStart.toISOString()),
    supabase
      .from('bills')
      .select('total_amount, created_at')
      .eq('salon_id', salonId)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  const bills = monthBills || [];
  const monthlyRevenue = bills.reduce(
    (sum: number, b: { total_amount: number }) => sum + (b.total_amount || 0),
    0,
  );
  const monthlyBillCount = bills.length;

  const totalRevenue = (allBills || []).reduce(
    (sum: number, b: { total_amount: number }) => sum + (b.total_amount || 0),
    0,
  );

  const paymentBreakdown: Record<string, number> = {};
  bills.forEach((b: { payment_method: string; total_amount: number }) => {
    const method = b.payment_method || 'unknown';
    paymentBreakdown[method] = (paymentBreakdown[method] || 0) + (b.total_amount || 0);
  });

  return {
    staffCount: staffCount ?? 0,
    clientCount: clientCount ?? 0,
    monthlyRevenue,
    monthlyBillCount,
    totalRevenue,
    paymentBreakdown,
    recentBills: allBills || [],
  };
}

export async function setSalonSoldByAgent(salonId: string, agentId: string | null) {
  await requireAdminRole(['super_admin']);
  const supabase = createServerClient();
  const { error } = await supabase
    .from('salons')
    .update({ sold_by_agent_id: agentId })
    .eq('id', salonId);
  if (error) throw error;
  return { success: true };
}

// ───────────────────────────────────────
// Impersonation: super admin enters a tenant's dashboard
// ───────────────────────────────────────

/**
 * Start impersonating a tenant salon.
 * Signs a new session with role='owner' + the tenant's salonId, and stashes
 * the super admin's original identity in `impersonatedBy` so we can exit.
 * Mirrors the cookie state set by the login flow so the proxy gate routes
 * the user to /dashboard as an owner.
 */
export async function impersonateSalon(salonId: string): Promise<{
  data: {
    salon: Record<string, unknown>;
    branches: Array<Record<string, unknown>>;
    mainBranch: Record<string, unknown>;
    supabaseAuth: { tokenHash: string; email: string };
  } | null;
  error: string | null;
}> {
  const session = await requireAdminRole(['super_admin']);
  if (session.impersonatedBy) {
    return { data: null, error: 'Already impersonating — exit first' };
  }
  const supabase = createServerClient();

  const { data: salon, error: salonErr } = await supabase
    .from('salons')
    .select('*')
    .eq('id', salonId)
    .maybeSingle();
  if (salonErr) return { data: null, error: safeError(salonErr) };
  if (!salon) return { data: null, error: 'Salon not found' };

  const { data: branches } = await supabase
    .from('branches')
    .select('*')
    .eq('salon_id', salonId)
    .order('is_main', { ascending: false });
  const mainBranch = branches?.[0];
  if (!mainBranch) return { data: null, error: 'Salon has no branch — cannot impersonate' };

  if (!salon.owner_id) {
    return { data: null, error: 'Salon has no owner auth user — cannot impersonate' };
  }

  // Mint a real Supabase Auth session for the owner. Client-side queries on
  // /dashboard go through RLS; without an authenticated session that resolves
  // to this salon's owner, get_user_salon_id() returns NULL and every query
  // returns zero rows. The magic-link hashed_token is redeemed on the client
  // via supabase.auth.verifyOtp, which sets the browser session.
  const { data: ownerUser, error: ownerErr } = await supabase.auth.admin.getUserById(salon.owner_id);
  if (ownerErr || !ownerUser?.user?.email) {
    return { data: null, error: 'Could not resolve owner auth user' };
  }
  const ownerEmail = ownerUser.user.email;

  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: ownerEmail,
  });
  const tokenHash = linkData?.properties?.hashed_token;
  if (linkErr || !tokenHash) {
    return { data: null, error: linkErr ? safeError(linkErr) : 'Could not mint owner session' };
  }

  // TODO: once the admin_impersonation_sessions table ships (separate SQL
  // agent), write a row here keyed by this admin auth user id and stash the
  // row id on the JWT instead of trusting the nested impersonatedBy blob on
  // its own. For now we stash the admin's auth user id so exitImpersonation()
  // can re-verify against admin_users before restoring super_admin.
  await signSession({
    salonId: salon.id,
    staffId: salon.owner_id,
    role: 'owner',
    branchId: mainBranch.id,
    name: `Admin viewing ${salon.name}`,
    impersonatedBy: {
      staffId: session.staffId,
      name: session.name || 'Super Admin',
      adminAuthUserId: session.staffId,
    },
  });

  // Previously this action also set cleartext icut-session/icut-role cookies
  // for the proxy gate to read. The proxy now verifies the HttpOnly icut-token
  // JWT instead, so those cookies are gone — the fresh signSession above is
  // the single source of truth for the impersonated role.

  return {
    data: {
      salon,
      branches: branches || [],
      mainBranch,
      supabaseAuth: { tokenHash, email: ownerEmail },
    },
    error: null,
  };
}

/**
 * Exit impersonation — restore the super_admin session.
 * Requires the current session to carry an `impersonatedBy` claim.
 */
export async function exitImpersonation(): Promise<{
  success: boolean;
  error: string | null;
  supabaseAuth: { tokenHash: string; email: string } | null;
}> {
  const session = await verifySession();
  if (!session.impersonatedBy) {
    return { success: false, error: 'Not currently impersonating', supabaseAuth: null };
  }

  // Defense-in-depth: the JWT's impersonatedBy blob is signed by us and can't
  // be forged, but if a super admin were demoted mid-impersonation (e.g. a
  // second super admin revoked them via admin_users.active=false) we must
  // NOT restore their admin session. Re-check admin_users by auth user id
  // before re-issuing.
  //
  // TODO: once admin_impersonation_sessions exists, also verify the row id
  // stashed on the token and mark the session row as closed.
  const adminAuthUserId = session.impersonatedBy.adminAuthUserId || session.impersonatedBy.staffId;
  const adminRole = await resolveAdminRoleByAuthId(adminAuthUserId);
  if (adminRole !== 'super_admin') {
    return { success: false, error: 'Original admin is no longer authorized', supabaseAuth: null };
  }

  await signSession({
    salonId: 'super-admin',
    staffId: adminAuthUserId,
    role: 'super_admin',
    branchId: '',
    name: session.impersonatedBy.name,
  });
  // Previously also mirrored icut-session + icut-role here. Proxy now reads
  // role from the verified JWT, so those cleartext cookies are gone.

  // Mint a fresh Supabase Auth session for the super admin so the browser's
  // Supabase client flips back from the impersonated owner. Without this the
  // super admin would keep the owner's auth.uid() after exiting, which breaks
  // any client-side supabase call. Best-effort — if token generation fails we
  // still return success and let the client sign out of Supabase Auth instead.
  let supabaseAuth: { tokenHash: string; email: string } | null = null;
  try {
    const supabase = createServerClient();
    const { data: adminUser } = await supabase.auth.admin.getUserById(adminAuthUserId);
    const adminEmail = adminUser?.user?.email;
    if (adminEmail) {
      const { data: linkData } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: adminEmail,
      });
      const tokenHash = linkData?.properties?.hashed_token;
      if (tokenHash) supabaseAuth = { tokenHash, email: adminEmail };
    }
  } catch {
    // Fall through — client will sign out of Supabase Auth as a safety net.
  }

  return { success: true, error: null, supabaseAuth };
}

/** Read-only view of the impersonation state for UI banners. */
export async function getImpersonationContext(): Promise<{
  isImpersonating: boolean;
  salonName: string | null;
}> {
  try {
    const session = await verifySession();
    if (!session.impersonatedBy) return { isImpersonating: false, salonName: null };
    const supabase = createServerClient();
    const { data: salon } = await supabase.from('salons').select('name').eq('id', session.salonId).maybeSingle();
    return { isImpersonating: true, salonName: salon?.name || null };
  } catch {
    return { isImpersonating: false, salonName: null };
  }
}

// ───────────────────────────────────────
// Hard-delete a tenant and every trace of it
// ───────────────────────────────────────

/**
 * Permanently deletes a salon and all of its data. Super admin only.
 * The caller MUST pass the exact salon name as confirmation — this is a
 * defense-in-depth guard against a UI bug or CSRF triggering accidental
 * deletion. Also removes the Supabase Auth accounts of the owner, partners,
 * and staff that belonged to this salon.
 */
export async function deleteSalonAndAllData(
  salonId: string,
  confirmName: string,
): Promise<{ success: boolean; deletedAuthUsers: number; error: string | null }> {
  await requireAdminRole(['super_admin']);
  const supabase = createServerClient();

  const { data: salon, error: loadErr } = await supabase
    .from('salons')
    .select('id, name, owner_id')
    .eq('id', salonId)
    .maybeSingle();
  if (loadErr) return { success: false, deletedAuthUsers: 0, error: safeError(loadErr) };
  if (!salon) return { success: false, deletedAuthUsers: 0, error: 'Salon not found' };
  if (confirmName.trim() !== salon.name) {
    return { success: false, deletedAuthUsers: 0, error: 'Salon name confirmation does not match' };
  }

  // Collect auth user ids we need to remove from Supabase Auth *before* the
  // salon row is gone (otherwise we lose the link to staff / partners).
  const authIds = new Set<string>();
  if (salon.owner_id) authIds.add(salon.owner_id);

  const { data: partners } = await supabase
    .from('salon_partners')
    .select('auth_user_id')
    .eq('salon_id', salonId);
  (partners || []).forEach((p: { auth_user_id: string | null }) => {
    if (p.auth_user_id) authIds.add(p.auth_user_id);
  });

  const { data: staff } = await supabase
    .from('staff')
    .select('auth_user_id')
    .eq('salon_id', salonId);
  (staff || []).forEach((s: { auth_user_id: string | null }) => {
    if (s.auth_user_id) authIds.add(s.auth_user_id);
  });

  // Most child FKs are ON DELETE NO ACTION (NOT cascade), so we have to
  // delete every blocker by hand before the salon delete will succeed.
  // Order matters: delete leaves first, then their parents, then the salon.
  //
  // Cascade chain that DOES auto-fire from `salons`:
  //   branches, services, staff, salon_partners, clients, packages,
  //   products, suppliers, promo_codes, payment_requests, agent_commissions,
  //   backbar_actuals, loyalty_rules (some), appointments + bills cascade
  //   their items.
  // But every CASCADE from salons → branches/staff/etc is BLOCKED if any
  // NO ACTION FK points at those rows. Hence the explicit deletes below.

  // Pull parent IDs once so we can scope IN clauses without round trips.
  const [{ data: branchRows }, { data: staffRows }, { data: clientRows }, { data: productRows }, { data: packageRows }] = await Promise.all([
    supabase.from('branches').select('id').eq('salon_id', salonId),
    supabase.from('staff').select('id').eq('salon_id', salonId),
    supabase.from('clients').select('id').eq('salon_id', salonId),
    supabase.from('products').select('id').eq('salon_id', salonId),
    supabase.from('packages').select('id').eq('salon_id', salonId),
  ]);
  const branchIds = (branchRows || []).map((r: { id: string }) => r.id);
  const staffIds = (staffRows || []).map((r: { id: string }) => r.id);
  const clientIds = (clientRows || []).map((r: { id: string }) => r.id);
  const productIds = (productRows || []).map((r: { id: string }) => r.id);
  const packageIds = (packageRows || []).map((r: { id: string }) => r.id);

  async function purge(table: string, column: string, ids: string[]) {
    if (ids.length === 0) return null;
    const { error } = await supabase.from(table).delete().in(column, ids);
    return error;
  }

  // Step 1: drain leaves that block branches/staff/clients/products/packages.
  // Each call is awaited individually so we surface the first failing table
  // by name for a useful error.
  const blockerSequence: Array<[string, string, string[]]> = [
    ['cash_drawers',     'branch_id',  branchIds],
    ['attendance',       'branch_id',  branchIds],
    ['expenses',         'branch_id',  branchIds],
    ['purchase_orders',  'branch_id',  branchIds],
    ['stock_movements',  'branch_id',  branchIds],
    ['udhaar_payments',  'client_id',  clientIds],
    ['advances',         'staff_id',   staffIds],
    ['client_packages',  'package_id', packageIds],
  ];
  for (const [table, column, ids] of blockerSequence) {
    const err = await purge(table, column, ids);
    if (err) return { success: false, deletedAuthUsers: 0, error: `${table}: ${safeError(err)}` };
  }
  // stock_movements may also point at products via product_id (a separate
  // NO ACTION FK); catch those too in case any survived the branch_id pass
  // (e.g. a movement logged against a product but with branch_id null).
  const stockProductErr = await purge('stock_movements', 'product_id', productIds);
  if (stockProductErr) return { success: false, deletedAuthUsers: 0, error: `stock_movements/product: ${safeError(stockProductErr)}` };

  // Step 2: tips → bills (NO ACTION) → appointments (NO ACTION). Have to
  // unwind the chain in reverse: tips first so bills can drop, bills before
  // appointments so the bills.appointment_id FK doesn't block the
  // appointments delete. tips lacks salon_id; scope via staff_id.
  const tipsErr = await purge('tips', 'staff_id', staffIds);
  if (tipsErr) return { success: false, deletedAuthUsers: 0, error: `tips: ${safeError(tipsErr)}` };

  const { error: billErr } = await supabase.from('bills').delete().eq('salon_id', salonId);
  if (billErr) return { success: false, deletedAuthUsers: 0, error: `bills: ${safeError(billErr)}` };
  const { error: aptErr } = await supabase.from('appointments').delete().eq('salon_id', salonId);
  if (aptErr) return { success: false, deletedAuthUsers: 0, error: `appointments: ${safeError(aptErr)}` };
  const { error: loyaltyErr } = await supabase.from('loyalty_rules').delete().eq('salon_id', salonId);
  if (loyaltyErr) return { success: false, deletedAuthUsers: 0, error: `loyalty_rules: ${safeError(loyaltyErr)}` };

  // Step 3: salons cascade handles the rest (branches, staff, services, etc.)
  const { error: delErr } = await supabase.from('salons').delete().eq('id', salonId);
  if (delErr) return { success: false, deletedAuthUsers: 0, error: `salons: ${safeError(delErr)}` };

  // Best-effort auth user removal — individual failures are non-fatal (data
  // is already gone, orphan auth rows can be cleaned up later).
  let deleted = 0;
  for (const id of authIds) {
    try {
      const { error } = await supabase.auth.admin.deleteUser(id);
      if (!error) deleted++;
    } catch {
      // swallow
    }
  }

  return { success: true, deletedAuthUsers: deleted, error: null };
}
