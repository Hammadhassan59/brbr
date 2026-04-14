import { supabase } from './supabase';
import type {
  Salon, SalonInsert,
  Branch, BranchInsert,
  Staff, StaffInsert,
  Service, ServiceInsert,
  Client, ClientInsert,
  Appointment, AppointmentInsert,
  AppointmentService, AppointmentServiceInsert,
  Bill, BillInsert,
  BillItem, BillItemInsert,
  Attendance, AttendanceInsert,
  Advance, AdvanceInsert,
  Tip, TipInsert,
  Product, ProductInsert,
  StockMovement, StockMovementInsert,
  Supplier, SupplierInsert,
  PurchaseOrder, PurchaseOrderInsert,
  Package, PackageInsert,
  ClientPackage, ClientPackageInsert,
  PromoCode, PromoCodeInsert,
  LoyaltyRules,
  CashDrawer, CashDrawerInsert,
  Expense, ExpenseInsert,
  UdhaarPayment, UdhaarPaymentInsert,
  DailySummary,
  StaffMonthlyCommission,
  UdhaarReportItem,
  ClientStats,
  AppointmentWithDetails,
  BillWithDetails,
} from '@/types/database';

// ═══════════════════════════════════════
// Salons
// ═══════════════════════════════════════

export async function getSalon(id: string) {
  const { data, error } = await supabase
    .from('salons')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as Salon;
}

export async function getSalonByOwner(ownerId: string) {
  const { data, error } = await supabase
    .from('salons')
    .select('*')
    .eq('owner_id', ownerId)
    .single();
  if (error) throw error;
  return data as Salon;
}

export async function createSalon(salon: SalonInsert) {
  const { data, error } = await supabase
    .from('salons')
    .insert(salon)
    .select()
    .single();
  if (error) throw error;
  return data as Salon;
}

export async function updateSalon(id: string, updates: Partial<Salon>) {
  const { data, error } = await supabase
    .from('salons')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Salon;
}

// ═══════════════════════════════════════
// Branches
// ═══════════════════════════════════════

export async function getBranches(salonId: string) {
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .eq('salon_id', salonId)
    .order('is_main', { ascending: false });
  if (error) throw error;
  return data as Branch[];
}

export async function getBranch(id: string) {
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as Branch;
}

export async function createBranch(branch: BranchInsert) {
  const { data, error } = await supabase
    .from('branches')
    .insert(branch)
    .select()
    .single();
  if (error) throw error;
  return data as Branch;
}

export async function updateBranch(id: string, updates: Partial<Branch>) {
  const { data, error } = await supabase
    .from('branches')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Branch;
}

// ═══════════════════════════════════════
// Staff
// ═══════════════════════════════════════

export async function getStaff(salonId: string) {
  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .eq('salon_id', salonId)
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return data as Staff[];
}

export async function getStaffByBranch(branchId: string) {
  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return data as Staff[];
}

export async function getStaffMember(id: string) {
  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as Staff;
}

export async function getStaffByPin(salonId: string, phone: string, pin: string) {
  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .eq('salon_id', salonId)
    .eq('phone', phone)
    .eq('pin_code', pin)
    .eq('is_active', true)
    .single();
  if (error) throw error;
  return data as Staff;
}

export async function getStaffByPhone(salonId: string, phone: string) {
  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .eq('salon_id', salonId)
    .eq('phone', phone)
    .eq('is_active', true)
    .single();
  if (error) throw error;
  return data as Staff;
}

export async function createStaffMember(staff: StaffInsert) {
  const { data, error } = await supabase
    .from('staff')
    .insert(staff)
    .select()
    .single();
  if (error) throw error;
  return data as Staff;
}

export async function updateStaffMember(id: string, updates: Partial<Staff>) {
  const { data, error } = await supabase
    .from('staff')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Staff;
}

// ═══════════════════════════════════════
// Services
// ═══════════════════════════════════════

export async function getServices(salonId: string) {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('salon_id', salonId)
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return data as Service[];
}

export async function getServicesByCategory(salonId: string, category: string) {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('salon_id', salonId)
    .eq('category', category)
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return data as Service[];
}

export async function createService(service: ServiceInsert) {
  const { data, error } = await supabase
    .from('services')
    .insert(service)
    .select()
    .single();
  if (error) throw error;
  return data as Service;
}

export async function updateService(id: string, updates: Partial<Service>) {
  const { data, error } = await supabase
    .from('services')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Service;
}

export async function bulkCreateServices(services: ServiceInsert[]) {
  const { data, error } = await supabase
    .from('services')
    .insert(services)
    .select();
  if (error) throw error;
  return data as Service[];
}

// ═══════════════════════════════════════
// Clients
// ═══════════════════════════════════════

export async function getClients(salonId: string) {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('salon_id', salonId)
    .order('name');
  if (error) throw error;
  return data as Client[];
}

export async function searchClients(salonId: string, query: string) {
  const trimmed = query.trim().slice(0, 100);
  if (!trimmed) return [] as Client[];

  // Two typed queries + merge. Using .ilike() with a pattern string keeps the
  // user input as a parameter instead of templating it into PostgREST's .or()
  // filter expression, which would interpret commas and parentheses as
  // operators (ISSUE-008).
  const pattern = `%${trimmed}%`;
  const [nameRes, phoneRes] = await Promise.all([
    supabase
      .from('clients')
      .select('*')
      .eq('salon_id', salonId)
      .ilike('name', pattern)
      .order('name')
      .limit(20),
    supabase
      .from('clients')
      .select('*')
      .eq('salon_id', salonId)
      .ilike('phone', pattern)
      .order('name')
      .limit(20),
  ]);
  if (nameRes.error) throw nameRes.error;
  if (phoneRes.error) throw phoneRes.error;

  const merged = new Map<string, Client>();
  for (const row of (nameRes.data || []) as Client[]) merged.set(row.id, row);
  for (const row of (phoneRes.data || []) as Client[]) merged.set(row.id, row);
  return Array.from(merged.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 20);
}

export async function getClient(id: string) {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as Client;
}

export async function createClient(client: ClientInsert) {
  const { data, error } = await supabase
    .from('clients')
    .insert(client)
    .select()
    .single();
  if (error) throw error;
  return data as Client;
}

export async function updateClient(id: string, updates: Partial<Client>) {
  const { data, error } = await supabase
    .from('clients')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Client;
}

export async function getVIPClients(salonId: string) {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('salon_id', salonId)
    .eq('is_vip', true)
    .order('total_spent', { ascending: false });
  if (error) throw error;
  return data as Client[];
}

export async function getUdhaarClients(salonId: string) {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('salon_id', salonId)
    .gt('udhaar_balance', 0)
    .order('udhaar_balance', { ascending: false });
  if (error) throw error;
  return data as Client[];
}

// ═══════════════════════════════════════
// Appointments
// ═══════════════════════════════════════

export async function getAppointments(branchId: string, date: string) {
  const { data, error } = await supabase
    .from('appointments')
    .select('*, client:clients(*), staff:staff(*), services:appointment_services(*)')
    .eq('branch_id', branchId)
    .eq('appointment_date', date)
    .order('start_time');
  if (error) throw error;
  return data as AppointmentWithDetails[];
}

export async function getAppointmentsByStaff(staffId: string, date: string) {
  const { data, error } = await supabase
    .from('appointments')
    .select('*, client:clients(*), staff:staff(*), services:appointment_services(*)')
    .eq('staff_id', staffId)
    .eq('appointment_date', date)
    .order('start_time');
  if (error) throw error;
  return data as AppointmentWithDetails[];
}

export async function getAppointment(id: string) {
  const { data, error } = await supabase
    .from('appointments')
    .select('*, client:clients(*), staff:staff(*), services:appointment_services(*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as AppointmentWithDetails;
}

export async function createAppointment(appointment: AppointmentInsert) {
  const { data, error } = await supabase
    .from('appointments')
    .insert(appointment)
    .select()
    .single();
  if (error) throw error;
  return data as Appointment;
}

export async function updateAppointment(id: string, updates: Partial<Appointment>) {
  const { data, error } = await supabase
    .from('appointments')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Appointment;
}

export async function createAppointmentServices(services: AppointmentServiceInsert[]) {
  const { data, error } = await supabase
    .from('appointment_services')
    .insert(services)
    .select();
  if (error) throw error;
  return data as AppointmentService[];
}

// ═══════════════════════════════════════
// Bills
// ═══════════════════════════════════════

export async function getBills(branchId: string, date: string) {
  const { data, error } = await supabase
    .from('bills')
    .select('*, client:clients(*), staff:staff(*), items:bill_items(*)')
    .eq('branch_id', branchId)
    .gte('created_at', `${date}T00:00:00`)
    .lte('created_at', `${date}T23:59:59`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as BillWithDetails[];
}

export async function getBill(id: string) {
  const { data, error } = await supabase
    .from('bills')
    .select('*, client:clients(*), staff:staff(*), items:bill_items(*), appointment:appointments(*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as BillWithDetails;
}

export async function createBill(bill: BillInsert) {
  const { data, error } = await supabase
    .from('bills')
    .insert(bill)
    .select()
    .single();
  if (error) throw error;
  return data as Bill;
}

export async function updateBill(id: string, updates: Partial<Bill>) {
  const { data, error } = await supabase
    .from('bills')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Bill;
}

export async function createBillItems(items: BillItemInsert[]) {
  const { data, error } = await supabase
    .from('bill_items')
    .insert(items)
    .select();
  if (error) throw error;
  return data as BillItem[];
}

// Bill number generation moved to server action (src/app/actions/bills.ts)
// to avoid race conditions between concurrent checkouts.

// ═══════════════════════════════════════
// Attendance
// ═══════════════════════════════════════

export async function getAttendance(staffId: string, month: number, year: number) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('staff_id', staffId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date');
  if (error) throw error;
  return data as Attendance[];
}

export async function markAttendance(attendance: AttendanceInsert) {
  const { data, error } = await supabase
    .from('attendance')
    .upsert(attendance, { onConflict: 'staff_id,date' })
    .select()
    .single();
  if (error) throw error;
  return data as Attendance;
}

// ═══════════════════════════════════════
// Advances
// ═══════════════════════════════════════

export async function getAdvances(staffId: string) {
  const { data, error } = await supabase
    .from('advances')
    .select('*')
    .eq('staff_id', staffId)
    .order('date', { ascending: false });
  if (error) throw error;
  return data as Advance[];
}

export async function createAdvance(advance: AdvanceInsert) {
  const { data, error } = await supabase
    .from('advances')
    .insert(advance)
    .select()
    .single();
  if (error) throw error;
  return data as Advance;
}

// ═══════════════════════════════════════
// Tips
// ═══════════════════════════════════════

export async function createTip(tip: TipInsert) {
  const { data, error } = await supabase
    .from('tips')
    .insert(tip)
    .select()
    .single();
  if (error) throw error;
  return data as Tip;
}

// ═══════════════════════════════════════
// Products & Inventory
// ═══════════════════════════════════════

export async function getProducts(salonId: string) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('salon_id', salonId)
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return data as Product[];
}

export async function getLowStockProducts(salonId: string) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('salon_id', salonId)
    .eq('is_active', true);
  if (error) throw error;
  // Filter client-side since Supabase doesn't support column-to-column comparison easily
  return (data as Product[]).filter(p => p.current_stock <= p.low_stock_threshold);
}

export async function createProduct(product: ProductInsert) {
  const { data, error } = await supabase
    .from('products')
    .insert(product)
    .select()
    .single();
  if (error) throw error;
  return data as Product;
}

export async function updateProduct(id: string, updates: Partial<Product>) {
  const { data, error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Product;
}

export async function createStockMovement(movement: StockMovementInsert) {
  const { data, error } = await supabase
    .from('stock_movements')
    .insert(movement)
    .select()
    .single();
  if (error) throw error;
  return data as StockMovement;
}

// ═══════════════════════════════════════
// Suppliers
// ═══════════════════════════════════════

export async function getSuppliers(salonId: string) {
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('salon_id', salonId)
    .order('name');
  if (error) throw error;
  return data as Supplier[];
}

export async function createSupplier(supplier: SupplierInsert) {
  const { data, error } = await supabase
    .from('suppliers')
    .insert(supplier)
    .select()
    .single();
  if (error) throw error;
  return data as Supplier;
}

// ═══════════════════════════════════════
// Purchase Orders
// ═══════════════════════════════════════

export async function getPurchaseOrders(branchId: string) {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select('*, supplier:suppliers(*)')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as (PurchaseOrder & { supplier: Supplier })[];
}

export async function createPurchaseOrder(order: PurchaseOrderInsert) {
  const { data, error } = await supabase
    .from('purchase_orders')
    .insert(order)
    .select()
    .single();
  if (error) throw error;
  return data as PurchaseOrder;
}

// ═══════════════════════════════════════
// Packages
// ═══════════════════════════════════════

export async function getPackages(salonId: string) {
  const { data, error } = await supabase
    .from('packages')
    .select('*')
    .eq('salon_id', salonId)
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return data as Package[];
}

export async function createPackage(pkg: PackageInsert) {
  const { data, error } = await supabase
    .from('packages')
    .insert(pkg)
    .select()
    .single();
  if (error) throw error;
  return data as Package;
}

export async function getClientPackages(clientId: string) {
  const { data, error } = await supabase
    .from('client_packages')
    .select('*, package:packages(*)')
    .eq('client_id', clientId)
    .eq('is_active', true);
  if (error) throw error;
  return data as (ClientPackage & { package: Package })[];
}

export async function assignClientPackage(cp: ClientPackageInsert) {
  const { data, error } = await supabase
    .from('client_packages')
    .insert(cp)
    .select()
    .single();
  if (error) throw error;
  return data as ClientPackage;
}

// ═══════════════════════════════════════
// Promo Codes
// ═══════════════════════════════════════

export async function validatePromoCode(salonId: string, code: string) {
  const { data, error } = await supabase
    .from('promo_codes')
    .select('*')
    .eq('salon_id', salonId)
    .eq('code', code)
    .eq('is_active', true)
    .single();
  if (error) return null;
  const promo = data as PromoCode;
  if (promo.expiry_date && new Date(promo.expiry_date) < new Date()) return null;
  if (promo.max_uses && promo.used_count >= promo.max_uses) return null;
  return promo;
}

// ═══════════════════════════════════════
// Loyalty Rules
// ═══════════════════════════════════════

export async function getLoyaltyRules(salonId: string) {
  const { data, error } = await supabase
    .from('loyalty_rules')
    .select('*')
    .eq('salon_id', salonId)
    .single();
  if (error) return null;
  return data as LoyaltyRules;
}

// ═══════════════════════════════════════
// Cash Drawer
// ═══════════════════════════════════════

export async function getTodayCashDrawer(branchId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('cash_drawers')
    .select('*')
    .eq('branch_id', branchId)
    .eq('date', today)
    .single();
  if (error) return null;
  return data as CashDrawer;
}

export async function openCashDrawer(drawer: CashDrawerInsert) {
  const { data, error } = await supabase
    .from('cash_drawers')
    .insert(drawer)
    .select()
    .single();
  if (error) throw error;
  return data as CashDrawer;
}

export async function closeCashDrawer(id: string, closingBalance: number, closedBy: string) {
  const { data, error } = await supabase
    .from('cash_drawers')
    .update({ closing_balance: closingBalance, closed_by: closedBy, status: 'closed' as const })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as CashDrawer;
}

// ═══════════════════════════════════════
// Expenses
// ═══════════════════════════════════════

export async function getExpenses(branchId: string, date: string) {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('branch_id', branchId)
    .eq('date', date)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Expense[];
}

export async function createExpense(expense: ExpenseInsert) {
  const { data, error } = await supabase
    .from('expenses')
    .insert(expense)
    .select()
    .single();
  if (error) throw error;
  return data as Expense;
}

// ═══════════════════════════════════════
// Udhaar Payments
// ═══════════════════════════════════════

export async function recordUdhaarPayment(payment: UdhaarPaymentInsert) {
  const { data, error } = await supabase
    .from('udhaar_payments')
    .insert(payment)
    .select()
    .single();
  if (error) throw error;
  return data as UdhaarPayment;
}

export async function getUdhaarPayments(clientId: string) {
  const { data, error } = await supabase
    .from('udhaar_payments')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as UdhaarPayment[];
}

// ═══════════════════════════════════════
// RPC Functions
// ═══════════════════════════════════════

export async function getDailySummary(branchId: string, date: string) {
  const { data, error } = await supabase
    .rpc('get_daily_summary', { p_branch_id: branchId, p_date: date });
  if (error) throw error;
  return data as DailySummary;
}

export async function getStaffMonthlyCommission(staffId: string, month: number, year: number) {
  const { data, error } = await supabase
    .rpc('get_staff_monthly_commission', { p_staff_id: staffId, p_month: month, p_year: year });
  if (error) throw error;
  return data as StaffMonthlyCommission;
}

export async function getUdhaarReport(salonId: string) {
  const { data, error } = await supabase
    .rpc('get_udhaar_report', { p_salon_id: salonId });
  if (error) throw error;
  return data as UdhaarReportItem[];
}

export async function getClientStats(clientId: string) {
  const { data, error } = await supabase
    .rpc('get_client_stats', { p_client_id: clientId });
  if (error) throw error;
  return data as ClientStats;
}
