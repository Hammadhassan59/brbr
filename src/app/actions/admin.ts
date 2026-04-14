'use server';

import { createServerClient } from '@/lib/supabase';
import { verifySession } from './auth';
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

  const activeSalons = liveSalons.filter((s) => s.setup_complete).length;
  const pendingSetup = liveSalons.length - activeSalons;

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
      trialSalons: pendingSetup,
      paidSalons: activeSalons,
      churnedSalons: 0,
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
    supabase.from('salons').select('id, name, owner_id'),
    supabase.from('salon_partners').select('*, salon:salons(name)').order('created_at', { ascending: false }),
  ]);

  return { staff: staff || [], salons: salons || [], partners: partners || [] };
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

  return { salons, cityDist, bills: billsData || [], salonNameMap };
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
