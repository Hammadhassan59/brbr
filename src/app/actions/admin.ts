'use server';

import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { verifySession, signSession } from './auth';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/database';

async function requireSuperAdmin() {
  const session = await verifySession();
  if (!session || session.role !== 'super_admin') {
    throw new Error('Unauthorized');
  }
  return session;
}

export async function getAdminDashboardData() {
  await requireSuperAdmin();
  const supabase = createServerClient();

  const [
    { data: salons, error: salonErr },
    { count: staffCount },
    { count: clientCount },
  ] = await Promise.all([
    supabase.from('salons').select('*').order('created_at', { ascending: false }),
    supabase.from('staff').select('*', { count: 'exact', head: true }),
    supabase.from('clients').select('*', { count: 'exact', head: true }),
  ]);

  if (salonErr) throw salonErr;

  const liveSalons = salons || [];

  // Monthly revenue
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { data: billData } = await supabase
    .from('bills')
    .select('total_amount')
    .gte('created_at', monthStart.toISOString());

  const monthlyRevenue = billData
    ? billData.reduce((sum: number, b: { total_amount: number }) => sum + (b.total_amount || 0), 0)
    : 0;
  const monthlyBills = billData ? billData.length : 0;

  // Top city
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
    salons: liveSalons,
    stats: {
      totalSalons: liveSalons.length,
      activeSalons,
      pendingSetup,
      totalStaff: staffCount ?? 0,
      totalClients: clientCount ?? 0,
      monthlyRevenue,
      monthlyBills,
      trialSalons,
      paidSalons: activeSalons,
      churnedSalons: expiredSalons,
      topCity,
    },
  };
}

export async function getAdminUsers() {
  await requireSuperAdmin();
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
  await requireSuperAdmin();
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('salons')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getAdminAnalytics() {
  await requireSuperAdmin();
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

  // Bills for last 6 months
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
  await requireSuperAdmin();
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
  await requireSuperAdmin();
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
  await requireSuperAdmin();
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
  await requireSuperAdmin();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('salons')
    .update(updates)
    .eq('id', salonId);

  if (error) throw error;
  return { success: true };
}

export async function getAdminSalonMetrics(salonId: string) {
  await requireSuperAdmin();
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
  await requireSuperAdmin();
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
  data: { salon: { id: string; name: string }; branchId: string } | null;
  error: string | null;
}> {
  const session = await requireSuperAdmin();
  if (session.impersonatedBy) {
    return { data: null, error: 'Already impersonating — exit first' };
  }
  const supabase = createServerClient();

  const { data: salon, error: salonErr } = await supabase
    .from('salons')
    .select('id, name, owner_id')
    .eq('id', salonId)
    .maybeSingle();
  if (salonErr) return { data: null, error: salonErr.message };
  if (!salon) return { data: null, error: 'Salon not found' };

  const { data: branches } = await supabase
    .from('branches')
    .select('id, is_main')
    .eq('salon_id', salonId)
    .order('is_main', { ascending: false });
  const mainBranch = branches?.[0];
  if (!mainBranch) return { data: null, error: 'Salon has no branch — cannot impersonate' };

  // Use the salon's real owner auth user id as staffId so all /dashboard
  // code paths see a normal owner session. If the owner_id is missing
  // (legacy salon), fall back to a synthetic id.
  const ownerAuthId = salon.owner_id || session.staffId;

  await signSession({
    salonId: salon.id,
    staffId: ownerAuthId,
    role: 'owner',
    branchId: mainBranch.id,
    name: `Admin viewing ${salon.name}`,
    impersonatedBy: { staffId: session.staffId, name: session.name || 'Super Admin' },
  });

  const cookieStore = await cookies();
  cookieStore.set('icut-session', '1', { path: '/', sameSite: 'strict' });
  cookieStore.set('icut-role', 'owner', { path: '/', sameSite: 'strict' });

  return { data: { salon: { id: salon.id, name: salon.name }, branchId: mainBranch.id }, error: null };
}

/**
 * Exit impersonation — restore the super_admin session.
 * Requires the current session to carry an `impersonatedBy` claim.
 */
export async function exitImpersonation(): Promise<{ success: boolean; error: string | null }> {
  const session = await verifySession();
  if (!session.impersonatedBy) {
    return { success: false, error: 'Not currently impersonating' };
  }
  await signSession({
    salonId: 'super-admin',
    staffId: session.impersonatedBy.staffId,
    role: 'super_admin',
    branchId: '',
    name: session.impersonatedBy.name,
  });
  const cookieStore = await cookies();
  cookieStore.set('icut-session', '1', { path: '/', sameSite: 'strict' });
  cookieStore.set('icut-role', 'super_admin', { path: '/', sameSite: 'strict' });
  return { success: true, error: null };
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
  await requireSuperAdmin();
  const supabase = createServerClient();

  const { data: salon, error: loadErr } = await supabase
    .from('salons')
    .select('id, name, owner_id')
    .eq('id', salonId)
    .maybeSingle();
  if (loadErr) return { success: false, deletedAuthUsers: 0, error: loadErr.message };
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

  // Tables without ON DELETE CASCADE on salon_id need explicit deletes first.
  // (The rest cascade via FK: branches, services, staff, salon_partners,
  // clients, client_packages, packages, products, suppliers, expenses,
  // stock_movements, tips, advances, udhaar_payments, cash_drawers, attendance,
  // promo_codes, purchase_orders, service_staff_pricing, payment_requests,
  // agent_commissions, product_service_links.)
  const { error: aptErr } = await supabase.from('appointments').delete().eq('salon_id', salonId);
  if (aptErr) return { success: false, deletedAuthUsers: 0, error: `appointments: ${aptErr.message}` };
  const { error: billErr } = await supabase.from('bills').delete().eq('salon_id', salonId);
  if (billErr) return { success: false, deletedAuthUsers: 0, error: `bills: ${billErr.message}` };
  const { error: loyaltyErr } = await supabase.from('loyalty_rules').delete().eq('salon_id', salonId);
  if (loyaltyErr) return { success: false, deletedAuthUsers: 0, error: `loyalty_rules: ${loyaltyErr.message}` };

  const { error: delErr } = await supabase.from('salons').delete().eq('id', salonId);
  if (delErr) return { success: false, deletedAuthUsers: 0, error: `salons: ${delErr.message}` };

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
