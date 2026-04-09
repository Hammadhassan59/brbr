'use server';

import { verifySession } from './auth';
import { createServerClient } from '@/lib/supabase';

export async function createBill(data: {
  branchId: string;
  billNumber: string;
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
  const session = await verifySession();
  const supabase = createServerClient();

  const { data: result, error } = await supabase
    .from('bills')
    .insert({
      salon_id: session.salonId,
      branch_id: data.branchId,
      bill_number: data.billNumber,
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

  if (error) return { data: null, error: error.message };
  return { data: result, error: null };
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
  await verifySession();
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
  await verifySession();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('tips')
    .insert({ staff_id: staffId, bill_id: billId, amount });

  if (error) return { error: error.message };
  return { error: null };
}

export async function updateCashDrawer(branchId: string, cashAmount: number) {
  await verifySession();
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
  await verifySession();
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
  await verifySession();
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
