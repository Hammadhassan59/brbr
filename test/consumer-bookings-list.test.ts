/**
 * Tests for `listBookingsForConsumer` (Week 5 addition to
 * `src/app/actions/bookings.ts`) — the server action that powers the
 * `/account/bookings` list page.
 *
 * Covers:
 *   - auth gate (no session → fail)
 *   - consumer-id scoping (other consumers' bookings never leak)
 *   - upcoming vs past status split
 *   - limit cap at 50
 *   - branch name/slug is attached on each row
 *
 * Same in-memory Supabase mock shape as `test/booking-actions.test.ts`.
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
    if (f.op === 'in') return Array.isArray(f.val) && (f.val as unknown[]).includes(v);
    return false;
  });
}

function builder(tableName: string) {
  const state = tbl(tableName);
  const filters: Array<{ op: string; col: string; val: unknown }> = [];
  const orders: Array<{ col: string; ascending: boolean }> = [];
  let limitN: number | null = null;

  const exec = () => {
    let rows = state.rows.filter((r) => matches(r, filters));
    for (const o of [...orders].reverse()) {
      rows = [...rows].sort((a, b) => {
        const av = a[o.col];
        const bv = b[o.col];
        if (av === bv) return 0;
        const cmp = (av as string | number) > (bv as string | number) ? 1 : -1;
        return o.ascending ? cmp : -cmp;
      });
    }
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
    order: (col: string, opts?: { ascending?: boolean }) => {
      orders.push({ col, ascending: opts?.ascending !== false });
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
    single: async () => {
      const res = exec();
      return { data: res.data[0] ?? null, error: null };
    },
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve(exec()),
  };
  return chain;
}

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: (table: string) => {
      return {
        select: () => builder(table),
      };
    },
    auth: {
      admin: { getUserById: async () => ({ data: { user: null }, error: null }) },
    },
  }),
}));

// ═══════════════════════════════════════════════════════════════════════════
// Session mocks
// ═══════════════════════════════════════════════════════════════════════════

const CONSUMER = {
  userId: '00000000-0000-4000-8000-000000000111',
  name: 'Ayesha Khan',
  email: 'ayesha@example.com',
  phone: '03001234567',
};

const OTHER_CONSUMER_ID = '99999999-9999-4999-8999-999999999999';

let consumerSessionMock: (() => Promise<unknown>) | null = null;
vi.mock('@/lib/consumer-session', () => ({
  getConsumerSession: () =>
    consumerSessionMock ? consumerSessionMock() : Promise.resolve(null),
}));

vi.mock('@/app/actions/auth', () => ({
  verifySession: () => Promise.reject(new Error('no salon session')),
}));

vi.mock('@/lib/marketplace/emails', () => ({
  sendBookingReceivedEmail: async () => ({ ok: true }),
  sendBookingConfirmedEmail: async () => ({ ok: true }),
  sendBookingDeclinedEmail: async () => ({ ok: true }),
  sendBookingCancelledBySalonEmail: async () => ({ ok: true }),
  sendBookingCompletedReviewPromptEmail: async () => ({ ok: true }),
  sendSalonHomeBookingReviewPromptEmail: async () => ({ ok: true }),
}));

// ═══════════════════════════════════════════════════════════════════════════
// Fixtures
// ═══════════════════════════════════════════════════════════════════════════

const BRANCH_A = 'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BRANCH_B = 'bbbb2222-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function seed() {
  for (const k of Object.keys(db)) delete db[k];
  db.branches = {
    rows: [
      { id: BRANCH_A, name: 'Downtown Cuts', slug: 'downtown-cuts' },
      { id: BRANCH_B, name: 'Royal Salon', slug: 'royal-salon' },
    ],
  };
  db.bookings = {
    rows: [
      // Upcoming — ours
      {
        id: 'book-1',
        consumer_id: CONSUMER.userId,
        branch_id: BRANCH_A,
        status: 'PENDING',
        location_type: 'in_salon',
        requested_slot_start: '2026-05-01T10:00:00.000Z',
        requested_slot_end: '2026-05-01T11:00:00.000Z',
        consumer_total: 2000,
        created_at: '2026-04-18T10:00:00.000Z',
        completed_at: null,
      },
      {
        id: 'book-2',
        consumer_id: CONSUMER.userId,
        branch_id: BRANCH_B,
        status: 'CONFIRMED',
        location_type: 'home',
        requested_slot_start: '2026-05-02T12:00:00.000Z',
        requested_slot_end: '2026-05-02T13:00:00.000Z',
        consumer_total: 3000,
        created_at: '2026-04-18T11:00:00.000Z',
        completed_at: null,
      },
      // Past — ours
      {
        id: 'book-3',
        consumer_id: CONSUMER.userId,
        branch_id: BRANCH_A,
        status: 'COMPLETED',
        location_type: 'in_salon',
        requested_slot_start: '2026-03-15T10:00:00.000Z',
        requested_slot_end: '2026-03-15T11:00:00.000Z',
        consumer_total: 1500,
        created_at: '2026-03-10T10:00:00.000Z',
        completed_at: '2026-03-15T11:30:00.000Z',
      },
      {
        id: 'book-4',
        consumer_id: CONSUMER.userId,
        branch_id: BRANCH_B,
        status: 'CANCELLED_BY_CONSUMER',
        location_type: 'in_salon',
        requested_slot_start: '2026-03-01T10:00:00.000Z',
        requested_slot_end: '2026-03-01T11:00:00.000Z',
        consumer_total: 1000,
        created_at: '2026-02-28T10:00:00.000Z',
        completed_at: null,
      },
      // Another consumer's booking — should never surface.
      {
        id: 'book-other',
        consumer_id: OTHER_CONSUMER_ID,
        branch_id: BRANCH_A,
        status: 'PENDING',
        location_type: 'in_salon',
        requested_slot_start: '2026-05-05T10:00:00.000Z',
        requested_slot_end: '2026-05-05T11:00:00.000Z',
        consumer_total: 500,
        created_at: '2026-04-18T10:00:00.000Z',
        completed_at: null,
      },
    ],
  };
}

beforeEach(() => {
  seed();
  consumerSessionMock = () => Promise.resolve({ ...CONSUMER });
});

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('listBookingsForConsumer', () => {
  it('rejects when no session', async () => {
    consumerSessionMock = () => Promise.resolve(null);
    const { listBookingsForConsumer } = await import('@/app/actions/bookings');
    const res = await listBookingsForConsumer();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/sign in/i);
  });

  it('scopes to the caller — never leaks other consumers', async () => {
    const { listBookingsForConsumer } = await import('@/app/actions/bookings');
    const res = await listBookingsForConsumer();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // 4 of ours (2 upcoming + 2 past). The other consumer's book-other never
    // appears.
    expect(res.data.map((b) => b.id).sort()).toEqual(['book-1', 'book-2', 'book-3', 'book-4']);
    for (const b of res.data) {
      expect(b.id).not.toBe('book-other');
    }
  });

  it('upcoming bucket returns PENDING/CONFIRMED/IN_PROGRESS only', async () => {
    const { listBookingsForConsumer } = await import('@/app/actions/bookings');
    const res = await listBookingsForConsumer({ bucket: 'upcoming' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.map((b) => b.id).sort()).toEqual(['book-1', 'book-2']);
    for (const b of res.data) {
      expect(['PENDING', 'CONFIRMED', 'IN_PROGRESS']).toContain(b.status);
    }
  });

  it('past bucket returns COMPLETED/DECLINED/CANCELLED*/NO_SHOW only', async () => {
    const { listBookingsForConsumer } = await import('@/app/actions/bookings');
    const res = await listBookingsForConsumer({ bucket: 'past' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.map((b) => b.id).sort()).toEqual(['book-3', 'book-4']);
    for (const b of res.data) {
      expect(['COMPLETED', 'DECLINED', 'CANCELLED_BY_CONSUMER', 'CANCELLED_BY_SALON', 'NO_SHOW']).toContain(b.status);
    }
  });

  it('attaches branch name + slug to each row', async () => {
    const { listBookingsForConsumer } = await import('@/app/actions/bookings');
    const res = await listBookingsForConsumer({ bucket: 'upcoming' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const book1 = res.data.find((b) => b.id === 'book-1');
    expect(book1?.branch.name).toBe('Downtown Cuts');
    expect(book1?.branch.slug).toBe('downtown-cuts');
    const book2 = res.data.find((b) => b.id === 'book-2');
    expect(book2?.branch.name).toBe('Royal Salon');
    expect(book2?.branch.slug).toBe('royal-salon');
  });

  it('caps limit at 50 even when caller asks for more', async () => {
    // Seed 60 additional rows for the caller.
    for (let i = 0; i < 60; i++) {
      db.bookings.rows.push({
        id: `pad-${i}`,
        consumer_id: CONSUMER.userId,
        branch_id: BRANCH_A,
        status: 'PENDING',
        location_type: 'in_salon',
        requested_slot_start: `2026-06-${String((i % 28) + 1).padStart(2, '0')}T10:00:00.000Z`,
        requested_slot_end: `2026-06-${String((i % 28) + 1).padStart(2, '0')}T11:00:00.000Z`,
        consumer_total: 100 * i,
        created_at: '2026-04-18T10:00:00.000Z',
        completed_at: null,
      });
    }
    const { listBookingsForConsumer } = await import('@/app/actions/bookings');
    const res = await listBookingsForConsumer({ bucket: 'upcoming', limit: 999 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.length).toBeLessThanOrEqual(50);
  });

  it('respects explicit status filter', async () => {
    const { listBookingsForConsumer } = await import('@/app/actions/bookings');
    const res = await listBookingsForConsumer({ status: 'COMPLETED' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.map((b) => b.id)).toEqual(['book-3']);
  });

  it('returns empty array when consumer has no bookings', async () => {
    // Flip the session to a consumer with no rows.
    consumerSessionMock = () =>
      Promise.resolve({
        userId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        name: 'Nobody',
        email: 'nobody@example.com',
        phone: '03001234567',
      });
    const { listBookingsForConsumer } = await import('@/app/actions/bookings');
    const res = await listBookingsForConsumer();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toEqual([]);
  });
});
