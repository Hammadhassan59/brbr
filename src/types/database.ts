// ═══════════════════════════════════════
// iCut Database Types
// Auto-generated from Supabase schema
// ═══════════════════════════════════════

export type SalonType = 'gents' | 'ladies' | 'unisex';
export type Language = 'en' | 'ur';
export type StaffRole = 'owner' | 'manager' | 'receptionist' | 'senior_stylist' | 'junior_stylist' | 'helper';
export type ServiceCategory = 'haircut' | 'color' | 'treatment' | 'facial' | 'waxing' | 'bridal' | 'nails' | 'massage' | 'beard' | 'other';
export type CommissionType = 'percentage' | 'flat';
export type Gender = 'male' | 'female' | 'other';
export type AppointmentStatus = 'booked' | 'confirmed' | 'in_progress' | 'done' | 'no_show' | 'cancelled';
export type BillStatus = 'draft' | 'paid' | 'void' | 'refunded';
export type PaymentMethod = 'cash' | 'jazzcash' | 'easypaisa' | 'bank_transfer' | 'card' | 'udhaar' | 'split';
export type DiscountType = 'flat' | 'percentage';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'half_day' | 'leave';
export type InventoryType = 'backbar' | 'retail';
export type BillItemType = 'service' | 'product';
export type MovementType = 'purchase' | 'sale' | 'backbar_use' | 'adjustment' | 'transfer_in' | 'transfer_out';
export type PurchaseOrderStatus = 'pending' | 'received' | 'paid' | 'partial';
export type CashDrawerStatus = 'open' | 'closed';

// ───────────────────────────────────────
// Working Hours & Prayer Blocks
// ───────────────────────────────────────
export interface DayHours {
  open: string;
  close: string;
  off: boolean;
  jummah_break?: boolean;
}

export interface WorkingHours {
  mon: DayHours;
  tue: DayHours;
  wed: DayHours;
  thu: DayHours;
  fri: DayHours;
  sat: DayHours;
  sun: DayHours;
}

export interface PrayerBlocks {
  fajr: boolean;
  zuhr: boolean;
  asr: boolean;
  maghrib: boolean;
  isha: boolean;
}

// ───────────────────────────────────────
// Table Row Types
// ───────────────────────────────────────

export interface Salon {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  whatsapp: string | null;
  type: SalonType;
  language: Language;
  gst_enabled: boolean;
  gst_number: string | null;
  gst_rate: number;
  prayer_block_enabled: boolean;
  jazzcash_number: string | null;
  easypaisa_number: string | null;
  bank_name: string | null;
  bank_account: string | null;
  bank_title: string | null;
  privacy_mode: boolean;
  setup_complete: boolean;
  onboarding_dismissed: boolean;
  owner_id: string | null;
  created_at: string;
}

export interface Branch {
  id: string;
  salon_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  is_main: boolean;
  working_hours: WorkingHours;
  prayer_blocks: PrayerBlocks;
  created_at: string;
}

export interface Staff {
  id: string;
  salon_id: string;
  branch_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  auth_user_id: string | null;
  role: StaffRole;
  photo_url: string | null;
  pin_code: string | null;
  base_salary: number;
  commission_type: CommissionType;
  commission_rate: number;
  join_date: string;
  is_active: boolean;
  last_login_at: string | null;
  first_login_seen: boolean;
  created_at: string;
}

export interface OnboardingStatus {
  has_clients: boolean;
  has_appointments: boolean;
  has_sale: boolean;
  has_payment_methods: boolean;
  staff_logged_in: boolean;
  onboarding_dismissed: boolean;
}

export interface Service {
  id: string;
  salon_id: string;
  name: string;
  category: ServiceCategory;
  duration_minutes: number;
  base_price: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface ServiceStaffPricing {
  id: string;
  service_id: string;
  staff_id: string;
  price: number;
}

export interface Client {
  id: string;
  salon_id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  gender: Gender | null;
  is_vip: boolean;
  is_blacklisted: boolean;
  notes: string | null;
  hair_notes: string | null;
  allergy_notes: string | null;
  loyalty_points: number;
  total_visits: number;
  total_spent: number;
  udhaar_balance: number;
  udhaar_limit: number;
  created_at: string;
}

export interface Appointment {
  id: string;
  branch_id: string | null;
  salon_id: string | null;
  client_id: string | null;
  staff_id: string | null;
  status: AppointmentStatus;
  appointment_date: string;
  start_time: string;
  end_time: string | null;
  token_number: number | null;
  is_walkin: boolean;
  notes: string | null;
  reminder_sent: boolean;
  created_at: string;
}

export interface AppointmentService {
  id: string;
  appointment_id: string;
  service_id: string | null;
  service_name: string;
  price: number;
  duration_minutes: number | null;
}

export interface Bill {
  id: string;
  bill_number: string;
  branch_id: string | null;
  salon_id: string | null;
  appointment_id: string | null;
  client_id: string | null;
  staff_id: string | null;
  subtotal: number;
  discount_amount: number;
  discount_type: DiscountType | null;
  tax_amount: number;
  tip_amount: number;
  total_amount: number;
  paid_amount: number;
  payment_method: PaymentMethod | null;
  payment_details: Record<string, unknown> | null;
  udhaar_added: number;
  loyalty_points_used: number;
  loyalty_points_earned: number;
  promo_code: string | null;
  status: BillStatus;
  notes: string | null;
  receipt_sent: boolean;
  created_at: string;
}

export interface BillItem {
  id: string;
  bill_id: string;
  item_type: BillItemType | null;
  service_id: string | null;
  product_id: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface Attendance {
  id: string;
  staff_id: string;
  branch_id: string | null;
  date: string;
  status: AttendanceStatus;
  check_in: string | null;
  check_out: string | null;
  late_minutes: number;
  deduction_amount: number;
  notes: string | null;
}

export interface Advance {
  id: string;
  staff_id: string;
  amount: number;
  date: string;
  reason: string | null;
  is_deducted: boolean;
  approved_by: string | null;
  created_at: string;
}

export interface Tip {
  id: string;
  staff_id: string;
  bill_id: string | null;
  amount: number;
  date: string;
}

export interface Product {
  id: string;
  salon_id: string;
  name: string;
  brand: string | null;
  category: string | null;
  unit: string;
  content_per_unit: number;
  content_unit: string;
  inventory_type: InventoryType;
  purchase_price: number;
  retail_price: number;
  current_stock: number;
  low_stock_threshold: number;
  is_active: boolean;
  created_at: string;
}

export interface ProductServiceLink {
  id: string;
  product_id: string;
  service_id: string;
  quantity_per_use: number;
}

export interface StockMovement {
  id: string;
  product_id: string;
  branch_id: string | null;
  movement_type: MovementType;
  quantity: number;
  reference_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Supplier {
  id: string;
  salon_id: string;
  name: string;
  phone: string | null;
  udhaar_balance: number;
  notes: string | null;
  created_at: string;
}

export interface PurchaseOrder {
  id: string;
  supplier_id: string | null;
  branch_id: string | null;
  items: Record<string, unknown>[];
  total_amount: number;
  paid_amount: number;
  status: PurchaseOrderStatus;
  notes: string | null;
  created_at: string;
}

export interface Package {
  id: string;
  salon_id: string;
  name: string;
  description: string | null;
  price: number;
  validity_days: number;
  services: Record<string, unknown>[];
  is_active: boolean;
  created_at: string;
}

export interface ClientPackage {
  id: string;
  client_id: string;
  package_id: string | null;
  purchase_date: string;
  expiry_date: string | null;
  services_remaining: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
}

export interface PromoCode {
  id: string;
  salon_id: string;
  code: string;
  discount_type: DiscountType | null;
  discount_value: number;
  min_bill_amount: number;
  max_uses: number | null;
  used_count: number;
  expiry_date: string | null;
  is_active: boolean;
  created_at: string;
}

export interface LoyaltyRules {
  id: string;
  salon_id: string;
  points_per_100_pkr: number;
  pkr_per_point_redemption: number;
  birthday_bonus_multiplier: number;
}

export interface CashDrawer {
  id: string;
  branch_id: string | null;
  date: string;
  opening_balance: number;
  closing_balance: number | null;
  total_cash_sales: number;
  total_expenses: number;
  opened_by: string | null;
  closed_by: string | null;
  status: CashDrawerStatus;
  notes: string | null;
  created_at: string;
}

export interface Expense {
  id: string;
  branch_id: string | null;
  category: string | null;
  amount: number;
  description: string | null;
  date: string;
  created_by: string | null;
  created_at: string;
}

export interface UdhaarPayment {
  id: string;
  client_id: string | null;
  amount: number;
  payment_method: string | null;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
}

export interface SalonPartner {
  id: string;
  salon_id: string;
  name: string;
  phone: string;
  email: string | null;
  auth_user_id: string | null;
  pin_code: string | null;
  is_active: boolean;
  created_at: string;
}

// ───────────────────────────────────────
// Insert Types (omit auto-generated fields)
// ───────────────────────────────────────

export type SalonInsert = Omit<Salon, 'id' | 'created_at'> & { id?: string };
export type BranchInsert = Omit<Branch, 'id' | 'created_at'> & { id?: string };
export type StaffInsert = Omit<Staff, 'id' | 'created_at'> & { id?: string };
export type ServiceInsert = Omit<Service, 'id' | 'created_at'> & { id?: string };
export type ServiceStaffPricingInsert = Omit<ServiceStaffPricing, 'id'> & { id?: string };
export type ClientInsert = Omit<Client, 'id' | 'created_at'> & { id?: string };
export type AppointmentInsert = Omit<Appointment, 'id' | 'created_at'> & { id?: string };
export type AppointmentServiceInsert = Omit<AppointmentService, 'id'> & { id?: string };
export type BillInsert = Omit<Bill, 'id' | 'created_at'> & { id?: string };
export type BillItemInsert = Omit<BillItem, 'id'> & { id?: string };
export type AttendanceInsert = Omit<Attendance, 'id'> & { id?: string };
export type AdvanceInsert = Omit<Advance, 'id' | 'created_at'> & { id?: string };
export type TipInsert = Omit<Tip, 'id'> & { id?: string };
export type ProductInsert = Omit<Product, 'id' | 'created_at'> & { id?: string };
export type ProductServiceLinkInsert = Omit<ProductServiceLink, 'id'> & { id?: string };
export type StockMovementInsert = Omit<StockMovement, 'id' | 'created_at'> & { id?: string };
export type SupplierInsert = Omit<Supplier, 'id' | 'created_at'> & { id?: string };
export type PurchaseOrderInsert = Omit<PurchaseOrder, 'id' | 'created_at'> & { id?: string };
export type PackageInsert = Omit<Package, 'id' | 'created_at'> & { id?: string };
export type ClientPackageInsert = Omit<ClientPackage, 'id' | 'created_at'> & { id?: string };
export type PromoCodeInsert = Omit<PromoCode, 'id' | 'created_at'> & { id?: string };
export type LoyaltyRulesInsert = Omit<LoyaltyRules, 'id'> & { id?: string };
export type CashDrawerInsert = Omit<CashDrawer, 'id' | 'created_at'> & { id?: string };
export type ExpenseInsert = Omit<Expense, 'id' | 'created_at'> & { id?: string };
export type UdhaarPaymentInsert = Omit<UdhaarPayment, 'id' | 'created_at'> & { id?: string };
export type SalonPartnerInsert = Omit<SalonPartner, 'id' | 'created_at'> & { id?: string };

// ───────────────────────────────────────
// RPC Return Types
// ───────────────────────────────────────

export interface DailySummary {
  total_revenue: number;
  total_bills: number;
  cash_amount: number;
  jazzcash_amount: number;
  easypaisa_amount: number;
  card_amount: number;
  bank_transfer_amount: number;
  udhaar_amount: number;
  top_services: { name: string; count: number; revenue: number }[];
  staff_performance: { name: string; services_done: number; revenue: number }[];
}

export interface StaffMonthlyCommission {
  services_count: number;
  total_revenue: number;
  commission_earned: number;
  tips_total: number;
  advances_total: number;
  late_deductions: number;
  net_payable: number;
}

export interface UdhaarReportItem {
  id: string;
  client_name: string;
  phone: string | null;
  udhaar_balance: number;
  last_visit: string | null;
  days_since_visit: number | null;
}

export interface ClientStats {
  total_visits: number;
  total_spent: number;
  loyalty_points: number;
  favourite_service: string | null;
  favourite_stylist: string | null;
  last_visit_date: string | null;
}

// ───────────────────────────────────────
// Joined / Extended Types (commonly used in UI)
// ───────────────────────────────────────

export interface AppointmentWithDetails extends Appointment {
  client?: Client;
  staff?: Staff;
  services?: AppointmentService[];
}

export interface BillWithDetails extends Bill {
  client?: Client;
  staff?: Staff;
  items?: BillItem[];
  appointment?: Appointment;
}

export interface StaffWithAttendance extends Staff {
  today_attendance?: Attendance;
}
