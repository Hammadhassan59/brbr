import { z } from 'zod';

// ═══════════════════════════════════════
// Mass-assignment allow-lists for server-action updates.
//
// Background: server actions use the Supabase service-role client which
// bypasses RLS. A `data: Record<string, unknown>` spread into `.update()`
// lets a motivated client set columns it should never touch (salon_id,
// owner_id, subscription_*, udhaar_balance, auth_user_id, etc.). Each schema
// below is the FULL LIST of editable columns for that table via THAT action;
// anything outside the list is stripped by `.strip()` before the DB write.
// ═══════════════════════════════════════

// Staff
// Actual schema (migrations 001 + 009 + 010 + 022): name, phone, email, role,
// photo_url, pin_code, base_salary, commission_type, commission_rate,
// join_date, is_active, branch_id, + auth_user_id (NEVER writable via this
// path). Task spec asked for first_name/last_name/notes/color — those don't
// exist in the schema, so we map to the real columns instead.
export const staffUpdateSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1).optional(),
    email: z.string().trim().email().optional().or(z.literal('').transform(() => undefined)),
    role: z
      .enum(['owner', 'manager', 'receptionist', 'senior_stylist', 'junior_stylist', 'helper'])
      .optional(),
    branch_id: z.string().uuid().optional(),
    base_salary: z.number().nonnegative().optional(),
    commission_type: z.enum(['percentage', 'flat']).optional(),
    commission_rate: z.number().nonnegative().optional(),
    join_date: z.string().optional(),
    is_active: z.boolean().optional(),
    pin_code: z.string().optional().nullable(),
    photo_url: z.string().optional().nullable(),
  })
  .strip();
export type StaffUpdate = z.infer<typeof staffUpdateSchema>;

// Clients
// Actual columns: name, phone, whatsapp, gender, is_vip, is_blacklisted,
// notes, hair_notes, allergy_notes, udhaar_limit. udhaar_balance is
// DELIBERATELY excluded — it's derived from bills/payments, not user-editable.
// The task spec also listed full_name/email/dob/address/preferences/
// birthday_month — none of those columns exist in the schema, so they're
// omitted.
export const clientUpdateSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    phone: z.string().optional().nullable(),
    whatsapp: z.string().optional().nullable(),
    gender: z.enum(['male', 'female', 'other']).optional().nullable(),
    notes: z.string().optional().nullable(),
    hair_notes: z.string().optional().nullable(),
    allergy_notes: z.string().optional().nullable(),
    is_vip: z.boolean().optional(),
    is_blacklisted: z.boolean().optional(),
    udhaar_limit: z.number().nonnegative().optional(),
  })
  .strip();
export type ClientUpdate = z.infer<typeof clientUpdateSchema>;

// Products
// Actual columns: name, brand, category, unit, content_per_unit,
// content_unit, inventory_type, purchase_price, retail_price, current_stock,
// low_stock_threshold, is_active. No sku/reorder_level/notes in schema.
export const productUpdateSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    brand: z.string().optional().nullable(),
    category: z.string().optional().nullable(),
    unit: z.string().optional(),
    content_per_unit: z.number().positive().optional(),
    content_unit: z.string().optional().nullable(),
    inventory_type: z.enum(['backbar', 'retail']).optional(),
    purchase_price: z.number().nonnegative().optional(),
    retail_price: z.number().nonnegative().optional(),
    current_stock: z.number().optional(),
    low_stock_threshold: z.number().nonnegative().optional(),
    is_active: z.boolean().optional(),
  })
  .strip();
export type ProductUpdate = z.infer<typeof productUpdateSchema>;

// Suppliers
export const supplierUpdateSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    phone: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
  })
  .strip();
export type SupplierUpdate = z.infer<typeof supplierUpdateSchema>;

// Packages
export const packageUpdateSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    description: z.string().optional().nullable(),
    price: z.number().nonnegative().optional(),
    validity_days: z.number().int().positive().optional(),
    is_active: z.boolean().optional(),
    services: z.unknown().optional(),
  })
  .strip();
export type PackageUpdate = z.infer<typeof packageUpdateSchema>;

// Promo codes
export const promoUpdateSchema = z
  .object({
    code: z.string().trim().min(1).optional(),
    discount_type: z.enum(['flat', 'percentage']).optional(),
    discount_value: z.number().nonnegative().optional(),
    min_bill_amount: z.number().nonnegative().optional(),
    max_uses: z.number().int().positive().nullable().optional(),
    expiry_date: z.string().nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .strip();
export type PromoUpdate = z.infer<typeof promoUpdateSchema>;

// Salon
// Actual editable columns (from migrations 001 + 003 + 009 + others): name,
// type, city, address, phone, whatsapp, prayer_block_enabled, logo_url,
// gst_enabled, gst_number, gst_rate, privacy_mode, jazzcash_number,
// easypaisa_number, bank_name, bank_account, bank_title,
// onboarding_dismissed, language.
// Task spec also mentioned timezone/currency/default_branch_id — those
// columns don't exist in the schema, so omitted.
// NEVER allowed: id, owner_id, setup_complete, created_at, slug,
// subscription_*, admin_notes, sold_by_agent_id.
export const salonUpdateSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    type: z.enum(['gents', 'ladies', 'unisex']).optional(),
    city: z.string().optional().nullable(),
    address: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    whatsapp: z.string().optional().nullable(),
    prayer_block_enabled: z.boolean().optional(),
    logo_url: z.string().optional().nullable(),
    gst_enabled: z.boolean().optional(),
    gst_number: z.string().optional().nullable(),
    gst_rate: z.number().nonnegative().max(100).optional(),
    privacy_mode: z.boolean().optional(),
    jazzcash_number: z.string().optional().nullable(),
    easypaisa_number: z.string().optional().nullable(),
    bank_name: z.string().optional().nullable(),
    bank_account: z.string().optional().nullable(),
    bank_title: z.string().optional().nullable(),
    onboarding_dismissed: z.boolean().optional(),
    language: z.enum(['en', 'ur']).optional(),
  })
  .strip();
export type SalonUpdate = z.infer<typeof salonUpdateSchema>;
