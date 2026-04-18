/**
 * Tests for `src/app/actions/consumer-addresses.ts` — save + list flows and
 * the "only one default at a time" invariant.
 *
 * Same in-memory Supabase mock style as `test/booking-actions.test.ts`: a
 * table-addressable store with a fluent builder that supports the subset of
 * the PostgREST API the action uses (select, eq, order, insert, update,
 * maybeSingle, single, await-as-terminal).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════
// In-memory Supabase mock
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
    return false;
  });
}

function builder(tableName: string) {
  const state = tbl(tableName);
  const filters: Array<{ op: string; col: string; val: unknown }> = [];
  const orders: Array<{ col: string; ascending: boolean }> = [];

  const exec = () => {
    let rows = state.rows.filter((r) => matches(r, filters));
    // Stable sort: apply orders in reverse.
    for (const o of [...orders].reverse()) {
      rows = [...rows].sort((a, b) => {
        const av = a[o.col];
        const bv = b[o.col];
        if (av === bv) return 0;
        const cmp = (av as string | number) > (bv as string | number) ? 1 : -1;
        return o.ascending ? cmp : -cmp;
      });
    }
    return { data: rows, error: null };
  };

  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      filters.push({ op: 'eq', col, val });
      return chain;
    },
    order: (col: string, opts?: { ascending?: boolean }) => {
      orders.push({ col, ascending: opts?.ascending !== false });
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
        select: () => builder(table),
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

let sessionMock: (() => Promise<unknown>) | null = () => Promise.resolve({ ...CONSUMER });
vi.mock('@/lib/consumer-session', () => ({
  getConsumerSession: () => (sessionMock ? sessionMock() : Promise.resolve(null)),
}));

// ═══════════════════════════════════════════════════════════════════════════
// Lifecycle
// ═══════════════════════════════════════════════════════════════════════════

beforeEach(async () => {
  for (const k of Object.keys(db)) delete db[k];
  db.consumer_addresses = { rows: [] };
  sessionMock = () => Promise.resolve({ ...CONSUMER });
  const { resetRateLimit } = await import('../src/lib/rate-limit');
  resetRateLimit(`consumer-address-save:${CONSUMER.userId}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('saveConsumerAddress', () => {
  it('rejects when no session', async () => {
    sessionMock = () => Promise.resolve(null);
    const { saveConsumerAddress } = await import('@/app/actions/consumer-addresses');
    const res = await saveConsumerAddress({
      label: 'Home',
      street: '12 Defence',
      lat: 24.85,
      lng: 67.0,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/sign in/i);
  });

  it('rejects invalid input (empty street)', async () => {
    const { saveConsumerAddress } = await import('@/app/actions/consumer-addresses');
    const res = await saveConsumerAddress({
      label: 'Home',
      street: 'ab',
      lat: 24.85,
      lng: 67.0,
    });
    expect(res.ok).toBe(false);
  });

  it('inserts a new address for the current consumer', async () => {
    const { saveConsumerAddress } = await import('@/app/actions/consumer-addresses');
    const res = await saveConsumerAddress({
      label: 'Home',
      street: '12 Defence Phase 5',
      lat: 24.85,
      lng: 67.0,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.label).toBe('Home');
    expect(res.data.is_default).toBe(false);
    expect(db.consumer_addresses.rows).toHaveLength(1);
    const inserted = db.consumer_addresses.rows[0] as Record<string, unknown>;
    expect(inserted.consumer_id).toBe(CONSUMER.userId);
  });

  it('isDefault=true clears other defaults for the same consumer', async () => {
    // Seed two existing addresses, one default.
    db.consumer_addresses.rows.push(
      {
        id: 'a-1',
        consumer_id: CONSUMER.userId,
        label: 'Home',
        street: 'Street 1',
        lat: 24.85,
        lng: 67.0,
        is_default: true,
        created_at: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'a-2',
        consumer_id: CONSUMER.userId,
        label: 'Office',
        street: 'Street 2',
        lat: 24.85,
        lng: 67.0,
        is_default: false,
        created_at: '2026-04-02T00:00:00.000Z',
      },
    );
    const { saveConsumerAddress } = await import('@/app/actions/consumer-addresses');
    const res = await saveConsumerAddress({
      label: "Mom's",
      street: 'Street 3',
      lat: 24.85,
      lng: 67.0,
      isDefault: true,
    });
    expect(res.ok).toBe(true);
    // After insert, exactly one row has is_default = true.
    const defaults = db.consumer_addresses.rows.filter(
      (r) => (r as Record<string, unknown>).is_default === true,
    );
    expect(defaults).toHaveLength(1);
    expect((defaults[0] as Record<string, unknown>).label).toBe("Mom's");
  });

  it("doesn't clear defaults of other consumers when setting a default", async () => {
    // Seed two consumers' defaults.
    db.consumer_addresses.rows.push({
      id: 'a-other',
      consumer_id: 'other-consumer',
      label: 'Home',
      street: 'x',
      lat: 24.85,
      lng: 67.0,
      is_default: true,
      created_at: '2026-04-01T00:00:00.000Z',
    });
    const { saveConsumerAddress } = await import('@/app/actions/consumer-addresses');
    await saveConsumerAddress({
      label: 'Home',
      street: 'Street 1',
      lat: 24.85,
      lng: 67.0,
      isDefault: true,
    });
    const otherRow = db.consumer_addresses.rows.find(
      (r) => (r as Record<string, unknown>).id === 'a-other',
    ) as Record<string, unknown>;
    expect(otherRow.is_default).toBe(true); // untouched
  });
});

describe('listConsumerAddresses', () => {
  it('rejects when no session', async () => {
    sessionMock = () => Promise.resolve(null);
    const { listConsumerAddresses } = await import(
      '@/app/actions/consumer-addresses'
    );
    const res = await listConsumerAddresses();
    expect(res.ok).toBe(false);
  });

  it('returns only this consumer rows, default first', async () => {
    db.consumer_addresses.rows.push(
      {
        id: 'a-other',
        consumer_id: 'other-id',
        label: 'Home',
        street: 'other',
        lat: 0,
        lng: 0,
        is_default: true,
        created_at: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'a-1',
        consumer_id: CONSUMER.userId,
        label: 'Office',
        street: 'work',
        lat: 0,
        lng: 0,
        is_default: false,
        created_at: '2026-04-02T00:00:00.000Z',
      },
      {
        id: 'a-2',
        consumer_id: CONSUMER.userId,
        label: 'Home',
        street: 'house',
        lat: 0,
        lng: 0,
        is_default: true,
        created_at: '2026-04-01T00:00:00.000Z',
      },
    );
    const { listConsumerAddresses } = await import(
      '@/app/actions/consumer-addresses'
    );
    const res = await listConsumerAddresses();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toHaveLength(2);
    expect(res.data.map((a) => a.id)).not.toContain('a-other');
    // Default must be first.
    expect(res.data[0]?.is_default).toBe(true);
    expect(res.data[0]?.id).toBe('a-2');
  });
});

describe('getConsumerAddress', () => {
  it('rejects when no session', async () => {
    sessionMock = () => Promise.resolve(null);
    const { getConsumerAddress } = await import(
      '@/app/actions/consumer-addresses'
    );
    const res = await getConsumerAddress('00000000-0000-4000-8000-000000000bbb');
    expect(res.ok).toBe(false);
  });

  it("refuses to return another consumer's address", async () => {
    db.consumer_addresses.rows.push({
      id: '11111111-1111-4111-8111-111111111111',
      consumer_id: 'OTHER',
      label: 'X',
      street: 'x',
      lat: 0,
      lng: 0,
      is_default: false,
      created_at: '2026-04-01T00:00:00.000Z',
    });
    const { getConsumerAddress } = await import(
      '@/app/actions/consumer-addresses'
    );
    const res = await getConsumerAddress('11111111-1111-4111-8111-111111111111');
    expect(res.ok).toBe(false);
  });

  it("returns an address the consumer owns", async () => {
    db.consumer_addresses.rows.push({
      id: '22222222-2222-4222-8222-222222222222',
      consumer_id: CONSUMER.userId,
      label: 'Home',
      street: 'mine',
      lat: 24.85,
      lng: 67.0,
      is_default: true,
      created_at: '2026-04-01T00:00:00.000Z',
    });
    const { getConsumerAddress } = await import(
      '@/app/actions/consumer-addresses'
    );
    const res = await getConsumerAddress('22222222-2222-4222-8222-222222222222');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.label).toBe('Home');
    expect(res.data.lat).toBe(24.85);
  });
});
