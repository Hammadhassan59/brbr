'use server';

import { checkWriteAccess } from './auth';
import { createServerClient } from '@/lib/supabase';

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
  const { error: writeError } = await checkWriteAccess();
  if (writeError) return { error: writeError };
  const supabase = createServerClient();

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
  const { error: writeError } = await checkWriteAccess();
  if (writeError) return { error: writeError };
  const supabase = createServerClient();

  const { error } = await supabase
    .from('tips')
    .insert({ staff_id: staffId, bill_id: billId, amount });

  if (error) return { error: error.message };
  return { error: null };
}

export async function updateCashDrawer(branchId: string, cashAmount: number) {
  const { error: writeError } = await checkWriteAccess();
  if (writeError) return { error: writeError };
  const supabase = createServerClient();

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
      .eq('id', drawer.id);
    if (error) return { error: error.message };
  }

  return { error: null };
}

export async function updatePromoCodeUsage(code: string) {
  const { error: writeError } = await checkWriteAccess();
  if (writeError) return { error: writeError };
  const supabase = createServerClient();

  const { data: promo } = await supabase
    .from('promo_codes')
    .select('used_count')
    .eq('code', code)
    .single();

  if (promo) {
    await supabase
      .from('promo_codes')
      .update({ used_count: (promo.used_count || 0) + 1 })
      .eq('code', code);
  }

  return { error: null };
}

export async function rollbackBill(billId: string) {
  const { error: writeError } = await checkWriteAccess();
  if (writeError) return { error: writeError };
  const supabase = createServerClient();

  try {
    await supabase.from('bill_items').delete().eq('bill_id', billId);
    await supabase.from('tips').delete().eq('bill_id', billId);
    await supabase.from('bills').delete().eq('id', billId);
  } catch {
    // cleanup failed — manual review needed
  }

  return { error: null };
}
