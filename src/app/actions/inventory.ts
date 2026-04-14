'use server';

import { checkWriteAccess } from './auth';
import { createServerClient } from '@/lib/supabase';

export async function createProduct(data: {
  name: string;
  brand?: string | null;
  category?: string | null;
  inventoryType: string;
  unit: string;
  contentPerUnit?: number;
  contentUnit?: string;
  purchasePrice?: number;
  retailPrice?: number;
  currentStock?: number;
  lowStockThreshold?: number;
}) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { data: null, error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  const { data: result, error } = await supabase
    .from('products')
    .insert({
      salon_id: session.salonId,
      name: data.name.trim(),
      brand: data.brand || null,
      category: data.category || null,
      inventory_type: data.inventoryType,
      unit: data.unit,
      content_per_unit: data.contentPerUnit || 1,
      content_unit: data.contentUnit,
      purchase_price: data.purchasePrice || 0,
      retail_price: data.retailPrice || 0,
      current_stock: data.currentStock || 0,
      low_stock_threshold: data.lowStockThreshold || 5,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: result, error: null };
}

export async function updateProduct(id: string, data: Record<string, unknown>) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();
  data.salon_id = session.salonId;

  const { error } = await supabase
    .from('products')
    .update(data)
    .eq('id', id);

  if (error) return { error: error.message };
  return { error: null };
}

export async function syncProductServiceLinks(productId: string, links: Array<{
  serviceId: string;
  qtyPerUse: number;
}>) {
  const { error: writeError } = await checkWriteAccess();
  if (writeError) return { error: writeError };
  const supabase = createServerClient();

  await supabase.from('product_service_links').delete().eq('product_id', productId);

  if (links.length > 0) {
    const { error } = await supabase
      .from('product_service_links')
      .insert(links.map(l => ({
        product_id: productId,
        service_id: l.serviceId,
        quantity_per_use: l.qtyPerUse,
      })));
    if (error) return { error: error.message };
  }

  return { error: null };
}

export async function adjustStock(productId: string, branchId: string, quantity: number, notes?: string | null) {
  const { error: writeError } = await checkWriteAccess();
  if (writeError) return { error: writeError };
  const supabase = createServerClient();

  // Get current stock
  const { data: product } = await supabase
    .from('products')
    .select('current_stock')
    .eq('id', productId)
    .single();

  if (!product) return { error: 'Product not found' };

  const newStock = Math.max(0, product.current_stock + quantity);

  const { error: updateErr } = await supabase
    .from('products')
    .update({ current_stock: newStock })
    .eq('id', productId);

  if (updateErr) return { error: updateErr.message };

  const { error: moveErr } = await supabase
    .from('stock_movements')
    .insert({
      product_id: productId,
      branch_id: branchId,
      movement_type: 'adjustment',
      quantity,
      notes: notes || null,
    });

  if (moveErr) return { error: moveErr.message };
  return { error: null };
}

/**
 * Deduct inventory for a completed bill.
 * - `product` items: decrement stock by item quantity.
 * - `service` items: look up product_service_links and decrement linked
 *    back-bar products by (quantity_per_use * item.quantity).
 * Logs each change to stock_movements. Best-effort: a single product failure
 * doesn't abort the rest, so a bill can still finalize.
 */
export async function deductStockForBill(params: {
  branchId: string;
  billId: string;
  items: Array<{ type: 'service' | 'product'; serviceId: string | null; productId: string | null; quantity: number; name: string }>;
}) {
  const { error: writeError } = await checkWriteAccess();
  if (writeError) return { error: writeError };
  const supabase = createServerClient();

  // Aggregate deductions by productId so we do one update per product.
  const deductions = new Map<string, number>();

  // 1) Direct product sales
  for (const item of params.items) {
    if (item.type === 'product' && item.productId) {
      deductions.set(item.productId, (deductions.get(item.productId) ?? 0) + item.quantity);
    }
  }

  // 2) Back-bar usage via product_service_links
  const serviceIds = Array.from(
    new Set(params.items.filter((i) => i.type === 'service' && i.serviceId).map((i) => i.serviceId as string))
  );
  if (serviceIds.length > 0) {
    const { data: links } = await supabase
      .from('product_service_links')
      .select('product_id, service_id, quantity_per_use')
      .in('service_id', serviceIds);

    if (links) {
      for (const link of links as Array<{ product_id: string; service_id: string; quantity_per_use: number }>) {
        const svcQty = params.items
          .filter((i) => i.type === 'service' && i.serviceId === link.service_id)
          .reduce((sum, i) => sum + i.quantity, 0);
        if (svcQty === 0) continue;
        const deduct = svcQty * Number(link.quantity_per_use || 0);
        if (deduct <= 0) continue;
        deductions.set(link.product_id, (deductions.get(link.product_id) ?? 0) + deduct);
      }
    }
  }

  if (deductions.size === 0) return { error: null };

  // Apply deductions.
  const productIds = Array.from(deductions.keys());
  const { data: products } = await supabase
    .from('products')
    .select('id, current_stock')
    .in('id', productIds);

  const stockMap: Record<string, number> = {};
  (products ?? []).forEach((p: { id: string; current_stock: number }) => {
    stockMap[p.id] = p.current_stock;
  });

  const movements: Array<{ product_id: string; branch_id: string; movement_type: string; quantity: number; notes: string }> = [];
  for (const [productId, qty] of deductions) {
    const current = stockMap[productId] ?? 0;
    const newStock = Math.max(0, current - qty);
    await supabase.from('products').update({ current_stock: newStock }).eq('id', productId);
    movements.push({
      product_id: productId,
      branch_id: params.branchId,
      movement_type: 'sale',
      quantity: -qty,
      notes: `Bill ${params.billId}`,
    });
  }

  if (movements.length > 0) {
    await supabase.from('stock_movements').insert(movements);
  }

  return { error: null };
}

export async function createPurchaseOrder(data: {
  supplierId: string;
  branchId: string;
  items: unknown;
  totalAmount: number;
  notes?: string | null;
}) {
  const { error: writeError } = await checkWriteAccess();
  if (writeError) return { error: writeError };
  const supabase = createServerClient();

  const { error } = await supabase
    .from('purchase_orders')
    .insert({
      supplier_id: data.supplierId,
      branch_id: data.branchId,
      items: data.items,
      total_amount: data.totalAmount,
      notes: data.notes || null,
    });

  if (error) return { error: error.message };
  return { error: null };
}

export async function updateOrderStatus(orderId: string, status: string) {
  const { error: writeError } = await checkWriteAccess();
  if (writeError) return { error: writeError };
  const supabase = createServerClient();

  const { error } = await supabase
    .from('purchase_orders')
    .update({ status })
    .eq('id', orderId);

  if (error) return { error: error.message };
  return { error: null };
}

export async function createSupplier(data: {
  name: string;
  phone?: string | null;
  notes?: string | null;
}) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  const { error } = await supabase
    .from('suppliers')
    .insert({
      salon_id: session.salonId,
      name: data.name.trim(),
      phone: data.phone || null,
      notes: data.notes || null,
    });

  if (error) return { error: error.message };
  return { error: null };
}

export async function updateSupplier(id: string, data: {
  name: string;
  phone?: string | null;
  notes?: string | null;
}) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  const { error } = await supabase
    .from('suppliers')
    .update({
      salon_id: session.salonId,
      name: data.name.trim(),
      phone: data.phone || null,
      notes: data.notes || null,
    })
    .eq('id', id);

  if (error) return { error: error.message };
  return { error: null };
}

export async function recordSupplierPayment(supplierId: string, amount: number, currentBalance: number) {
  const { error: writeError } = await checkWriteAccess();
  if (writeError) return { error: writeError };
  const supabase = createServerClient();

  const { error } = await supabase
    .from('suppliers')
    .update({ udhaar_balance: currentBalance - amount })
    .eq('id', supplierId);

  if (error) return { error: error.message };
  return { error: null };
}
