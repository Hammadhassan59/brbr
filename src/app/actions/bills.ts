'use server';

import { checkWriteAccess } from './auth';
import { createServerClient } from '@/lib/supabase';
import {
  assertBillOwned,
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
  try {
    await assertBillOwned(billId, session.salonId);
  } catch (e) {
    return { error: tenantErrorMessage(e) };
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

  // Staff member's home branch should match the bill's branch. If the staff
  // is unassigned to a branch, fall back to same-salon check (already done
  // above). A stylist from another branch receiving a tip on this branch's
  // bill is suspicious, so reject.
  if (staff.branch_id && bill.branch_id && staff.branch_id !== bill.branch_id) {
    return { error: 'Staff member is not assigned to the branch this bill belongs to' };
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
