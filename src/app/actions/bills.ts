'use server';

import { checkWriteAccess, verifySession } from './auth';
import { createServerClient } from '@/lib/supabase';
import {
  assertBillOwned,
  assertBranchMembership,
  assertBranchOwned,
  assertStaffOwned,
  tenantErrorMessage,
} from '@/lib/tenant-guard';

/**
 * Generate bill number server-side at insert time to avoid race conditions.
 * Uses service_role client (bypasses RLS) and retries on collision.
 */
async function generateBillNumber(supabase: ReturnType<typeof createServerClient>, salonId: string): Promise<string> {
  const todayISO = new Date().toISOString().slice(0, 10);
  const prefix = `BB-${todayISO.replace(/-/g, '')}-`;

  const { data } = await supabase
    .from('bills')
    .select('bill_number')
    .eq('salon_id', salonId)
    .like('bill_number', `${prefix}%`)
    .order('bill_number', { ascending: false })
    .limit(1);

  let nextSeq = 1;
  if (data && data.length > 0) {
    const lastSeq = parseInt(data[0].bill_number.replace(prefix, ''), 10);
    if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
  }

  return `${prefix}${String(nextSeq).padStart(3, '0')}`;
}

export async function createBill(data: {
  branchId: string;
  appointmentId?: string | null;
  clientId?: string | null;
  staffId?: string | null;
  subtotal: number;
  discountAmount?: number;
  discountType?: string | null;
  taxAmount?: number;
  tipAmount?: number;
  totalAmount: number;
  paidAmount?: number;
  paymentMethod: string;
  paymentDetails?: unknown;
  udhaarAdded?: number;
  loyaltyPointsUsed?: number;
  loyaltyPointsEarned?: number;
  promoCode?: string | null;
}) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { data: null, error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  // Session must be allowed to operate on the target branch.
  try {
    await assertBranchOwned(data.branchId, session.salonId);
    assertBranchMembership(session, data.branchId);
  } catch (e) {
    return { data: null, error: tenantErrorMessage(e) };
  }

  // Client (if any) must live in this branch.
  if (data.clientId) {
    const { data: client } = await supabase
      .from('clients')
      .select('id, salon_id, branch_id')
      .eq('id', data.clientId)
      .maybeSingle();
    if (!client) return { data: null, error: 'Invalid client' };
    const c = client as { salon_id: string; branch_id: string | null };
    if (c.salon_id !== session.salonId) return { data: null, error: 'Not allowed' };
    if (c.branch_id && c.branch_id !== data.branchId) {
      return { data: null, error: 'Client belongs to a different branch' };
    }
  }

  // Staff (if any) must be in this branch — either via primary_branch_id or
  // staff_branches. Receptionist ringing up on multi-branch gets both paths.
  if (data.staffId) {
    const { data: staff } = await supabase
      .from('staff')
      .select('id, salon_id, primary_branch_id')
      .eq('id', data.staffId)
      .maybeSingle();
    if (!staff) return { data: null, error: 'Invalid staff' };
    const s = staff as { salon_id: string; primary_branch_id: string | null };
    if (s.salon_id !== session.salonId) return { data: null, error: 'Not allowed' };
    if (s.primary_branch_id !== data.branchId) {
      // Fall back to staff_branches membership check.
      const { data: link } = await supabase
        .from('staff_branches')
        .select('id')
        .eq('staff_id', data.staffId)
        .eq('branch_id', data.branchId)
        .maybeSingle();
      if (!link) return { data: null, error: 'Staff not assigned to this branch' };
    }
  }

  // Retry up to 3 times on bill_number collision
  for (let attempt = 0; attempt < 3; attempt++) {
    const billNumber = await generateBillNumber(supabase, session.salonId);

    const { data: result, error } = await supabase
      .from('bills')
      .insert({
        salon_id: session.salonId,
        branch_id: data.branchId,
        bill_number: billNumber,
        appointment_id: data.appointmentId || null,
        client_id: data.clientId || null,
        staff_id: data.staffId || null,
        subtotal: data.subtotal,
        discount_amount: data.discountAmount || 0,
        discount_type: data.discountType || null,
        tax_amount: data.taxAmount || 0,
        tip_amount: data.tipAmount || 0,
        total_amount: data.totalAmount,
        paid_amount: data.paidAmount || data.totalAmount,
        payment_method: data.paymentMethod,
        payment_details: data.paymentDetails || null,
        udhaar_added: data.udhaarAdded || 0,
        loyalty_points_used: data.loyaltyPointsUsed || 0,
        loyalty_points_earned: data.loyaltyPointsEarned || 0,
        promo_code: data.promoCode || null,
        status: 'paid',
      })
      .select()
      .single();

    if (!error) return { data: result, error: null };

    // If it's a unique constraint violation, retry with a fresh number
    if (error.code === '23505' && error.message.includes('bill_number')) continue;

    return { data: null, error: error.message };
  }

  return { data: null, error: 'Failed to generate unique bill number after 3 attempts' };
}

export async function createBillItems(billId: string, items: Array<{
  type: string;
  serviceId?: string | null;
  productId?: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}>) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  // bill_items has no salon_id — verify the parent bill is ours first.
  let billMeta: { branch_id: string | null; salon_id: string };
  try {
    billMeta = await assertBillOwned(billId, session.salonId);
  } catch (e) {
    return { error: tenantErrorMessage(e) };
  }

  // Every service_id referenced on the items must belong to the bill's branch
  // — otherwise a caller could attach a service from branch B to a bill on
  // branch A and corrupt per-branch reports.
  const serviceIds = Array.from(new Set(
    items.map((i) => i.serviceId).filter((x): x is string => !!x),
  ));
  if (serviceIds.length > 0 && billMeta.branch_id) {
    const { data: svc, error: svcErr } = await supabase
      .from('services')
      .select('id, salon_id, branch_id')
      .in('id', serviceIds);
    if (svcErr) return { error: svcErr.message };
    for (const s of (svc ?? []) as Array<{ id: string; salon_id: string; branch_id: string | null }>) {
      if (s.salon_id !== session.salonId) return { error: 'Not allowed' };
      if (s.branch_id && s.branch_id !== billMeta.branch_id) {
        return { error: 'Service belongs to a different branch' };
      }
    }
    if ((svc ?? []).length !== serviceIds.length) return { error: 'Invalid service' };
  }

  const { error } = await supabase
    .from('bill_items')
    .insert(items.map(i => ({
      bill_id: billId,
      item_type: i.type,
      service_id: i.serviceId || null,
      product_id: i.productId || null,
      name: i.name,
      quantity: i.quantity,
      unit_price: i.unitPrice,
      total_price: i.totalPrice,
    })));

  if (error) return { error: error.message };
  return { error: null };
}

export async function recordTip(staffId: string, billId: string, amount: number) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  // Both records must belong to this salon — tips has no salon_id column.
  let staff: { id: string; salon_id: string; branch_id: string | null };
  let bill: { branch_id: string | null; salon_id: string };
  try {
    staff = await assertStaffOwned(staffId, session.salonId);
    bill = await assertBillOwned(billId, session.salonId);
  } catch (e) {
    return { error: tenantErrorMessage(e) };
  }

  // After migration 036 the staff row has `primary_branch_id`, but
  // assertStaffOwned selects `branch_id` for back-compat and returns whatever
  // the DB column name was at query time. If the staff's primary branch
  // doesn't match, consult staff_branches so multi-branch stylists can still
  // receive tips at a secondary branch.
  if (bill.branch_id && staff.branch_id && staff.branch_id !== bill.branch_id) {
    const { data: link } = await supabase
      .from('staff_branches')
      .select('id')
      .eq('staff_id', staffId)
      .eq('branch_id', bill.branch_id)
      .maybeSingle();
    if (!link) {
      return { error: 'Staff member is not assigned to the branch this bill belongs to' };
    }
  }

  const { error } = await supabase
    .from('tips')
    .insert({ staff_id: staffId, bill_id: billId, amount });

  if (error) return { error: error.message };
  return { error: null };
}

export async function updateCashDrawer(branchId: string, cashAmount: number) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  // cash_drawers has no salon_id — branch ownership is the only guard.
  try {
    await assertBranchOwned(branchId, session.salonId);
  } catch (e) {
    return { error: tenantErrorMessage(e) };
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: drawer } = await supabase
    .from('cash_drawers')
    .select('*')
    .eq('branch_id', branchId)
    .eq('date', today)
    .single();

  if (drawer) {
    const { error } = await supabase
      .from('cash_drawers')
      .update({ total_cash_sales: (drawer.total_cash_sales || 0) + cashAmount })
      .eq('id', drawer.id)
      .eq('branch_id', branchId);
    if (error) return { error: error.message };
  }

  return { error: null };
}

export async function updatePromoCodeUsage(code: string) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  // Scope by salon_id — multiple salons may have the same promo code string.
  const { data: promo } = await supabase
    .from('promo_codes')
    .select('id, used_count')
    .eq('code', code)
    .eq('salon_id', session.salonId)
    .maybeSingle();

  if (promo) {
    await supabase
      .from('promo_codes')
      .update({ used_count: (promo.used_count || 0) + 1 })
      .eq('id', promo.id)
      .eq('salon_id', session.salonId);
  }

  return { error: null };
}

export async function rollbackBill(billId: string) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  // Verify the bill is ours BEFORE deleting children — otherwise a caller
  // could wipe another salon's bill_items/tips by guessing an ID.
  try {
    await assertBillOwned(billId, session.salonId);
  } catch (e) {
    return { error: tenantErrorMessage(e) };
  }

  try {
    await supabase.from('bill_items').delete().eq('bill_id', billId);
    await supabase.from('tips').delete().eq('bill_id', billId);
    await supabase.from('bills').delete().eq('id', billId).eq('salon_id', session.salonId);
  } catch {
    // cleanup failed — manual review needed
  }

  return { error: null };
}

// ────────────────────────────────────────────────────────────────────────
// Bill history — list + single-row fetch for the Bills page (regenerate,
// reprint, WhatsApp, download). Branch-scoped via session.branchIds so a
// manager in Branch A can never read bills from Branch B.
// ────────────────────────────────────────────────────────────────────────

export interface BillItemRow {
  id: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  item_type: 'service' | 'product' | null;
}

export interface BillRow {
  id: string;
  bill_number: string;
  created_at: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  tip_amount: number;
  total_amount: number;
  paid_amount: number;
  payment_method: string | null;
  status: string;
  loyalty_points_earned: number;
  loyalty_points_used: number;
  udhaar_added: number;
  client: { id: string; name: string | null; phone: string | null } | null;
  staff: { id: string; name: string | null } | null;
  branch: { id: string; name: string | null } | null;
  items: BillItemRow[];
}

const BILL_SELECT = `
  id, bill_number, created_at,
  subtotal, discount_amount, tax_amount, tip_amount, total_amount, paid_amount,
  payment_method, status,
  loyalty_points_earned, loyalty_points_used, udhaar_added,
  client:clients (id, name, phone),
  staff:staff (id, name),
  branch:branches (id, name),
  items:bill_items (id, name, quantity, unit_price, total_price, item_type)
` as const;

export async function listBills(input: {
  branchId?: string;
  limit?: number;
  offset?: number;
  search?: string;
  fromDate?: string;
  toDate?: string;
}): Promise<{ data: BillRow[]; error: string | null; total: number }> {
  const session = await verifySession();
  const supabase = createServerClient();

  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);

  let q = supabase
    .from('bills')
    .select(BILL_SELECT, { count: 'exact' })
    .eq('salon_id', session.salonId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (input.branchId) {
    q = q.eq('branch_id', input.branchId);
  } else if (session.branchIds && session.branchIds.length > 0) {
    q = q.in('branch_id', session.branchIds);
  }
  if (input.search && input.search.trim()) {
    q = q.ilike('bill_number', `%${input.search.trim()}%`);
  }
  if (input.fromDate) q = q.gte('created_at', `${input.fromDate}T00:00:00`);
  if (input.toDate) q = q.lte('created_at', `${input.toDate}T23:59:59`);

  const { data, error, count } = await q;
  if (error) return { data: [], error: error.message, total: 0 };
  return {
    data: (data || []) as unknown as BillRow[],
    error: null,
    total: count ?? 0,
  };
}

export async function getBillById(id: string): Promise<{ data: BillRow | null; error: string | null }> {
  const session = await verifySession();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('bills')
    .select(BILL_SELECT)
    .eq('salon_id', session.salonId)
    .eq('id', id)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data: (data as unknown as BillRow) ?? null, error: null };
}
