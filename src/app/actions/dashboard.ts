'use server';

import { verifySession } from './auth';
import { createServerClient } from '@/lib/supabase';
import type {
  DailySummary,
  StaffMonthlyCommission,
  UdhaarReportItem,
  ClientStats,
  AppointmentWithDetails,
  Staff,
} from '@/types/database';

// ───────────────────────────────────────────────────────────────────────────
// Single bootstrap action for the main /dashboard page.
//
// Replaces 13 client-side supabase.from() calls + 2 supabase.channel()
// realtime subscriptions that the page used to make. Returns everything the
// page needs in one round trip; the page polls this action on an interval to
// approximate the realtime refresh that we lost when realtime was dropped.
// ───────────────────────────────────────────────────────────────────────────

export interface DashboardSnapshot {
  summary: DailySummary | null;
  appointments: AppointmentWithDetails[];
  cashInDrawer: number;
  lowStockCount: number;
  udhaarClients: number;
  udhaarTotal: number;
  branchStaff: Staff[];
  stylistTips: number;
  posWalkInCount: number;
  // Bills slice — page needs created_at + total + payment_method to draw
  // the per-hour or per-day chart and the payment-breakdown card.
  bills: Array<{
    total_amount: number;
    created_at: string;
    payment_method: string;
    staff_id: string | null;
    appointment_id: string | null;
  }>;
}

// Daily report bootstrap — handles both "single branch" and "all member
// branches" modes. Replaces 4 client-side .from() reads in /dashboard/reports/daily.
import type { Bill, BillItem, CashDrawer, Expense } from '@/types/database';

export async function getDailyReport(input: {
  branchId: string | null;     // null = aggregate across memberBranchIds
  memberBranchIds: string[];
  date: string;
}): Promise<{
  data: {
    summary: DailySummary | null;
    bills: Array<Bill & { items?: BillItem[] }>;
    drawer: CashDrawer | null;
    expenses: Expense[];
  } | null;
  error: string | null;
}> {
  try {
    const session = await verifySession();
    if (!session.salonId) return { data: null, error: 'No salon context' };
    const supabase = createServerClient();
    const { branchId, memberBranchIds, date } = input;

    // Summary RPC: salon-level (all branches) or branch-level via existing RPC.
    let summary: DailySummary | null = null;
    if (branchId === null) {
      const r = await supabase.rpc('get_salon_daily_summary', { p_salon_id: session.salonId, p_date: date });
      summary = (r.data as DailySummary) ?? null;
    } else {
      const r = await supabase.rpc('get_daily_summary', { p_branch_id: branchId, p_date: date, p_salon_id: session.salonId });
      summary = (r.data as DailySummary) ?? null;
    }

    // Bills + cash drawer + expenses scope.
    const branchIdsForRead = branchId === null ? memberBranchIds : [branchId];
    if (branchIdsForRead.length === 0) {
      return { data: { summary, bills: [], drawer: null, expenses: [] }, error: null };
    }

    const [billsRes, drawerRes, expRes] = await Promise.all([
      branchIdsForRead.length === 1
        ? supabase
            .from('bills')
            .select('*')
            .eq('branch_id', branchIdsForRead[0])
            .gte('created_at', `${date}T00:00:00`)
            .lte('created_at', `${date}T23:59:59`)
            .order('created_at', { ascending: false })
        : supabase
            .from('bills')
            .select('*')
            .in('branch_id', branchIdsForRead)
            .gte('created_at', `${date}T00:00:00`)
            .lte('created_at', `${date}T23:59:59`)
            .order('created_at', { ascending: false }),
      // Single cash drawer only makes sense per-branch.
      branchId !== null
        ? supabase.from('cash_drawers').select('*').eq('branch_id', branchId).eq('date', date).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      branchIdsForRead.length === 1
        ? supabase.from('expenses').select('*').eq('salon_id', session.salonId).eq('branch_id', branchIdsForRead[0]).eq('date', date).order('created_at', { ascending: false })
        : supabase.from('expenses').select('*').eq('salon_id', session.salonId).in('branch_id', branchIdsForRead).eq('date', date).order('created_at', { ascending: false }),
    ]);

    // Stitch bill_items via a follow-up read (PostgREST embedded join repl).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const billsRows = (billsRes.data ?? []) as any[];
    const billIds = billsRows.map((b) => b.id);
    const itemsRes = billIds.length
      ? await supabase.from('bill_items').select('*').in('bill_id', billIds)
      : { data: [] as BillItem[], error: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itemsByBill = new Map<string, any[]>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const i of (itemsRes.data ?? []) as any[]) {
      const list = itemsByBill.get(i.bill_id) ?? [];
      list.push(i); itemsByBill.set(i.bill_id, list);
    }
    const bills = billsRows.map((b) => ({ ...b, items: itemsByBill.get(b.id) ?? [] })) as Array<Bill & { items?: BillItem[] }>;

    return {
      data: {
        summary,
        bills,
        drawer: (drawerRes.data as CashDrawer) ?? null,
        expenses: (expRes.data ?? []) as Expense[],
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed' };
  }
}

// Single bootstrap for /dashboard/reports — does the aggregation server-side.
export interface ReportsOverview {
  daily: { revenue: number; bills: number };
  monthly: { revenue: number; trend: number };
  staff: { activeCount: number; topEarner: string };
  inventory: { lowStock: number; totalProducts: number };
  clients: { total: number; udhaarTotal: number };
  profitLoss: { revenue: number; expenses: number };
}

export async function getReportsOverview(input: {
  branchId: string;
}): Promise<{ data: ReportsOverview | null; error: string | null }> {
  try {
    const session = await verifySession();
    if (!session.salonId) return { data: null, error: 'No salon context' };
    const supabase = createServerClient();
    const { branchId } = input;

    const [bills, memberRows, products, branchProducts, clients, expenses, staffBills] = await Promise.all([
      supabase.from('bills').select('total_amount, created_at').eq('branch_id', branchId).eq('status', 'paid'),
      supabase.from('staff_branches').select('staff_id').eq('branch_id', branchId),
      supabase.from('products').select('id').eq('salon_id', session.salonId).eq('branch_id', branchId).eq('is_active', true),
      supabase.from('branch_products').select('product_id, current_stock, low_stock_threshold').eq('branch_id', branchId),
      supabase.from('clients').select('udhaar_balance').eq('salon_id', session.salonId).eq('branch_id', branchId),
      supabase.from('expenses').select('amount').eq('branch_id', branchId),
      supabase.from('bills').select('staff_id, total_amount').eq('branch_id', branchId).eq('status', 'paid'),
    ]);

    // Staff list (resolves the previous PostgREST embedded join
    // staff.staff_branches!inner(branch_id))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const staffIds = ((memberRows.data ?? []) as any[]).map((r) => r.staff_id);
    const staffRes = staffIds.length
      ? await supabase
          .from('staff')
          .select('id, name')
          .in('id', staffIds)
          .eq('salon_id', session.salonId)
          .eq('is_active', true)
      : { data: [] as Array<{ id: string; name: string }>, error: null };

    // Aggregations.
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const billsRows = (bills.data ?? []) as any[];
    const todayBills = billsRows.filter((b) => String(b.created_at ?? '').startsWith(today));
    const todayRevenue = todayBills.reduce((s, b) => s + Number(b.total_amount ?? 0), 0);
    const totalRevenue = billsRows.reduce((s, b) => s + Number(b.total_amount ?? 0), 0);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const productIds = new Set<string>(((products.data ?? []) as any[]).map((p) => p.id));
    const bpMap = new Map<string, { current_stock: number; low_stock_threshold: number }>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (branchProducts.data ?? []) as any[]) {
      bpMap.set(r.product_id, { current_stock: r.current_stock, low_stock_threshold: r.low_stock_threshold });
    }
    let lowStock = 0;
    for (const id of productIds) {
      const bp = bpMap.get(id);
      if (bp && bp.current_stock <= bp.low_stock_threshold) lowStock++;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientsRows = (clients.data ?? []) as any[];
    const udhaarTotal = clientsRows.reduce((s, c) => s + Number(c.udhaar_balance ?? 0), 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const totalExpenses = ((expenses.data ?? []) as any[]).reduce((s, e) => s + Number(e.amount ?? 0), 0);

    // Top earner by revenue.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const staffBillsRows = (staffBills.data ?? []) as any[];
    const revByStaff: Record<string, number> = {};
    for (const b of staffBillsRows) {
      if (b.staff_id) revByStaff[b.staff_id] = (revByStaff[b.staff_id] ?? 0) + Number(b.total_amount ?? 0);
    }
    let topEarner = '—';
    let topRevenue = 0;
    for (const s of (staffRes.data ?? []) as Array<{ id: string; name: string }>) {
      const rev = revByStaff[s.id] ?? 0;
      if (rev > topRevenue) { topRevenue = rev; topEarner = s.name; }
    }

    // Month-over-month trend.
    const now = new Date();
    const curMonth = now.getMonth();
    const curYear = now.getFullYear();
    const prevMonthDate = new Date(curYear, curMonth - 1, 1);
    const prevMonthEnd = new Date(curYear, curMonth, 0);
    const curMonthStart = new Date(curYear, curMonth, 1);
    const curMonthBills = billsRows.filter((b) => new Date(b.created_at) >= curMonthStart);
    const prevMonthBills = billsRows.filter((b) => {
      const d = new Date(b.created_at);
      return d >= prevMonthDate && d <= prevMonthEnd;
    });
    const curMonthRevenue = curMonthBills.reduce((s, b) => s + Number(b.total_amount ?? 0), 0);
    const prevMonthRevenue = prevMonthBills.reduce((s, b) => s + Number(b.total_amount ?? 0), 0);
    const monthTrend = prevMonthRevenue > 0
      ? Math.round(((curMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100)
      : 0;

    return {
      data: {
        daily: { revenue: todayRevenue, bills: todayBills.length },
        monthly: { revenue: totalRevenue, trend: monthTrend },
        staff: { activeCount: (staffRes.data ?? []).length, topEarner },
        inventory: { lowStock, totalProducts: productIds.size },
        clients: { total: clientsRows.length, udhaarTotal },
        profitLoss: { revenue: totalRevenue, expenses: totalExpenses },
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function getDashboardSnapshot(input: {
  branchId: string;
  startDate: string;
  endDate: string;
  // Optional staffId — if the caller is a stylist, we look up their tips.
  stylistStaffId?: string;
}): Promise<{ data: DashboardSnapshot | null; error: string | null }> {
  try {
    const session = await verifySession();
    if (!session.salonId) return { data: null, error: 'No salon context' };
    const supabase = createServerClient();
    const { branchId, startDate, endDate, stylistStaffId } = input;
    const multiDay = startDate !== endDate;

    // Daily summary RPC. Already a SECURITY DEFINER fn that asserts ownership.
    const summaryRes = await supabase.rpc('get_daily_summary', {
      p_branch_id: branchId,
      p_date: startDate,
      p_salon_id: session.salonId,
    });
    const summary: DailySummary | null = summaryRes.error ? null : (summaryRes.data ?? null);

    // Pull in parallel — independent reads.
    const [
      apts,
      drawer,
      products,
      branchProducts,
      udhaar,
      bills,
      branchStaffRows,
      tipsRes,
    ] = await Promise.all([
      // Appointments + nested client/staff/services. The pg-adapter doesn't
      // do PostgREST embedded joins, so we fetch the parents and stitch
      // children below.
      multiDay
        ? supabase
            .from('appointments')
            .select('*')
            .eq('branch_id', branchId)
            .gte('appointment_date', startDate)
            .lte('appointment_date', endDate)
            .order('start_time')
        : supabase
            .from('appointments')
            .select('*')
            .eq('branch_id', branchId)
            .eq('appointment_date', startDate)
            .order('start_time'),
      supabase
        .from('cash_drawers')
        .select('*')
        .eq('branch_id', branchId)
        .eq('date', startDate)
        .maybeSingle(),
      supabase
        .from('products')
        .select('id')
        .eq('salon_id', session.salonId)
        .eq('branch_id', branchId)
        .eq('is_active', true),
      supabase
        .from('branch_products')
        .select('product_id, current_stock, low_stock_threshold')
        .eq('branch_id', branchId),
      supabase
        .from('clients')
        .select('udhaar_balance')
        .eq('salon_id', session.salonId)
        .eq('branch_id', branchId)
        .gt('udhaar_balance', 0),
      supabase
        .from('bills')
        .select('total_amount, created_at, payment_method, staff_id, appointment_id')
        .eq('branch_id', branchId)
        .eq('status', 'paid')
        .gte('created_at', `${startDate}T00:00:00+05:00`)
        .lte('created_at', `${endDate}T23:59:59+05:00`),
      supabase
        .from('staff_branches')
        .select('staff_id')
        .eq('branch_id', branchId),
      stylistStaffId
        ? supabase
            .from('tips')
            .select('amount')
            .eq('staff_id', stylistStaffId)
            .eq('date', startDate)
        : Promise.resolve({ data: [] as Array<{ amount: number }>, error: null }),
    ]);

    // Stitch appointment relations: fetch related clients, staff, and services
    // by IDs, then index them. One follow-up query per relation table.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aptRows = (apts.data ?? []) as any[];
    const clientIds = Array.from(new Set(aptRows.map((a) => a.client_id).filter(Boolean)));
    const staffIdsFromApts = Array.from(new Set(aptRows.map((a) => a.staff_id).filter(Boolean)));
    const aptIds = aptRows.map((a) => a.id);

    const [clientsRes, aptStaffRes, aptSvcRes] = await Promise.all([
      clientIds.length
        ? supabase.from('clients').select('*').in('id', clientIds)
        : Promise.resolve({ data: [], error: null }),
      staffIdsFromApts.length
        ? supabase.from('staff').select('*').in('id', staffIdsFromApts)
        : Promise.resolve({ data: [], error: null }),
      aptIds.length
        ? supabase.from('appointment_services').select('*').in('appointment_id', aptIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientsById = new Map<string, any>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of (clientsRes.data ?? []) as any[]) clientsById.set(c.id, c);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const staffById = new Map<string, any>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const s of (aptStaffRes.data ?? []) as any[]) staffById.set(s.id, s);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svcsByApt = new Map<string, any[]>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (aptSvcRes.data ?? []) as any[]) {
      const list = svcsByApt.get(r.appointment_id) ?? [];
      list.push(r);
      svcsByApt.set(r.appointment_id, list);
    }
    const appointments: AppointmentWithDetails[] = aptRows.map((a) => ({
      ...a,
      client: clientsById.get(a.client_id) ?? null,
      staff: staffById.get(a.staff_id) ?? null,
      services: svcsByApt.get(a.id) ?? [],
    }));

    // Cash drawer math.
    const drawerRow = drawer.data as
      | { opening_balance?: number; total_cash_sales?: number; total_expenses?: number }
      | null;
    const cashInDrawer = drawerRow
      ? (drawerRow.opening_balance ?? 0) + (drawerRow.total_cash_sales ?? 0) - (drawerRow.total_expenses ?? 0)
      : 0;

    // Low-stock count: branch_products row where current_stock <= threshold,
    // restricted to active products in this branch.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const productIds = new Set<string>(((products.data ?? []) as any[]).map((p) => p.id));
    let lowStockCount = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const bp of (branchProducts.data ?? []) as any[]) {
      if (productIds.has(bp.product_id) && bp.current_stock <= bp.low_stock_threshold) lowStockCount++;
    }

    // Udhaar.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const udhaarRows = (udhaar.data ?? []) as any[];
    const udhaarTotal = udhaarRows.reduce((s, c) => s + Number(c.udhaar_balance ?? 0), 0);

    // Bills + walk-in derived count.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const billsRows = (bills.data ?? []) as any[];
    const posWalkInCount = billsRows.filter((b) => !b.appointment_id).length;

    // Branch staff (multi-branch via staff_branches join table).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const branchStaffIds = ((branchStaffRows.data ?? []) as any[]).map((r) => r.staff_id);
    const branchStaffRes = branchStaffIds.length
      ? await supabase.from('staff').select('*').in('id', branchStaffIds).eq('is_active', true)
      : { data: [] as Staff[], error: null };

    // Stylist tips.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stylistTips = ((tipsRes.data ?? []) as any[]).reduce(
      (s, t) => s + Number(t.amount ?? 0), 0,
    );

    return {
      data: {
        summary,
        appointments,
        cashInDrawer,
        lowStockCount,
        udhaarClients: udhaarRows.length,
        udhaarTotal,
        branchStaff: (branchStaffRes.data ?? []) as Staff[],
        stylistTips,
        posWalkInCount,
        bills: billsRows,
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed' };
  }
}

/**
 * Server-action wrappers for the four SECURITY DEFINER dashboard RPCs
 * hardened by migration 029_secure_rpcs.sql.
 *
 * After migration 029, those RPCs:
 *   1. Require p_salon_id and assert it matches the referenced entity.
 *   2. Have EXECUTE revoked from anon + authenticated, granted only to
 *      service_role.
 *
 * That means the Supabase anon client can no longer call them directly from
 * the browser. All four must go through a server action that:
 *   1. Verifies the iCut JWT via verifySession() to get a trusted salonId.
 *   2. Calls the RPC via the service-role client, passing that salonId.
 *
 * The salon ownership checks inside the RPC bodies (see migration 029) are
 * defense-in-depth in case this action is ever misused.
 */

export async function getDailySummaryAction(
  branchId: string,
  date: string,
): Promise<{ data: DailySummary | null; error: string | null }> {
  try {
    const session = await verifySession();
    if (!session.salonId) {
      return { data: null, error: 'No salon context' };
    }

    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('get_daily_summary', {
      p_branch_id: branchId,
      p_date: date,
      p_salon_id: session.salonId,
    });

    if (error) return { data: null, error: error.message };
    return { data: (data as DailySummary) ?? null, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function getStaffMonthlyCommissionAction(
  staffId: string,
  month: number,
  year: number,
): Promise<{ data: StaffMonthlyCommission | null; error: string | null }> {
  try {
    const session = await verifySession();
    if (!session.salonId) {
      return { data: null, error: 'No salon context' };
    }

    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('get_staff_monthly_commission', {
      p_staff_id: staffId,
      p_month: month,
      p_year: year,
      p_salon_id: session.salonId,
    });

    if (error) return { data: null, error: error.message };
    return { data: (data as StaffMonthlyCommission) ?? null, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function getUdhaarReportAction(): Promise<{
  data: UdhaarReportItem[] | null;
  error: string | null;
}> {
  try {
    const session = await verifySession();
    if (!session.salonId) {
      return { data: null, error: 'No salon context' };
    }

    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('get_udhaar_report', {
      p_salon_id: session.salonId,
    });

    if (error) return { data: null, error: error.message };
    return { data: (data as UdhaarReportItem[]) ?? [], error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function getClientStatsAction(
  clientId: string,
): Promise<{ data: ClientStats | null; error: string | null }> {
  try {
    const session = await verifySession();
    if (!session.salonId) {
      return { data: null, error: 'No salon context' };
    }

    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('get_client_stats', {
      p_client_id: clientId,
      p_salon_id: session.salonId,
    });

    if (error) return { data: null, error: error.message };
    return { data: (data as ClientStats) ?? null, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed' };
  }
}
