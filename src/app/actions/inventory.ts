'use server';

import { verifySession } from './auth';
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
  const session = await verifySession();
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
  const session = await verifySession();
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
  await verifySession();
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
  await verifySession();
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

export async function createPurchaseOrder(data: {
  supplierId: string;
  branchId: string;
  items: unknown;
  totalAmount: number;
  notes?: string | null;
}) {
  await verifySession();
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
  await verifySession();
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
  const session = await verifySession();
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
  const session = await verifySession();
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
  await verifySession();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('suppliers')
    .update({ udhaar_balance: currentBalance - amount })
    .eq('id', supplierId);

  if (error) return { error: error.message };
  return { error: null };
}
