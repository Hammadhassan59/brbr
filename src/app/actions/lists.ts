'use server';

import { verifySession } from './auth';
import { createServerClient } from '@/lib/supabase';
import type {
  Client,
  Supplier,
  PromoCode,
  Staff,
  Product,
  StockTransfer,
  StockMovement,
  Service,
  Bill,
  BillItem,
  Expense,
} from '@/types/database';

interface ProductServiceLink {
  id: string;
  product_id: string;
  service_id: string;
  quantity_per_use: number;
}

// ───────────────────────────────────────────────────────────────────────────
// Simple list/get reads for the small client-component pages that previously
// did one or two .from() calls inline. Every action verifies the iCut JWT
// and uses session.salonId, never client-supplied salon ids.
// ───────────────────────────────────────────────────────────────────────────

async function ctx() {
  const session = await verifySession();
  if (!session.salonId) throw new Error('No salon context');
  return { session, supabase: createServerClient() };
}

export async function listSuppliers(branchId: string): Promise<{ data: Supplier[]; error: string | null }> {
  try {
    const { session, supabase } = await ctx();
    const { data } = await supabase
      .from('suppliers')
      .select('*')
      .eq('salon_id', session.salonId)
      .eq('branch_id', branchId)
      .order('name');
    return { data: (data ?? []) as Supplier[], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function listPromoCodes(branchId: string): Promise<{ data: PromoCode[]; error: string | null }> {
  try {
    const { session, supabase } = await ctx();
    const { data } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('salon_id', session.salonId)
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false });
    return { data: (data ?? []) as PromoCode[], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function listClients(branchId: string): Promise<{ data: Client[]; error: string | null }> {
  try {
    const { session, supabase } = await ctx();
    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('salon_id', session.salonId)
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false });
    return { data: (data ?? []) as Client[], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Failed' };
  }
}

// Bill + expense aggregation for the monthly + profit-loss reports.
// Branch scope: array of branch ids (single-branch mode = [bid], all-branches
// mode = memberBranchIds).
export async function getBillsForRange(input: {
  branchIds: string[];
  startDate: string;
  endDate: string;
}): Promise<{ data: Bill[]; error: string | null }> {
  try {
    const { supabase } = await ctx();
    if (input.branchIds.length === 0) return { data: [], error: null };
    const { data } = await supabase
      .from('bills')
      .select('*')
      .eq('status', 'paid')
      .in('branch_id', input.branchIds)
      .gte('created_at', `${input.startDate}T00:00:00`)
      .lte('created_at', `${input.endDate}T23:59:59`);
    return { data: (data ?? []) as Bill[], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Failed' };
  }
}

// Branches list (full Branch rows) — used by /dashboard/settings.
import type { Branch } from '@/types/database';
export async function listBranches(): Promise<{ data: Branch[]; error: string | null }> {
  try {
    const { session, supabase } = await ctx();
    const { data } = await supabase
      .from('branches')
      .select('*')
      .eq('salon_id', session.salonId)
      .order('is_main', { ascending: false });
    return { data: (data ?? []) as Branch[], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Failed' };
  }
}

// Branches overview KPIs (used by /dashboard/branches). Returns per-branch
// staff count, today's revenue, today's appointment count.
export async function getBranchesOverview(): Promise<{
  data: Record<string, { staffCount: number; todayRevenue: number; todayAppointments: number }>;
  error: string | null;
}> {
  try {
    const { session, supabase } = await ctx();
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
    const branchesRes = await supabase.from('branches').select('id').eq('salon_id', session.salonId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const branchIds = ((branchesRes.data ?? []) as any[]).map((b) => b.id);
    if (branchIds.length === 0) return { data: {}, error: null };
    const [staffRes, billsRes, aptsRes] = await Promise.all([
      supabase.from('staff_branches').select('staff_id, branch_id').in('branch_id', branchIds),
      supabase.from('bills').select('branch_id, total_amount').eq('salon_id', session.salonId).gte('created_at', today + 'T00:00:00').lt('created_at', today + 'T23:59:59'),
      supabase.from('appointments').select('branch_id').eq('salon_id', session.salonId).eq('appointment_date', today),
    ]);
    // staff filter: drop any whose staff row isn't active. Need to query staff to check.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbRows = ((staffRes.data ?? []) as any[]);
    const staffIds = Array.from(new Set(sbRows.map((r) => r.staff_id)));
    const activeStaff = staffIds.length
      ? await supabase.from('staff').select('id, is_active').in('id', staffIds).eq('is_active', true)
      : { data: [] as Array<{ id: string }>, error: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activeIds = new Set<string>(((activeStaff.data ?? []) as any[]).map((s) => s.id));

    const stats: Record<string, { staffCount: number; todayRevenue: number; todayAppointments: number }> = {};
    branchIds.forEach((id) => { stats[id] = { staffCount: 0, todayRevenue: 0, todayAppointments: 0 }; });
    for (const r of sbRows) {
      if (activeIds.has(r.staff_id) && stats[r.branch_id]) stats[r.branch_id].staffCount++;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const b of (billsRes.data ?? []) as any[]) {
      if (stats[b.branch_id]) stats[b.branch_id].todayRevenue += Number(b.total_amount ?? 0);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const a of (aptsRes.data ?? []) as any[]) {
      if (stats[a.branch_id]) stats[a.branch_id].todayAppointments++;
    }
    return { data: stats, error: null };
  } catch (e) {
    return { data: {}, error: e instanceof Error ? e.message : 'Failed' };
  }
}

// Loyalty rules + top loyalty clients (used by /dashboard/packages/loyalty).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getLoyaltyOverview(branchId: string): Promise<{ data: { rules: any | null; topClients: Client[] }; error: string | null }> {
  try {
    const { session, supabase } = await ctx();
    const [rulesRes, clientsRes] = await Promise.all([
      supabase.from('loyalty_rules').select('*').eq('salon_id', session.salonId).eq('branch_id', branchId).maybeSingle(),
      supabase
        .from('clients')
        .select('*')
        .eq('salon_id', session.salonId)
        .eq('branch_id', branchId)
        .gt('loyalty_points', 0)
        .order('loyalty_points', { ascending: false })
        .limit(10),
    ]);
    return {
      data: {
        rules: rulesRes.data ?? null,
        topClients: (clientsRes.data ?? []) as Client[],
      },
      error: null,
    };
  } catch (e) {
    return { data: { rules: null, topClients: [] }, error: e instanceof Error ? e.message : 'Failed' };
  }
}

// Packages + services for /dashboard/packages.
import type { Package as PkgType } from '@/types/database';
export async function getPackagesAndServices(branchId: string): Promise<{
  data: { packages: PkgType[]; services: Service[] };
  error: string | null;
}> {
  try {
    const { session, supabase } = await ctx();
    const [pkgRes, svcRes] = await Promise.all([
      supabase.from('packages').select('*').eq('salon_id', session.salonId).eq('branch_id', branchId).order('name'),
      supabase.from('services').select('*').eq('salon_id', session.salonId).eq('branch_id', branchId).eq('is_active', true).order('sort_order'),
    ]);
    return {
      data: { packages: (pkgRes.data ?? []) as PkgType[], services: (svcRes.data ?? []) as Service[] },
      error: null,
    };
  } catch (e) {
    return { data: { packages: [], services: [] }, error: e instanceof Error ? e.message : 'Failed' };
  }
}

// Expenses + bills total income for /dashboard/expenses.
export async function getExpensesAndIncome(input: {
  branchId: string; startDate: string; endDate: string;
}): Promise<{ data: { expenses: Expense[]; income: number }; error: string | null }> {
  try {
    const { supabase } = await ctx();
    const [expRes, billsRes] = await Promise.all([
      supabase.from('expenses').select('*').eq('branch_id', input.branchId).gte('date', input.startDate).lte('date', input.endDate).order('date', { ascending: false }),
      supabase.from('bills').select('total_amount').eq('branch_id', input.branchId).eq('status', 'paid').gte('created_at', `${input.startDate}T00:00:00`).lte('created_at', `${input.endDate}T23:59:59`),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const income = ((billsRes.data ?? []) as any[]).reduce((s, b) => s + Number(b.total_amount ?? 0), 0);
    return { data: { expenses: (expRes.data ?? []) as Expense[], income }, error: null };
  } catch (e) {
    return { data: { expenses: [], income: 0 }, error: e instanceof Error ? e.message : 'Failed' };
  }
}

// Active salon partners (used by /dashboard/expenses for the advances dialog).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listActiveSalonPartners(): Promise<{ data: any[]; error: string | null }> {
  try {
    const { session, supabase } = await ctx();
    const { data } = await supabase
      .from('salon_partners')
      .select('*')
      .eq('salon_id', session.salonId)
      .eq('is_active', true)
      .order('name');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { data: (data ?? []) as any[], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Failed' };
  }
}

// Advances for a list of staff in a date range, with staff names joined in.
export async function listAdvancesForStaff(input: {
  staffIds: string[]; startDate: string; endDate: string;
}): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Array<any & { staff_name: string }>;
  error: string | null;
}> {
  try {
    const { session, supabase } = await ctx();
    if (input.staffIds.length === 0) return { data: [], error: null };
    const [advRes, staffRes] = await Promise.all([
      supabase.from('advances').select('*').in('staff_id', input.staffIds).gte('date', input.startDate).lte('date', input.endDate).order('date', { ascending: false }),
      supabase.from('staff').select('id, name, salon_id').in('id', input.staffIds),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const staffById = new Map<string, string>(((staffRes.data ?? []) as any[])
      .filter((s) => s.salon_id === session.salonId)
      .map((s) => [s.id, s.name]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = ((advRes.data ?? []) as any[])
      .filter((a) => staffById.has(a.staff_id))
      .map((a) => ({ ...a, staff_name: staffById.get(a.staff_id) ?? 'Unknown' }));
    return { data, error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Failed' };
  }
}

// Active staff at a branch (uses staff_branches join). Replaces the
// inline staff_branches → staff lookup pattern in /dashboard/expenses.
export async function listActiveStaffAtBranch(branchId: string): Promise<{ data: Staff[]; error: string | null }> {
  try {
    const { session, supabase } = await ctx();
    const memberRes = await supabase.from('staff_branches').select('staff_id').eq('branch_id', branchId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const staffIds = ((memberRes.data ?? []) as any[]).map((r) => r.staff_id);
    if (staffIds.length === 0) return { data: [], error: null };
    const { data } = await supabase
      .from('staff')
      .select('*')
      .in('id', staffIds)
      .eq('is_active', true)
      .eq('salon_id', session.salonId)
      .order('name');
    return { data: (data ?? []) as Staff[], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Failed' };
  }
}

// Update an advance row (small write that the expenses page does inline).
export async function updateAdvance(input: {
  advanceId: string; amount: number; reason: string | null;
}): Promise<{ error: string | null }> {
  try {
    const { supabase } = await ctx();
    const { error } = await supabase
      .from('advances')
      .update({ amount: input.amount, reason: input.reason })
      .eq('id', input.advanceId);
    return { error: error?.message ?? null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed' };
  }
}

// Get the currently-open cash drawer (if any) for a branch+date.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getOpenCashDrawer(input: { branchId: string; date: string }): Promise<{ data: any | null; error: string | null }> {
  try {
    const { supabase } = await ctx();
    const { data } = await supabase
      .from('cash_drawers')
      .select('*')
      .eq('branch_id', input.branchId)
      .eq('date', input.date)
      .eq('status', 'open')
      .maybeSingle();
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed' };
  }
}

// Single staff detail bundle (used by /dashboard/staff/[id]).
 
export async function getStaffDetail(input: { staffId: string; today: string; startDate: string; endDate: string }): Promise<{
  data: {
    staff: Staff | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    appointments: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    attendance: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    advances: any[];
  } | null;
  error: string | null;
}> {
  try {
    const { session, supabase } = await ctx();
    const [staffRes, aptsRes, attRes, advRes] = await Promise.all([
      supabase.from('staff').select('*').eq('id', input.staffId).maybeSingle(),
      supabase.from('appointments').select('*').eq('staff_id', input.staffId).eq('appointment_date', input.today).order('start_time'),
      supabase.from('attendance').select('*').eq('staff_id', input.staffId).gte('date', input.startDate).lte('date', input.endDate).order('date'),
      supabase.from('advances').select('*').eq('staff_id', input.staffId).order('date', { ascending: false }).limit(50),
    ]);
    const staff = staffRes.data as Staff | null;
    if (staff && (staff as { salon_id: string }).salon_id !== session.salonId) {
      return { data: null, error: 'Cross-tenant staff lookup' };
    }
    // Stitch appointment relations (clients + services).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aptRows = (aptsRes.data ?? []) as any[];
    const clientIds = Array.from(new Set(aptRows.map((a) => a.client_id).filter(Boolean)));
    const aptIds = aptRows.map((a) => a.id);
    const [clientsRes, svcRes] = await Promise.all([
      clientIds.length ? supabase.from('clients').select('*').in('id', clientIds) : Promise.resolve({ data: [], error: null }),
      aptIds.length ? supabase.from('appointment_services').select('*').in('appointment_id', aptIds) : Promise.resolve({ data: [], error: null }),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientsById = new Map<string, any>(((clientsRes.data ?? []) as any[]).map((c) => [c.id, c]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svcsByApt = new Map<string, any[]>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (svcRes.data ?? []) as any[]) {
      const list = svcsByApt.get(r.appointment_id) ?? [];
      list.push(r); svcsByApt.set(r.appointment_id, list);
    }
    const appointments = aptRows.map((a) => ({
      ...a,
      client: clientsById.get(a.client_id) ?? null,
      services: svcsByApt.get(a.id) ?? [],
    }));
    return {
      data: {
        staff,
        appointments,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        attendance: (attRes.data ?? []) as any[],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        advances: (advRes.data ?? []) as any[],
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed' };
  }
}

// Bill items of type='service' for a list of bill ids — used by the profit-loss
// flat-commission calc.
export async function listServiceBillItemsForBills(billIds: string[]): Promise<{ data: BillItem[]; error: string | null }> {
  try {
    const { supabase } = await ctx();
    if (billIds.length === 0) return { data: [], error: null };
    const { data } = await supabase
      .from('bill_items')
      .select('*')
      .in('bill_id', billIds)
      .eq('item_type', 'service');
    return { data: (data ?? []) as BillItem[], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function getExpensesForRange(input: {
  branchIds: string[];
  startDate: string;
  endDate: string;
}): Promise<{ data: Expense[]; error: string | null }> {
  try {
    const { session, supabase } = await ctx();
    if (input.branchIds.length === 0) return { data: [], error: null };
    const { data } = await supabase
      .from('expenses')
      .select('*')
      .eq('salon_id', session.salonId)
      .in('branch_id', input.branchIds)
      .gte('date', input.startDate)
      .lte('date', input.endDate);
    return { data: (data ?? []) as Expense[], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Failed' };
  }
}

// Active staff filtered by primary branch (used by the staff-commissions
// report's branch scope picker). Pass null to get all active salon staff.
export async function listActiveStaffForBranch(primaryBranchId: string | null): Promise<{ data: Staff[]; error: string | null }> {
  try {
    const { session, supabase } = await ctx();
    let q = supabase.from('staff').select('*').eq('salon_id', session.salonId).eq('is_active', true);
    if (primaryBranchId) q = q.eq('primary_branch_id', primaryBranchId);
    const { data } = await q.order('name');
    return { data: (data ?? []) as Staff[], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Failed' };
  }
}

// Attendance counts (status only) for a staff in a date range.
export async function listAttendanceForStaff(input: {
  staffId: string; startDate: string; endDate: string;
}): Promise<{ data: Array<{ status: string }>; error: string | null }> {
  try {
    const { supabase } = await ctx();
    const { data } = await supabase
      .from('attendance')
      .select('status')
      .eq('staff_id', input.staffId)
      .gte('date', input.startDate)
      .lte('date', input.endDate);
    return { data: (data ?? []) as Array<{ status: string }>, error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function listActiveStaff(): Promise<{ data: Staff[]; error: string | null }> {
  try {
    const { session, supabase } = await ctx();
    const { data } = await supabase
      .from('staff')
      .select('*')
      .eq('salon_id', session.salonId)
      .eq('is_active', true)
      .order('name');
    return { data: (data ?? []) as Staff[], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function listActiveServices(branchId: string): Promise<{ data: Service[]; error: string | null }> {
  try {
    const { session, supabase } = await ctx();
    const { data } = await supabase
      .from('services')
      .select('*')
      .eq('salon_id', session.salonId)
      .eq('branch_id', branchId)
      .eq('is_active', true)
      .order('name');
    return { data: (data ?? []) as Service[], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function updateBranchProductThreshold(input: {
  productId: string; branchId: string; lowStockThreshold: number;
}): Promise<{ error: string | null }> {
  try {
    const { session, supabase } = await ctx();
    // Defense-in-depth: ensure the product belongs to this salon before
    // updating the per-branch threshold row.
    const owner = await supabase.from('products').select('salon_id').eq('id', input.productId).maybeSingle();
    if (!owner.data || (owner.data as { salon_id: string }).salon_id !== session.salonId) {
      return { error: 'Cross-tenant product update' };
    }
    const { error } = await supabase
      .from('branch_products')
      .update({ low_stock_threshold: input.lowStockThreshold })
      .eq('branch_id', input.branchId)
      .eq('product_id', input.productId);
    return { error: error?.message ?? null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function listProductServiceLinks(productId: string): Promise<{ data: ProductServiceLink[]; error: string | null }> {
  try {
    const { supabase } = await ctx();
    const { data } = await supabase.from('product_service_links').select('*').eq('product_id', productId);
    return { data: (data ?? []) as ProductServiceLink[], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function listActiveBranchProducts(branchId: string): Promise<{ data: Product[]; error: string | null }> {
  try {
    const { session, supabase } = await ctx();
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('salon_id', session.salonId)
      .eq('branch_id', branchId)
      .eq('is_active', true)
      .order('name');
    return { data: (data ?? []) as Product[], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function getStaffById(staffId: string): Promise<{ data: Staff | null; error: string | null }> {
  try {
    const { session, supabase } = await ctx();
    const { data } = await supabase.from('staff').select('*').eq('id', staffId).maybeSingle();
    if (data && (data as { salon_id: string }).salon_id !== session.salonId) {
      return { data: null, error: 'Cross-tenant staff lookup' };
    }
    return { data: (data as Staff) ?? null, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function getClientForEdit(input: { clientId: string; branchId: string }): Promise<{ data: Client | null; error: string | null }> {
  try {
    const { session, supabase } = await ctx();
    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('id', input.clientId)
      .eq('salon_id', session.salonId)
      .eq('branch_id', input.branchId)
      .maybeSingle();
    return { data: (data as Client) ?? null, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed' };
  }
}

export interface ClientDetailBundle {
  client: Client | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bills: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  udhaarPayments: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  packages: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stats: any;
}
export async function getClientDetail(input: { clientId: string; branchId: string }): Promise<{ data: ClientDetailBundle | null; error: string | null }> {
  try {
    const { session, supabase } = await ctx();
    const [clientRes, billsRes, udhaarRes, pkgRes] = await Promise.all([
      supabase.from('clients').select('*').eq('id', input.clientId).eq('salon_id', session.salonId).eq('branch_id', input.branchId).maybeSingle(),
      supabase.from('bills').select('*').eq('client_id', input.clientId).eq('status', 'paid').order('created_at', { ascending: false }).limit(50),
      supabase.from('udhaar_payments').select('*').eq('client_id', input.clientId).order('created_at', { ascending: false }),
      supabase.from('client_packages').select('*').eq('client_id', input.clientId),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const billsRows = (billsRes.data ?? []) as any[];
    const billIds = billsRows.map((b) => b.id);
    const staffIds = Array.from(new Set(billsRows.map((b) => b.staff_id).filter(Boolean)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pkgRows = (pkgRes.data ?? []) as any[];
    const packageIds = Array.from(new Set(pkgRows.map((p) => p.package_id).filter(Boolean)));
    const [itemsRes, staffRes, packagesRes] = await Promise.all([
      billIds.length ? supabase.from('bill_items').select('*').in('bill_id', billIds) : Promise.resolve({ data: [], error: null }),
      staffIds.length ? supabase.from('staff').select('id, name').in('id', staffIds) : Promise.resolve({ data: [], error: null }),
      packageIds.length ? supabase.from('packages').select('*').in('id', packageIds) : Promise.resolve({ data: [], error: null }),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itemsByBill = new Map<string, any[]>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const i of (itemsRes.data ?? []) as any[]) {
      const list = itemsByBill.get(i.bill_id) ?? [];
      list.push(i);
      itemsByBill.set(i.bill_id, list);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const staffById = new Map<string, any>(((staffRes.data ?? []) as any[]).map((s) => [s.id, s]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const packageById = new Map<string, any>(((packagesRes.data ?? []) as any[]).map((p) => [p.id, p]));
    const bills = billsRows.map((b) => ({ ...b, items: itemsByBill.get(b.id) ?? [], staff: staffById.get(b.staff_id) ?? null }));
    const clientPackages = pkgRows.map((p) => ({ ...p, package: packageById.get(p.package_id) ?? null }));

    // Cheap stats — total spent, last visit.
    const totalSpent = bills.reduce((s, b) => s + Number(b.total_amount ?? 0), 0);
    const visits = bills.length;
    const lastVisit = bills[0]?.created_at ?? null;
    const stats = { totalSpent, visits, lastVisit };

    return {
      data: {
        client: (clientRes.data as Client) ?? null,
        bills,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        udhaarPayments: (udhaarRes.data ?? []) as any[],
        packages: clientPackages,
        stats,
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed' };
  }
}

// Server-side replacement for src/lib/db.ts:fetchProductsWithBranchStock —
// the client wrapper relied on the browser supabase client which is gone.
import type { ProductWithBranchStock } from '@/lib/db';

export async function getProductsWithBranchStock(input: { branchId: string }): Promise<{
  data: ProductWithBranchStock[];
  error: string | null;
}> {
  try {
    const { session, supabase } = await ctx();
    const [productsRes, bpRes] = await Promise.all([
      supabase
        .from('products')
        .select('*')
        .eq('salon_id', session.salonId)
        .eq('branch_id', input.branchId)
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('branch_products')
        .select('*')
        .eq('branch_id', input.branchId),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bpByProduct = new Map<string, any>(((bpRes.data ?? []) as any[]).map((bp) => [bp.product_id, bp]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = ((productsRes.data ?? []) as any[]).map((p) => {
      const bp = bpByProduct.get(p.id);
      return {
        ...p,
        current_stock: bp?.current_stock ?? 0,
        low_stock_threshold: bp?.low_stock_threshold ?? 5,
        branch_product_id: bp?.id,
      } as ProductWithBranchStock;
    });
    return { data, error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function getInventoryOverview(branchId: string): Promise<{
  data: {
    movements: Array<StockMovement & { product_name?: string }>;
  } | null;
  error: string | null;
}> {
  try {
    const { session, supabase } = await ctx();
    const movRes = await supabase
      .from('stock_movements')
      .select('*')
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })
      .limit(10);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (movRes.data ?? []) as any[];
    const productIds = Array.from(new Set(rows.map((m) => m.product_id).filter(Boolean)));
    const prodRes = productIds.length
      ? await supabase.from('products').select('id, name, salon_id').in('id', productIds)
      : { data: [], error: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byId = new Map<string, any>(((prodRes.data ?? []) as any[])
      .filter((p) => p.salon_id === session.salonId)
      .map((p) => [p.id, p]));
    const movements = rows
      .map((m) => ({ ...m, product_name: byId.get(m.product_id)?.name as string | undefined }))
      .filter((m) => byId.has(m.product_id));
    return { data: { movements }, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function getInventoryReport(input: {
  branchId: string; dateFrom: string; dateTo: string;
}): Promise<{
  data: {
    movements: Array<StockMovement & { product?: Product }>;
    products: ProductWithBranchStock[];
    staffOptions: Staff[];
  } | null;
  error: string | null;
}> {
  try {
    const { session, supabase } = await ctx();
    const [movRes, productsRes, branchProductsRes, staffRes] = await Promise.all([
      supabase
        .from('stock_movements')
        .select('*')
        .eq('branch_id', input.branchId)
        .gte('created_at', `${input.dateFrom}T00:00:00`)
        .lte('created_at', `${input.dateTo}T23:59:59`)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.from('products').select('*').eq('salon_id', session.salonId).eq('branch_id', input.branchId).eq('is_active', true).order('name'),
      supabase.from('branch_products').select('*').eq('branch_id', input.branchId),
      supabase.from('staff').select('*').eq('salon_id', session.salonId).eq('is_active', true).order('name'),
    ]);

    // Stitch product onto each movement (replaces PostgREST products!inner).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const productsList = ((productsRes.data ?? []) as any[]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const productById = new Map<string, any>(productsList.map((p) => [p.id, p]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const movements = ((movRes.data ?? []) as any[])
      .map((m) => ({ ...m, product: productById.get(m.product_id) }))
      .filter((m) => m.product); // tenant-isolation: drop rows whose product isn't in this salon

    // Merge branch_products stock into product list.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bpByProduct = new Map<string, any>(((branchProductsRes.data ?? []) as any[]).map((bp) => [bp.product_id, bp]));
    const products = productsList.map((p) => {
      const bp = bpByProduct.get(p.id);
      return {
        ...p,
        current_stock: bp?.current_stock ?? 0,
        low_stock_threshold: bp?.low_stock_threshold ?? 5,
        branch_product_id: bp?.id,
      } as ProductWithBranchStock;
    });

    return {
      data: { movements, products, staffOptions: (staffRes.data ?? []) as Staff[] },
      error: null,
    };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed' };
  }
}

// Per-branch products + their current_stock map. Used by the transfer dialog
// to gate "available: N" client-side before submitting the transfer.
// Purchase orders + their supplier rows (replaces the previous PostgREST
// embedded join). Suppliers are returned in a parallel list so existing
// callers can still display po.supplier.name.
export async function getPurchaseOrdersAndSuppliers(branchId: string): Promise<{
  data: { orders: Array<{ supplier?: Supplier } & Record<string, unknown>>; suppliers: Supplier[] } | null;
  error: string | null;
}> {
  try {
    const { session, supabase } = await ctx();
    const [ordRes, supRes] = await Promise.all([
      supabase.from('purchase_orders').select('*').eq('branch_id', branchId).order('created_at', { ascending: false }),
      supabase.from('suppliers').select('*').eq('salon_id', session.salonId).eq('branch_id', branchId).order('name'),
    ]);
    const suppliers = (supRes.data ?? []) as Supplier[];
    const supplierById = new Map(suppliers.map((s) => [s.id, s]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orders = ((ordRes.data ?? []) as any[]).map((o) => ({
      ...o,
      supplier: supplierById.get(o.supplier_id),
    }));
    return { data: { orders, suppliers }, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function getBranchProductsAndStock(branchId: string): Promise<{
  data: { products: Product[]; stockByProduct: Record<string, number> } | null;
  error: string | null;
}> {
  try {
    const { session, supabase } = await ctx();
    const [stockRes, prodRes] = await Promise.all([
      supabase.from('branch_products').select('product_id,current_stock').eq('branch_id', branchId),
      supabase.from('products').select('*').eq('salon_id', session.salonId).eq('branch_id', branchId).eq('is_active', true).order('name'),
    ]);
    const stockByProduct: Record<string, number> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (stockRes.data ?? []) as any[]) {
      stockByProduct[row.product_id] = Number(row.current_stock) || 0;
    }
    return {
      data: { products: (prodRes.data ?? []) as Product[], stockByProduct },
      error: null,
    };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function getStockTransfersAndProducts(branchId: string): Promise<{
  data: { transfers: StockTransfer[]; products: Product[] } | null;
  error: string | null;
}> {
  try {
    const { session, supabase } = await ctx();
    const [txRes, prodRes] = await Promise.all([
      supabase
        .from('stock_transfers')
        .select('*')
        .eq('salon_id', session.salonId)
        .or(`from_branch_id.eq.${branchId},to_branch_id.eq.${branchId}`)
        .order('created_at', { ascending: false }),
      supabase
        .from('products')
        .select('*')
        .eq('salon_id', session.salonId)
        .eq('branch_id', branchId)
        .eq('is_active', true)
        .order('name'),
    ]);
    return {
      data: {
        transfers: (txRes.data ?? []) as StockTransfer[],
        products: (prodRes.data ?? []) as Product[],
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed' };
  }
}
