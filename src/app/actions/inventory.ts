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

  // Aggregate deductions per product. Track packaging units (bottles sold
  // directly) and content units (ml/g used on back-bar services) separately,
  // since they need different conversions against current_stock.
  const deductions = new Map<string, { bottles: number; content: number }>();
  const bump = (id: string, patch: Partial<{ bottles: number; content: number }>) => {
    const cur = deductions.get(id) ?? { bottles: 0, content: 0 };
    deductions.set(id, {
      bottles: cur.bottles + (patch.bottles ?? 0),
      content: cur.content + (patch.content ?? 0),
    });
  };

  // 1) Direct product sales — item.quantity is in packaging units.
  for (const item of params.items) {
    if (item.type === 'product' && item.productId) {
      bump(item.productId, { bottles: item.quantity });
    }
  }

  // 2) Back-bar usage via product_service_links — quantity_per_use is in
  //    content_unit (ml/g), so this deducts content, not bottles.
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
        bump(link.product_id, { content: deduct });
      }
    }
  }

  if (deductions.size === 0) return { error: null };

  // Apply deductions. Convert content units to fractional bottles using
  // content_per_unit so a 300ml bottle used 30ml only drops stock by 0.1.
  const productIds = Array.from(deductions.keys());
  const { data: products } = await supabase
    .from('products')
    .select('id, current_stock, content_per_unit')
    .in('id', productIds);

  const stockMap: Record<string, { current: number; perUnit: number }> = {};
  (products ?? []).forEach((p: { id: string; current_stock: number; content_per_unit: number }) => {
    stockMap[p.id] = {
      current: Number(p.current_stock) || 0,
      perUnit: Number(p.content_per_unit) || 1,
    };
  });

  const movements: Array<{ product_id: string; branch_id: string; movement_type: string; quantity: number; notes: string }> = [];
  for (const [productId, d] of deductions) {
    const info = stockMap[productId];
    if (!info) continue;
    const bottlesFromContent = info.perUnit > 0 ? d.content / info.perUnit : 0;
    const totalBottleDeduct = d.bottles + bottlesFromContent;
    if (totalBottleDeduct <= 0) continue;
    const newStock = Math.max(0, info.current - totalBottleDeduct);
    await supabase.from('products').update({ current_stock: newStock }).eq('id', productId);
    movements.push({
      product_id: productId,
      branch_id: params.branchId,
      movement_type: 'sale',
      quantity: -totalBottleDeduct,
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

// ───────────────────────────────────────
// Backbar consumption report
// ───────────────────────────────────────

export interface BackbarStylistRow {
  staff_id: string;
  staff_name: string;
  services_count: number;
  expected_qty: number;
}

export interface BackbarReportRow {
  product_id: string;
  product_name: string;
  brand: string | null;
  content_unit: string | null;
  content_per_unit: number;
  cost_per_content_unit: number;
  services_count: number;
  expected_qty: number;
  expected_cost: number;
  actual_qty: number | null;
  actual_id: string | null;
  actual_notes: string | null;
  variance_qty: number | null;
  variance_pct: number | null;
  by_stylist: BackbarStylistRow[];
}

/**
 * Owner-facing backbar consumption report.
 *
 * What it answers: for each product that's linked to services, in the chosen
 * window: how much SHOULD have been consumed (expected, computed from
 * bill_items × product_service_links.quantity_per_use), how much was
 * ACTUALLY consumed (only if the owner has entered a stocktake for the same
 * window via recordBackbarActual), and the variance. Each product also
 * carries a per-stylist breakdown (attributed via bills.staff_id) so the
 * owner can spot heavy users.
 *
 * Stylist attribution caveat: a multi-stylist bill is attributed entirely to
 * the staff_id on the bill row — usually the receptionist or whoever rang it
 * up. Common case is single-stylist; v1 accepts the inaccuracy.
 */
export async function getBackbarConsumptionReport(input: {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  staffId?: string;
}): Promise<{ data: { rows: BackbarReportRow[] } | null; error: string | null }> {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { data: null, error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  // Bills in window for this salon. Time bounds use Asia/Karachi day so the
  // report matches what the dashboard shows for the same dates.
  let billsQ = supabase
    .from('bills')
    .select('id, staff_id, created_at')
    .eq('salon_id', session.salonId)
    .eq('status', 'paid')
    .gte('created_at', `${input.from}T00:00:00+05:00`)
    .lte('created_at', `${input.to}T23:59:59+05:00`);
  if (input.staffId) billsQ = billsQ.eq('staff_id', input.staffId);

  const { data: bills, error: billsErr } = await billsQ;
  if (billsErr) return { data: null, error: billsErr.message };

  if (!bills || bills.length === 0) {
    return { data: { rows: [] }, error: null };
  }

  const billIds = bills.map((b: { id: string }) => b.id);
  const billStaff = new Map<string, string>(
    bills.map((b: { id: string; staff_id: string | null }) => [b.id, b.staff_id ?? '']),
  );

  // Service line items on those bills.
  const { data: items, error: itemsErr } = await supabase
    .from('bill_items')
    .select('bill_id, service_id')
    .in('bill_id', billIds)
    .not('service_id', 'is', null);
  if (itemsErr) return { data: null, error: itemsErr.message };

  if (!items || items.length === 0) {
    return { data: { rows: [] }, error: null };
  }

  // Product links for the services we saw.
  const serviceIds = Array.from(new Set(items.map((i: { service_id: string }) => i.service_id)));
  const { data: links, error: linksErr } = await supabase
    .from('product_service_links')
    .select('product_id, service_id, quantity_per_use, products(name, brand, content_per_unit, content_unit, purchase_price)')
    .in('service_id', serviceIds);
  if (linksErr) return { data: null, error: linksErr.message };

  type LinkRow = {
    product_id: string;
    service_id: string;
    quantity_per_use: number;
    products: { name: string; brand: string | null; content_per_unit: number; content_unit: string | null; purchase_price: number } | null;
  };
  // PostgREST types embeds as arrays even when the FK is single-row; cast
  // through unknown and treat the embed as a single object. The DB schema
  // guarantees one product per link (FK on product_id).
  const linksByService = new Map<string, LinkRow[]>();
  for (const l of (links || []) as unknown as LinkRow[]) {
    const arr = linksByService.get(l.service_id) ?? [];
    arr.push(l);
    linksByService.set(l.service_id, arr);
  }

  // Aggregate: per product → totals + per-stylist sub-totals.
  type Aggregate = {
    product_id: string;
    product_name: string;
    brand: string | null;
    content_unit: string | null;
    content_per_unit: number;
    purchase_price: number;
    services_count: number;
    expected_qty: number;
    by_stylist: Map<string, { services_count: number; expected_qty: number }>;
  };
  const byProduct = new Map<string, Aggregate>();

  for (const item of items as { bill_id: string; service_id: string }[]) {
    const links = linksByService.get(item.service_id);
    if (!links) continue;
    const staffId = billStaff.get(item.bill_id) || '';
    for (const link of links) {
      if (!link.products) continue;
      const agg = byProduct.get(link.product_id) ?? {
        product_id: link.product_id,
        product_name: link.products.name,
        brand: link.products.brand,
        content_unit: link.products.content_unit,
        content_per_unit: Number(link.products.content_per_unit) || 1,
        purchase_price: Number(link.products.purchase_price) || 0,
        services_count: 0,
        expected_qty: 0,
        by_stylist: new Map(),
      };
      agg.services_count += 1;
      agg.expected_qty += Number(link.quantity_per_use) || 0;
      if (staffId) {
        const sub = agg.by_stylist.get(staffId) ?? { services_count: 0, expected_qty: 0 };
        sub.services_count += 1;
        sub.expected_qty += Number(link.quantity_per_use) || 0;
        agg.by_stylist.set(staffId, sub);
      }
      byProduct.set(link.product_id, agg);
    }
  }

  // Resolve staff names.
  const staffIds = Array.from(new Set(Array.from(byProduct.values()).flatMap((a) => Array.from(a.by_stylist.keys()))));
  const staffNames = new Map<string, string>();
  if (staffIds.length > 0) {
    const { data: staffRows } = await supabase
      .from('staff')
      .select('id, name')
      .in('id', staffIds);
    for (const s of (staffRows || []) as { id: string; name: string }[]) {
      staffNames.set(s.id, s.name);
    }
  }

  // Owner-entered actuals for this exact period.
  const productIds = Array.from(byProduct.keys());
  const actualByProduct = new Map<string, { id: string; actual_qty: number; notes: string | null }>();
  if (productIds.length > 0) {
    const { data: actuals } = await supabase
      .from('backbar_actuals')
      .select('id, product_id, actual_qty, notes')
      .eq('salon_id', session.salonId)
      .eq('period_start', input.from)
      .eq('period_end', input.to)
      .in('product_id', productIds);
    for (const a of (actuals || []) as { id: string; product_id: string; actual_qty: number; notes: string | null }[]) {
      actualByProduct.set(a.product_id, { id: a.id, actual_qty: Number(a.actual_qty), notes: a.notes });
    }
  }

  const rows: BackbarReportRow[] = Array.from(byProduct.values())
    .map((agg) => {
      const actual = actualByProduct.get(agg.product_id);
      const actual_qty = actual ? actual.actual_qty : null;
      const variance_qty = actual_qty !== null ? agg.expected_qty - actual_qty : null;
      const variance_pct =
        actual_qty !== null && agg.expected_qty > 0
          ? (variance_qty! / agg.expected_qty) * 100
          : null;
      const cost_per_content_unit = agg.content_per_unit > 0 ? agg.purchase_price / agg.content_per_unit : 0;
      return {
        product_id: agg.product_id,
        product_name: agg.product_name,
        brand: agg.brand,
        content_unit: agg.content_unit,
        content_per_unit: agg.content_per_unit,
        cost_per_content_unit,
        services_count: agg.services_count,
        expected_qty: agg.expected_qty,
        expected_cost: agg.expected_qty * cost_per_content_unit,
        actual_qty,
        actual_id: actual?.id ?? null,
        actual_notes: actual?.notes ?? null,
        variance_qty,
        variance_pct,
        by_stylist: Array.from(agg.by_stylist.entries())
          .map(([staff_id, v]) => ({
            staff_id,
            staff_name: staffNames.get(staff_id) ?? 'Unknown',
            services_count: v.services_count,
            expected_qty: v.expected_qty,
          }))
          .sort((a, b) => b.expected_qty - a.expected_qty),
      };
    })
    .sort((a, b) => b.expected_qty - a.expected_qty);

  return { data: { rows }, error: null };
}

/**
 * Owner records or updates a stocktake count for a (product, period). Upserts
 * on the unique (salon_id, product_id, period_start, period_end) constraint
 * so re-saving the same window simply updates the existing row.
 */
export async function recordBackbarActual(input: {
  product_id: string;
  period_start: string; // YYYY-MM-DD
  period_end: string;   // YYYY-MM-DD
  actual_qty: number;
  notes?: string | null;
}): Promise<{ error: string | null }> {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  if (!Number.isFinite(input.actual_qty) || input.actual_qty < 0) {
    return { error: 'Actual qty must be a non-negative number' };
  }
  if (input.period_end < input.period_start) {
    return { error: 'Period end must be on or after period start' };
  }
  const supabase = createServerClient();
  const { error } = await supabase
    .from('backbar_actuals')
    .upsert({
      salon_id: session.salonId,
      product_id: input.product_id,
      period_start: input.period_start,
      period_end: input.period_end,
      actual_qty: input.actual_qty,
      notes: input.notes ?? null,
      recorded_by: session.staffId,
      recorded_at: new Date().toISOString(),
    }, { onConflict: 'salon_id,product_id,period_start,period_end' });
  if (error) return { error: error.message };
  return { error: null };
}
