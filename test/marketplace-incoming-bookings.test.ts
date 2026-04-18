/**
 * Tests for the salon-side "Incoming Bookings" realtime panel:
 *
 *   - `getConsumerByIdForSalon` (src/lib/marketplace/consumer-for-salon.ts)
 *     Cross-tenant boundary: a salon can only read a consumer's rating +
 *     contact when that consumer has at least one booking at their salon.
 *
 *   - `replaceRow` and `mergePolledRows` (panel helpers)
 *     Realtime UPDATE payload handler correctness.
 *
 *   - `STATUS_BADGE`
 *     Every booking status in the 8-value enum resolves to a label + class —
 *     ensures a row never renders with a blank badge.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── In-memory Supabase mock (shape matches consumer-for-salon.ts only) ───

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
    limit: (n: number) => {
      limitN = n;
      return chain;
    },
    maybeSingle: async () => {
      const res = exec();
      return { data: res.data[0] ?? null, error: null };
    },
    then: (resolve: (v: { data: Row[] | null; error: unknown }) => unknown) => {
      return resolve(exec());
    },
  };
  return chain;
}

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: (table: string) => ({
      select: () => builder(table),
    }),
  }),
  supabase: {}, // the client-facing export — unused in this test file
}));

// ─── Auth mock — controlled per test ─────────────────────────────────────

let verifySessionMock: (() => Promise<unknown>) | null = null;
vi.mock('@/app/actions/auth', () => ({
  verifySession: () => (verifySessionMock ? verifySessionMock() : Promise.reject(new Error('no session'))),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────

const SALON_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_SALON_ID = '22222222-2222-4222-8222-222222222222';
const CONSUMER_ID = '99999999-9999-4999-8999-999999999999';

function salonSession(salonId: string = SALON_ID) {
  return Promise.resolve({
    salonId,
    staffId: 'staff-1',
    role: 'owner',
    primaryBranchId: 'branch-1',
    branchId: 'branch-1',
    branchIds: ['branch-1'],
    permissions: { '*': true },
    name: 'Owner',
  });
}

function seed(opts: { hasBooking: boolean; consumerRating?: { avg: number; count: number } }) {
  for (const k of Object.keys(db)) delete db[k];
  db.consumers = {
    rows: [
      {
        id: CONSUMER_ID,
        name: 'Ayesha Khan',
        phone: '03001234567',
        rating_avg: opts.consumerRating?.avg ?? null,
        rating_count: opts.consumerRating?.count ?? 0,
      },
    ],
  };
  db.bookings = {
    rows: opts.hasBooking
      ? [
          {
            id: 'booking-1',
            salon_id: SALON_ID,
            consumer_id: CONSUMER_ID,
            status: 'PENDING',
          },
        ]
      : [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  verifySessionMock = () => salonSession();
  seed({ hasBooking: false });
});

// ═══════════════════════════════════════════════════════════════════════════
// getConsumerByIdForSalon
// ═══════════════════════════════════════════════════════════════════════════

describe('getConsumerByIdForSalon', () => {
  it('rejects with "Not found" when the salon has no bookings for the consumer', async () => {
    seed({ hasBooking: false });
    const { getConsumerByIdForSalon } = await import(
      '../src/lib/marketplace/consumer-for-salon'
    );
    const res = await getConsumerByIdForSalon(CONSUMER_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not found/i);
  });

  it('rejects with "Not found" when the only booking belongs to a different salon (cross-tenant defense)', async () => {
    // Salon JWT still resolves to SALON_ID, but the booking links
    // OTHER_SALON_ID to the consumer — the helper must not return the rating.
    for (const k of Object.keys(db)) delete db[k];
    db.consumers = {
      rows: [{ id: CONSUMER_ID, name: 'Ayesha', phone: '03001', rating_avg: 4.9, rating_count: 20 }],
    };
    db.bookings = {
      rows: [{ id: 'b-other', salon_id: OTHER_SALON_ID, consumer_id: CONSUMER_ID, status: 'PENDING' }],
    };
    const { getConsumerByIdForSalon } = await import(
      '../src/lib/marketplace/consumer-for-salon'
    );
    const res = await getConsumerByIdForSalon(CONSUMER_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not found/i);
  });

  it('returns name + phone + rating when the salon has at least one booking with the consumer', async () => {
    seed({ hasBooking: true, consumerRating: { avg: 4.8, count: 12 } });
    const { getConsumerByIdForSalon } = await import(
      '../src/lib/marketplace/consumer-for-salon'
    );
    const res = await getConsumerByIdForSalon(CONSUMER_ID);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.id).toBe(CONSUMER_ID);
      expect(res.data.name).toBe('Ayesha Khan');
      expect(res.data.phone).toBe('03001234567');
      expect(res.data.rating_avg).toBe(4.8);
      expect(res.data.rating_count).toBe(12);
    }
  });

  it('returns rating_avg=null + rating_count=0 for a consumer with no reviews yet', async () => {
    seed({ hasBooking: true });
    const { getConsumerByIdForSalon } = await import(
      '../src/lib/marketplace/consumer-for-salon'
    );
    const res = await getConsumerByIdForSalon(CONSUMER_ID);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.rating_avg).toBeNull();
      expect(res.data.rating_count).toBe(0);
    }
  });

  it('rejects when there is no salon session', async () => {
    verifySessionMock = () => Promise.reject(new Error('no session'));
    const { getConsumerByIdForSalon } = await import(
      '../src/lib/marketplace/consumer-for-salon'
    );
    const res = await getConsumerByIdForSalon(CONSUMER_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not authenticated/i);
  });

  it('rejects an invalid UUID before any DB hit', async () => {
    const { getConsumerByIdForSalon } = await import(
      '../src/lib/marketplace/consumer-for-salon'
    );
    const res = await getConsumerByIdForSalon('not-a-uuid');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/invalid/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Panel helpers — realtime UPDATE handler
// ═══════════════════════════════════════════════════════════════════════════

describe('panel helpers', () => {
  // Dynamically import to share the same module instance as production —
  // helpers are exported from the client component.
  async function loadHelpers() {
    return await import(
      '../src/app/dashboard/marketplace-bookings/components/incoming-bookings-client'
    );
  }

  const base = {
    id: 'b1',
    consumer_id: CONSUMER_ID,
    branch_id: 'branch-1',
    status: 'PENDING' as const,
    location_type: 'in_salon' as const,
    requested_slot_start: '2026-05-01T12:00:00Z',
    requested_slot_end: '2026-05-01T13:00:00Z',
    consumer_total: 1500,
    address_street: null,
    consumer_notes: null,
    created_at: '2026-04-18T10:00:00Z',
  };

  it('replaceRow replaces the matching row on UPDATE', async () => {
    const { replaceRow } = await loadHelpers();
    const rows = [base, { ...base, id: 'b2' }];
    const updated = { ...base, status: 'CONFIRMED' as const };
    const out = replaceRow(rows, updated);
    expect(out).toHaveLength(2);
    expect(out[0].status).toBe('CONFIRMED');
    expect(out[1].id).toBe('b2');
  });

  it('replaceRow prepends when the id was not in the list yet', async () => {
    const { replaceRow } = await loadHelpers();
    const rows = [{ ...base, id: 'b2' }];
    const incoming = { ...base, id: 'b-new', status: 'PENDING' as const };
    const out = replaceRow(rows, incoming);
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe('b-new');
  });

  it('mergePolledRows keeps previously seen rows (even if they moved out of PENDING)', async () => {
    const { mergePolledRows } = await loadHelpers();
    const prev = [
      { ...base, id: 'b1', status: 'CONFIRMED' as const },
      { ...base, id: 'b2', status: 'PENDING' as const },
    ];
    // The poll only ever returns PENDING, so 'b1' is absent — it must not
    // vanish from the panel just because it's CONFIRMED now.
    const polled = [{ ...base, id: 'b2', status: 'PENDING' as const }];
    const out = mergePolledRows(prev, polled);
    expect(out.find((r) => r.id === 'b1')).toBeDefined();
    expect(out.find((r) => r.id === 'b2')).toBeDefined();
  });

  it('mergePolledRows prepends brand-new polled PENDING rows', async () => {
    const { mergePolledRows } = await loadHelpers();
    const prev = [{ ...base, id: 'b1' }];
    const polled = [
      { ...base, id: 'b1' },
      { ...base, id: 'b-new', status: 'PENDING' as const },
    ];
    const out = mergePolledRows(prev, polled);
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe('b-new');
  });

  it('sortRows puts PENDING first, then by slot ascending', async () => {
    const { sortRows } = await loadHelpers();
    const rows = [
      { id: '1', status: 'CONFIRMED' as const, requested_slot_start: '2026-05-01T12:00:00Z' },
      { id: '2', status: 'PENDING' as const, requested_slot_start: '2026-05-02T12:00:00Z' },
      { id: '3', status: 'PENDING' as const, requested_slot_start: '2026-05-01T09:00:00Z' },
      { id: '4', status: 'COMPLETED' as const, requested_slot_start: '2026-05-01T08:00:00Z' },
    ];
    const out = sortRows(rows);
    expect(out.map((r) => r.id)).toEqual(['3', '2', '4', '1']);
  });

  it('normalizePhoneForWa strips +/ spaces and fixes a leading 0', async () => {
    const { normalizePhoneForWa } = await loadHelpers();
    expect(normalizePhoneForWa('03001234567')).toBe('923001234567');
    expect(normalizePhoneForWa('+92 300 123 4567')).toBe('923001234567');
    expect(normalizePhoneForWa('923001234567')).toBe('923001234567');
  });

  it('humanizeSlot produces "Today X" / "Tomorrow X" / weekday labels', async () => {
    const { humanizeSlot } = await loadHelpers();
    const now = new Date('2026-04-18T10:00:00');
    const today = new Date('2026-04-18T15:00:00').toISOString();
    const tomorrow = new Date('2026-04-19T10:30:00').toISOString();
    const friday = new Date('2026-04-24T16:00:00').toISOString(); // a Friday
    expect(humanizeSlot(today, now)).toMatch(/^Today /);
    expect(humanizeSlot(tomorrow, now)).toMatch(/^Tomorrow /);
    expect(humanizeSlot(friday, now)).toMatch(/^Fri /);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Status badge rendering — every status resolves to a label + class
// ═══════════════════════════════════════════════════════════════════════════

describe('STATUS_BADGE', () => {
  const STATUSES = [
    'PENDING',
    'CONFIRMED',
    'DECLINED',
    'CANCELLED_BY_CONSUMER',
    'CANCELLED_BY_SALON',
    'IN_PROGRESS',
    'COMPLETED',
    'NO_SHOW',
  ] as const;

  it.each(STATUSES)('defines a label and class for %s', async (status) => {
    const { STATUS_BADGE } = await import(
      '../src/app/dashboard/marketplace-bookings/components/incoming-bookings-client'
    );
    const entry = STATUS_BADGE[status];
    expect(entry).toBeTruthy();
    expect(typeof entry.label).toBe('string');
    expect(entry.label.length).toBeGreaterThan(0);
    expect(typeof entry.cls).toBe('string');
    expect(entry.cls.length).toBeGreaterThan(0);
  });

  it('marks terminal statuses correctly', async () => {
    const { TERMINAL_STATUSES } = await import(
      '../src/app/dashboard/marketplace-bookings/components/incoming-bookings-client'
    );
    expect(TERMINAL_STATUSES.has('COMPLETED')).toBe(true);
    expect(TERMINAL_STATUSES.has('DECLINED')).toBe(true);
    expect(TERMINAL_STATUSES.has('CANCELLED_BY_CONSUMER')).toBe(true);
    expect(TERMINAL_STATUSES.has('CANCELLED_BY_SALON')).toBe(true);
    expect(TERMINAL_STATUSES.has('NO_SHOW')).toBe(true);
    expect(TERMINAL_STATUSES.has('PENDING')).toBe(false);
    expect(TERMINAL_STATUSES.has('CONFIRMED')).toBe(false);
    expect(TERMINAL_STATUSES.has('IN_PROGRESS')).toBe(false);
  });
});
