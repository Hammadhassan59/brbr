'use server';

import { verifySession } from './auth';
import { createServerClient } from '@/lib/supabase';
import type {
  Service,
  Product,
  Package as PkgType,
  Staff,
  Client,
  AppointmentWithDetails,
  BranchProduct,
} from '@/types/database';

// ───────────────────────────────────────────────────────────────────────────
// /dashboard/pos data layer — replaces 7 client-side supabase.from() calls.
// All actions verify the iCut JWT and use the trusted salonId from it; no
// salon/branch ids are accepted from clients.
// ───────────────────────────────────────────────────────────────────────────

export interface PosCatalog {
  services: Service[];
  products: Product[];          // with branch_products stock merged in
  packages: PkgType[];
  stylists: Staff[];
  loyaltyEnabled: boolean;
}

export async function getPosCatalog(input: {
  branchId: string;
}): Promise<{ data: PosCatalog | null; error: string | null }> {
  try {
    const session = await verifySession();
    if (!session.salonId) return { data: null, error: 'No salon context' };
    const supabase = createServerClient();
    const { branchId } = input;

    const memberRows = await supabase
      .from('staff_branches')
      .select('staff_id')
      .eq('branch_id', branchId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const staffIds = ((memberRows.data ?? []) as any[]).map((r) => r.staff_id);

    const [svc, prod, branchProd, pkg, staff, loyalty] = await Promise.all([
      supabase.from('services').select('*').eq('salon_id', session.salonId).eq('branch_id', branchId).eq('is_active', true).order('sort_order'),
      supabase.from('products').select('*').eq('salon_id', session.salonId).eq('branch_id', branchId).eq('is_active', true).order('name'),
      supabase.from('branch_products').select('product_id,current_stock,low_stock_threshold').eq('branch_id', branchId),
      supabase.from('packages').select('*').eq('salon_id', session.salonId).eq('branch_id', branchId).eq('is_active', true).order('name'),
      staffIds.length
        ? supabase.from('staff').select('*').in('id', staffIds).eq('is_active', true).in('role', ['senior_stylist', 'junior_stylist']).order('name')
        : Promise.resolve({ data: [] as Staff[], error: null }),
      supabase.from('loyalty_rules').select('enabled').eq('salon_id', session.salonId).eq('branch_id', branchId).maybeSingle(),
    ]);

    // Merge per-branch stock into product rows so the UI's BillBuilder /
    // low-stock warnings keep working off `product.current_stock`.
    const bpMap = new Map<string, Pick<BranchProduct, 'current_stock' | 'low_stock_threshold'>>();
    for (const row of (branchProd.data ?? []) as Array<Pick<BranchProduct, 'product_id' | 'current_stock' | 'low_stock_threshold'>>) {
      bpMap.set(row.product_id, { current_stock: row.current_stock, low_stock_threshold: row.low_stock_threshold });
    }
    const products = ((prod.data ?? []) as Product[]).map((p) => {
      const bp = bpMap.get(p.id);
      return {
        ...p,
        current_stock: bp ? Number(bp.current_stock) : 0,
        low_stock_threshold: bp ? Number(bp.low_stock_threshold) : 0,
      };
    });

    return {
      data: {
        services: (svc.data ?? []) as Service[],
        products,
        packages: (pkg.data ?? []) as PkgType[],
        stylists: (staff.data ?? []) as Staff[],
        loyaltyEnabled: loyalty.data ? Boolean((loyalty.data as { enabled: boolean }).enabled) : true,
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed' };
  }
}

// Loads a single appointment with its client/staff/service relations for the
// POS pre-fill flow. Replaces the embedded-join select() that used PostgREST.
export async function getAppointmentForPos(aptId: string): Promise<{
  data: AppointmentWithDetails | null;
  error: string | null;
}> {
  try {
    const session = await verifySession();
    if (!session.salonId) return { data: null, error: 'No salon context' };
    const supabase = createServerClient();

    const aptRes = await supabase.from('appointments').select('*').eq('id', aptId).maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apt = aptRes.data as any;
    if (!apt) return { data: null, error: 'Appointment not found' };
    if (apt.salon_id && apt.salon_id !== session.salonId) {
      return { data: null, error: 'Cross-tenant appointment access denied' };
    }

    const [clientRes, staffRes, svcRes] = await Promise.all([
      apt.client_id ? supabase.from('clients').select('*').eq('id', apt.client_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      apt.staff_id ? supabase.from('staff').select('*').eq('id', apt.staff_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      supabase.from('appointment_services').select('*').eq('appointment_id', apt.id),
    ]);

    return {
      data: {
        ...apt,
        client: clientRes.data ?? null,
        staff: staffRes.data ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        services: (svcRes.data ?? []) as any[],
      } as AppointmentWithDetails,
      error: null,
    };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed' };
  }
}

// Promo code lookup for the POS apply-promo flow.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getPromoCode(input: { branchId: string; code: string }): Promise<{ data: any | null; error: string | null }> {
  try {
    const session = await verifySession();
    if (!session.salonId) return { data: null, error: 'No salon context' };
    const supabase = createServerClient();
    const { data } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('salon_id', session.salonId)
      .eq('branch_id', input.branchId)
      .eq('code', input.code.trim().toUpperCase())
      .maybeSingle();
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed' };
  }
}

// Re-hydrate a client by id (used by the POS draft restore flow).
export async function getClientById(clientId: string): Promise<{ data: Client | null; error: string | null }> {
  try {
    const session = await verifySession();
    if (!session.salonId) return { data: null, error: 'No salon context' };
    const supabase = createServerClient();
    const { data } = await supabase.from('clients').select('*').eq('id', clientId).maybeSingle();
    if (data && (data as { salon_id: string }).salon_id !== session.salonId) {
      return { data: null, error: 'Cross-tenant client lookup' };
    }
    return { data: (data as Client) ?? null, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed' };
  }
}

// Client search: ILIKE against name OR phone, salon-scoped, top 10 unique
// matches. Pre-existing pattern (no SQL OR) merges name+phone results in JS
// to avoid PostgREST .or() injection surface.
export async function searchPosClients(input: {
  branchId: string;
  query: string;
}): Promise<{ data: Client[]; error: string | null }> {
  try {
    const session = await verifySession();
    if (!session.salonId) return { data: [], error: 'No salon context' };
    const trimmed = input.query.trim().slice(0, 100);
    if (trimmed.length < 2) return { data: [], error: null };
    const pattern = `%${trimmed}%`;
    const supabase = createServerClient();
    const [nameRes, phoneRes] = await Promise.all([
      supabase.from('clients').select('*').eq('salon_id', session.salonId).eq('branch_id', input.branchId).ilike('name', pattern).limit(10),
      supabase.from('clients').select('*').eq('salon_id', session.salonId).eq('branch_id', input.branchId).ilike('phone', pattern).limit(10),
    ]);
    const merged = new Map<string, Client>();
    for (const row of (nameRes.data ?? []) as Client[]) merged.set(row.id, row);
    for (const row of (phoneRes.data ?? []) as Client[]) merged.set(row.id, row);
    return { data: Array.from(merged.values()).slice(0, 10), error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Failed' };
  }
}
