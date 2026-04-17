import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regression: `current_stock` is in packaging units (bottles) but
// `product_service_links.quantity_per_use` is in content units (ml/g).
// The old code subtracted content units directly from bottle count, so a
// 10-use bottle went empty after 1 client. Fix: divide content deduction
// by `content_per_unit` to convert to fractional bottles.

vi.mock('@/app/actions/auth', () => ({
  checkWriteAccess: vi.fn().mockResolvedValue({
    session: { salonId: 'salon-A', staffId: 's1', role: 'owner', branchId: 'b1', name: 'T' },
    error: null,
  }),
}));

vi.mock('@/lib/tenant-guard', () => ({
  assertBranchOwned: vi.fn().mockResolvedValue(undefined),
  tenantErrorMessage: () => null,
}));

type Product = { id: string; content_per_unit: number };
type BranchProduct = { branch_id: string; product_id: string; current_stock: number };
type Link = { product_id: string; service_id: string; quantity_per_use: number };

const db: {
  products: Product[];
  branchProducts: BranchProduct[];
  links: Link[];
  /** Each stock-write update, keyed as before for test compatibility. */
  updates: Array<{ id: string; current_stock: number }>;
  movements: Array<{ product_id: string; branch_id: string; quantity: number; movement_type: string }>;
} = { products: [], branchProducts: [], links: [], updates: [], movements: [] };

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: (table: string) => {
      if (table === 'product_service_links') {
        return {
          select: (_c: string) => ({
            in: async (_col: string, ids: string[]) => ({
              data: db.links.filter((l) => ids.includes(l.service_id)),
              error: null,
            }),
          }),
        };
      }
      if (table === 'products') {
        return {
          select: (_c: string) => ({
            in: (_col: string, ids: string[]) => ({
              eq: async (_col2: string, _val: string) => ({
                data: db.products.filter((p) => ids.includes(p.id)),
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'branch_products') {
        return {
          select: (_c: string) => ({
            eq: (_col: string, branchId: string) => ({
              in: async (_col2: string, ids: string[]) => ({
                data: db.branchProducts
                  .filter((bp) => bp.branch_id === branchId && ids.includes(bp.product_id))
                  .map((bp) => ({ product_id: bp.product_id, current_stock: bp.current_stock })),
                error: null,
              }),
            }),
          }),
          update: (patch: { current_stock: number }) => ({
            eq: (_col: string, branchId: string) => ({
              eq: async (_col2: string, productId: string) => {
                const bp = db.branchProducts.find(
                  (x) => x.branch_id === branchId && x.product_id === productId,
                );
                if (bp) bp.current_stock = patch.current_stock;
                db.updates.push({ id: productId, current_stock: patch.current_stock });
                return { error: null };
              },
            }),
          }),
        };
      }
      if (table === 'stock_movements') {
        return {
          insert: async (rows: Array<{ product_id: string; branch_id: string; quantity: number; movement_type: string }>) => {
            db.movements.push(...rows);
            return { error: null };
          },
        };
      }
      return {};
    },
  }),
}));

import { deductStockForBill } from '@/app/actions/inventory';

beforeEach(() => {
  db.products = [];
  db.branchProducts = [];
  db.links = [];
  db.updates = [];
  db.movements = [];
});

const stockAt = (branchId: string, productId: string) =>
  db.branchProducts.find((bp) => bp.branch_id === branchId && bp.product_id === productId)?.current_stock;

describe('deductStockForBill', () => {
  it('back-bar service deducts fractional bottles based on content_per_unit', async () => {
    // 1 bottle of 300ml hair color. Service uses 30ml per client.
    db.products = [{ id: 'p1', content_per_unit: 300 }];
    db.branchProducts = [{ branch_id: 'b1', product_id: 'p1', current_stock: 1 }];
    db.links = [{ product_id: 'p1', service_id: 'svc1', quantity_per_use: 30 }];

    await deductStockForBill({
      branchId: 'b1',
      billId: 'bill-1',
      items: [{ type: 'service', serviceId: 'svc1', productId: null, quantity: 1, name: 'Color' }],
    });

    // 30ml / 300ml_per_bottle = 0.1 bottles deducted → 0.9 bottles left.
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0].current_stock).toBeCloseTo(0.9, 5);
  });

  it('back-bar usage over 10 clients empties a 10-use bottle (the reported bug)', async () => {
    // User's repro: "10 uses, if one client, 9 uses left, after 10 uses empty."
    // Represented as content_per_unit=10, quantity_per_use=1.
    db.products = [{ id: 'p1', content_per_unit: 10 }];
    db.branchProducts = [{ branch_id: 'b1', product_id: 'p1', current_stock: 1 }];
    db.links = [{ product_id: 'p1', service_id: 'svc1', quantity_per_use: 1 }];

    // First client: should leave 0.9 bottles (= 9 uses), NOT 0.
    await deductStockForBill({
      branchId: 'b1',
      billId: 'bill-1',
      items: [{ type: 'service', serviceId: 'svc1', productId: null, quantity: 1, name: 'Color' }],
    });
    expect(stockAt('b1', 'p1')).toBeCloseTo(0.9, 5);

    // Nine more clients → exactly 0.
    for (let i = 0; i < 9; i++) {
      await deductStockForBill({
        branchId: 'b1',
        billId: `bill-${i + 2}`,
        items: [{ type: 'service', serviceId: 'svc1', productId: null, quantity: 1, name: 'Color' }],
      });
    }
    expect(stockAt('b1', 'p1')).toBeCloseTo(0, 5);
  });

  it('direct product sale still deducts whole bottles', async () => {
    // Retail sale: item.quantity is in bottles, no content conversion.
    db.products = [{ id: 'p1', content_per_unit: 300 }];
    db.branchProducts = [{ branch_id: 'b1', product_id: 'p1', current_stock: 5 }];

    await deductStockForBill({
      branchId: 'b1',
      billId: 'bill-1',
      items: [{ type: 'product', serviceId: null, productId: 'p1', quantity: 2, name: 'Shampoo' }],
    });

    expect(db.updates[0].current_stock).toBe(3);
  });

  it('never drops stock below zero', async () => {
    db.products = [{ id: 'p1', content_per_unit: 10 }];
    db.branchProducts = [{ branch_id: 'b1', product_id: 'p1', current_stock: 0.05 }];
    db.links = [{ product_id: 'p1', service_id: 'svc1', quantity_per_use: 1 }];

    await deductStockForBill({
      branchId: 'b1',
      billId: 'bill-1',
      items: [{ type: 'service', serviceId: 'svc1', productId: null, quantity: 1, name: 'Color' }],
    });

    expect(db.updates[0].current_stock).toBe(0);
  });

  it('deducts from the specified branch only, leaving the other branch untouched', async () => {
    // Regression for migration 035 (per-branch inventory): a service at branch
    // b1 must not drop stock at branch b2.
    db.products = [{ id: 'p1', content_per_unit: 10 }];
    db.branchProducts = [
      { branch_id: 'b1', product_id: 'p1', current_stock: 1 },
      { branch_id: 'b2', product_id: 'p1', current_stock: 1 },
    ];
    db.links = [{ product_id: 'p1', service_id: 'svc1', quantity_per_use: 1 }];

    await deductStockForBill({
      branchId: 'b1',
      billId: 'bill-1',
      items: [{ type: 'service', serviceId: 'svc1', productId: null, quantity: 1, name: 'Color' }],
    });

    expect(stockAt('b1', 'p1')).toBeCloseTo(0.9, 5);
    expect(stockAt('b2', 'p1')).toBe(1);
    expect(db.movements[0].branch_id).toBe('b1');
  });
});
