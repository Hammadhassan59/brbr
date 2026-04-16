import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock data set up before each test for the backbar consumption report.
// Validates: per-product roll-up, per-stylist breakdown, variance only when
// owner has saved an actual for the EXACT period.

let bills: Array<{ id: string; staff_id: string; created_at: string }> = [];
let billItems: Array<{ bill_id: string; service_id: string }> = [];
let links: Array<{ product_id: string; service_id: string; quantity_per_use: number; products: { name: string; brand: string | null; content_per_unit: number; content_unit: string | null; purchase_price: number } | null }> = [];
let staffRows: Array<{ id: string; name: string }> = [];
let actuals: Array<{ id: string; product_id: string; actual_qty: number; notes: string | null }> = [];

const session = { salonId: 'salon-1', staffId: 'owner-1', role: 'owner', branchId: 'branch-1', name: 'Owner' };

// Tiny query builder that supports the chain shape our action uses. We use
// a thenable that snapshots the current ctx at the moment of await (the
// staff_id .eq is called LAST in the chain, so the snapshot must happen
// after every chain call has run).
function fromMock(table: string) {
  if (table === 'bills') {
    const ctx: { staffFilter: string | undefined } = { staffFilter: undefined };
    type Result = { data: typeof bills; error: null };
    const settle = (): Result => ({
      data: ctx.staffFilter ? bills.filter((b) => b.staff_id === ctx.staffFilter) : bills,
      error: null,
    });
    const chain = {
      select: () => chain,
      eq: (col: string, val: string) => {
        if (col === 'staff_id') ctx.staffFilter = val;
        return chain;
      },
      gte: () => chain,
      lte: () => chain,
      then: <T>(onResolve: (v: Result) => T, onReject?: (e: unknown) => T): Promise<T> =>
        Promise.resolve(settle()).then(onResolve, onReject),
    };
    return chain;
  }
  if (table === 'bill_items') {
    return {
      select: () => ({
        in: (_col: string, ids: string[]) => ({
          // The action queries bill_items.in('bill_id', billIds). Honor that
          // filter — otherwise items from bills excluded by the staff filter
          // leak in and inflate expected_qty.
          not: () => Promise.resolve({
            data: billItems.filter((i) => ids.includes(i.bill_id)),
            error: null,
          }),
        }),
      }),
    };
  }
  if (table === 'product_service_links') {
    return {
      select: () => ({ in: () => Promise.resolve({ data: links, error: null }) }),
    };
  }
  if (table === 'staff') {
    return {
      select: () => ({ in: () => Promise.resolve({ data: staffRows, error: null }) }),
    };
  }
  if (table === 'backbar_actuals') {
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              in: () => Promise.resolve({ data: actuals, error: null }),
            }),
          }),
        }),
      }),
      upsert: () => Promise.resolve({ error: null }),
    };
  }
  return {};
}

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({ from: fromMock }),
}));

vi.mock('@/app/actions/auth', () => ({
  checkWriteAccess: () => Promise.resolve({ session, error: null }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  staffRows = [
    { id: 'stylist-x', name: 'Stylist X' },
    { id: 'stylist-y', name: 'Stylist Y' },
  ];
  // Three bills: two by Stylist X (one shampoo each) and one by Stylist Y.
  bills = [
    { id: 'bill-1', staff_id: 'stylist-x', created_at: '2026-04-10T10:00:00Z' },
    { id: 'bill-2', staff_id: 'stylist-y', created_at: '2026-04-12T11:00:00Z' },
    { id: 'bill-3', staff_id: 'stylist-x', created_at: '2026-04-15T15:00:00Z' },
  ];
  billItems = [
    { bill_id: 'bill-1', service_id: 'svc-haircut' },
    { bill_id: 'bill-2', service_id: 'svc-haircut' },
    { bill_id: 'bill-3', service_id: 'svc-haircut' },
  ];
  // 30ml of shampoo per haircut.
  links = [
    {
      product_id: 'prod-shampoo',
      service_id: 'svc-haircut',
      quantity_per_use: 30,
      products: { name: 'Shampoo', brand: 'Acme', content_per_unit: 300, content_unit: 'ml', purchase_price: 600 },
    },
  ];
  actuals = [];
});

describe('getBackbarConsumptionReport', () => {
  it('rolls up expected qty across all bills (3 haircuts × 30ml = 90ml)', async () => {
    const { getBackbarConsumptionReport } = await import('../src/app/actions/inventory');
    const { data } = await getBackbarConsumptionReport({ from: '2026-04-01', to: '2026-04-30' });
    expect(data?.rows).toHaveLength(1);
    expect(data?.rows[0].expected_qty).toBe(90);
    expect(data?.rows[0].services_count).toBe(3);
  });

  it('breaks down expected by stylist (X: 60ml across 2 services, Y: 30ml across 1)', async () => {
    const { getBackbarConsumptionReport } = await import('../src/app/actions/inventory');
    const { data } = await getBackbarConsumptionReport({ from: '2026-04-01', to: '2026-04-30' });
    const byStylist = data?.rows[0].by_stylist;
    expect(byStylist).toHaveLength(2);
    const x = byStylist?.find((s) => s.staff_id === 'stylist-x');
    const y = byStylist?.find((s) => s.staff_id === 'stylist-y');
    expect(x).toEqual({ staff_id: 'stylist-x', staff_name: 'Stylist X', services_count: 2, expected_qty: 60 });
    expect(y).toEqual({ staff_id: 'stylist-y', staff_name: 'Stylist Y', services_count: 1, expected_qty: 30 });
  });

  it('orders the by_stylist breakdown by descending expected_qty (heavy users first)', async () => {
    const { getBackbarConsumptionReport } = await import('../src/app/actions/inventory');
    const { data } = await getBackbarConsumptionReport({ from: '2026-04-01', to: '2026-04-30' });
    expect(data?.rows[0].by_stylist[0].staff_id).toBe('stylist-x');
  });

  it('returns null variance when no owner stocktake exists for the period', async () => {
    const { getBackbarConsumptionReport } = await import('../src/app/actions/inventory');
    const { data } = await getBackbarConsumptionReport({ from: '2026-04-01', to: '2026-04-30' });
    expect(data?.rows[0].actual_qty).toBeNull();
    expect(data?.rows[0].variance_qty).toBeNull();
    expect(data?.rows[0].variance_pct).toBeNull();
  });

  it('computes variance when an actual stocktake exists (expected 90, actual 100 → -10ml, -11.1%)', async () => {
    actuals = [{ id: 'a-1', product_id: 'prod-shampoo', actual_qty: 100, notes: null }];
    const { getBackbarConsumptionReport } = await import('../src/app/actions/inventory');
    const { data } = await getBackbarConsumptionReport({ from: '2026-04-01', to: '2026-04-30' });
    expect(data?.rows[0].actual_qty).toBe(100);
    expect(data?.rows[0].variance_qty).toBe(-10);
    expect(data?.rows[0].variance_pct).toBeCloseTo(-11.11, 1);
  });

  it('staff filter restricts the bill set so totals only reflect that stylist', async () => {
    const { getBackbarConsumptionReport } = await import('../src/app/actions/inventory');
    const { data } = await getBackbarConsumptionReport({ from: '2026-04-01', to: '2026-04-30', staffId: 'stylist-y' });
    expect(data?.rows[0].expected_qty).toBe(30);
    expect(data?.rows[0].by_stylist).toHaveLength(1);
    expect(data?.rows[0].by_stylist[0].staff_id).toBe('stylist-y');
  });

  it('returns empty rows when no bills match the window', async () => {
    bills = [];
    const { getBackbarConsumptionReport } = await import('../src/app/actions/inventory');
    const { data } = await getBackbarConsumptionReport({ from: '2026-04-01', to: '2026-04-30' });
    expect(data?.rows).toEqual([]);
  });
});
