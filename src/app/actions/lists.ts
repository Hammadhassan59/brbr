'use server';

import { verifySession } from './auth';
import { createServerClient } from '@/lib/supabase';
import type {
  Client,
  Supplier,
  PromoCode,
  Staff,
  Product,
  StockTransfer,
  StockMovement,
  Service,
} from '@/types/database';

interface ProductServiceLink {
  id: string;
  product_id: string;
  service_id: string;
  quantity_per_use: number;
}

// ───────────────────────────────────────────────────────────────────────────
// Simple list/get reads for the small client-component pages that previously
// did one or two .from() calls inline. Every action verifies the iCut JWT
// and uses session.salonId, never client-supplied salon ids.
// ───────────────────────────────────────────────────────────────────────────

async function ctx() {
  const session = await verifySession();
  if (!session.salonId) throw new Error('No salon context');
  return { session, supabase: createServerClient() };
}

export async function listSuppliers(branchId: string): Promise<{ data: Supplier[]; error: string | null }> {
  try {
    const { session, supabase } = await ctx();
    const { data } = await supabase
      .from('suppliers')
      .select('*')
      .eq('salon_id', session.salonId)
      .eq('branch_id', branchId)
      .order('name');
    return { data: (data ?? []) as Supplier[], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function listPromoCodes(branchId: string): Promise<{ data: PromoCode[]; error: string | null }> {
  try {
    const { session, supabase } = await ctx();
    const { data } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('salon_id', session.salonId)
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false });
    return { data: (data ?? []) as PromoCode[], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function listClients(branchId: string): Promise<{ data: Client[]; error: string | null }> {
  try {
    const { session, supabase } = await ctx();
    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('salon_id', session.salonId)
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false });
    return { data: (data ?? []) as Client[], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function listActiveStaff(): Promise<{ data: Staff[]; error: string | null }> {
  try {
    const { session, supabase } = await ctx();
    const { data } = await supabase
      .from('staff')
      .select('*')
      .eq('salon_id', session.salonId)
      .eq('is_active', true)
      .order('name');
    return { data: (data ?? []) as Staff[], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function listActiveServices(branchId: string): Promise<{ data: Service[]; error: string | null }> {
  try {
    const { session, supabase } = await ctx();
    const { data } = await supabase
      .from('services')
      .select('*')
      .eq('salon_id', session.salonId)
      .eq('branch_id', branchId)
      .eq('is_active', true)
      .order('name');
    return { data: (data ?? []) as Service[], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function updateBranchProductThreshold(input: {
  productId: string; branchId: string; lowStockThreshold: number;
}): Promise<{ error: string | null }> {
  try {
    const { session, supabase } = await ctx();
    // Defense-in-depth: ensure the product belongs to this salon before
    // updating the per-branch threshold row.
    const owner = await supabase.from('products').select('salon_id').eq('id', input.productId).maybeSingle();
    if (!owner.data || (owner.data as { salon_id: string }).salon_id !== session.salonId) {
      return { error: 'Cross-tenant product update' };
    }
    const { error } = await supabase
      .from('branch_products')
      .update({ low_stock_threshold: input.lowStockThreshold })
      .eq('branch_id', input.branchId)
      .eq('product_id', input.productId);
    return { error: error?.message ?? null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function listProductServiceLinks(productId: string): Promise<{ data: ProductServiceLink[]; error: string | null }> {
  try {
    const { supabase } = await ctx();
    const { data } = await supabase.from('product_service_links').select('*').eq('product_id', productId);
    return { data: (data ?? []) as ProductServiceLink[], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function listActiveBranchProducts(branchId: string): Promise<{ data: Product[]; error: string | null }> {
  try {
    const { session, supabase } = await ctx();
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('salon_id', session.salonId)
      .eq('branch_id', branchId)
      .eq('is_active', true)
      .order('name');
    return { data: (data ?? []) as Product[], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function getStaffById(staffId: string): Promise<{ data: Staff | null; error: string | null }> {
  try {
    const { session, supabase } = await ctx();
    const { data } = await supabase.from('staff').select('*').eq('id', staffId).maybeSingle();
    if (data && (data as { salon_id: string }).salon_id !== session.salonId) {
      return { data: null, error: 'Cross-tenant staff lookup' };
    }
    return { data: (data as Staff) ?? null, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function getClientForEdit(input: { clientId: string; branchId: string }): Promise<{ data: Client | null; error: string | null }> {
  try {
    const { session, supabase } = await ctx();
    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('id', input.clientId)
      .eq('salon_id', session.salonId)
      .eq('branch_id', input.branchId)
      .maybeSingle();
    return { data: (data as Client) ?? null, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed' };
  }
}

export interface ClientDetailBundle {
  client: Client | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bills: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  udhaarPayments: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  packages: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stats: any;
}
export async function getClientDetail(input: { clientId: string; branchId: string }): Promise<{ data: ClientDetailBundle | null; error: string | null }> {
  try {
    const { session, supabase } = await ctx();
    const [clientRes, billsRes, udhaarRes, pkgRes] = await Promise.all([
      supabase.from('clients').select('*').eq('id', input.clientId).eq('salon_id', session.salonId).eq('branch_id', input.branchId).maybeSingle(),
      // bills with bill_items + staff name — embedded join replaced with two follow-ups
      supabase.from('bills').select('*').eq('client_id', input.clientId).eq('status', 'paid').order('created_at', { ascending: false }),
      supabase.from('udhaar_payments').select('*').eq('client_id', input.clientId).order('created_at', { ascending: false }),
      supabase.from('client_packages').select('*').eq('client_id', input.clientId).order('purchased_at', { ascending: false }),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const billsRows = (billsRes.data ?? []) as any[];
    const billIds = billsRows.map((b) => b.id);
    const staffIds = Array.from(new Set(billsRows.map((b) => b.staff_id).filter(Boolean)));
    const [itemsRes, staffRes] = await Promise.all([
      billIds.length ? supabase.from('bill_items').select('*').in('bill_id', billIds) : Promise.resolve({ data: [], error: null }),
      staffIds.length ? supabase.from('staff').select('id, name').in('id', staffIds) : Promise.resolve({ data: [], error: null }),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itemsByBill = new Map<string, any[]>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const i of (itemsRes.data ?? []) as any[]) {
      const list = itemsByBill.get(i.bill_id) ?? [];
      list.push(i);
      itemsByBill.set(i.bill_id, list);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const staffById = new Map<string, any>(((staffRes.data ?? []) as any[]).map((s) => [s.id, s]));
    const bills = billsRows.map((b) => ({ ...b, items: itemsByBill.get(b.id) ?? [], staff: staffById.get(b.staff_id) ?? null }));

    // Cheap stats — total spent, last visit.
    const totalSpent = bills.reduce((s, b) => s + Number(b.total_amount ?? 0), 0);
    const visits = bills.length;
    const lastVisit = bills[0]?.created_at ?? null;
    const stats = { totalSpent, visits, lastVisit };

    return {
      data: {
        client: (clientRes.data as Client) ?? null,
        bills,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        udhaarPayments: (udhaarRes.data ?? []) as any[],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        packages: (pkgRes.data ?? []) as any[],
        stats,
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed' };
  }
}

// Server-side replacement for src/lib/db.ts:fetchProductsWithBranchStock —
// the client wrapper relied on the browser supabase client which is gone.
import type { ProductWithBranchStock } from '@/lib/db';

export async function getProductsWithBranchStock(input: { branchId: string }): Promise<{
  data: ProductWithBranchStock[];
  error: string | null;
}> {
  try {
    const { session, supabase } = await ctx();
    const [productsRes, bpRes] = await Promise.all([
      supabase
        .from('products')
        .select('*')
        .eq('salon_id', session.salonId)
        .eq('branch_id', input.branchId)
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('branch_products')
        .select('*')
        .eq('branch_id', input.branchId),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bpByProduct = new Map<string, any>(((bpRes.data ?? []) as any[]).map((bp) => [bp.product_id, bp]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = ((productsRes.data ?? []) as any[]).map((p) => {
      const bp = bpByProduct.get(p.id);
      return {
        ...p,
        current_stock: bp?.current_stock ?? 0,
        low_stock_threshold: bp?.low_stock_threshold ?? 5,
        branch_product_id: bp?.id,
      } as ProductWithBranchStock;
    });
    return { data, error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function getInventoryOverview(branchId: string): Promise<{
  data: {
    movements: Array<StockMovement & { product_name?: string }>;
  } | null;
  error: string | null;
}> {
  try {
    const { session, supabase } = await ctx();
    const movRes = await supabase
      .from('stock_movements')
      .select('*')
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })
      .limit(10);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (movRes.data ?? []) as any[];
    const productIds = Array.from(new Set(rows.map((m) => m.product_id).filter(Boolean)));
    const prodRes = productIds.length
      ? await supabase.from('products').select('id, name, salon_id').in('id', productIds)
      : { data: [], error: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byId = new Map<string, any>(((prodRes.data ?? []) as any[])
      .filter((p) => p.salon_id === session.salonId)
      .map((p) => [p.id, p]));
    const movements = rows
      .map((m) => ({ ...m, product_name: byId.get(m.product_id)?.name as string | undefined }))
      .filter((m) => byId.has(m.product_id));
    return { data: { movements }, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function getInventoryReport(input: {
  branchId: string; dateFrom: string; dateTo: string;
}): Promise<{
  data: {
    movements: Array<StockMovement & { product?: Product }>;
    products: ProductWithBranchStock[];
    staffOptions: Staff[];
  } | null;
  error: string | null;
}> {
  try {
    const { session, supabase } = await ctx();
    const [movRes, productsRes, branchProductsRes, staffRes] = await Promise.all([
      supabase
        .from('stock_movements')
        .select('*')
        .eq('branch_id', input.branchId)
        .gte('created_at', `${input.dateFrom}T00:00:00`)
        .lte('created_at', `${input.dateTo}T23:59:59`)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.from('products').select('*').eq('salon_id', session.salonId).eq('branch_id', input.branchId).eq('is_active', true).order('name'),
      supabase.from('branch_products').select('*').eq('branch_id', input.branchId),
      supabase.from('staff').select('*').eq('salon_id', session.salonId).eq('is_active', true).order('name'),
    ]);

    // Stitch product onto each movement (replaces PostgREST products!inner).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const productsList = ((productsRes.data ?? []) as any[]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const productById = new Map<string, any>(productsList.map((p) => [p.id, p]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const movements = ((movRes.data ?? []) as any[])
      .map((m) => ({ ...m, product: productById.get(m.product_id) }))
      .filter((m) => m.product); // tenant-isolation: drop rows whose product isn't in this salon

    // Merge branch_products stock into product list.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bpByProduct = new Map<string, any>(((branchProductsRes.data ?? []) as any[]).map((bp) => [bp.product_id, bp]));
    const products = productsList.map((p) => {
      const bp = bpByProduct.get(p.id);
      return {
        ...p,
        current_stock: bp?.current_stock ?? 0,
        low_stock_threshold: bp?.low_stock_threshold ?? 5,
        branch_product_id: bp?.id,
      } as ProductWithBranchStock;
    });

    return {
      data: { movements, products, staffOptions: (staffRes.data ?? []) as Staff[] },
      error: null,
    };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed' };
  }
}

// Per-branch products + their current_stock map. Used by the transfer dialog
// to gate "available: N" client-side before submitting the transfer.
// Purchase orders + their supplier rows (replaces the previous PostgREST
// embedded join). Suppliers are returned in a parallel list so existing
// callers can still display po.supplier.name.
export async function getPurchaseOrdersAndSuppliers(branchId: string): Promise<{
  data: { orders: Array<{ supplier?: Supplier } & Record<string, unknown>>; suppliers: Supplier[] } | null;
  error: string | null;
}> {
  try {
    const { session, supabase } = await ctx();
    const [ordRes, supRes] = await Promise.all([
      supabase.from('purchase_orders').select('*').eq('branch_id', branchId).order('created_at', { ascending: false }),
      supabase.from('suppliers').select('*').eq('salon_id', session.salonId).eq('branch_id', branchId).order('name'),
    ]);
    const suppliers = (supRes.data ?? []) as Supplier[];
    const supplierById = new Map(suppliers.map((s) => [s.id, s]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orders = ((ordRes.data ?? []) as any[]).map((o) => ({
      ...o,
      supplier: supplierById.get(o.supplier_id),
    }));
    return { data: { orders, suppliers }, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function getBranchProductsAndStock(branchId: string): Promise<{
  data: { products: Product[]; stockByProduct: Record<string, number> } | null;
  error: string | null;
}> {
  try {
    const { session, supabase } = await ctx();
    const [stockRes, prodRes] = await Promise.all([
      supabase.from('branch_products').select('product_id,current_stock').eq('branch_id', branchId),
      supabase.from('products').select('*').eq('salon_id', session.salonId).eq('branch_id', branchId).eq('is_active', true).order('name'),
    ]);
    const stockByProduct: Record<string, number> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (stockRes.data ?? []) as any[]) {
      stockByProduct[row.product_id] = Number(row.current_stock) || 0;
    }
    return {
      data: { products: (prodRes.data ?? []) as Product[], stockByProduct },
      error: null,
    };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function getStockTransfersAndProducts(branchId: string): Promise<{
  data: { transfers: StockTransfer[]; products: Product[] } | null;
  error: string | null;
}> {
  try {
    const { session, supabase } = await ctx();
    const [txRes, prodRes] = await Promise.all([
      supabase
        .from('stock_transfers')
        .select('*')
        .eq('salon_id', session.salonId)
        .or(`from_branch_id.eq.${branchId},to_branch_id.eq.${branchId}`)
        .order('created_at', { ascending: false }),
      supabase
        .from('products')
        .select('*')
        .eq('salon_id', session.salonId)
        .eq('branch_id', branchId)
        .eq('is_active', true)
        .order('name'),
    ]);
    return {
      data: {
        transfers: (txRes.data ?? []) as StockTransfer[],
        products: (prodRes.data ?? []) as Product[],
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed' };
  }
}
