import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Regression: bill_number was globally unique in 001_initial_schema.sql, but the
// generator scopes numbers per-salon. Migration 014 replaces the global unique
// with a composite (salon_id, bill_number) unique. See DEBUG REPORT in commit
// message for full root-cause analysis.

vi.mock('@/app/actions/auth', () => ({
  checkWriteAccess: vi.fn().mockResolvedValue({
    session: { salonId: 'salon-B', staffId: 'staff-1', role: 'owner', branchId: 'branch-1', name: 'Test' },
    error: null,
  }),
}));

// State shared between the mock and the assertions
const state: {
  existingBills: Array<{ salon_id: string; bill_number: string }>;
  insertCalls: Array<{ salon_id: string; bill_number: string }>;
} = { existingBills: [], insertCalls: [] };

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: (_table: string) => ({
      // Generator query: .select().eq('salon_id', x).like('bill_number', prefix).order().limit()
      select: (_cols: string) => ({
        eq: (_col: string, salonId: string) => ({
          like: (_col2: string, pattern: string) => ({
            order: () => ({
              limit: async () => {
                const prefix = pattern.replace('%', '');
                const matches = state.existingBills
                  .filter(b => b.salon_id === salonId && b.bill_number.startsWith(prefix))
                  .sort((a, b) => b.bill_number.localeCompare(a.bill_number));
                return { data: matches.slice(0, 1), error: null };
              },
            }),
          }),
        }),
      }),
      insert: (row: { salon_id: string; bill_number: string }) => ({
        select: () => ({
          single: async () => {
            state.insertCalls.push({ salon_id: row.salon_id, bill_number: row.bill_number });
            // Simulate the CURRENT (post-migration) composite unique: (salon_id, bill_number)
            const collision = state.existingBills.some(
              b => b.salon_id === row.salon_id && b.bill_number === row.bill_number
            );
            if (collision) {
              return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "bills_salon_bill_number_unique" on bill_number' } };
            }
            state.existingBills.push({ salon_id: row.salon_id, bill_number: row.bill_number });
            return { data: { id: 'bill-new', ...row }, error: null };
          },
        }),
      }),
    }),
  }),
}));

describe('createBill — per-salon bill number collision regression', () => {
  beforeEach(() => {
    state.existingBills = [];
    state.insertCalls = [];
    vi.clearAllMocks();
  });

  it('creates a bill for salon-B even when salon-A already has BB-<date>-001 today', async () => {
    // Pre-seed: another salon already used today's 001 (this WOULD have caused the
    // global-unique collision before migration 014).
    const todayPrefix = `BB-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-`;
    state.existingBills.push({ salon_id: 'salon-A', bill_number: `${todayPrefix}001` });

    const { createBill } = await import('../src/app/actions/bills');
    const result = await createBill({
      branchId: 'branch-1',
      subtotal: 100,
      totalAmount: 100,
      paymentMethod: 'cash',
    });

    expect(result.error).toBeNull();
    expect(result.data).toBeTruthy();
    // Salon B's first bill of the day should also be -001 (scoped per salon)
    expect(state.insertCalls[0].bill_number).toBe(`${todayPrefix}001`);
    expect(state.insertCalls[0].salon_id).toBe('salon-B');
  });
});

describe('migration 014 — bill_number unique scoping', () => {
  it('drops the global unique and adds a composite unique per salon', () => {
    const path = join(__dirname, '..', 'supabase', 'migrations', '014_fix_bill_number_unique_per_salon.sql');
    const sql = readFileSync(path, 'utf8');
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS bills_bill_number_key/i);
    expect(sql).toMatch(/UNIQUE\s*\(\s*salon_id\s*,\s*bill_number\s*\)/i);
  });
});
