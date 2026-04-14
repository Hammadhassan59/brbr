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

type Product = { id: string; current_stock: number; content_per_unit: number };
type Link = { product_id: string; service_id: string; quantity_per_use: number };

const db: {
  products: Product[];
  links: Link[];
  updates: Array<{ id: string; current_stock: number }>;
  movements: Array<{ product_id: string; quantity: number }>;
} = { products: [], links: [], updates: [], movements: [] };

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
            in: async (_col: string, ids: string[]) => ({
              data: db.products.filter((p) => ids.includes(p.id)),
              error: null,
            }),
          }),
          update: (patch: { current_stock: number }) => ({
            eq: async (_col: string, id: string) => {
              db.updates.push({ id, current_stock: patch.current_stock });
              const p = db.products.find((x) => x.id === id);
              if (p) p.current_stock = patch.current_stock;
              return { error: null };
            },
          }),
        };
      }
      if (table === 'stock_movements') {
        return {
          insert: async (rows: Array<{ product_id: string; quantity: number }>) => {
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
  db.links = [];
  db.updates = [];
  db.movements = [];
});

describe('deductStockForBill', () => {
  it('back-bar service deducts fractional bottles based on content_per_unit', async () => {
    // 1 bottle of 300ml hair color. Service uses 30ml per client.
    db.products = [{ id: 'p1', current_stock: 1, content_per_unit: 300 }];
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
    db.products = [{ id: 'p1', current_stock: 1, content_per_unit: 10 }];
    db.links = [{ product_id: 'p1', service_id: 'svc1', quantity_per_use: 1 }];

    // First client: should leave 0.9 bottles (= 9 uses), NOT 0.
    await deductStockForBill({
      branchId: 'b1',
      billId: 'bill-1',
      items: [{ type: 'service', serviceId: 'svc1', productId: null, quantity: 1, name: 'Color' }],
    });
    expect(db.products[0].current_stock).toBeCloseTo(0.9, 5);

    // Nine more clients → exactly 0.
    for (let i = 0; i < 9; i++) {
      await deductStockForBill({
        branchId: 'b1',
        billId: `bill-${i + 2}`,
        items: [{ type: 'service', serviceId: 'svc1', productId: null, quantity: 1, name: 'Color' }],
      });
    }
    expect(db.products[0].current_stock).toBeCloseTo(0, 5);
  });

  it('direct product sale still deducts whole bottles', async () => {
    // Retail sale: item.quantity is in bottles, no content conversion.
    db.products = [{ id: 'p1', current_stock: 5, content_per_unit: 300 }];

    await deductStockForBill({
      branchId: 'b1',
      billId: 'bill-1',
      items: [{ type: 'product', serviceId: null, productId: 'p1', quantity: 2, name: 'Shampoo' }],
    });

    expect(db.updates[0].current_stock).toBe(3);
  });

  it('never drops stock below zero', async () => {
    db.products = [{ id: 'p1', current_stock: 0.05, content_per_unit: 10 }];
    db.links = [{ product_id: 'p1', service_id: 'svc1', quantity_per_use: 1 }];

    await deductStockForBill({
      branchId: 'b1',
      billId: 'bill-1',
      items: [{ type: 'service', serviceId: 'svc1', productId: null, quantity: 1, name: 'Color' }],
    });

    expect(db.updates[0].current_stock).toBe(0);
  });
});
