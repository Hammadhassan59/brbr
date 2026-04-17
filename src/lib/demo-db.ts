// ═══════════════════════════════════════
// iCut Demo Database
// Mock Supabase client + comprehensive demo data
// for development without a real Supabase instance.
// ═══════════════════════════════════════

import type {
  Service, Client, Product, Appointment, AppointmentService,
  Bill, BillItem, Attendance, Tip, Advance, Supplier,
  PurchaseOrder, StockMovement, Package, ClientPackage,
  PromoCode, LoyaltyRules, CashDrawer, Expense, UdhaarPayment,
  DailySummary, StaffMonthlyCommission, UdhaarReportItem, ClientStats,
  Staff, AttendanceStatus, ProductServiceLink, ServiceStaffPricing,
} from '@/types/database';
import type { SalonPartner } from '@/types/database';
import {
  DEMO_SALON, DEMO_BRANCH, DEMO_STAFF_OWNER, DEMO_STAFF_STYLIST, DEMO_STAFF_RECEPTIONIST,
  DEMO_SALON_GENTS, DEMO_BRANCH_GENTS, DEMO_BRANCH_GENTS_2,
  DEMO_GENTS_OWNER, DEMO_GENTS_BARBER_SENIOR, DEMO_GENTS_BARBER_JUNIOR, DEMO_GENTS_HELPER,
  DEMO_GENTS_BRANCH2_SENIOR, DEMO_GENTS_BRANCH2_JUNIOR,
  DEMO_PARTNER_ROYAL,
  DEMO_ALL_SALONS,
} from './demo-data';

// ───────────────────────────────────────
// Date Helpers (PKT timezone)
// ───────────────────────────────────────

function todayStr(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
}

function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
}

// ───────────────────────────────────────
// ID shorthand constants
// ───────────────────────────────────────

const GL_SALON = '11111111-1111-1111-1111-111111111111';
const GL_BRANCH = '22222222-2222-2222-2222-222222222222';
const RB_SALON = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const RB_BRANCH = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab';
const RB_BRANCH2 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaac';

// Staff IDs
const ST = {
  fatima: '33333333-3333-3333-3333-333333333301',
  sadia: '33333333-3333-3333-3333-333333333302',
  nadia: '33333333-3333-3333-3333-333333333303',
  rabia: '33333333-3333-3333-3333-333333333304',
  zainab: '33333333-3333-3333-3333-333333333305',
  ahmed: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa001',
  usman: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa002',
  bilal: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa003',
  hamza: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa004',
  nadeem: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa005',
  waqar: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa006',
};

// Service IDs (matching seed.sql)
const SV_GL = {
  basicHaircut: '44444444-4444-4444-4444-444444444401',
  layerCut: '44444444-4444-4444-4444-444444444402',
  bobCut: '44444444-4444-4444-4444-444444444403',
  bangs: '44444444-4444-4444-4444-444444444404',
  fullColor: '44444444-4444-4444-4444-444444444405',
  rootTouchUp: '44444444-4444-4444-4444-444444444406',
  highlights: '44444444-4444-4444-4444-444444444407',
  balayage: '44444444-4444-4444-4444-444444444408',
  keratin: '44444444-4444-4444-4444-444444444409',
  protein: '44444444-4444-4444-4444-444444444410',
  deepCond: '44444444-4444-4444-4444-444444444411',
  basicFacial: '44444444-4444-4444-4444-444444444412',
  goldFacial: '44444444-4444-4444-4444-444444444413',
  whiteningFacial: '44444444-4444-4444-4444-444444444414',
  armsWax: '44444444-4444-4444-4444-444444444415',
  legsWax: '44444444-4444-4444-4444-444444444416',
  bodyWax: '44444444-4444-4444-4444-444444444417',
  upperLip: '44444444-4444-4444-4444-444444444418',
  bridalMakeup: '44444444-4444-4444-4444-444444444419',
  mehndiMakeup: '44444444-4444-4444-4444-444444444420',
};

const SV_RB = {
  regularHaircut: '44444444-aaaa-4444-aaaa-444444444401',
  premiumHaircut: '44444444-aaaa-4444-aaaa-444444444402',
  kidsHaircut: '44444444-aaaa-4444-aaaa-444444444403',
  beardTrim: '44444444-aaaa-4444-aaaa-444444444404',
  beardStyling: '44444444-aaaa-4444-aaaa-444444444405',
  cleanShave: '44444444-aaaa-4444-aaaa-444444444406',
  hairColor: '44444444-aaaa-4444-aaaa-444444444407',
  beardColor: '44444444-aaaa-4444-aaaa-444444444408',
  hairTreatment: '44444444-aaaa-4444-aaaa-444444444409',
  headMassage: '44444444-aaaa-4444-aaaa-444444444410',
  mensFacial: '44444444-aaaa-4444-aaaa-444444444411',
  hairStraight: '44444444-aaaa-4444-aaaa-444444444412',
  washStyle: '44444444-aaaa-4444-aaaa-444444444413',
  threading: '44444444-aaaa-4444-aaaa-444444444414',
  hotTowelShave: '44444444-aaaa-4444-aaaa-444444444415',
};

// Client IDs (Glamour - matching seed.sql)
const CL_GL = [
  '55555555-5555-5555-5555-555555555501', '55555555-5555-5555-5555-555555555502',
  '55555555-5555-5555-5555-555555555503', '55555555-5555-5555-5555-555555555504',
  '55555555-5555-5555-5555-555555555505', '55555555-5555-5555-5555-555555555506',
  '55555555-5555-5555-5555-555555555507', '55555555-5555-5555-5555-555555555508',
  '55555555-5555-5555-5555-555555555509', '55555555-5555-5555-5555-555555555510',
  '55555555-5555-5555-5555-555555555511', '55555555-5555-5555-5555-555555555512',
  '55555555-5555-5555-5555-555555555513', '55555555-5555-5555-5555-555555555514',
  '55555555-5555-5555-5555-555555555515', '55555555-5555-5555-5555-555555555516',
  '55555555-5555-5555-5555-555555555517', '55555555-5555-5555-5555-555555555518',
  '55555555-5555-5555-5555-555555555519', '55555555-5555-5555-5555-555555555520',
  '55555555-5555-5555-5555-555555555521', '55555555-5555-5555-5555-555555555522',
  '55555555-5555-5555-5555-555555555523', '55555555-5555-5555-5555-555555555524',
  '55555555-5555-5555-5555-555555555525',
];

// Client IDs (Royal Barbers)
const CL_RB = [
  '55555555-aaaa-5555-aaaa-555555555501', '55555555-aaaa-5555-aaaa-555555555502',
  '55555555-aaaa-5555-aaaa-555555555503', '55555555-aaaa-5555-aaaa-555555555504',
  '55555555-aaaa-5555-aaaa-555555555505', '55555555-aaaa-5555-aaaa-555555555506',
  '55555555-aaaa-5555-aaaa-555555555507', '55555555-aaaa-5555-aaaa-555555555508',
  '55555555-aaaa-5555-aaaa-555555555509', '55555555-aaaa-5555-aaaa-555555555510',
  '55555555-aaaa-5555-aaaa-555555555511', '55555555-aaaa-5555-aaaa-555555555512',
  '55555555-aaaa-5555-aaaa-555555555513', '55555555-aaaa-5555-aaaa-555555555514',
  '55555555-aaaa-5555-aaaa-555555555515', '55555555-aaaa-5555-aaaa-555555555516',
  '55555555-aaaa-5555-aaaa-555555555517', '55555555-aaaa-5555-aaaa-555555555518',
  '55555555-aaaa-5555-aaaa-555555555519', '55555555-aaaa-5555-aaaa-555555555520',
  '55555555-aaaa-5555-aaaa-555555555521', '55555555-aaaa-5555-aaaa-555555555522',
  '55555555-aaaa-5555-aaaa-555555555523', '55555555-aaaa-5555-aaaa-555555555524',
  '55555555-aaaa-5555-aaaa-555555555525',
];

// Product IDs
const PR_GL = [
  '66666666-6666-6666-6666-666666666601', '66666666-6666-6666-6666-666666666602',
  '66666666-6666-6666-6666-666666666603', '66666666-6666-6666-6666-666666666604',
  '66666666-6666-6666-6666-666666666605', '66666666-6666-6666-6666-666666666606',
  '66666666-6666-6666-6666-666666666607', '66666666-6666-6666-6666-666666666608',
  '66666666-6666-6666-6666-666666666609', '66666666-6666-6666-6666-666666666610',
];

const PR_RB = [
  '66666666-aaaa-6666-aaaa-666666666601', '66666666-aaaa-6666-aaaa-666666666602',
  '66666666-aaaa-6666-aaaa-666666666603', '66666666-aaaa-6666-aaaa-666666666604',
  '66666666-aaaa-6666-aaaa-666666666605', '66666666-aaaa-6666-aaaa-666666666606',
  '66666666-aaaa-6666-aaaa-666666666607', '66666666-aaaa-6666-aaaa-666666666608',
];


// ═══════════════════════════════════════
// GLAMOUR STUDIO — Extra Staff (not in demo-data.ts login list)
// ═══════════════════════════════════════

const glamourExtraStaff: Staff[] = [
  { id: ST.nadia, salon_id: GL_SALON, primary_branch_id: GL_BRANCH, name: 'Nadia Hussain', phone: '0333-4567890', email: null, auth_user_id: null, role: 'senior_stylist', photo_url: null, pin_code: '3456', base_salary: 18000, commission_type: 'percentage', commission_rate: 30, join_date: '2024-08-01', is_active: true, last_login_at: null, first_login_seen: true, created_at: '2024-08-01T00:00:00Z' },
  { id: ST.rabia, salon_id: GL_SALON, primary_branch_id: GL_BRANCH, name: 'Rabia Ali', phone: '0345-6789012', email: null, auth_user_id: null, role: 'junior_stylist', photo_url: null, pin_code: '4567', base_salary: 12000, commission_type: 'percentage', commission_rate: 20, join_date: '2024-09-01', is_active: true, last_login_at: null, first_login_seen: true, created_at: '2024-09-01T00:00:00Z' },
];


// ═══════════════════════════════════════
// GLAMOUR STUDIO — Services (20, matching seed.sql)
// ═══════════════════════════════════════

const glamourServices: Service[] = [
  { id: SV_GL.basicHaircut, salon_id: GL_SALON, name: 'Basic Haircut', category: 'haircut', duration_minutes: 30, base_price: 500, is_active: true, sort_order: 1, created_at: '2025-01-01T00:00:00Z' },
  { id: SV_GL.layerCut, salon_id: GL_SALON, name: 'Layer Cut', category: 'haircut', duration_minutes: 45, base_price: 1200, is_active: true, sort_order: 2, created_at: '2025-01-01T00:00:00Z' },
  { id: SV_GL.bobCut, salon_id: GL_SALON, name: 'Bob Cut', category: 'haircut', duration_minutes: 40, base_price: 1000, is_active: true, sort_order: 3, created_at: '2025-01-01T00:00:00Z' },
  { id: SV_GL.bangs, salon_id: GL_SALON, name: 'Bangs / Fringe Cut', category: 'haircut', duration_minutes: 15, base_price: 300, is_active: true, sort_order: 4, created_at: '2025-01-01T00:00:00Z' },
  { id: SV_GL.fullColor, salon_id: GL_SALON, name: 'Full Hair Color', category: 'color', duration_minutes: 90, base_price: 3000, is_active: true, sort_order: 5, created_at: '2025-01-01T00:00:00Z' },
  { id: SV_GL.rootTouchUp, salon_id: GL_SALON, name: 'Root Touch-Up', category: 'color', duration_minutes: 60, base_price: 1500, is_active: true, sort_order: 6, created_at: '2025-01-01T00:00:00Z' },
  { id: SV_GL.highlights, salon_id: GL_SALON, name: 'Highlights / Lowlights', category: 'color', duration_minutes: 120, base_price: 5000, is_active: true, sort_order: 7, created_at: '2025-01-01T00:00:00Z' },
  { id: SV_GL.balayage, salon_id: GL_SALON, name: 'Balayage', category: 'color', duration_minutes: 150, base_price: 8000, is_active: true, sort_order: 8, created_at: '2025-01-01T00:00:00Z' },
  { id: SV_GL.keratin, salon_id: GL_SALON, name: 'Keratin Treatment', category: 'treatment', duration_minutes: 180, base_price: 12000, is_active: true, sort_order: 9, created_at: '2025-01-01T00:00:00Z' },
  { id: SV_GL.protein, salon_id: GL_SALON, name: 'Hair Protein Treatment', category: 'treatment', duration_minutes: 90, base_price: 5000, is_active: true, sort_order: 10, created_at: '2025-01-01T00:00:00Z' },
  { id: SV_GL.deepCond, salon_id: GL_SALON, name: 'Deep Conditioning', category: 'treatment', duration_minutes: 45, base_price: 2000, is_active: true, sort_order: 11, created_at: '2025-01-01T00:00:00Z' },
  { id: SV_GL.basicFacial, salon_id: GL_SALON, name: 'Basic Facial', category: 'facial', duration_minutes: 45, base_price: 1500, is_active: true, sort_order: 12, created_at: '2025-01-01T00:00:00Z' },
  { id: SV_GL.goldFacial, salon_id: GL_SALON, name: 'Gold Facial', category: 'facial', duration_minutes: 60, base_price: 3000, is_active: true, sort_order: 13, created_at: '2025-01-01T00:00:00Z' },
  { id: SV_GL.whiteningFacial, salon_id: GL_SALON, name: 'Whitening Facial', category: 'facial', duration_minutes: 75, base_price: 4000, is_active: true, sort_order: 14, created_at: '2025-01-01T00:00:00Z' },
  { id: SV_GL.armsWax, salon_id: GL_SALON, name: 'Full Arms Wax', category: 'waxing', duration_minutes: 30, base_price: 800, is_active: true, sort_order: 15, created_at: '2025-01-01T00:00:00Z' },
  { id: SV_GL.legsWax, salon_id: GL_SALON, name: 'Full Legs Wax', category: 'waxing', duration_minutes: 45, base_price: 1200, is_active: true, sort_order: 16, created_at: '2025-01-01T00:00:00Z' },
  { id: SV_GL.bodyWax, salon_id: GL_SALON, name: 'Full Body Wax', category: 'waxing', duration_minutes: 120, base_price: 4500, is_active: true, sort_order: 17, created_at: '2025-01-01T00:00:00Z' },
  { id: SV_GL.upperLip, salon_id: GL_SALON, name: 'Upper Lip Threading', category: 'waxing', duration_minutes: 10, base_price: 150, is_active: true, sort_order: 18, created_at: '2025-01-01T00:00:00Z' },
  { id: SV_GL.bridalMakeup, salon_id: GL_SALON, name: 'Bridal Makeup', category: 'bridal', duration_minutes: 180, base_price: 25000, is_active: true, sort_order: 19, created_at: '2025-01-01T00:00:00Z' },
  { id: SV_GL.mehndiMakeup, salon_id: GL_SALON, name: 'Mehndi Night Makeup', category: 'bridal', duration_minutes: 120, base_price: 15000, is_active: true, sort_order: 20, created_at: '2025-01-01T00:00:00Z' },
];


// ═══════════════════════════════════════
// ROYAL BARBERS — Services (15)
// ═══════════════════════════════════════

const royalServices: Service[] = [
  { id: SV_RB.regularHaircut, salon_id: RB_SALON, name: 'Regular Haircut', category: 'haircut', duration_minutes: 20, base_price: 400, is_active: true, sort_order: 1, created_at: '2025-02-10T00:00:00Z' },
  { id: SV_RB.premiumHaircut, salon_id: RB_SALON, name: 'Premium Haircut', category: 'haircut', duration_minutes: 30, base_price: 800, is_active: true, sort_order: 2, created_at: '2025-02-10T00:00:00Z' },
  { id: SV_RB.kidsHaircut, salon_id: RB_SALON, name: 'Kids Haircut', category: 'haircut', duration_minutes: 15, base_price: 300, is_active: true, sort_order: 3, created_at: '2025-02-10T00:00:00Z' },
  { id: SV_RB.beardTrim, salon_id: RB_SALON, name: 'Beard Trim', category: 'beard', duration_minutes: 15, base_price: 200, is_active: true, sort_order: 4, created_at: '2025-02-10T00:00:00Z' },
  { id: SV_RB.beardStyling, salon_id: RB_SALON, name: 'Beard Styling', category: 'beard', duration_minutes: 20, base_price: 400, is_active: true, sort_order: 5, created_at: '2025-02-10T00:00:00Z' },
  { id: SV_RB.cleanShave, salon_id: RB_SALON, name: 'Clean Shave', category: 'beard', duration_minutes: 20, base_price: 300, is_active: true, sort_order: 6, created_at: '2025-02-10T00:00:00Z' },
  { id: SV_RB.hairColor, salon_id: RB_SALON, name: 'Hair Color', category: 'color', duration_minutes: 45, base_price: 1500, is_active: true, sort_order: 7, created_at: '2025-02-10T00:00:00Z' },
  { id: SV_RB.beardColor, salon_id: RB_SALON, name: 'Beard Color', category: 'color', duration_minutes: 20, base_price: 500, is_active: true, sort_order: 8, created_at: '2025-02-10T00:00:00Z' },
  { id: SV_RB.hairTreatment, salon_id: RB_SALON, name: 'Hair Treatment', category: 'treatment', duration_minutes: 60, base_price: 2000, is_active: true, sort_order: 9, created_at: '2025-02-10T00:00:00Z' },
  { id: SV_RB.headMassage, salon_id: RB_SALON, name: 'Head Massage', category: 'massage', duration_minutes: 20, base_price: 500, is_active: true, sort_order: 10, created_at: '2025-02-10T00:00:00Z' },
  { id: SV_RB.mensFacial, salon_id: RB_SALON, name: "Men's Facial", category: 'facial', duration_minutes: 30, base_price: 1200, is_active: true, sort_order: 11, created_at: '2025-02-10T00:00:00Z' },
  { id: SV_RB.hairStraight, salon_id: RB_SALON, name: 'Hair Straightening', category: 'treatment', duration_minutes: 90, base_price: 3000, is_active: true, sort_order: 12, created_at: '2025-02-10T00:00:00Z' },
  { id: SV_RB.washStyle, salon_id: RB_SALON, name: 'Hair Wash & Style', category: 'haircut', duration_minutes: 25, base_price: 600, is_active: true, sort_order: 13, created_at: '2025-02-10T00:00:00Z' },
  { id: SV_RB.threading, salon_id: RB_SALON, name: 'Eyebrow Threading', category: 'other', duration_minutes: 10, base_price: 100, is_active: true, sort_order: 14, created_at: '2025-02-10T00:00:00Z' },
  { id: SV_RB.hotTowelShave, salon_id: RB_SALON, name: 'Hot Towel Shave', category: 'beard', duration_minutes: 25, base_price: 500, is_active: true, sort_order: 15, created_at: '2025-02-10T00:00:00Z' },
];


// ═══════════════════════════════════════
// GLAMOUR STUDIO — Clients (10)
// ═══════════════════════════════════════

const glamourClients: Client[] = [
  { id: CL_GL[0], salon_id: GL_SALON, name: 'Ayesha Malik', phone: '0321-1111111', whatsapp: '0321-1111111', gender: 'female', is_vip: false, is_blacklisted: false, notes: null, hair_notes: 'Prefers layers, medium length', allergy_notes: null, loyalty_points: 450, total_visits: 12, total_spent: 42000, udhaar_balance: 0, udhaar_limit: 5000, created_at: '2024-08-01T00:00:00Z' },
  { id: CL_GL[1], salon_id: GL_SALON, name: 'Hira Butt', phone: '0333-2222222', whatsapp: '0333-2222222', gender: 'female', is_vip: false, is_blacklisted: false, notes: null, hair_notes: null, allergy_notes: null, loyalty_points: 320, total_visits: 8, total_spent: 28000, udhaar_balance: 0, udhaar_limit: 5000, created_at: '2024-09-01T00:00:00Z' },
  { id: CL_GL[2], salon_id: GL_SALON, name: 'Mehreen Syed', phone: '0300-3333333', whatsapp: '0300-3333333', gender: 'female', is_vip: true, is_blacklisted: false, notes: 'VIP client - always offer complimentary tea', hair_notes: 'Keratin every 3 months, sensitive scalp', allergy_notes: 'Allergic to ammonia-based colors', loyalty_points: 680, total_visits: 18, total_spent: 65000, udhaar_balance: 0, udhaar_limit: 10000, created_at: '2024-06-15T00:00:00Z' },
  { id: CL_GL[3], salon_id: GL_SALON, name: 'Sana Javed', phone: '0312-4444444', whatsapp: '0312-4444444', gender: 'female', is_vip: false, is_blacklisted: false, notes: null, hair_notes: null, allergy_notes: null, loyalty_points: 150, total_visits: 4, total_spent: 12000, udhaar_balance: 2500, udhaar_limit: 5000, created_at: '2025-01-01T00:00:00Z' },
  { id: CL_GL[4], salon_id: GL_SALON, name: 'Fatima Tariq', phone: '0345-5555555', whatsapp: '0345-5555555', gender: 'female', is_vip: false, is_blacklisted: false, notes: null, hair_notes: 'Fine hair, avoid heavy products', allergy_notes: null, loyalty_points: 200, total_visits: 6, total_spent: 18000, udhaar_balance: 0, udhaar_limit: 5000, created_at: '2024-10-01T00:00:00Z' },
  { id: CL_GL[5], salon_id: GL_SALON, name: 'Zara Sheikh', phone: '0301-6666666', whatsapp: '0301-6666666', gender: 'female', is_vip: false, is_blacklisted: false, notes: null, hair_notes: null, allergy_notes: null, loyalty_points: 90, total_visits: 3, total_spent: 8500, udhaar_balance: 0, udhaar_limit: 3000, created_at: '2025-02-01T00:00:00Z' },
  { id: CL_GL[6], salon_id: GL_SALON, name: 'Amna Ilyas', phone: '0321-7777777', whatsapp: '0321-7777777', gender: 'female', is_vip: true, is_blacklisted: false, notes: 'VIP - regular bridal referrals', hair_notes: 'Balayage touch-up every 2 months', allergy_notes: null, loyalty_points: 510, total_visits: 15, total_spent: 55000, udhaar_balance: 0, udhaar_limit: 15000, created_at: '2024-07-01T00:00:00Z' },
  { id: CL_GL[7], salon_id: GL_SALON, name: 'Iqra Aziz', phone: '0333-8888888', whatsapp: '0333-8888888', gender: 'female', is_vip: false, is_blacklisted: false, notes: null, hair_notes: null, allergy_notes: 'Sensitive skin - patch test required', loyalty_points: 270, total_visits: 7, total_spent: 22000, udhaar_balance: 4000, udhaar_limit: 5000, created_at: '2024-11-01T00:00:00Z' },
  { id: CL_GL[8], salon_id: GL_SALON, name: 'Mawra Hocane', phone: '0300-9999999', whatsapp: '0300-9999999', gender: 'female', is_vip: true, is_blacklisted: false, notes: 'Top client', hair_notes: 'Prefers Keune products only', allergy_notes: null, loyalty_points: 830, total_visits: 22, total_spent: 95000, udhaar_balance: 0, udhaar_limit: 20000, created_at: '2024-06-01T00:00:00Z' },
  { id: CL_GL[9], salon_id: GL_SALON, name: 'Kinza Hashmi', phone: '0312-0000000', whatsapp: '0312-0000000', gender: 'female', is_vip: false, is_blacklisted: false, notes: null, hair_notes: null, allergy_notes: null, loyalty_points: 40, total_visits: 2, total_spent: 3500, udhaar_balance: 0, udhaar_limit: 3000, created_at: '2025-03-01T00:00:00Z' },
  { id: CL_GL[10], salon_id: GL_SALON, name: 'Nimra Khan', phone: '0333-1112001', whatsapp: '0333-1112001', gender: 'female', is_vip: true, is_blacklisted: false, notes: 'VIP - influencer, gives social media shoutouts', hair_notes: 'Platinum blonde, toner every 6 weeks', allergy_notes: null, loyalty_points: 920, total_visits: 25, total_spent: 112000, udhaar_balance: 0, udhaar_limit: 25000, created_at: '2024-05-01T00:00:00Z' },
  { id: CL_GL[11], salon_id: GL_SALON, name: 'Sanam Jung', phone: '0300-1112002', whatsapp: '0300-1112002', gender: 'female', is_vip: false, is_blacklisted: false, notes: 'Referred by Mehreen', hair_notes: 'Curly hair, wants frizz control', allergy_notes: 'Latex allergy — no latex gloves', loyalty_points: 380, total_visits: 10, total_spent: 34000, udhaar_balance: 3500, udhaar_limit: 8000, created_at: '2024-09-15T00:00:00Z' },
  { id: CL_GL[12], salon_id: GL_SALON, name: 'Sajal Aly', phone: '0345-1112003', whatsapp: '0345-1112003', gender: 'female', is_vip: true, is_blacklisted: false, notes: 'VIP - celebrity client, ensure privacy', hair_notes: 'Natural brown, hates chemical treatments', allergy_notes: null, loyalty_points: 1200, total_visits: 30, total_spent: 145000, udhaar_balance: 0, udhaar_limit: 50000, created_at: '2024-03-01T00:00:00Z' },
  { id: CL_GL[13], salon_id: GL_SALON, name: 'Kubra Khan', phone: '0321-1112004', whatsapp: '0321-1112004', gender: 'female', is_vip: false, is_blacklisted: false, notes: null, hair_notes: 'Thick wavy hair', allergy_notes: null, loyalty_points: 160, total_visits: 5, total_spent: 14500, udhaar_balance: 0, udhaar_limit: 5000, created_at: '2025-01-15T00:00:00Z' },
  { id: CL_GL[14], salon_id: GL_SALON, name: 'Yumna Zaidi', phone: '0312-1112005', whatsapp: '0312-1112005', gender: 'female', is_vip: false, is_blacklisted: false, notes: 'Comes with her mother usually', hair_notes: null, allergy_notes: null, loyalty_points: 75, total_visits: 3, total_spent: 6800, udhaar_balance: 1800, udhaar_limit: 3000, created_at: '2025-02-10T00:00:00Z' },
  { id: CL_GL[15], salon_id: GL_SALON, name: 'Aiman Khan', phone: '0301-1112006', whatsapp: '0301-1112006', gender: 'female', is_vip: true, is_blacklisted: false, notes: 'VIP - bridal season regular', hair_notes: 'Loves updos and braids', allergy_notes: null, loyalty_points: 640, total_visits: 17, total_spent: 78000, udhaar_balance: 0, udhaar_limit: 15000, created_at: '2024-07-20T00:00:00Z' },
  { id: CL_GL[16], salon_id: GL_SALON, name: 'Dur-e-Fishan', phone: '0333-1112007', whatsapp: '0333-1112007', gender: 'female', is_vip: false, is_blacklisted: false, notes: null, hair_notes: 'Highlights every 3 months', allergy_notes: null, loyalty_points: 310, total_visits: 9, total_spent: 27500, udhaar_balance: 0, udhaar_limit: 5000, created_at: '2024-10-15T00:00:00Z' },
  { id: CL_GL[17], salon_id: GL_SALON, name: 'Naimal Khawar', phone: '0345-1112008', whatsapp: '0345-1112008', gender: 'female', is_vip: false, is_blacklisted: true, notes: 'BLACKLISTED: bounced payment, argued with staff', hair_notes: null, allergy_notes: null, loyalty_points: 0, total_visits: 4, total_spent: 8000, udhaar_balance: 6500, udhaar_limit: 0, created_at: '2024-12-01T00:00:00Z' },
  { id: CL_GL[18], salon_id: GL_SALON, name: 'Saba Qamar', phone: '0300-1112009', whatsapp: '0300-1112009', gender: 'female', is_vip: false, is_blacklisted: false, notes: 'Only visits on weekends', hair_notes: 'Dry scalp, needs moisturizing treatments', allergy_notes: null, loyalty_points: 220, total_visits: 7, total_spent: 19000, udhaar_balance: 0, udhaar_limit: 5000, created_at: '2024-11-15T00:00:00Z' },
  { id: CL_GL[19], salon_id: GL_SALON, name: 'Syra Yousuf', phone: '0321-1112010', whatsapp: '0321-1112010', gender: 'female', is_vip: false, is_blacklisted: false, notes: null, hair_notes: null, allergy_notes: null, loyalty_points: 30, total_visits: 1, total_spent: 2500, udhaar_balance: 0, udhaar_limit: 3000, created_at: '2025-03-20T00:00:00Z' },
  { id: CL_GL[20], salon_id: GL_SALON, name: 'Mahira Khan', phone: '0312-1112011', whatsapp: '0312-1112011', gender: 'female', is_vip: true, is_blacklisted: false, notes: 'VIP - always books full day for events', hair_notes: 'Prefers organic products', allergy_notes: 'PPD allergy — no dark hair colors', loyalty_points: 1500, total_visits: 35, total_spent: 185000, udhaar_balance: 0, udhaar_limit: 50000, created_at: '2024-02-01T00:00:00Z' },
  { id: CL_GL[21], salon_id: GL_SALON, name: 'Urwa Hocane', phone: '0301-1112012', whatsapp: '0301-1112012', gender: 'female', is_vip: false, is_blacklisted: false, notes: 'Sister of Mawra', hair_notes: 'Bob cut enthusiast', allergy_notes: null, loyalty_points: 410, total_visits: 11, total_spent: 38000, udhaar_balance: 2000, udhaar_limit: 5000, created_at: '2024-08-10T00:00:00Z' },
  { id: CL_GL[22], salon_id: GL_SALON, name: 'Hania Aamir', phone: '0333-1112013', whatsapp: '0333-1112013', gender: 'female', is_vip: false, is_blacklisted: false, notes: null, hair_notes: 'Loves vibrant colors — pinks, purples', allergy_notes: null, loyalty_points: 290, total_visits: 8, total_spent: 24000, udhaar_balance: 0, udhaar_limit: 5000, created_at: '2024-10-01T00:00:00Z' },
  { id: CL_GL[23], salon_id: GL_SALON, name: 'Ramsha Khan', phone: '0345-1112014', whatsapp: '0345-1112014', gender: 'female', is_vip: false, is_blacklisted: false, notes: 'College student, budget-conscious', hair_notes: null, allergy_notes: null, loyalty_points: 50, total_visits: 2, total_spent: 4000, udhaar_balance: 0, udhaar_limit: 2000, created_at: '2025-03-10T00:00:00Z' },
  { id: CL_GL[24], salon_id: GL_SALON, name: 'Neelam Muneer', phone: '0300-1112015', whatsapp: '0300-1112015', gender: 'female', is_vip: false, is_blacklisted: false, notes: null, hair_notes: 'Long straight hair, trims only', allergy_notes: null, loyalty_points: 130, total_visits: 6, total_spent: 11000, udhaar_balance: 0, udhaar_limit: 5000, created_at: '2024-12-15T00:00:00Z' },
];


// ═══════════════════════════════════════
// ROYAL BARBERS — Clients (10)
// ═══════════════════════════════════════

const royalClients: Client[] = [
  { id: CL_RB[0], salon_id: RB_SALON, name: 'Ali Hassan', phone: '0333-1110001', whatsapp: '0333-1110001', gender: 'male', is_vip: false, is_blacklisted: false, notes: null, hair_notes: 'Fade on sides, textured top', allergy_notes: null, loyalty_points: 280, total_visits: 14, total_spent: 15800, udhaar_balance: 0, udhaar_limit: 3000, created_at: '2025-02-15T00:00:00Z' },
  { id: CL_RB[1], salon_id: RB_SALON, name: 'Omar Farooq', phone: '0345-1110002', whatsapp: '0345-1110002', gender: 'male', is_vip: true, is_blacklisted: false, notes: 'VIP - CEO, always on time', hair_notes: 'Classic side part', allergy_notes: null, loyalty_points: 520, total_visits: 20, total_spent: 32000, udhaar_balance: 0, udhaar_limit: 10000, created_at: '2025-02-15T00:00:00Z' },
  { id: CL_RB[2], salon_id: RB_SALON, name: 'Hassan Sheikh', phone: '0300-1110003', whatsapp: '0300-1110003', gender: 'male', is_vip: false, is_blacklisted: false, notes: null, hair_notes: null, allergy_notes: null, loyalty_points: 180, total_visits: 9, total_spent: 8400, udhaar_balance: 0, udhaar_limit: 3000, created_at: '2025-02-20T00:00:00Z' },
  { id: CL_RB[3], salon_id: RB_SALON, name: 'Bilal Mahmood', phone: '0312-1110004', whatsapp: '0312-1110004', gender: 'male', is_vip: false, is_blacklisted: false, notes: null, hair_notes: 'Wants trendy styles', allergy_notes: null, loyalty_points: 90, total_visits: 5, total_spent: 5200, udhaar_balance: 800, udhaar_limit: 2000, created_at: '2025-03-01T00:00:00Z' },
  { id: CL_RB[4], salon_id: RB_SALON, name: 'Zain ul Abidin', phone: '0301-1110005', whatsapp: '0301-1110005', gender: 'male', is_vip: false, is_blacklisted: false, notes: null, hair_notes: null, allergy_notes: null, loyalty_points: 210, total_visits: 11, total_spent: 10600, udhaar_balance: 0, udhaar_limit: 3000, created_at: '2025-02-18T00:00:00Z' },
  { id: CL_RB[5], salon_id: RB_SALON, name: 'Faisal Qureshi', phone: '0333-1110006', whatsapp: '0333-1110006', gender: 'male', is_vip: true, is_blacklisted: false, notes: 'VIP - refers many clients', hair_notes: 'Prefers scissors cut, no clippers', allergy_notes: null, loyalty_points: 440, total_visits: 18, total_spent: 24600, udhaar_balance: 0, udhaar_limit: 8000, created_at: '2025-02-15T00:00:00Z' },
  { id: CL_RB[6], salon_id: RB_SALON, name: 'Tariq Mehmood', phone: '0345-1110007', whatsapp: '0345-1110007', gender: 'male', is_vip: false, is_blacklisted: false, notes: null, hair_notes: null, allergy_notes: null, loyalty_points: 150, total_visits: 8, total_spent: 7800, udhaar_balance: 0, udhaar_limit: 3000, created_at: '2025-02-25T00:00:00Z' },
  { id: CL_RB[7], salon_id: RB_SALON, name: 'Imran Khalid', phone: '0300-1110008', whatsapp: '0300-1110008', gender: 'male', is_vip: false, is_blacklisted: false, notes: null, hair_notes: null, allergy_notes: null, loyalty_points: 60, total_visits: 3, total_spent: 2400, udhaar_balance: 0, udhaar_limit: 2000, created_at: '2025-03-10T00:00:00Z' },
  { id: CL_RB[8], salon_id: RB_SALON, name: 'Shahid Abbas', phone: '0312-1110009', whatsapp: '0312-1110009', gender: 'male', is_vip: false, is_blacklisted: false, notes: null, hair_notes: 'Thick curly hair', allergy_notes: null, loyalty_points: 340, total_visits: 16, total_spent: 18200, udhaar_balance: 1200, udhaar_limit: 3000, created_at: '2025-02-15T00:00:00Z' },
  { id: CL_RB[9], salon_id: RB_SALON, name: 'Kamran Akmal', phone: '0301-1110010', whatsapp: '0301-1110010', gender: 'male', is_vip: false, is_blacklisted: false, notes: null, hair_notes: null, allergy_notes: null, loyalty_points: 120, total_visits: 6, total_spent: 5400, udhaar_balance: 0, udhaar_limit: 3000, created_at: '2025-03-01T00:00:00Z' },
  { id: CL_RB[10], salon_id: RB_SALON, name: 'Wasim Akram', phone: '0333-1120011', whatsapp: '0333-1120011', gender: 'male', is_vip: true, is_blacklisted: false, notes: 'VIP - legend, always give best service', hair_notes: 'Greying temples, wants natural look', allergy_notes: null, loyalty_points: 780, total_visits: 28, total_spent: 48000, udhaar_balance: 0, udhaar_limit: 20000, created_at: '2025-02-15T00:00:00Z' },
  { id: CL_RB[11], salon_id: RB_SALON, name: 'Babar Azam', phone: '0345-1120012', whatsapp: '0345-1120012', gender: 'male', is_vip: true, is_blacklisted: false, notes: 'VIP - needs privacy, comes after hours sometimes', hair_notes: 'Clean fade, skin tight sides', allergy_notes: null, loyalty_points: 650, total_visits: 22, total_spent: 38000, udhaar_balance: 0, udhaar_limit: 15000, created_at: '2025-02-15T00:00:00Z' },
  { id: CL_RB[12], salon_id: RB_SALON, name: 'Shaheen Afridi', phone: '0300-1120013', whatsapp: '0300-1120013', gender: 'male', is_vip: false, is_blacklisted: false, notes: null, hair_notes: 'Long on top, likes volume', allergy_notes: null, loyalty_points: 320, total_visits: 12, total_spent: 14800, udhaar_balance: 0, udhaar_limit: 5000, created_at: '2025-02-18T00:00:00Z' },
  { id: CL_RB[13], salon_id: RB_SALON, name: 'Rizwan Ahmed', phone: '0312-1120014', whatsapp: '0312-1120014', gender: 'male', is_vip: false, is_blacklisted: false, notes: 'IT professional, comes during lunch', hair_notes: null, allergy_notes: null, loyalty_points: 190, total_visits: 10, total_spent: 9200, udhaar_balance: 1500, udhaar_limit: 3000, created_at: '2025-02-20T00:00:00Z' },
  { id: CL_RB[14], salon_id: RB_SALON, name: 'Junaid Jamshed Jr', phone: '0301-1120015', whatsapp: '0301-1120015', gender: 'male', is_vip: false, is_blacklisted: false, notes: null, hair_notes: 'Beard is priority, hair secondary', allergy_notes: 'Sensitive to aftershave with alcohol', loyalty_points: 240, total_visits: 14, total_spent: 12600, udhaar_balance: 0, udhaar_limit: 5000, created_at: '2025-02-15T00:00:00Z' },
  { id: CL_RB[15], salon_id: RB_SALON, name: 'Adnan Siddiqui', phone: '0333-1120016', whatsapp: '0333-1120016', gender: 'male', is_vip: true, is_blacklisted: false, notes: 'VIP - actor, tips generously', hair_notes: 'Salt and pepper look, maintain it', allergy_notes: null, loyalty_points: 560, total_visits: 19, total_spent: 34000, udhaar_balance: 0, udhaar_limit: 10000, created_at: '2025-02-15T00:00:00Z' },
  { id: CL_RB[16], salon_id: RB_SALON, name: 'Asad Umer', phone: '0345-1120017', whatsapp: '0345-1120017', gender: 'male', is_vip: false, is_blacklisted: false, notes: 'Government official, punctual', hair_notes: 'Conservative side part', allergy_notes: null, loyalty_points: 170, total_visits: 9, total_spent: 8400, udhaar_balance: 0, udhaar_limit: 3000, created_at: '2025-02-25T00:00:00Z' },
  { id: CL_RB[17], salon_id: RB_SALON, name: 'Danish Taimoor', phone: '0300-1120018', whatsapp: '0300-1120018', gender: 'male', is_vip: false, is_blacklisted: false, notes: null, hair_notes: 'Messy textured look', allergy_notes: null, loyalty_points: 100, total_visits: 5, total_spent: 5800, udhaar_balance: 2000, udhaar_limit: 4000, created_at: '2025-03-01T00:00:00Z' },
  { id: CL_RB[18], salon_id: RB_SALON, name: 'Atif Aslam', phone: '0312-1120019', whatsapp: '0312-1120019', gender: 'male', is_vip: true, is_blacklisted: false, notes: 'VIP - musician, irregular schedule', hair_notes: 'Long hair, just trims', allergy_notes: null, loyalty_points: 430, total_visits: 15, total_spent: 28000, udhaar_balance: 0, udhaar_limit: 10000, created_at: '2025-02-15T00:00:00Z' },
  { id: CL_RB[19], salon_id: RB_SALON, name: 'Shan Masood', phone: '0301-1120020', whatsapp: '0301-1120020', gender: 'male', is_vip: false, is_blacklisted: false, notes: null, hair_notes: null, allergy_notes: null, loyalty_points: 45, total_visits: 2, total_spent: 2200, udhaar_balance: 0, udhaar_limit: 2000, created_at: '2025-03-15T00:00:00Z' },
  { id: CL_RB[20], salon_id: RB_SALON, name: 'Fakhar Zaman', phone: '0333-1120021', whatsapp: '0333-1120021', gender: 'male', is_vip: false, is_blacklisted: false, notes: null, hair_notes: 'Buzz cut, every 2 weeks', allergy_notes: null, loyalty_points: 380, total_visits: 20, total_spent: 16000, udhaar_balance: 0, udhaar_limit: 5000, created_at: '2025-02-15T00:00:00Z' },
  { id: CL_RB[21], salon_id: RB_SALON, name: 'Muneeb Butt', phone: '0345-1120022', whatsapp: '0345-1120022', gender: 'male', is_vip: false, is_blacklisted: false, notes: 'Comes with wife Aiman sometimes', hair_notes: null, allergy_notes: null, loyalty_points: 260, total_visits: 13, total_spent: 11800, udhaar_balance: 0, udhaar_limit: 5000, created_at: '2025-02-18T00:00:00Z' },
  { id: CL_RB[22], salon_id: RB_SALON, name: 'Naseem Shah', phone: '0300-1120023', whatsapp: '0300-1120023', gender: 'male', is_vip: false, is_blacklisted: true, notes: 'BLACKLISTED: no-showed 3 times, wasted staff time', hair_notes: null, allergy_notes: null, loyalty_points: 0, total_visits: 3, total_spent: 2400, udhaar_balance: 800, udhaar_limit: 0, created_at: '2025-03-01T00:00:00Z' },
  { id: CL_RB[23], salon_id: RB_SALON, name: 'Hasan Ali', phone: '0312-1120024', whatsapp: '0312-1120024', gender: 'male', is_vip: false, is_blacklisted: false, notes: 'Student, budget cuts only', hair_notes: null, allergy_notes: null, loyalty_points: 70, total_visits: 4, total_spent: 2800, udhaar_balance: 0, udhaar_limit: 1000, created_at: '2025-03-10T00:00:00Z' },
  { id: CL_RB[24], salon_id: RB_SALON, name: 'Fahad Mustafa', phone: '0301-1120025', whatsapp: '0301-1120025', gender: 'male', is_vip: false, is_blacklisted: false, notes: 'TV host, irregular visits', hair_notes: 'Prefers pomade finish', allergy_notes: null, loyalty_points: 200, total_visits: 8, total_spent: 9600, udhaar_balance: 0, udhaar_limit: 5000, created_at: '2025-02-20T00:00:00Z' },
];


// ═══════════════════════════════════════
// GLAMOUR STUDIO — Products (10: 5 backbar + 5 retail)
// ═══════════════════════════════════════

const glamourProducts: Product[] = [
  { id: PR_GL[0], salon_id: GL_SALON, branch_id: GL_BRANCH, name: 'Casting Creme Gloss', brand: "L'Oréal", category: 'Hair Color', unit: 'box', content_per_unit: 60, content_unit: 'ml', inventory_type: 'backbar', purchase_price: 450, retail_price: 0, current_stock: 25, low_stock_threshold: 5, is_active: true, created_at: '2025-01-01T00:00:00Z' },
  { id: PR_GL[1], salon_id: GL_SALON, branch_id: GL_BRANCH, name: 'Semi Color', brand: 'Keune', category: 'Hair Color', unit: 'tube', content_per_unit: 60, content_unit: 'ml', inventory_type: 'backbar', purchase_price: 800, retail_price: 0, current_stock: 15, low_stock_threshold: 3, is_active: true, created_at: '2025-01-01T00:00:00Z' },
  { id: PR_GL[2], salon_id: GL_SALON, branch_id: GL_BRANCH, name: 'Koleston Perfect', brand: 'Wella', category: 'Hair Color', unit: 'tube', content_per_unit: 60, content_unit: 'ml', inventory_type: 'backbar', purchase_price: 650, retail_price: 0, current_stock: 18, low_stock_threshold: 5, is_active: true, created_at: '2025-01-01T00:00:00Z' },
  { id: PR_GL[3], salon_id: GL_SALON, branch_id: GL_BRANCH, name: 'Igora Royal', brand: 'Schwarzkopf', category: 'Hair Color', unit: 'tube', content_per_unit: 60, content_unit: 'ml', inventory_type: 'backbar', purchase_price: 750, retail_price: 0, current_stock: 2, low_stock_threshold: 3, is_active: true, created_at: '2025-01-01T00:00:00Z' },
  { id: PR_GL[4], salon_id: GL_SALON, branch_id: GL_BRANCH, name: 'Nail Lacquer', brand: 'OPI', category: 'Nail Polish', unit: 'bottle', content_per_unit: 15, content_unit: 'ml', inventory_type: 'retail', purchase_price: 350, retail_price: 800, current_stock: 30, low_stock_threshold: 10, is_active: true, created_at: '2025-01-01T00:00:00Z' },
  { id: PR_GL[5], salon_id: GL_SALON, branch_id: GL_BRANCH, name: 'Keratin Shampoo', brand: 'Keune', category: 'Shampoo', unit: 'bottle', content_per_unit: 500, content_unit: 'ml', inventory_type: 'retail', purchase_price: 900, retail_price: 1800, current_stock: 12, low_stock_threshold: 3, is_active: true, created_at: '2025-01-15T00:00:00Z' },
  { id: PR_GL[6], salon_id: GL_SALON, branch_id: GL_BRANCH, name: 'Hair Serum', brand: "L'Oréal", category: 'Styling', unit: 'bottle', content_per_unit: 100, content_unit: 'ml', inventory_type: 'retail', purchase_price: 600, retail_price: 1200, current_stock: 8, low_stock_threshold: 3, is_active: true, created_at: '2025-01-15T00:00:00Z' },
  { id: PR_GL[7], salon_id: GL_SALON, branch_id: GL_BRANCH, name: 'Deep Conditioning Mask', brand: 'Schwarzkopf', category: 'Treatment', unit: 'jar', content_per_unit: 500, content_unit: 'g', inventory_type: 'backbar', purchase_price: 1200, retail_price: 0, current_stock: 6, low_stock_threshold: 2, is_active: true, created_at: '2025-01-15T00:00:00Z' },
  { id: PR_GL[8], salon_id: GL_SALON, branch_id: GL_BRANCH, name: 'Wax Strips', brand: 'Veet', category: 'Waxing', unit: 'pack', content_per_unit: 20, content_unit: 'strips', inventory_type: 'backbar', purchase_price: 350, retail_price: 0, current_stock: 20, low_stock_threshold: 5, is_active: true, created_at: '2025-02-01T00:00:00Z' },
  { id: PR_GL[9], salon_id: GL_SALON, branch_id: GL_BRANCH, name: 'Hair Spray', brand: 'TRESemmé', category: 'Styling', unit: 'can', content_per_unit: 250, content_unit: 'ml', inventory_type: 'retail', purchase_price: 500, retail_price: 950, current_stock: 10, low_stock_threshold: 3, is_active: true, created_at: '2025-02-01T00:00:00Z' },
];


// ═══════════════════════════════════════
// ROYAL BARBERS — Products (8)
// ═══════════════════════════════════════

const royalProducts: Product[] = [
  { id: PR_RB[0], salon_id: RB_SALON, branch_id: RB_BRANCH, name: 'Hair Wax', brand: 'Gatsby', category: 'Styling', unit: 'jar', content_per_unit: 75, content_unit: 'g', inventory_type: 'retail', purchase_price: 300, retail_price: 600, current_stock: 15, low_stock_threshold: 5, is_active: true, created_at: '2025-02-10T00:00:00Z' },
  { id: PR_RB[1], salon_id: RB_SALON, branch_id: RB_BRANCH, name: 'Hair Gel', brand: 'Schwarzkopf', category: 'Styling', unit: 'tube', content_per_unit: 150, content_unit: 'ml', inventory_type: 'retail', purchase_price: 400, retail_price: 750, current_stock: 12, low_stock_threshold: 4, is_active: true, created_at: '2025-02-10T00:00:00Z' },
  { id: PR_RB[2], salon_id: RB_SALON, branch_id: RB_BRANCH, name: 'Just For Men Color', brand: 'Just For Men', category: 'Hair Color', unit: 'box', content_per_unit: 40, content_unit: 'ml', inventory_type: 'backbar', purchase_price: 550, retail_price: 0, current_stock: 10, low_stock_threshold: 3, is_active: true, created_at: '2025-02-10T00:00:00Z' },
  { id: PR_RB[3], salon_id: RB_SALON, branch_id: RB_BRANCH, name: 'Shaving Cream', brand: 'Nivea', category: 'Shaving', unit: 'can', content_per_unit: 200, content_unit: 'ml', inventory_type: 'backbar', purchase_price: 280, retail_price: 0, current_stock: 8, low_stock_threshold: 3, is_active: true, created_at: '2025-02-10T00:00:00Z' },
  { id: PR_RB[4], salon_id: RB_SALON, branch_id: RB_BRANCH, name: 'After Shave', brand: 'Old Spice', category: 'Shaving', unit: 'bottle', content_per_unit: 100, content_unit: 'ml', inventory_type: 'retail', purchase_price: 350, retail_price: 700, current_stock: 6, low_stock_threshold: 2, is_active: true, created_at: '2025-02-10T00:00:00Z' },
  { id: PR_RB[5], salon_id: RB_SALON, branch_id: RB_BRANCH, name: 'Hair Oil', brand: 'Dabur Amla', category: 'Hair Care', unit: 'bottle', content_per_unit: 200, content_unit: 'ml', inventory_type: 'retail', purchase_price: 200, retail_price: 400, current_stock: 20, low_stock_threshold: 5, is_active: true, created_at: '2025-02-10T00:00:00Z' },
  { id: PR_RB[6], salon_id: RB_SALON, branch_id: RB_BRANCH, name: 'Beard Oil', brand: 'Beardo', category: 'Beard Care', unit: 'bottle', content_per_unit: 30, content_unit: 'ml', inventory_type: 'retail', purchase_price: 450, retail_price: 900, current_stock: 1, low_stock_threshold: 3, is_active: true, created_at: '2025-02-15T00:00:00Z' },
  { id: PR_RB[7], salon_id: RB_SALON, branch_id: RB_BRANCH, name: 'Hair Spray', brand: 'TRESemmé', category: 'Styling', unit: 'can', content_per_unit: 250, content_unit: 'ml', inventory_type: 'backbar', purchase_price: 500, retail_price: 0, current_stock: 5, low_stock_threshold: 2, is_active: true, created_at: '2025-02-15T00:00:00Z' },
];


// ═══════════════════════════════════════
// Suppliers
// ═══════════════════════════════════════

const allSuppliers: Supplier[] = [
  { id: 'sup-0001', salon_id: GL_SALON, name: 'Lahore Beauty Wholesale', phone: '0321-8880001', udhaar_balance: 15000, notes: 'Main hair color supplier', created_at: '2025-01-01T00:00:00Z' },
  { id: 'sup-0002', salon_id: GL_SALON, name: 'Keune Pakistan Distributor', phone: '0333-8880002', udhaar_balance: 0, notes: 'Keune authorized', created_at: '2025-01-01T00:00:00Z' },
  { id: 'sup-0003', salon_id: GL_SALON, name: 'Ali Brothers Trading', phone: '0300-8880003', udhaar_balance: 8500, notes: 'Waxing & misc supplies', created_at: '2025-02-01T00:00:00Z' },
  { id: 'sup-0004', salon_id: RB_SALON, name: 'Islamabad Barber Supplies', phone: '0345-8880004', udhaar_balance: 5000, notes: 'Main supplier', created_at: '2025-02-10T00:00:00Z' },
  { id: 'sup-0005', salon_id: RB_SALON, name: 'Jinnah Cosmetics', phone: '0312-8880005', udhaar_balance: 0, notes: 'Styling products', created_at: '2025-02-15T00:00:00Z' },
];


// ═══════════════════════════════════════
// Packages
// ═══════════════════════════════════════

const allPackages: Package[] = [
  { id: 'pkg-0001', salon_id: GL_SALON, name: 'Bridal Complete Package', description: 'Full bridal prep: facial, waxing, hair, makeup', price: 35000, validity_days: 30, services: [{ service_id: SV_GL.bridalMakeup, name: 'Bridal Makeup', quantity: 1 }, { service_id: SV_GL.goldFacial, name: 'Gold Facial', quantity: 2 }, { service_id: SV_GL.bodyWax, name: 'Full Body Wax', quantity: 1 }], is_active: true, created_at: '2025-01-15T00:00:00Z' },
  { id: 'pkg-0002', salon_id: GL_SALON, name: 'Monthly Glow Package', description: 'Facial + haircut + threading monthly', price: 2500, validity_days: 30, services: [{ service_id: SV_GL.basicFacial, name: 'Basic Facial', quantity: 1 }, { service_id: SV_GL.basicHaircut, name: 'Basic Haircut', quantity: 1 }, { service_id: SV_GL.upperLip, name: 'Upper Lip Threading', quantity: 1 }], is_active: true, created_at: '2025-02-01T00:00:00Z' },
  { id: 'pkg-0003', salon_id: RB_SALON, name: 'Gentleman Package', description: 'Premium cut + beard styling + facial', price: 2000, validity_days: 30, services: [{ service_id: SV_RB.premiumHaircut, name: 'Premium Haircut', quantity: 1 }, { service_id: SV_RB.beardStyling, name: 'Beard Styling', quantity: 1 }, { service_id: SV_RB.mensFacial, name: "Men's Facial", quantity: 1 }], is_active: true, created_at: '2025-02-15T00:00:00Z' },
  { id: 'pkg-0004', salon_id: RB_SALON, name: 'Weekly Grooming', description: 'Haircut + beard trim + massage', price: 900, validity_days: 7, services: [{ service_id: SV_RB.regularHaircut, name: 'Regular Haircut', quantity: 1 }, { service_id: SV_RB.beardTrim, name: 'Beard Trim', quantity: 1 }, { service_id: SV_RB.headMassage, name: 'Head Massage', quantity: 1 }], is_active: true, created_at: '2025-02-20T00:00:00Z' },
];

const allClientPackages: ClientPackage[] = [
  { id: 'cpkg-0001', client_id: CL_GL[2], package_id: 'pkg-0001', purchase_date: dateOffset(-10), expiry_date: dateOffset(20), services_remaining: { 'Bridal Makeup': 1, 'Gold Facial': 1, 'Full Body Wax': 0 }, is_active: true, created_at: dateOffset(-10) + 'T10:00:00Z' },
  { id: 'cpkg-0002', client_id: CL_GL[0], package_id: 'pkg-0002', purchase_date: dateOffset(-5), expiry_date: dateOffset(25), services_remaining: { 'Basic Facial': 1, 'Basic Haircut': 0, 'Upper Lip Threading': 1 }, is_active: true, created_at: dateOffset(-5) + 'T10:00:00Z' },
  { id: 'cpkg-0003', client_id: CL_RB[1], package_id: 'pkg-0003', purchase_date: dateOffset(-3), expiry_date: dateOffset(27), services_remaining: { 'Premium Haircut': 1, 'Beard Styling': 1, "Men's Facial": 1 }, is_active: true, created_at: dateOffset(-3) + 'T10:00:00Z' },
];


// ═══════════════════════════════════════
// Promo Codes
// ═══════════════════════════════════════

const allPromoCodes: PromoCode[] = [
  { id: 'promo-0001', salon_id: GL_SALON, code: 'WELCOME20', discount_type: 'percentage', discount_value: 20, min_bill_amount: 1000, max_uses: 50, used_count: 12, expiry_date: dateOffset(60), is_active: true, created_at: '2025-02-01T00:00:00Z' },
  { id: 'promo-0002', salon_id: GL_SALON, code: 'BRIDAL500', discount_type: 'flat', discount_value: 500, min_bill_amount: 5000, max_uses: 20, used_count: 5, expiry_date: dateOffset(90), is_active: true, created_at: '2025-02-15T00:00:00Z' },
  { id: 'promo-0003', salon_id: RB_SALON, code: 'FIRST50', discount_type: 'percentage', discount_value: 50, min_bill_amount: 500, max_uses: 100, used_count: 23, expiry_date: dateOffset(30), is_active: true, created_at: '2025-02-10T00:00:00Z' },
  { id: 'promo-0004', salon_id: RB_SALON, code: 'ROYAL200', discount_type: 'flat', discount_value: 200, min_bill_amount: 1000, max_uses: 30, used_count: 8, expiry_date: dateOffset(45), is_active: true, created_at: '2025-03-01T00:00:00Z' },
];


// ═══════════════════════════════════════
// Loyalty Rules
// ═══════════════════════════════════════

const allLoyaltyRules: LoyaltyRules[] = [
  { id: 'lr-0001', salon_id: GL_SALON, branch_id: GL_BRANCH, points_per_100_pkr: 10, pkr_per_point_redemption: 0.5, birthday_bonus_multiplier: 2 },
  { id: 'lr-0002', salon_id: RB_SALON, branch_id: RB_BRANCH, points_per_100_pkr: 5, pkr_per_point_redemption: 1, birthday_bonus_multiplier: 3 },
];


// ═══════════════════════════════════════
// Service-Staff Pricing overrides
// ═══════════════════════════════════════

const allServiceStaffPricing: ServiceStaffPricing[] = [
  { id: 'ssp-0001', service_id: SV_GL.layerCut, staff_id: ST.sadia, price: 1500 },
  { id: 'ssp-0002', service_id: SV_GL.keratin, staff_id: ST.sadia, price: 14000 },
  { id: 'ssp-0003', service_id: SV_GL.highlights, staff_id: ST.nadia, price: 5500 },
  { id: 'ssp-0004', service_id: SV_RB.premiumHaircut, staff_id: ST.usman, price: 1000 },
];


// ═══════════════════════════════════════
// Product-Service Links (backbar auto-deduction)
// ═══════════════════════════════════════

// quantity_per_use is in content_unit (ml, g, strips, etc.)
// e.g., Full Color uses 40ml of a 60ml box → quantity_per_use: 40
const allProductServiceLinks: ProductServiceLink[] = [
  { id: 'psl-0001', product_id: PR_GL[0], service_id: SV_GL.fullColor, quantity_per_use: 40 },     // 40ml per full color (60ml box = ~1.5 clients)
  { id: 'psl-0002', product_id: PR_GL[1], service_id: SV_GL.rootTouchUp, quantity_per_use: 20 },   // 20ml per root touch-up (60ml tube = 3 clients)
  { id: 'psl-0003', product_id: PR_GL[7], service_id: SV_GL.deepCond, quantity_per_use: 50 },      // 50g per deep conditioning (500g jar = 10 clients)
  { id: 'psl-0004', product_id: PR_GL[8], service_id: SV_GL.armsWax, quantity_per_use: 4 },        // 4 strips per arms wax (20 strips/pack = 5 clients)
  { id: 'psl-0005', product_id: PR_GL[8], service_id: SV_GL.legsWax, quantity_per_use: 8 },        // 8 strips per legs wax (20 strips/pack = ~2.5 clients)
  { id: 'psl-0006', product_id: PR_RB[2], service_id: SV_RB.hairColor, quantity_per_use: 40 },     // 40ml per color (40ml box = 1 client)
  { id: 'psl-0007', product_id: PR_RB[3], service_id: SV_RB.cleanShave, quantity_per_use: 5 },     // 5ml per clean shave (200ml can = 40 shaves)
  { id: 'psl-0008', product_id: PR_RB[3], service_id: SV_RB.hotTowelShave, quantity_per_use: 8 },  // 8ml per hot towel shave (200ml can = 25 shaves)
];


// ═══════════════════════════════════════
// GENERATED TIME-RELATIVE DATA
// ═══════════════════════════════════════

interface TransactionBundle {
  appointments: Appointment[];
  appointmentServices: AppointmentService[];
  bills: Bill[];
  billItems: BillItem[];
  tips: Tip[];
}

function generateTransactions(): TransactionBundle {
  const apts: Appointment[] = [];
  const aptSvcs: AppointmentService[] = [];
  const bills: Bill[] = [];
  const billItems: BillItem[] = [];
  const tips: Tip[] = [];
  let aC = 0, asC = 0, bC = 0, biC = 0, tC = 0;

  const td = todayStr();

  function addApt(
    branchId: string, salonId: string, clientId: string | null, staffId: string,
    date: string, start: string, end: string, status: 'done' | 'in_progress' | 'confirmed' | 'booked' | 'no_show' | 'cancelled',
    svcs: { id: string; name: string; price: number; dur: number }[],
    walkin = false, payMethod: 'cash' | 'jazzcash' | 'easypaisa' | 'card' | 'udhaar' | 'bank_transfer' = 'cash',
    tipAmt = 0, discount = 0,
  ) {
    aC++;
    const aptId = `apt-${String(aC).padStart(4, '0')}`;
    apts.push({
      id: aptId, branch_id: branchId, salon_id: salonId, client_id: clientId, staff_id: staffId,
      appointment_date: date, start_time: start, end_time: end,
      token_number: walkin ? aC : null, is_walkin: walkin,
      status, notes: null,
      reminder_sent: ['done', 'in_progress', 'confirmed'].includes(status),
      created_at: `${date}T08:00:00Z`,
    });

    for (const svc of svcs) {
      asC++;
      aptSvcs.push({ id: `as-${String(asC).padStart(4, '0')}`, appointment_id: aptId, service_id: svc.id, service_name: svc.name, price: svc.price, duration_minutes: svc.dur });
    }

    if (status === 'done') {
      bC++;
      const subtotal = svcs.reduce((s, sv) => s + sv.price, 0);
      const total = subtotal - discount + tipAmt;
      const prefix = salonId === GL_SALON ? 'GL' : 'RB';
      const billId = `bill-${String(bC).padStart(4, '0')}`;
      bills.push({
        id: billId, bill_number: `${prefix}-${String(bC).padStart(4, '0')}`,
        branch_id: branchId, salon_id: salonId, appointment_id: aptId,
        client_id: clientId, staff_id: staffId,
        subtotal, discount_amount: discount, discount_type: discount > 0 ? 'flat' : null,
        tax_amount: 0, tip_amount: tipAmt, total_amount: total,
        paid_amount: total, payment_method: payMethod, payment_details: null,
        udhaar_added: payMethod === 'udhaar' ? total : 0,
        loyalty_points_used: 0, loyalty_points_earned: Math.floor(subtotal / 100) * 10,
        promo_code: null, status: 'paid', notes: null, receipt_sent: Math.random() > 0.5,
        created_at: `${date}T${start}:00`,
      });

      for (const svc of svcs) {
        biC++;
        billItems.push({ id: `bi-${String(biC).padStart(4, '0')}`, bill_id: billId, item_type: 'service', service_id: svc.id, product_id: null, name: svc.name, quantity: 1, unit_price: svc.price, total_price: svc.price });
      }

      if (tipAmt > 0) {
        tC++;
        tips.push({ id: `tip-${String(tC).padStart(4, '0')}`, staff_id: staffId, bill_id: billId, amount: tipAmt, date });
      }
    }
  }

  // ── GLAMOUR STUDIO — Today ──
  addApt(GL_BRANCH, GL_SALON, CL_GL[0], ST.sadia, td, '10:00', '10:30', 'done',
    [{ id: SV_GL.basicHaircut, name: 'Basic Haircut', price: 500, dur: 30 }], false, 'cash', 100);
  addApt(GL_BRANCH, GL_SALON, CL_GL[1], ST.nadia, td, '10:00', '10:45', 'done',
    [{ id: SV_GL.layerCut, name: 'Layer Cut', price: 1200, dur: 45 }], false, 'jazzcash');
  addApt(GL_BRANCH, GL_SALON, null, ST.rabia, td, '10:30', '11:00', 'done',
    [{ id: SV_GL.armsWax, name: 'Full Arms Wax', price: 800, dur: 30 }], true, 'cash');
  addApt(GL_BRANCH, GL_SALON, CL_GL[4], ST.sadia, td, '11:00', '12:00', 'done',
    [{ id: SV_GL.rootTouchUp, name: 'Root Touch-Up', price: 1500, dur: 60 }], false, 'easypaisa', 200);
  addApt(GL_BRANCH, GL_SALON, CL_GL[2], ST.nadia, td, '11:00', '12:00', 'in_progress',
    [{ id: SV_GL.goldFacial, name: 'Gold Facial', price: 3000, dur: 60 }]);
  addApt(GL_BRANCH, GL_SALON, CL_GL[6], ST.sadia, td, '14:00', '16:00', 'confirmed',
    [{ id: SV_GL.highlights, name: 'Highlights / Lowlights', price: 5000, dur: 120 }]);
  addApt(GL_BRANCH, GL_SALON, CL_GL[9], ST.rabia, td, '14:30', '15:10', 'confirmed',
    [{ id: SV_GL.bobCut, name: 'Bob Cut', price: 1000, dur: 40 }]);
  addApt(GL_BRANCH, GL_SALON, CL_GL[7], ST.nadia, td, '15:00', '16:15', 'booked',
    [{ id: SV_GL.whiteningFacial, name: 'Whitening Facial', price: 4000, dur: 75 }, { id: SV_GL.upperLip, name: 'Upper Lip Threading', price: 150, dur: 10 }]);
  addApt(GL_BRANCH, GL_SALON, CL_GL[5], ST.rabia, td, '16:00', '16:30', 'booked',
    [{ id: SV_GL.basicHaircut, name: 'Basic Haircut', price: 500, dur: 30 }]);
  addApt(GL_BRANCH, GL_SALON, CL_GL[3], ST.sadia, td, '17:00', '17:15', 'booked',
    [{ id: SV_GL.bangs, name: 'Bangs / Fringe Cut', price: 300, dur: 15 }]);

  // ── ROYAL BARBERS — Today ──
  addApt(RB_BRANCH, RB_SALON, CL_RB[0], ST.usman, td, '09:00', '09:20', 'done',
    [{ id: SV_RB.regularHaircut, name: 'Regular Haircut', price: 400, dur: 20 }], false, 'cash', 50);
  addApt(RB_BRANCH, RB_SALON, CL_RB[1], ST.usman, td, '09:30', '10:00', 'done',
    [{ id: SV_RB.premiumHaircut, name: 'Premium Haircut', price: 800, dur: 30 }, { id: SV_RB.beardStyling, name: 'Beard Styling', price: 400, dur: 20 }], false, 'card', 200);
  addApt(RB_BRANCH, RB_SALON, null, ST.bilal, td, '09:30', '09:50', 'done',
    [{ id: SV_RB.regularHaircut, name: 'Regular Haircut', price: 400, dur: 20 }], true, 'cash');
  addApt(RB_BRANCH, RB_SALON, CL_RB[2], ST.usman, td, '10:30', '11:10', 'done',
    [{ id: SV_RB.cleanShave, name: 'Clean Shave', price: 300, dur: 20 }, { id: SV_RB.headMassage, name: 'Head Massage', price: 500, dur: 20 }], false, 'cash');
  addApt(RB_BRANCH, RB_SALON, CL_RB[3], ST.bilal, td, '10:30', '11:15', 'done',
    [{ id: SV_RB.hairColor, name: 'Hair Color', price: 1500, dur: 45 }], false, 'jazzcash');
  addApt(RB_BRANCH, RB_SALON, null, ST.bilal, td, '11:30', '11:50', 'in_progress',
    [{ id: SV_RB.regularHaircut, name: 'Regular Haircut', price: 400, dur: 20 }, { id: SV_RB.beardTrim, name: 'Beard Trim', price: 200, dur: 15 }], true);
  addApt(RB_BRANCH, RB_SALON, CL_RB[4], ST.usman, td, '14:00', '14:30', 'confirmed',
    [{ id: SV_RB.premiumHaircut, name: 'Premium Haircut', price: 800, dur: 30 }]);
  addApt(RB_BRANCH, RB_SALON, CL_RB[5], ST.usman, td, '15:00', '15:55', 'booked',
    [{ id: SV_RB.hotTowelShave, name: 'Hot Towel Shave', price: 500, dur: 25 }, { id: SV_RB.mensFacial, name: "Men's Facial", price: 1200, dur: 30 }]);
  addApt(RB_BRANCH, RB_SALON, CL_RB[6], ST.bilal, td, '16:00', '17:00', 'booked',
    [{ id: SV_RB.hairTreatment, name: 'Hair Treatment', price: 2000, dur: 60 }]);
  addApt(RB_BRANCH, RB_SALON, CL_RB[7], ST.usman, td, '17:00', '17:20', 'booked',
    [{ id: SV_RB.regularHaircut, name: 'Regular Haircut', price: 400, dur: 20 }]);

  // ── Past 90 days — Glamour Studio ──
  const glPool: Array<[string, string, string, { id: string; name: string; price: number; dur: number }[], 'cash' | 'jazzcash' | 'easypaisa' | 'card', number]> = [
    [CL_GL[8], ST.sadia, '10:00', [{ id: SV_GL.keratin, name: 'Keratin Treatment', price: 12000, dur: 180 }], 'card', 500],
    [CL_GL[2], ST.nadia, '11:00', [{ id: SV_GL.goldFacial, name: 'Gold Facial', price: 3000, dur: 60 }], 'cash', 200],
    [CL_GL[6], ST.sadia, '14:00', [{ id: SV_GL.balayage, name: 'Balayage', price: 8000, dur: 150 }], 'jazzcash', 0],
    [CL_GL[0], ST.rabia, '10:30', [{ id: SV_GL.basicHaircut, name: 'Basic Haircut', price: 500, dur: 30 }, { id: SV_GL.upperLip, name: 'Upper Lip Threading', price: 150, dur: 10 }], 'cash', 0],
    [CL_GL[7], ST.nadia, '13:00', [{ id: SV_GL.whiteningFacial, name: 'Whitening Facial', price: 4000, dur: 75 }], 'easypaisa', 100],
    [CL_GL[4], ST.rabia, '15:00', [{ id: SV_GL.legsWax, name: 'Full Legs Wax', price: 1200, dur: 45 }], 'cash', 0],
    [CL_GL[1], ST.sadia, '11:00', [{ id: SV_GL.protein, name: 'Hair Protein Treatment', price: 5000, dur: 90 }], 'cash', 200],
    [CL_GL[3], ST.nadia, '14:00', [{ id: SV_GL.basicFacial, name: 'Basic Facial', price: 1500, dur: 45 }], 'cash', 0],
    [CL_GL[5], ST.rabia, '16:00', [{ id: SV_GL.bobCut, name: 'Bob Cut', price: 1000, dur: 40 }], 'cash', 0],
    [CL_GL[9], ST.sadia, '10:00', [{ id: SV_GL.basicHaircut, name: 'Basic Haircut', price: 500, dur: 30 }], 'cash', 0],
    [CL_GL[10], ST.nadia, '12:00', [{ id: SV_GL.highlights, name: 'Highlights / Lowlights', price: 5000, dur: 120 }], 'card', 300],
    [CL_GL[12], ST.sadia, '15:00', [{ id: SV_GL.keratin, name: 'Keratin Treatment', price: 12000, dur: 180 }], 'jazzcash', 0],
    [CL_GL[15], ST.rabia, '11:30', [{ id: SV_GL.armsWax, name: 'Full Arms Wax', price: 800, dur: 30 }, { id: SV_GL.legsWax, name: 'Full Legs Wax', price: 1200, dur: 45 }], 'cash', 0],
    [CL_GL[20], ST.nadia, '16:00', [{ id: SV_GL.fullColor, name: 'Full Head Color', price: 3500, dur: 90 }], 'easypaisa', 200],
    [CL_GL[16], ST.sadia, '09:30', [{ id: SV_GL.deepCond, name: 'Deep Conditioning', price: 2000, dur: 45 }], 'cash', 100],
  ];

  for (let day = -90; day <= -1; day++) {
    const date = dateOffset(day);
    const dow = new Date(date).getDay();
    if (dow === 0) continue;
    const seed = Math.abs(day * 7 + 3);
    const count = 3 + (seed % 5);
    for (let i = 0; i < count; i++) {
      const pick = glPool[(seed + i * 3) % glPool.length];
      const [cId, sId, start, svcs, pay, tip] = pick;
      const endH = parseInt(start.split(':')[0]) + Math.ceil(svcs.reduce((s, sv) => s + sv.dur, 0) / 60);
      const walkin = (seed + i) % 7 === 0;
      addApt(GL_BRANCH, GL_SALON, walkin ? null : cId, sId, date, start, `${endH}:00`, 'done', svcs, walkin, pay, tip);
    }
  }

  // ── Past 90 days — Royal Barbers (Branch 1) ──
  const rbPool: Array<[string, string, string, { id: string; name: string; price: number; dur: number }[], 'cash' | 'jazzcash' | 'easypaisa' | 'card', number]> = [
    [CL_RB[0], ST.usman, '09:00', [{ id: SV_RB.regularHaircut, name: 'Regular Haircut', price: 400, dur: 20 }, { id: SV_RB.beardTrim, name: 'Beard Trim', price: 200, dur: 15 }], 'cash', 50],
    [CL_RB[1], ST.usman, '10:00', [{ id: SV_RB.premiumHaircut, name: 'Premium Haircut', price: 800, dur: 30 }], 'card', 100],
    [CL_RB[4], ST.bilal, '09:30', [{ id: SV_RB.regularHaircut, name: 'Regular Haircut', price: 400, dur: 20 }], 'cash', 0],
    [CL_RB[8], ST.usman, '11:00', [{ id: SV_RB.hotTowelShave, name: 'Hot Towel Shave', price: 500, dur: 25 }], 'cash', 50],
    [CL_RB[5], ST.bilal, '14:00', [{ id: SV_RB.hairColor, name: 'Hair Color', price: 1500, dur: 45 }], 'jazzcash', 0],
    [CL_RB[9], ST.usman, '15:00', [{ id: SV_RB.mensFacial, name: "Men's Facial", price: 1200, dur: 30 }], 'cash', 0],
    [CL_RB[6], ST.bilal, '16:00', [{ id: SV_RB.washStyle, name: 'Hair Wash & Style', price: 600, dur: 25 }], 'cash', 0],
    [CL_RB[2], ST.usman, '17:00', [{ id: SV_RB.cleanShave, name: 'Clean Shave', price: 300, dur: 20 }, { id: SV_RB.beardColor, name: 'Beard Color', price: 500, dur: 20 }], 'easypaisa', 0],
    [CL_RB[10], ST.usman, '09:30', [{ id: SV_RB.premiumHaircut, name: 'Premium Haircut', price: 800, dur: 30 }, { id: SV_RB.beardStyling, name: 'Beard Styling', price: 400, dur: 20 }], 'card', 200],
    [CL_RB[11], ST.bilal, '10:30', [{ id: SV_RB.regularHaircut, name: 'Regular Haircut', price: 400, dur: 20 }], 'cash', 0],
    [CL_RB[15], ST.usman, '11:30', [{ id: SV_RB.hairTreatment, name: 'Hair Treatment', price: 2000, dur: 60 }], 'jazzcash', 100],
    [CL_RB[18], ST.bilal, '13:00', [{ id: SV_RB.premiumHaircut, name: 'Premium Haircut', price: 800, dur: 30 }, { id: SV_RB.headMassage, name: 'Head Massage', price: 500, dur: 20 }], 'cash', 0],
    [CL_RB[20], ST.usman, '14:30', [{ id: SV_RB.regularHaircut, name: 'Regular Haircut', price: 400, dur: 20 }], 'cash', 0],
    [CL_RB[21], ST.bilal, '15:30', [{ id: SV_RB.mensFacial, name: "Men's Facial", price: 1200, dur: 30 }], 'easypaisa', 0],
  ];

  for (let day = -90; day <= -1; day++) {
    const date = dateOffset(day);
    const dow = new Date(date).getDay();
    if (dow === 0) continue;
    const seed = Math.abs(day * 11 + 5);
    const count = 3 + (seed % 4);
    for (let i = 0; i < count; i++) {
      const pick = rbPool[(seed + i * 3) % rbPool.length];
      const [cId, sId, start, svcs, pay, tip] = pick;
      const endH = parseInt(start.split(':')[0]) + 1;
      const walkin = (seed + i) % 5 === 0;
      addApt(RB_BRANCH, RB_SALON, walkin ? null : cId, sId, date, start, `${endH}:00`, 'done', svcs, walkin, pay, tip);
    }
  }

  // ── Future 3 days ──
  for (let day = 1; day <= 3; day++) {
    const date = dateOffset(day);
    addApt(GL_BRANCH, GL_SALON, CL_GL[2], ST.sadia, date, '11:00', '14:00', 'booked',
      [{ id: SV_GL.highlights, name: 'Highlights / Lowlights', price: 5000, dur: 120 }]);
    addApt(GL_BRANCH, GL_SALON, CL_GL[0], ST.nadia, date, '14:00', '15:00', 'booked',
      [{ id: SV_GL.goldFacial, name: 'Gold Facial', price: 3000, dur: 60 }]);
    addApt(RB_BRANCH, RB_SALON, CL_RB[1], ST.usman, date, '10:00', '10:30', 'booked',
      [{ id: SV_RB.premiumHaircut, name: 'Premium Haircut', price: 800, dur: 30 }]);
    addApt(RB_BRANCH, RB_SALON, CL_RB[4], ST.bilal, date, '14:00', '14:20', 'confirmed',
      [{ id: SV_RB.regularHaircut, name: 'Regular Haircut', price: 400, dur: 20 }]);
  }

  // ── ROYAL BARBERS — Branch 2 (Blue Area) — Today ──
  addApt(RB_BRANCH2, RB_SALON, CL_RB[5], ST.nadeem, td, '09:30', '10:00', 'done',
    [{ id: SV_RB.premiumHaircut, name: 'Premium Haircut', price: 800, dur: 30 }], false, 'cash', 100);
  addApt(RB_BRANCH2, RB_SALON, CL_RB[9], ST.waqar, td, '10:00', '10:20', 'done',
    [{ id: SV_RB.regularHaircut, name: 'Regular Haircut', price: 400, dur: 20 }], false, 'cash');
  addApt(RB_BRANCH2, RB_SALON, null, ST.nadeem, td, '10:30', '10:55', 'done',
    [{ id: SV_RB.hotTowelShave, name: 'Hot Towel Shave', price: 500, dur: 25 }], true, 'cash');
  addApt(RB_BRANCH2, RB_SALON, CL_RB[6], ST.waqar, td, '11:00', '11:45', 'in_progress',
    [{ id: SV_RB.hairColor, name: 'Hair Color', price: 1500, dur: 45 }]);
  addApt(RB_BRANCH2, RB_SALON, CL_RB[7], ST.nadeem, td, '14:00', '14:30', 'confirmed',
    [{ id: SV_RB.premiumHaircut, name: 'Premium Haircut', price: 800, dur: 30 }, { id: SV_RB.beardStyling, name: 'Beard Styling', price: 400, dur: 20 }]);
  addApt(RB_BRANCH2, RB_SALON, CL_RB[8], ST.waqar, td, '15:00', '16:00', 'booked',
    [{ id: SV_RB.hairTreatment, name: 'Hair Treatment', price: 2000, dur: 60 }]);

  // ── ROYAL BARBERS — Branch 2 — Past 90 days ──
  for (let day = -90; day <= -1; day++) {
    const date = dateOffset(day);
    const dow = new Date(date).getDay();
    if (dow === 0) continue;
    const seed = Math.abs(day * 13 + 7);
    addApt(RB_BRANCH2, RB_SALON, CL_RB[seed % 25], ST.nadeem, date, '09:30', '10:00', 'done',
      [{ id: SV_RB.premiumHaircut, name: 'Premium Haircut', price: 800, dur: 30 }], false, 'cash', seed % 3 === 0 ? 50 : 0);
    addApt(RB_BRANCH2, RB_SALON, CL_RB[(seed + 3) % 25], ST.waqar, date, '10:30', '10:50', 'done',
      [{ id: SV_RB.regularHaircut, name: 'Regular Haircut', price: 400, dur: 20 }, { id: SV_RB.beardTrim, name: 'Beard Trim', price: 200, dur: 15 }], false, seed % 4 === 0 ? 'jazzcash' : 'cash');
    if (seed % 2 === 0) {
      addApt(RB_BRANCH2, RB_SALON, CL_RB[(seed + 5) % 25], ST.nadeem, date, '14:00', '14:30', 'done',
        [{ id: SV_RB.mensFacial, name: "Men's Facial", price: 1200, dur: 30 }], false, 'jazzcash');
    }
    if (seed % 3 === 0) {
      addApt(RB_BRANCH2, RB_SALON, CL_RB[(seed + 7) % 25], ST.waqar, date, '15:00', '16:00', 'done',
        [{ id: SV_RB.hairTreatment, name: 'Hair Treatment', price: 2000, dur: 60 }], false, 'card', 100);
    }
  }

  // Add a no-show from 2 days ago
  addApt(GL_BRANCH, GL_SALON, CL_GL[3], ST.sadia, dateOffset(-2), '16:00', '16:30', 'no_show',
    [{ id: SV_GL.basicHaircut, name: 'Basic Haircut', price: 500, dur: 30 }]);
  addApt(RB_BRANCH, RB_SALON, CL_RB[3], ST.bilal, dateOffset(-3), '14:00', '14:45', 'cancelled',
    [{ id: SV_RB.hairColor, name: 'Hair Color', price: 1500, dur: 45 }]);

  return { appointments: apts, appointmentServices: aptSvcs, bills, billItems, tips };
}


function generateAttendance(): Attendance[] {
  const records: Attendance[] = [];
  let c = 0;
  const staffList = [
    { id: ST.fatima, branch: GL_BRANCH, openH: 10 },
    { id: ST.sadia, branch: GL_BRANCH, openH: 10 },
    { id: ST.nadia, branch: GL_BRANCH, openH: 10 },
    { id: ST.rabia, branch: GL_BRANCH, openH: 10 },
    { id: ST.zainab, branch: GL_BRANCH, openH: 10 },
    { id: ST.ahmed, branch: RB_BRANCH, openH: 9 },
    { id: ST.usman, branch: RB_BRANCH, openH: 9 },
    { id: ST.bilal, branch: RB_BRANCH, openH: 9 },
    { id: ST.hamza, branch: RB_BRANCH, openH: 9 },
    { id: ST.nadeem, branch: RB_BRANCH2, openH: 9 },
    { id: ST.waqar, branch: RB_BRANCH2, openH: 9 },
  ];

  for (let day = -30; day <= 0; day++) {
    const date = dateOffset(day);
    const dow = new Date(date).getDay();
    for (const staff of staffList) {
      if (staff.branch === RB_BRANCH && dow === 0) continue; // Closed Sunday
      c++;
      const seed = (Math.abs(day) * 31 + c) % 100;
      let status: AttendanceStatus = 'present';
      let late = 0, ded = 0;
      if (seed < 3) { status = 'absent'; ded = 500; }
      else if (seed < 5) { status = 'leave'; }
      else if (seed < 10) { status = 'late'; late = 10 + (seed % 25); ded = 200; }
      else if (seed < 12) { status = 'half_day'; }

      records.push({
        id: `att-${String(c).padStart(5, '0')}`, staff_id: staff.id, branch_id: staff.branch, date, status,
        check_in: ['absent', 'leave'].includes(status) ? null : `${String(staff.openH).padStart(2, '0')}:${String(late).padStart(2, '0')}`,
        check_out: ['absent', 'leave'].includes(status) ? null : (staff.branch === GL_BRANCH ? '20:00' : '22:00'),
        late_minutes: late, deduction_amount: ded,
        notes: status === 'leave' ? 'Personal leave' : null,
      });
    }
  }
  return records;
}


function generateCashDrawers(): CashDrawer[] {
  const drawers: CashDrawer[] = [];
  let c = 0;
  for (let day = -7; day <= 0; day++) {
    const date = dateOffset(day);
    const dow = new Date(date).getDay();
    // Glamour
    c++;
    drawers.push({
      id: `cd-${String(c).padStart(4, '0')}`, branch_id: GL_BRANCH, date,
      opening_balance: 5000, closing_balance: day < 0 ? 5000 + 8000 - 1500 : null,
      total_cash_sales: day < 0 ? 8000 + (day % 3) * 1000 : 3000,
      total_expenses: day < 0 ? 1500 : 500,
      opened_by: ST.fatima, closed_by: day < 0 ? ST.fatima : null,
      status: day < 0 ? 'closed' : 'open', notes: null,
      created_at: `${date}T10:00:00Z`,
    });
    // Royal (skip Sunday)
    if (dow !== 0) {
      c++;
      drawers.push({
        id: `cd-${String(c).padStart(4, '0')}`, branch_id: RB_BRANCH, date,
        opening_balance: 3000, closing_balance: day < 0 ? 3000 + 5000 - 800 : null,
        total_cash_sales: day < 0 ? 5000 + (day % 2) * 500 : 1650,
        total_expenses: day < 0 ? 800 : 300,
        opened_by: ST.ahmed, closed_by: day < 0 ? ST.ahmed : null,
        status: day < 0 ? 'closed' : 'open', notes: null,
        created_at: `${date}T09:00:00Z`,
      });
      // Royal Branch 2 (Blue Area)
      c++;
      drawers.push({
        id: `cd-${String(c).padStart(4, '0')}`, branch_id: RB_BRANCH2, date,
        opening_balance: 2000, closing_balance: day < 0 ? 2000 + 3500 - 500 : null,
        total_cash_sales: day < 0 ? 3500 + (day % 2) * 300 : 1200,
        total_expenses: day < 0 ? 500 : 200,
        opened_by: ST.nadeem, closed_by: day < 0 ? ST.nadeem : null,
        status: day < 0 ? 'closed' : 'open', notes: null,
        created_at: `${date}T09:00:00Z`,
      });
    }
  }
  return drawers;
}


function generateExpenses(): Expense[] {
  const expenses: Expense[] = [];
  let c = 0;
  const categories = ['Chai/Snacks', 'Cleaning Supplies', 'Transport', 'Utility', 'Miscellaneous'];
  for (let day = -7; day <= 0; day++) {
    const date = dateOffset(day);
    // Glamour — 2-3 expenses per day
    for (let i = 0; i < 2 + (Math.abs(day) % 2); i++) {
      c++;
      expenses.push({
        id: `exp-${String(c).padStart(4, '0')}`, branch_id: GL_BRANCH,
        category: categories[c % categories.length],
        amount: [200, 350, 500, 150, 400][c % 5],
        description: ['Staff chai & biscuits', 'Floor cleaner and towels', 'Careem for delivery', 'Electricity bill share', 'Paper towels and tissue'][c % 5],
        date, created_by: ST.fatima,
        created_at: `${date}T12:00:00Z`,
      });
    }
    // Royal — 1-2 expenses per day
    const dow = new Date(date).getDay();
    if (dow !== 0) {
      for (let i = 0; i < 1 + (Math.abs(day) % 2); i++) {
        c++;
        expenses.push({
          id: `exp-${String(c).padStart(4, '0')}`, branch_id: RB_BRANCH,
          category: categories[c % categories.length],
          amount: [150, 250, 300, 100, 200][c % 5],
          description: ['Chai for staff', 'Blade refills', 'Uber for supply pickup', 'AC maintenance', 'Sanitizer refill'][c % 5],
          date, created_by: ST.ahmed,
          created_at: `${date}T11:00:00Z`,
        });
      }
      // Royal Branch 2 — 1 expense per day
      c++;
      expenses.push({
        id: `exp-${String(c).padStart(4, '0')}`, branch_id: RB_BRANCH2,
        category: categories[c % categories.length],
        amount: [120, 200, 180, 100, 150][c % 5],
        description: ['Chai & snacks', 'Cleaning supplies', 'Towel laundry', 'Water cooler refill', 'Tissue & sanitizer'][c % 5],
        date, created_by: ST.nadeem,
        created_at: `${date}T11:00:00Z`,
      });
    }
  }
  return expenses;
}


function generateStockMovements(): StockMovement[] {
  const moves: StockMovement[] = [];
  let c = 0;
  // Glamour — purchases and backbar use
  const glMoves: Array<[string, string, 'purchase' | 'sale' | 'backbar_use', number, string]> = [
    [PR_GL[0], GL_BRANCH, 'purchase', 10, 'Restocked from Lahore Beauty Wholesale'],
    [PR_GL[1], GL_BRANCH, 'purchase', 5, 'Keune order received'],
    [PR_GL[0], GL_BRANCH, 'backbar_use', -2, 'Used for full color services'],
    [PR_GL[4], GL_BRANCH, 'sale', -1, 'Retail sale to client'],
    [PR_GL[5], GL_BRANCH, 'sale', -2, 'Retail sale'],
    [PR_GL[7], GL_BRANCH, 'backbar_use', -1, 'Deep conditioning treatments'],
    [PR_GL[8], GL_BRANCH, 'backbar_use', -3, 'Waxing services this week'],
    [PR_GL[6], GL_BRANCH, 'sale', -1, 'Client purchased hair serum'],
  ];
  for (const [pId, bId, type, qty, note] of glMoves) {
    c++;
    moves.push({ id: `sm-${String(c).padStart(4, '0')}`, product_id: pId, branch_id: bId, movement_type: type, quantity: qty, reference_id: null, notes: note, created_by: ST.fatima, created_at: `${dateOffset(-c)}T14:00:00Z` });
  }
  // Royal
  const rbMoves: Array<[string, string, 'purchase' | 'sale' | 'backbar_use', number, string]> = [
    [PR_RB[2], RB_BRANCH, 'purchase', 5, 'Restocked hair color'],
    [PR_RB[3], RB_BRANCH, 'purchase', 4, 'Shaving cream restock'],
    [PR_RB[0], RB_BRANCH, 'sale', -2, 'Gatsby wax sold'],
    [PR_RB[2], RB_BRANCH, 'backbar_use', -3, 'Used for hair color services'],
    [PR_RB[3], RB_BRANCH, 'backbar_use', -1, 'Shaving services'],
    [PR_RB[6], RB_BRANCH, 'sale', -1, 'Beard oil sold to client'],
  ];
  for (const [pId, bId, type, qty, note] of rbMoves) {
    c++;
    moves.push({ id: `sm-${String(c).padStart(4, '0')}`, product_id: pId, branch_id: bId, movement_type: type, quantity: qty, reference_id: null, notes: note, created_by: ST.ahmed, created_at: `${dateOffset(-c + 8)}T14:00:00Z` });
  }
  return moves;
}


function generatePurchaseOrders(): PurchaseOrder[] {
  return [
    { id: 'po-0001', supplier_id: 'sup-0001', branch_id: GL_BRANCH, items: [{ product: 'Casting Creme Gloss', qty: 10, price: 450 }, { product: 'Koleston Perfect', qty: 10, price: 650 }], total_amount: 11000, paid_amount: 11000, status: 'paid', notes: 'Monthly color restock', created_at: `${dateOffset(-15)}T10:00:00Z` },
    { id: 'po-0002', supplier_id: 'sup-0002', branch_id: GL_BRANCH, items: [{ product: 'Semi Color', qty: 8, price: 800 }, { product: 'Keratin Shampoo', qty: 6, price: 900 }], total_amount: 11800, paid_amount: 6000, status: 'partial', notes: 'Keune monthly order', created_at: `${dateOffset(-8)}T10:00:00Z` },
    { id: 'po-0003', supplier_id: 'sup-0003', branch_id: GL_BRANCH, items: [{ product: 'Wax Strips', qty: 20, price: 350 }], total_amount: 7000, paid_amount: 7000, status: 'paid', notes: null, created_at: `${dateOffset(-20)}T10:00:00Z` },
    { id: 'po-0004', supplier_id: 'sup-0004', branch_id: RB_BRANCH, items: [{ product: 'Just For Men Color', qty: 10, price: 550 }, { product: 'Shaving Cream', qty: 8, price: 280 }], total_amount: 7740, paid_amount: 7740, status: 'paid', notes: 'Monthly restock', created_at: `${dateOffset(-12)}T10:00:00Z` },
    { id: 'po-0005', supplier_id: 'sup-0005', branch_id: RB_BRANCH, items: [{ product: 'Hair Wax', qty: 10, price: 300 }, { product: 'After Shave', qty: 6, price: 350 }], total_amount: 5100, paid_amount: 0, status: 'pending', notes: 'Awaiting delivery', created_at: `${dateOffset(-3)}T10:00:00Z` },
  ];
}


const allAdvances: Advance[] = [
  { id: 'adv-0001', staff_id: ST.rabia, amount: 3000, date: dateOffset(-15), reason: 'Family emergency', is_deducted: true, approved_by: ST.fatima, created_at: `${dateOffset(-15)}T12:00:00Z` },
  { id: 'adv-0002', staff_id: ST.nadia, amount: 5000, date: dateOffset(-8), reason: 'Eid shopping', is_deducted: false, approved_by: ST.fatima, created_at: `${dateOffset(-8)}T12:00:00Z` },
  { id: 'adv-0003', staff_id: ST.bilal, amount: 2000, date: dateOffset(-10), reason: 'Personal need', is_deducted: true, approved_by: ST.ahmed, created_at: `${dateOffset(-10)}T12:00:00Z` },
  { id: 'adv-0004', staff_id: ST.hamza, amount: 1500, date: dateOffset(-5), reason: 'Medical expense', is_deducted: false, approved_by: ST.ahmed, created_at: `${dateOffset(-5)}T12:00:00Z` },
];


const allUdhaarPayments: UdhaarPayment[] = [
  { id: 'up-0001', client_id: CL_GL[3], amount: 1000, payment_method: 'cash', notes: 'Partial udhaar payment', recorded_by: ST.zainab, created_at: `${dateOffset(-5)}T15:00:00Z` },
  { id: 'up-0002', client_id: CL_GL[7], amount: 2000, payment_method: 'jazzcash', notes: 'Udhaar settlement', recorded_by: ST.zainab, created_at: `${dateOffset(-3)}T16:00:00Z` },
  { id: 'up-0003', client_id: CL_RB[3], amount: 500, payment_method: 'cash', notes: null, recorded_by: ST.ahmed, created_at: `${dateOffset(-4)}T11:00:00Z` },
  { id: 'up-0004', client_id: CL_RB[8], amount: 800, payment_method: 'easypaisa', notes: 'Paid via EasyPaisa', recorded_by: ST.ahmed, created_at: `${dateOffset(-2)}T14:00:00Z` },
];


// ═══════════════════════════════════════
// DATA STORE — lazily initialized
// ═══════════════════════════════════════

let _store: Map<string, any[]> | null = null;

function getStore(): Map<string, any[]> {
  if (!_store) {
    _store = new Map();
    const allStaff: Staff[] = [
      DEMO_STAFF_OWNER, DEMO_STAFF_STYLIST, DEMO_STAFF_RECEPTIONIST,
      ...glamourExtraStaff,
      DEMO_GENTS_OWNER, DEMO_GENTS_BARBER_SENIOR, DEMO_GENTS_BARBER_JUNIOR, DEMO_GENTS_HELPER,
      DEMO_GENTS_BRANCH2_SENIOR, DEMO_GENTS_BRANCH2_JUNIOR,
    ];
    const tx = generateTransactions();

    _store.set('salons', [...DEMO_ALL_SALONS]);
    _store.set('branches', [DEMO_BRANCH, DEMO_BRANCH_GENTS, DEMO_BRANCH_GENTS_2]);
    _store.set('salon_partners', [DEMO_PARTNER_ROYAL]);
    _store.set('staff', allStaff);
    _store.set('services', [...glamourServices, ...royalServices]);
    _store.set('clients', [...glamourClients, ...royalClients]);
    _store.set('products', [...glamourProducts, ...royalProducts]);
    _store.set('appointments', tx.appointments);
    _store.set('appointment_services', tx.appointmentServices);
    _store.set('bills', tx.bills);
    _store.set('bill_items', tx.billItems);
    _store.set('tips', tx.tips);
    _store.set('attendance', generateAttendance());
    _store.set('advances', [...allAdvances]);
    _store.set('suppliers', [...allSuppliers]);
    _store.set('purchase_orders', generatePurchaseOrders());
    _store.set('stock_movements', generateStockMovements());
    _store.set('packages', [...allPackages]);
    _store.set('client_packages', [...allClientPackages]);
    _store.set('promo_codes', [...allPromoCodes]);
    _store.set('loyalty_rules', [...allLoyaltyRules]);
    _store.set('cash_drawers', generateCashDrawers());
    _store.set('expenses', generateExpenses());
    _store.set('udhaar_payments', [...allUdhaarPayments]);
    _store.set('service_staff_pricing', [...allServiceStaffPricing]);
    _store.set('product_service_links', [...allProductServiceLinks]);
  }
  return _store;
}

function getTableData(table: string): any[] {
  return [...(getStore().get(table) || [])];
}

function addToStore(table: string, items: any[]) {
  const existing = getStore().get(table) || [];
  existing.push(...items);
  getStore().set(table, existing);
}

function updateInStore(table: string, id: string, updates: any) {
  const data = getStore().get(table) || [];
  const idx = data.findIndex((r: any) => r.id === id);
  if (idx >= 0) {
    data[idx] = { ...data[idx], ...updates };
  }
}


// ═══════════════════════════════════════
// QUERY RESOLUTION
// ═══════════════════════════════════════

const TABLE_SINGULAR: Record<string, string> = {
  salons: 'salon', branches: 'branch', staff: 'staff', services: 'service',
  clients: 'client', appointments: 'appointment', appointment_services: 'appointment_service',
  bills: 'bill', bill_items: 'bill_item', products: 'product', packages: 'package',
  suppliers: 'supplier', purchase_orders: 'purchase_order', cash_drawers: 'cash_drawer',
  expenses: 'expense', attendance: 'attendance', tips: 'tip', advances: 'advance',
  salon_partners: 'salon_partner',
};

function parseRelations(selectStr: string): Array<{ alias: string; table: string; fields: string }> {
  const rels: Array<{ alias: string; table: string; fields: string }> = [];
  const re = /(\w+):(\w+)\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(selectStr)) !== null) {
    rels.push({ alias: m[1], table: m[2], fields: m[3] });
  }
  return rels;
}

function pickFields(obj: any, fields: string): any {
  if (fields === '*') return { ...obj };
  const out: any = {};
  for (const f of fields.split(',').map(s => s.trim())) {
    out[f] = obj[f];
  }
  return out;
}

function applyJoins(data: any[], selectStr: string, mainTable: string): any[] {
  const rels = parseRelations(selectStr);
  if (rels.length === 0) return data;

  return data.map(row => {
    const joined = { ...row };
    for (const rel of rels) {
      const relData = getTableData(rel.table);
      const fkCol = `${rel.alias}_id`;

      if (row[fkCol] !== undefined && row[fkCol] !== null) {
        const match = relData.find((r: any) => r.id === row[fkCol]);
        joined[rel.alias] = match ? pickFields(match, rel.fields) : null;
      } else if (row[fkCol] === null) {
        joined[rel.alias] = null;
      } else {
        const mainSing = TABLE_SINGULAR[mainTable] || mainTable.replace(/s$/, '');
        const revFk = `${mainSing}_id`;
        const matches = relData.filter((r: any) => r[revFk] === row.id);
        joined[rel.alias] = matches.map((m: any) => pickFields(m, rel.fields));
      }
    }
    return joined;
  });
}

function applyFilter(data: any[], type: string, col: string, val: any, op?: string): any[] {
  return data.filter(row => {
    const v = row[col];
    switch (type) {
      case 'eq': return v === val;
      case 'neq': return v !== val;
      case 'gt': return v > val;
      case 'gte': return v >= val;
      case 'lt': return v < val;
      case 'lte': return v <= val;
      case 'in': return Array.isArray(val) && val.includes(v);
      case 'not':
        if (op === 'is' && val === null) return v != null;
        return true;
      default: return true;
    }
  });
}

const ALLOWED_FILTER_COLUMNS = new Set([
  'name', 'phone', 'email', 'status', 'role', 'type', 'category',
  'salon_id', 'branch_id', 'staff_id', 'client_id', 'id',
]);

function applyOrFilter(data: any[], orStr: string): any[] {
  const conditions = orStr.split(',');
  return data.filter(row =>
    conditions.some(cond => {
      const parts = cond.split('.');
      const col = parts[0];
      const op = parts[1];
      const val = parts.slice(2).join('.');
      if (!ALLOWED_FILTER_COLUMNS.has(col)) return false;
      if (op === 'ilike') {
        const pattern = val.replace(/%/g, '').toLowerCase();
        return String(row[col] || '').toLowerCase().includes(pattern);
      }
      if (op === 'eq') return String(row[col]) === val;
      return false;
    }),
  );
}


// ═══════════════════════════════════════
// RPC HANDLERS
// ═══════════════════════════════════════

function computeDailySummary(branchId: string, date: string): DailySummary {
  const bills = getTableData('bills').filter((b: any) =>
    b.branch_id === branchId && b.status === 'paid' && b.created_at?.startsWith(date),
  );
  const byMethod = (m: string) => bills.filter((b: any) => b.payment_method === m).reduce((s: number, b: any) => s + b.total_amount, 0);

  const billIds = new Set(bills.map((b: any) => b.id));
  const items = getTableData('bill_items').filter((i: any) => billIds.has(i.bill_id) && i.item_type === 'service');
  const svcMap = new Map<string, { count: number; revenue: number }>();
  for (const it of items) {
    const e = svcMap.get(it.name) || { count: 0, revenue: 0 };
    e.count += it.quantity; e.revenue += it.total_price;
    svcMap.set(it.name, e);
  }

  const staffMap = new Map<string, { services_done: number; revenue: number }>();
  const allStaff = getTableData('staff');
  for (const bill of bills) {
    if (!bill.staff_id) continue;
    const st = allStaff.find((s: any) => s.id === bill.staff_id);
    const name = st?.name || 'Unknown';
    const e = staffMap.get(name) || { services_done: 0, revenue: 0 };
    e.services_done += 1; e.revenue += bill.total_amount;
    staffMap.set(name, e);
  }

  return {
    total_revenue: bills.reduce((s: number, b: any) => s + b.total_amount, 0),
    total_bills: bills.length,
    cash_amount: byMethod('cash'),
    jazzcash_amount: byMethod('jazzcash'),
    easypaisa_amount: byMethod('easypaisa'),
    card_amount: byMethod('card'),
    bank_transfer_amount: byMethod('bank_transfer'),
    udhaar_amount: byMethod('udhaar'),
    top_services: Array.from(svcMap.entries()).map(([name, s]) => ({ name, ...s })).sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    staff_performance: Array.from(staffMap.entries()).map(([name, s]) => ({ name, ...s })).sort((a, b) => b.revenue - a.revenue),
  };
}

function computeStaffCommission(staffId: string, month: number, year: number): StaffMonthlyCommission {
  const staff = getTableData('staff').find((s: any) => s.id === staffId);
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const bills = getTableData('bills').filter((b: any) => b.staff_id === staffId && b.status === 'paid' && b.created_at?.startsWith(prefix));
  const totalRev = bills.reduce((s: number, b: any) => s + b.total_amount, 0);
  const commRate = staff?.commission_rate || 0;
  const commEarned = staff?.commission_type === 'percentage' ? totalRev * commRate / 100 : bills.length * commRate;
  const tipsTotal = getTableData('tips').filter((t: any) => t.staff_id === staffId && t.date?.startsWith(prefix)).reduce((s: number, t: any) => s + t.amount, 0);
  const advTotal = getTableData('advances').filter((a: any) => a.staff_id === staffId && a.date?.startsWith(prefix)).reduce((s: number, a: any) => s + a.amount, 0);
  const lateDeductions = getTableData('attendance').filter((a: any) => a.staff_id === staffId && a.date?.startsWith(prefix)).reduce((s: number, a: any) => s + a.deduction_amount, 0);
  const baseSalary = staff?.base_salary || 0;

  return {
    services_count: bills.length,
    total_revenue: totalRev,
    commission_earned: commEarned,
    tips_total: tipsTotal,
    advances_total: advTotal,
    late_deductions: lateDeductions,
    net_payable: baseSalary + commEarned + tipsTotal - advTotal - lateDeductions,
  };
}

function computeUdhaarReport(salonId: string): UdhaarReportItem[] {
  return getTableData('clients')
    .filter((c: any) => c.salon_id === salonId && c.udhaar_balance > 0)
    .map((c: any) => ({
      id: c.id, client_name: c.name, phone: c.phone, udhaar_balance: c.udhaar_balance,
      last_visit: dateOffset(-3), days_since_visit: 3,
    }));
}

function computeClientStats(clientId: string): ClientStats {
  const client = getTableData('clients').find((c: any) => c.id === clientId);
  if (!client) return { total_visits: 0, total_spent: 0, loyalty_points: 0, favourite_service: null, favourite_stylist: null, last_visit_date: null };

  const bills = getTableData('bills').filter((b: any) => b.client_id === clientId && b.status === 'paid');
  const items = getTableData('bill_items').filter((i: any) => bills.some((b: any) => b.id === i.bill_id) && i.item_type === 'service');
  const svcCounts = new Map<string, number>();
  for (const it of items) { svcCounts.set(it.name, (svcCounts.get(it.name) || 0) + 1); }
  const staffCounts = new Map<string, number>();
  const allStaff = getTableData('staff');
  for (const b of bills) {
    const st = allStaff.find((s: any) => s.id === b.staff_id);
    if (st) staffCounts.set(st.name, (staffCounts.get(st.name) || 0) + 1);
  }

  return {
    total_visits: client.total_visits,
    total_spent: client.total_spent,
    loyalty_points: client.loyalty_points,
    favourite_service: svcCounts.size > 0 ? [...svcCounts.entries()].sort((a, b) => b[1] - a[1])[0][0] : null,
    favourite_stylist: staffCounts.size > 0 ? [...staffCounts.entries()].sort((a, b) => b[1] - a[1])[0][0] : null,
    last_visit_date: bills.length > 0 ? bills.sort((a: any, b: any) => b.created_at.localeCompare(a.created_at))[0].created_at.split('T')[0] : null,
  };
}

function computeSalonDailySummary(salonId: string, date: string): DailySummary {
  const branches = getTableData('branches').filter((b: any) => b.salon_id === salonId);
  const branchIds = branches.map((b: any) => b.id);
  const bills = getTableData('bills').filter((b: any) =>
    branchIds.includes(b.branch_id) && b.status === 'paid' && b.created_at?.startsWith(date),
  );
  const byMethod = (m: string) => bills.filter((b: any) => b.payment_method === m).reduce((s: number, b: any) => s + b.total_amount, 0);

  const billIds = new Set(bills.map((b: any) => b.id));
  const items = getTableData('bill_items').filter((i: any) => billIds.has(i.bill_id) && i.item_type === 'service');
  const svcMap = new Map<string, { count: number; revenue: number }>();
  for (const it of items) {
    const e = svcMap.get(it.name) || { count: 0, revenue: 0 };
    e.count += it.quantity; e.revenue += it.total_price;
    svcMap.set(it.name, e);
  }
  const staffPerfMap = new Map<string, { services_done: number; revenue: number }>();
  const allStaff = getTableData('staff');
  for (const bill of bills) {
    if (!bill.staff_id) continue;
    const st = allStaff.find((s: any) => s.id === bill.staff_id);
    const name = st?.name || 'Unknown';
    const e = staffPerfMap.get(name) || { services_done: 0, revenue: 0 };
    e.services_done += 1; e.revenue += bill.total_amount;
    staffPerfMap.set(name, e);
  }

  return {
    total_revenue: bills.reduce((s: number, b: any) => s + b.total_amount, 0),
    total_bills: bills.length,
    cash_amount: byMethod('cash'),
    jazzcash_amount: byMethod('jazzcash'),
    easypaisa_amount: byMethod('easypaisa'),
    card_amount: byMethod('card'),
    bank_transfer_amount: byMethod('bank_transfer'),
    udhaar_amount: byMethod('udhaar'),
    top_services: Array.from(svcMap.entries()).map(([name, s]) => ({ name, ...s })).sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    staff_performance: Array.from(staffPerfMap.entries()).map(([name, s]) => ({ name, ...s })).sort((a, b) => b.revenue - a.revenue),
  };
}

function handleRpc(name: string, params: any): any {
  switch (name) {
    case 'get_daily_summary': return computeDailySummary(params.p_branch_id, params.p_date);
    case 'get_salon_daily_summary': return computeSalonDailySummary(params.p_salon_id, params.p_date);
    case 'get_staff_monthly_commission': return computeStaffCommission(params.p_staff_id, params.p_month, params.p_year);
    case 'get_udhaar_report': return computeUdhaarReport(params.p_salon_id);
    case 'get_client_stats': return computeClientStats(params.p_client_id);
    default: return null;
  }
}


// ═══════════════════════════════════════
// DEMO SUPABASE CLIENT
// ═══════════════════════════════════════

class DemoQueryBuilder {
  private _table: string;
  private _selectStr = '*';
  private _selectOpts: any = null;
  private _filters: Array<{ type: string; col: string; val: any; op?: string }> = [];
  private _orders: Array<{ col: string; ascending: boolean }> = [];
  private _isSingle = false;
  private _limit: number | null = null;
  private _insertData: any = null;
  private _updateData: any = null;
  private _upsertData: any = null;
  private _upsertOpts: any = null;
  private _isDelete = false;
  private _orFilter: string | null = null;

  constructor(table: string) { this._table = table; }

  select(cols?: string, opts?: any) { if (cols) this._selectStr = cols; if (opts) this._selectOpts = opts; return this; }
  eq(col: string, val: any) { this._filters.push({ type: 'eq', col, val }); return this; }
  neq(col: string, val: any) { this._filters.push({ type: 'neq', col, val }); return this; }
  gt(col: string, val: any) { this._filters.push({ type: 'gt', col, val }); return this; }
  gte(col: string, val: any) { this._filters.push({ type: 'gte', col, val }); return this; }
  lt(col: string, val: any) { this._filters.push({ type: 'lt', col, val }); return this; }
  lte(col: string, val: any) { this._filters.push({ type: 'lte', col, val }); return this; }
  in(col: string, vals: any[]) { this._filters.push({ type: 'in', col, val: vals }); return this; }
  not(col: string, op: string, val: any) { this._filters.push({ type: 'not', col, val, op }); return this; }
  or(filterStr: string) { this._orFilter = filterStr; return this; }
  order(col: string, opts?: { ascending?: boolean }) { this._orders.push({ col, ascending: opts?.ascending !== false }); return this; }
  single() { this._isSingle = true; return this; }
  limit(n: number) { this._limit = n; return this; }
  insert(data: any) { this._insertData = data; return this; }
  update(data: any) { this._updateData = data; return this; }
  upsert(data: any, opts?: any) { this._upsertData = data; this._upsertOpts = opts; return this; }
  delete() { this._isDelete = true; return this; }

  then(onfulfilled?: any, onrejected?: any) {
    return Promise.resolve(this._resolve()).then(onfulfilled, onrejected);
  }

  private _resolve(): { data: any; error: any; count?: number } {
    // Count query
    if (this._selectOpts?.count === 'exact' && this._selectOpts?.head) {
      let data = getTableData(this._table);
      for (const f of this._filters) data = applyFilter(data, f.type, f.col, f.val, f.op);
      return { data: null, error: null, count: data.length };
    }

    // INSERT
    if (this._insertData !== null) {
      const items = Array.isArray(this._insertData) ? this._insertData : [this._insertData];
      const inserted = items.map(item => ({
        id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        created_at: new Date().toISOString(),
        ...item,
      }));
      addToStore(this._table, inserted);
      const result = this._isSingle ? inserted[0] : inserted;
      return { data: result, error: null };
    }

    // UPDATE
    if (this._updateData !== null) {
      let data = getTableData(this._table);
      for (const f of this._filters) data = applyFilter(data, f.type, f.col, f.val, f.op);
      for (const row of data) updateInStore(this._table, row.id, this._updateData);
      const updated = data.map(row => ({ ...row, ...this._updateData }));
      return { data: this._isSingle ? updated[0] || null : updated, error: null };
    }

    // UPSERT
    if (this._upsertData !== null) {
      const item = this._upsertData;
      const existing = getTableData(this._table);
      const conflictCols = this._upsertOpts?.onConflict?.split(',').map((s: string) => s.trim()) || ['id'];
      const match = existing.find((row: any) => conflictCols.every((col: string) => row[col] === item[col]));
      if (match) {
        updateInStore(this._table, match.id, item);
        const updated = { ...match, ...item };
        return { data: this._isSingle ? updated : [updated], error: null };
      }
      const inserted = { id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, created_at: new Date().toISOString(), ...item };
      addToStore(this._table, [inserted]);
      return { data: this._isSingle ? inserted : [inserted], error: null };
    }

    // DELETE
    if (this._isDelete) {
      return { data: null, error: null };
    }

    // SELECT
    let data = getTableData(this._table);
    for (const f of this._filters) data = applyFilter(data, f.type, f.col, f.val, f.op);
    if (this._orFilter) data = applyOrFilter(data, this._orFilter);

    // Joins
    if (this._selectStr.includes(':')) {
      data = applyJoins(data, this._selectStr, this._table);
    }

    // Order
    for (const ord of [...this._orders].reverse()) {
      data.sort((a: any, b: any) => {
        const va = a[ord.col], vb = b[ord.col];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        if (typeof va === 'boolean') return ord.ascending ? (va === vb ? 0 : va ? -1 : 1) : (va === vb ? 0 : va ? 1 : -1);
        return ord.ascending ? (va > vb ? 1 : va < vb ? -1 : 0) : (va < vb ? 1 : va > vb ? -1 : 0);
      });
    }

    if (this._limit) data = data.slice(0, this._limit);

    if (this._isSingle) {
      return { data: data[0] || null, error: data.length === 0 ? { message: 'Not found', code: 'PGRST116' } : null };
    }
    return { data, error: null };
  }
}


class DemoRpcBuilder {
  private _result: any;
  constructor(name: string, params: any) {
    this._result = handleRpc(name, params);
  }
  then(onfulfilled?: any, onrejected?: any) {
    return Promise.resolve({ data: this._result, error: null }).then(onfulfilled, onrejected);
  }
}


// ═══════════════════════════════════════
// PUBLIC EXPORT: createDemoClient()
// ═══════════════════════════════════════

export function createDemoClient() {
  return {
    from(table: string) {
      return new DemoQueryBuilder(table);
    },
    rpc(name: string, params?: any) {
      return new DemoRpcBuilder(name, params || {});
    },
    channel(_name: string) {
      const ch: any = {
        on: () => ch,
        subscribe: () => ch,
        unsubscribe: () => {},
      };
      return ch;
    },
    removeChannel() {},
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  };
}
