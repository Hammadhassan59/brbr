/**
 * Tests for src/app/actions/marketplace-reviews.ts — two-way rating
 * submission (consumer → salon, salon → consumer), window/status helpers,
 * and the consumer's "my reviews" list.
 *
 * Shape of the mock supabase:
 *   - An in-memory table store with a minimal query builder (select, eq, in,
 *     maybeSingle, single, then, insert with .select().single()).
 *   - We do NOT simulate the DB triggers that update `branches.rating_avg`
 *     or the `enforce_salon_review_home_only` constraint — the tests that
 *     need those assert either (a) the row lands with the correct shape so
 *     the DB trigger would fire, or (b) the app-side pre-trigger assert
 *     rejects the case with a friendlier message.
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

  const exec = () => {
    const rows = state.rows.filter((r) => matches(r, filters));
    return { data: rows, error: null };
  };

  const chain: Record<string, unknown> = {
    select: (_cols?: string) => chain,
    eq: (col: string, val: unknown) => {
      filters.push({ op: 'eq', col, val });
      return chain;
    },
    in: (col: string, val: unknown[]) => {
      filters.push({ op: 'in', col, val });
      return chain;
    },
    order: (_col: string, _opts?: unknown) => chain,
    limit: (_n: number) => chain,
    maybeSingle: async () => {
      const res = exec();
      return { data: res.data?.[0] ?? null, error: null };
    },
    single: async () => {
      const res = exec();
      return { data: res.data?.[0] ?? null, error: null };
    },
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve(exec()),
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
// Session mocks
// ═══════════════════════════════════════════════════════════════════════════

let consumerSessionMock: (() => Promise<unknown>) | null = null;
vi.mock('@/lib/consumer-session', () => ({
  getConsumerSession: () => (consumerSessionMock ? consumerSessionMock() : Promise.resolve(null)),
}));

let verifySessionMock: (() => Promise<unknown>) | null = null;
vi.mock('@/app/actions/auth', () => ({
  verifySession: () => (verifySessionMock ? verifySessionMock() : Promise.reject(new Error('no session'))),
}));

// ═══════════════════════════════════════════════════════════════════════════
// Fixtures
// ═══════════════════════════════════════════════════════════════════════════

const CONSUMER = {
  userId: '00000000-0000-4000-8000-000000000001',
  name: 'Ayesha Khan',
  email: 'ayesha@example.com',
  phone: '03001234567',
};

const OTHER_CONSUMER_ID = '00000000-0000-4000-8000-000000000002';

const SALON_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_SALON_ID = '22222222-2222-4222-8222-222222222222';
const BRANCH_ID = '33333333-3333-4333-8333-333333333333';

const BOOKING_ID_AT_SALON_COMPLETED = '44444444-4444-4444-8444-444444444441';
const BOOKING_ID_HOME_COMPLETED = '44444444-4444-4444-8444-444444444442';
const BOOKING_ID_PENDING = '44444444-4444-4444-8444-444444444443';
const BOOKING_ID_WINDOW_CLOSED = '44444444-4444-4444-8444-444444444444';
const BOOKING_ID_OTHER_SALON = '44444444-4444-4444-8444-444444444445';

function salonSession(salonId: string = SALON_ID) {
  return Promise.resolve({
    salonId,
    staffId: 'staff-1',
    role: 'owner',
    primaryBranchId: BRANCH_ID,
    branchId: BRANCH_ID,
    branchIds: [BRANCH_ID],
    permissions: { '*': true },
    name: 'Owner Name',
  });
}

function consumerSession() {
  return Promise.resolve({ ...CONSUMER });
}

function openWindow(): string {
  return new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
}

function closedWindow(): string {
  return new Date(Date.now() - 60 * 1000).toISOString();
}

/**
 * Reset + seed a standard set of bookings covering every branch of the
 * review rules we want to exercise.
 */
function seedWorld() {
  for (const k of Object.keys(db)) delete db[k];

  db.consumers = {
    rows: [
      { id: CONSUMER.userId, name: CONSUMER.name, phone: CONSUMER.phone },
    ],
  };

  db.branches = {
    rows: [
      { id: BRANCH_ID, name: 'Downtown Cuts', salon_id: SALON_ID, slug: 'downtown-cuts' },
    ],
  };

  db.salons = {
    rows: [
      { id: SALON_ID, name: 'Downtown Cuts HQ' },
      { id: OTHER_SALON_ID, name: 'Other Salon' },
    ],
  };

  db.bookings = {
    rows: [
      {
        id: BOOKING_ID_AT_SALON_COMPLETED,
        consumer_id: CONSUMER.userId,
        branch_id: BRANCH_ID,
        salon_id: SALON_ID,
        status: 'COMPLETED',
        location_type: 'in_salon',
        review_window_closes_at: openWindow(),
      },
      {
        id: BOOKING_ID_HOME_COMPLETED,
        consumer_id: CONSUMER.userId,
        branch_id: BRANCH_ID,
        salon_id: SALON_ID,
        status: 'COMPLETED',
        location_type: 'home',
        review_window_closes_at: openWindow(),
      },
      {
        id: BOOKING_ID_PENDING,
        consumer_id: CONSUMER.userId,
        branch_id: BRANCH_ID,
        salon_id: SALON_ID,
        status: 'PENDING',
        location_type: 'in_salon',
        review_window_closes_at: null,
      },
      {
        id: BOOKING_ID_WINDOW_CLOSED,
        consumer_id: CONSUMER.userId,
        branch_id: BRANCH_ID,
        salon_id: SALON_ID,
        status: 'COMPLETED',
        location_type: 'home',
        review_window_closes_at: closedWindow(),
      },
      {
        id: BOOKING_ID_OTHER_SALON,
        consumer_id: OTHER_CONSUMER_ID,
        branch_id: BRANCH_ID,
        salon_id: OTHER_SALON_ID,
        status: 'COMPLETED',
        location_type: 'home',
        review_window_closes_at: openWindow(),
      },
    ],
  };

  db.reviews = { rows: [] };
}

// ═══════════════════════════════════════════════════════════════════════════
// Test-lifecycle setup
// ═══════════════════════════════════════════════════════════════════════════

beforeEach(async () => {
  vi.clearAllMocks();
  seedWorld();
  consumerSessionMock = consumerSession;
  verifySessionMock = () => salonSession();

  const { resetRateLimit } = await import('../src/lib/rate-limit');
  for (const bucket of ['review-submit-consumer', 'review-submit-salon']) {
    resetRateLimit(`${bucket}:${CONSUMER.userId}`);
    resetRateLimit(`${bucket}:${SALON_ID}`);
    resetRateLimit(`${bucket}:${OTHER_SALON_ID}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// submitConsumerReview
// ═══════════════════════════════════════════════════════════════════════════

describe('submitConsumerReview', () => {
  it('inserts a consumer_of_salon review for a completed booking inside the window', async () => {
    const { submitConsumerReview } = await import(
      '../src/app/actions/marketplace-reviews'
    );
    const res = await submitConsumerReview({
      bookingId: BOOKING_ID_AT_SALON_COMPLETED,
      rating: 5,
      comment: 'Great cut',
    });
    expect(res.ok).toBe(true);
    expect(db.reviews.rows).toHaveLength(1);
    const review = db.reviews.rows[0] as Record<string, unknown>;
    expect(review.booking_id).toBe(BOOKING_ID_AT_SALON_COMPLETED);
    expect(review.direction).toBe('consumer_of_salon');
    expect(review.rating).toBe(5);
    expect(review.comment).toBe('Great cut');
  });

  it('rejects when the review window has closed', async () => {
    const { submitConsumerReview } = await import(
      '../src/app/actions/marketplace-reviews'
    );
    const res = await submitConsumerReview({
      bookingId: BOOKING_ID_WINDOW_CLOSED,
      rating: 4,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/window/i);
    expect(db.reviews.rows).toHaveLength(0);
  });

  it('rejects when the booking is not COMPLETED', async () => {
    const { submitConsumerReview } = await import(
      '../src/app/actions/marketplace-reviews'
    );
    const res = await submitConsumerReview({
      bookingId: BOOKING_ID_PENDING,
      rating: 5,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/completed/i);
  });

  it('rejects a duplicate consumer review for the same booking', async () => {
    db.reviews.rows.push({
      id: 'r-prev',
      booking_id: BOOKING_ID_AT_SALON_COMPLETED,
      direction: 'consumer_of_salon',
      rating: 5,
      comment: null,
    });
    const { submitConsumerReview } = await import(
      '../src/app/actions/marketplace-reviews'
    );
    const res = await submitConsumerReview({
      bookingId: BOOKING_ID_AT_SALON_COMPLETED,
      rating: 3,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/already reviewed/i);
    // original review unchanged; no new row inserted
    expect(db.reviews.rows).toHaveLength(1);
  });

  it('rejects when the booking belongs to another consumer', async () => {
    const { submitConsumerReview } = await import(
      '../src/app/actions/marketplace-reviews'
    );
    const res = await submitConsumerReview({
      bookingId: BOOKING_ID_OTHER_SALON,
      rating: 5,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not allowed/i);
  });

  it('rejects invalid ratings (not 1-5)', async () => {
    const { submitConsumerReview } = await import(
      '../src/app/actions/marketplace-reviews'
    );
    const tooHigh = await submitConsumerReview({
      bookingId: BOOKING_ID_AT_SALON_COMPLETED,
      rating: 6,
    });
    expect(tooHigh.ok).toBe(false);

    const tooLow = await submitConsumerReview({
      bookingId: BOOKING_ID_AT_SALON_COMPLETED,
      rating: 0,
    });
    expect(tooLow.ok).toBe(false);
  });

  it('requires a session', async () => {
    consumerSessionMock = () => Promise.resolve(null);
    const { submitConsumerReview } = await import(
      '../src/app/actions/marketplace-reviews'
    );
    const res = await submitConsumerReview({
      bookingId: BOOKING_ID_AT_SALON_COMPLETED,
      rating: 5,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/sign in/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// submitSalonReview
// ═══════════════════════════════════════════════════════════════════════════

describe('submitSalonReview', () => {
  it('inserts a salon_of_consumer review for a completed home booking', async () => {
    const { submitSalonReview } = await import(
      '../src/app/actions/marketplace-reviews'
    );
    const res = await submitSalonReview({
      bookingId: BOOKING_ID_HOME_COMPLETED,
      rating: 4,
      comment: 'Polite and on time',
    });
    expect(res.ok).toBe(true);
    expect(db.reviews.rows).toHaveLength(1);
    const review = db.reviews.rows[0] as Record<string, unknown>;
    expect(review.direction).toBe('salon_of_consumer');
    expect(review.rating).toBe(4);
  });

  it('rejects a salon review on an in_salon booking (app-side friendly error)', async () => {
    const { submitSalonReview } = await import(
      '../src/app/actions/marketplace-reviews'
    );
    const res = await submitSalonReview({
      bookingId: BOOKING_ID_AT_SALON_COMPLETED,
      rating: 5,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/home booking/i);
    expect(db.reviews.rows).toHaveLength(0);
  });

  it('rejects a salon review cross-tenant (different salon_id on session)', async () => {
    verifySessionMock = () => salonSession(OTHER_SALON_ID);
    const { submitSalonReview } = await import(
      '../src/app/actions/marketplace-reviews'
    );
    const res = await submitSalonReview({
      bookingId: BOOKING_ID_HOME_COMPLETED,
      rating: 5,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not allowed/i);
    expect(db.reviews.rows).toHaveLength(0);
  });

  it('rejects when the review window is closed', async () => {
    const { submitSalonReview } = await import(
      '../src/app/actions/marketplace-reviews'
    );
    const res = await submitSalonReview({
      bookingId: BOOKING_ID_WINDOW_CLOSED,
      rating: 5,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/window/i);
  });

  it('rejects a duplicate salon review for the same booking', async () => {
    db.reviews.rows.push({
      id: 'r-prev',
      booking_id: BOOKING_ID_HOME_COMPLETED,
      direction: 'salon_of_consumer',
      rating: 5,
      comment: null,
    });
    const { submitSalonReview } = await import(
      '../src/app/actions/marketplace-reviews'
    );
    const res = await submitSalonReview({
      bookingId: BOOKING_ID_HOME_COMPLETED,
      rating: 3,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/already reviewed/i);
  });

  it('requires a salon session', async () => {
    verifySessionMock = () => Promise.reject(new Error('no session'));
    const { submitSalonReview } = await import(
      '../src/app/actions/marketplace-reviews'
    );
    const res = await submitSalonReview({
      bookingId: BOOKING_ID_HOME_COMPLETED,
      rating: 5,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not authenticated/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getReviewStatusForBooking — all 4 combinations
// ═══════════════════════════════════════════════════════════════════════════

describe('getReviewStatusForBooking', () => {
  it('returns (false, false, true) when neither side has reviewed and window is open', async () => {
    const { getReviewStatusForBooking } = await import(
      '../src/app/actions/marketplace-reviews'
    );
    const res = await getReviewStatusForBooking(BOOKING_ID_HOME_COMPLETED);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.consumerHasReviewed).toBe(false);
      expect(res.data.salonHasReviewed).toBe(false);
      expect(res.data.windowOpen).toBe(true);
      expect(res.data.closesAt).toBeTruthy();
    }
  });

  it('returns (true, false, true) when only consumer has reviewed', async () => {
    db.reviews.rows.push({
      id: 'r1',
      booking_id: BOOKING_ID_HOME_COMPLETED,
      direction: 'consumer_of_salon',
      rating: 5,
      comment: null,
    });
    const { getReviewStatusForBooking } = await import(
      '../src/app/actions/marketplace-reviews'
    );
    const res = await getReviewStatusForBooking(BOOKING_ID_HOME_COMPLETED);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.consumerHasReviewed).toBe(true);
      expect(res.data.salonHasReviewed).toBe(false);
    }
  });

  it('returns (false, true, true) when only salon has reviewed', async () => {
    db.reviews.rows.push({
      id: 'r1',
      booking_id: BOOKING_ID_HOME_COMPLETED,
      direction: 'salon_of_consumer',
      rating: 4,
      comment: null,
    });
    const { getReviewStatusForBooking } = await import(
      '../src/app/actions/marketplace-reviews'
    );
    const res = await getReviewStatusForBooking(BOOKING_ID_HOME_COMPLETED);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.consumerHasReviewed).toBe(false);
      expect(res.data.salonHasReviewed).toBe(true);
    }
  });

  it('returns (true, true, false) when both reviewed and window has closed', async () => {
    db.reviews.rows.push(
      {
        id: 'r1',
        booking_id: BOOKING_ID_WINDOW_CLOSED,
        direction: 'consumer_of_salon',
        rating: 5,
        comment: null,
      },
      {
        id: 'r2',
        booking_id: BOOKING_ID_WINDOW_CLOSED,
        direction: 'salon_of_consumer',
        rating: 4,
        comment: null,
      },
    );
    const { getReviewStatusForBooking } = await import(
      '../src/app/actions/marketplace-reviews'
    );
    const res = await getReviewStatusForBooking(BOOKING_ID_WINDOW_CLOSED);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.consumerHasReviewed).toBe(true);
      expect(res.data.salonHasReviewed).toBe(true);
      expect(res.data.windowOpen).toBe(false);
    }
  });

  it('works for a salon session (no consumer session)', async () => {
    consumerSessionMock = () => Promise.resolve(null);
    const { getReviewStatusForBooking } = await import(
      '../src/app/actions/marketplace-reviews'
    );
    const res = await getReviewStatusForBooking(BOOKING_ID_HOME_COMPLETED);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.windowOpen).toBe(true);
    }
  });

  it('rejects when the caller owns neither the booking nor the salon', async () => {
    consumerSessionMock = () => Promise.resolve(null);
    verifySessionMock = () => salonSession(OTHER_SALON_ID);
    const { getReviewStatusForBooking } = await import(
      '../src/app/actions/marketplace-reviews'
    );
    const res = await getReviewStatusForBooking(BOOKING_ID_HOME_COMPLETED);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not allowed/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// listRecentConsumerReviewsByConsumer
// ═══════════════════════════════════════════════════════════════════════════

describe('listRecentConsumerReviewsByConsumer', () => {
  it('returns the consumer\'s own consumer_of_salon reviews, newest first', async () => {
    const now = Date.now();
    db.reviews.rows.push(
      {
        id: 'r1',
        booking_id: BOOKING_ID_AT_SALON_COMPLETED,
        direction: 'consumer_of_salon',
        rating: 5,
        comment: 'nice',
        created_at: new Date(now - 60_000).toISOString(),
      },
      {
        id: 'r2',
        booking_id: BOOKING_ID_HOME_COMPLETED,
        direction: 'consumer_of_salon',
        rating: 4,
        comment: null,
        created_at: new Date(now).toISOString(),
      },
      // salon→consumer review in the set — must be filtered out
      {
        id: 'r3',
        booking_id: BOOKING_ID_HOME_COMPLETED,
        direction: 'salon_of_consumer',
        rating: 3,
        comment: null,
        created_at: new Date(now).toISOString(),
      },
    );
    const { listRecentConsumerReviewsByConsumer } = await import(
      '../src/app/actions/marketplace-reviews'
    );
    const res = await listRecentConsumerReviewsByConsumer(10);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toHaveLength(2);
      expect(res.data[0].id).toBe('r2'); // newest first
      expect(res.data[0].salon_name).toBe('Downtown Cuts HQ');
      expect(res.data[0].branch_slug).toBe('downtown-cuts');
    }
  });

  it('returns empty array when the consumer has no bookings', async () => {
    db.bookings.rows = [];
    const { listRecentConsumerReviewsByConsumer } = await import(
      '../src/app/actions/marketplace-reviews'
    );
    const res = await listRecentConsumerReviewsByConsumer();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual([]);
  });

  it('requires a session', async () => {
    consumerSessionMock = () => Promise.resolve(null);
    const { listRecentConsumerReviewsByConsumer } = await import(
      '../src/app/actions/marketplace-reviews'
    );
    const res = await listRecentConsumerReviewsByConsumer();
    expect(res.ok).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Migration 041 contract — keep the trigger invariants in the same file so
// drift from the DB schema shows up immediately in `npm test`.
// ═══════════════════════════════════════════════════════════════════════════

describe('DB review trigger contract (migration 041)', () => {
  it('includes enforce_salon_review_home_only trigger', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const sql = readFileSync(
      path.join(__dirname, '..', 'supabase', 'migrations', '041_marketplace_groundwork.sql'),
      'utf8',
    );
    expect(sql).toMatch(/enforce_salon_review_home_only/);
    expect(sql).toMatch(/Salon can only review consumers on home bookings/);
  });

  it('includes update_branch_rating_agg + update_consumer_rating_agg triggers', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const sql = readFileSync(
      path.join(__dirname, '..', 'supabase', 'migrations', '041_marketplace_groundwork.sql'),
      'utf8',
    );
    expect(sql).toMatch(/update_branch_rating_agg/);
    expect(sql).toMatch(/update_consumer_rating_agg/);
    expect(sql).toMatch(/UNIQUE\s*\(\s*booking_id,\s*direction\s*\)/);
  });
});
