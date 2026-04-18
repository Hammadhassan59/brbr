/**
 * Tests for the UPDATE + DELETE flows added to
 * `src/app/actions/consumer-addresses.ts`:
 *
 *   - updateConsumerAddress  — ownership check, default-uniqueness, patch
 *   - deleteConsumerAddress  — ownership check, non-terminal-booking guard
 *
 * Mirrors the in-memory Supabase mock style of
 * `test/consumer-addresses-actions.test.ts` — we don't share that file's
 * mock because each test file ships its own `vi.mock('@/lib/supabase', …)`
 * closure and Vitest wants the mock defined once per file.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════
// In-memory Supabase mock — supports the PostgREST subset these actions use:
//   select + eq + in + maybeSingle + single + order + limit
//   insert + update (eq-chain) + delete (eq-chain)
// ═══════════════════════════════════════════════════════════════════════════

type Row = Record<string, unknown>;
interface TableState { rows: Row[] }
const db: Record<string, TableState> = {};
function tbl(name: string): TableState {
  if (!db[name]) db[name] = { rows: [] };
  return db[name];
}

function matches(row: Row, filters: Array<{ op: string; col: string; val: unknown }>): boolean {
  return filters.every((f) => {
    const v = row[f.col];
    if (f.op === 'eq') return v === f.val;
    if (f.op === 'in') return Array.isArray(f.val) && (f.val as unknown[]).includes(v);
    return false;
  });
}

function selectBuilder(tableName: string) {
  const state = tbl(tableName);
  const filters: Array<{ op: string; col: string; val: unknown }> = [];
  let limitN: number | null = null;

  const exec = () => {
    let rows = state.rows.filter((r) => matches(r, filters));
    if (limitN != null) rows = rows.slice(0, limitN);
    return { data: rows, error: null };
  };

  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      filters.push({ op: 'eq', col, val });
      return chain;
    },
    in: (col: string, val: unknown[]) => {
      filters.push({ op: 'in', col, val });
      return chain;
    },
    order: () => chain,
    limit: (n: number) => {
      limitN = n;
      return chain;
    },
    maybeSingle: async () => {
      const res = exec();
      return { data: res.data[0] ?? null, error: null };
    },
    single: async () => {
      const res = exec();
      return { data: res.data[0] ?? null, error: null };
    },
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
      resolve(exec()),
  };
  return chain;
}

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: (table: string) => {
      const state = tbl(table);
      return {
        select: () => selectBuilder(table),
        insert: (rowOrRows: Row | Row[]) => {
          const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
          for (const r of rows) {
            if (!r.id) r.id = `${table}-${state.rows.length + 1}`;
            if (!r.created_at) r.created_at = new Date().toISOString();
            state.rows.push(r);
          }
          return {
            select: () => ({
              single: async () => ({ data: rows[0], error: null }),
            }),
            then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
              resolve({ data: rows, error: null }),
          };
        },
        update: (patch: Row) => {
          const filters: Array<{ op: string; col: string; val: unknown }> = [];
          const chain: Record<string, unknown> = {
            eq: (col: string, val: unknown) => {
              filters.push({ op: 'eq', col, val });
              return chain;
            },
            then: (resolve: (v: { data: null; error: null }) => unknown) => {
              for (const r of state.rows) {
                if (matches(r, filters)) Object.assign(r, patch);
              }
              return resolve({ data: null, error: null });
            },
          };
          return chain;
        },
        delete: () => {
          const filters: Array<{ op: string; col: string; val: unknown }> = [];
          const chain: Record<string, unknown> = {
            eq: (col: string, val: unknown) => {
              filters.push({ op: 'eq', col, val });
              return chain;
            },
            then: (resolve: (v: { data: null; error: null }) => unknown) => {
              state.rows = state.rows.filter((r) => !matches(r, filters));
              return resolve({ data: null, error: null });
            },
          };
          return chain;
        },
      };
    },
  }),
}));

// ═══════════════════════════════════════════════════════════════════════════
// Consumer session mock
// ═══════════════════════════════════════════════════════════════════════════

const CONSUMER = {
  userId: '00000000-0000-4000-8000-000000000aaa',
  name: 'Ayesha',
  email: 'ayesha@example.com',
  phone: '03001234567',
};

let sessionMock: (() => Promise<unknown>) | null = () =>
  Promise.resolve({ ...CONSUMER });
vi.mock('@/lib/consumer-session', () => ({
  getConsumerSession: () => (sessionMock ? sessionMock() : Promise.resolve(null)),
}));

// ═══════════════════════════════════════════════════════════════════════════
// Lifecycle
// ═══════════════════════════════════════════════════════════════════════════

const ADDR_ID_A = '11111111-1111-4111-8111-111111111111';
const ADDR_ID_B = '22222222-2222-4222-8222-222222222222';
const ADDR_ID_OTHER = '33333333-3333-4333-8333-333333333333';

beforeEach(async () => {
  for (const k of Object.keys(db)) delete db[k];
  db.consumer_addresses = { rows: [] };
  db.bookings = { rows: [] };
  sessionMock = () => Promise.resolve({ ...CONSUMER });
  const { resetRateLimit } = await import('../src/lib/rate-limit');
  resetRateLimit(`consumer-address-save:${CONSUMER.userId}`);
});

function seedAddresses() {
  db.consumer_addresses.rows.push(
    {
      id: ADDR_ID_A,
      consumer_id: CONSUMER.userId,
      label: 'Home',
      street: '12 Defence',
      lat: 24.85,
      lng: 67.0,
      is_default: true,
      created_at: '2026-04-01T00:00:00.000Z',
    },
    {
      id: ADDR_ID_B,
      consumer_id: CONSUMER.userId,
      label: 'Office',
      street: '100 I.I. Chundrigar',
      lat: 24.86,
      lng: 67.01,
      is_default: false,
      created_at: '2026-04-02T00:00:00.000Z',
    },
    {
      id: ADDR_ID_OTHER,
      consumer_id: 'other-consumer',
      label: 'Somebody else home',
      street: 'Secret',
      lat: 31.5,
      lng: 74.3,
      is_default: true,
      created_at: '2026-04-01T00:00:00.000Z',
    },
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// updateConsumerAddress
// ═══════════════════════════════════════════════════════════════════════════

describe('updateConsumerAddress', () => {
  it('rejects when no session', async () => {
    sessionMock = () => Promise.resolve(null);
    const { updateConsumerAddress } = await import('@/app/actions/consumer-addresses');
    const res = await updateConsumerAddress({
      id: ADDR_ID_A,
      label: 'Home',
      street: '12 Defence',
      lat: 24.85,
      lng: 67.0,
    });
    expect(res.ok).toBe(false);
  });

  it('rejects an invalid UUID', async () => {
    const { updateConsumerAddress } = await import('@/app/actions/consumer-addresses');
    const res = await updateConsumerAddress({
      id: 'not-a-uuid',
      label: 'Home',
      street: '12 Defence',
      lat: 24.85,
      lng: 67.0,
    });
    expect(res.ok).toBe(false);
  });

  it("refuses to update another consumer's address", async () => {
    seedAddresses();
    const { updateConsumerAddress } = await import('@/app/actions/consumer-addresses');
    const res = await updateConsumerAddress({
      id: ADDR_ID_OTHER,
      label: 'Hacked',
      street: 'Cross-tenant street',
      lat: 0,
      lng: 0,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not found/i);
    // The other consumer's row is unchanged.
    const row = db.consumer_addresses.rows.find(
      (r) => (r as Record<string, unknown>).id === ADDR_ID_OTHER,
    ) as Record<string, unknown>;
    expect(row.label).toBe('Somebody else home');
  });

  it('updates a consumer-owned address in place', async () => {
    seedAddresses();
    const { updateConsumerAddress } = await import('@/app/actions/consumer-addresses');
    const res = await updateConsumerAddress({
      id: ADDR_ID_B,
      label: 'Work',
      street: 'New street',
      lat: 24.9,
      lng: 67.05,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.label).toBe('Work');
    expect(res.data.street).toBe('New street');
    expect(res.data.lat).toBe(24.9);
    // Row persisted.
    const row = db.consumer_addresses.rows.find(
      (r) => (r as Record<string, unknown>).id === ADDR_ID_B,
    ) as Record<string, unknown>;
    expect(row.label).toBe('Work');
  });

  it('setting isDefault=true clears other defaults for the same consumer only', async () => {
    seedAddresses();
    const { updateConsumerAddress } = await import('@/app/actions/consumer-addresses');
    const res = await updateConsumerAddress({
      id: ADDR_ID_B,
      label: 'Office',
      street: '100 I.I. Chundrigar',
      lat: 24.86,
      lng: 67.01,
      isDefault: true,
    });
    expect(res.ok).toBe(true);
    // The previously default row A is now not default.
    const rowA = db.consumer_addresses.rows.find(
      (r) => (r as Record<string, unknown>).id === ADDR_ID_A,
    ) as Record<string, unknown>;
    expect(rowA.is_default).toBe(false);
    // The newly-updated row B is default.
    const rowB = db.consumer_addresses.rows.find(
      (r) => (r as Record<string, unknown>).id === ADDR_ID_B,
    ) as Record<string, unknown>;
    expect(rowB.is_default).toBe(true);
    // The OTHER consumer's default must remain true — cross-tenant safety.
    const rowOther = db.consumer_addresses.rows.find(
      (r) => (r as Record<string, unknown>).id === ADDR_ID_OTHER,
    ) as Record<string, unknown>;
    expect(rowOther.is_default).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// deleteConsumerAddress
// ═══════════════════════════════════════════════════════════════════════════

describe('deleteConsumerAddress', () => {
  it('rejects when no session', async () => {
    sessionMock = () => Promise.resolve(null);
    const { deleteConsumerAddress } = await import('@/app/actions/consumer-addresses');
    const res = await deleteConsumerAddress({ id: ADDR_ID_A });
    expect(res.ok).toBe(false);
  });

  it("refuses to delete another consumer's address", async () => {
    seedAddresses();
    const { deleteConsumerAddress } = await import('@/app/actions/consumer-addresses');
    const res = await deleteConsumerAddress({ id: ADDR_ID_OTHER });
    expect(res.ok).toBe(false);
    // Row still present.
    const row = db.consumer_addresses.rows.find(
      (r) => (r as Record<string, unknown>).id === ADDR_ID_OTHER,
    );
    expect(row).toBeDefined();
  });

  it('deletes a consumer-owned address', async () => {
    seedAddresses();
    const { deleteConsumerAddress } = await import('@/app/actions/consumer-addresses');
    const res = await deleteConsumerAddress({ id: ADDR_ID_B });
    expect(res.ok).toBe(true);
    const row = db.consumer_addresses.rows.find(
      (r) => (r as Record<string, unknown>).id === ADDR_ID_B,
    );
    expect(row).toBeUndefined();
  });

  it('refuses to delete when a non-terminal booking still references the address', async () => {
    seedAddresses();
    db.bookings.rows.push({
      id: 'booking-1',
      consumer_id: CONSUMER.userId,
      address_id: ADDR_ID_A,
      status: 'CONFIRMED',
    });
    const { deleteConsumerAddress } = await import('@/app/actions/consumer-addresses');
    const res = await deleteConsumerAddress({ id: ADDR_ID_A });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/pending or confirmed booking/i);
    // Row untouched.
    const row = db.consumer_addresses.rows.find(
      (r) => (r as Record<string, unknown>).id === ADDR_ID_A,
    );
    expect(row).toBeDefined();
  });

  it('allows deletion when only terminal bookings reference the address', async () => {
    seedAddresses();
    db.bookings.rows.push({
      id: 'booking-old',
      consumer_id: CONSUMER.userId,
      address_id: ADDR_ID_A,
      status: 'COMPLETED',
    });
    const { deleteConsumerAddress } = await import('@/app/actions/consumer-addresses');
    const res = await deleteConsumerAddress({ id: ADDR_ID_A });
    expect(res.ok).toBe(true);
    const row = db.consumer_addresses.rows.find(
      (r) => (r as Record<string, unknown>).id === ADDR_ID_A,
    );
    expect(row).toBeUndefined();
  });
});
