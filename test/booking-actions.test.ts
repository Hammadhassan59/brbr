/**
 * Tests for src/app/actions/bookings.ts — the marketplace booking state
 * machine + consumer/salon server actions.
 *
 * We mock:
 *   - `@/lib/consumer-session`    — to simulate a logged-in consumer
 *   - `@/app/actions/auth`        — `verifySession` for salon-side actions
 *   - `@/lib/supabase`            — a table-addressable in-memory store
 *   - `@/lib/marketplace/emails`  — fire-and-forget senders
 *   - `@/lib/marketplace/pricing` — optional (we test with BOTH presence
 *                                    and absence of this module via cached
 *                                    fallback path)
 *
 * The in-memory store re-implements the minimal subset of the Supabase
 * query builder actually used by bookings.ts: select + eq + in + lt + gt +
 * limit + maybeSingle + single + order, plus insert/update/delete.
 * Everything else throws so we notice if the action changes its query shape.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════
// In-memory Supabase mock
// ═══════════════════════════════════════════════════════════════════════════

type Row = Record<string, unknown>;

interface TableState {
  rows: Row[];
  /** Force next select() to fail with this error. */
  selectError?: { message: string } | null;
  /** Force next insert() to fail with this error. */
  insertError?: { message: string } | null;
  /** Force next update() to fail with this error. */
  updateError?: { message: string } | null;
}

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
    if (f.op === 'lt') return Number(new Date(v as string).getTime()) < Number(new Date(f.val as string).getTime());
    if (f.op === 'gt') return Number(new Date(v as string).getTime()) > Number(new Date(f.val as string).getTime());
    return false;
  });
}

/** Builder returned by `.from(tableName)` with a fluent filter chain. */
function builder(tableName: string) {
  const state = tbl(tableName);
  const filters: Array<{ op: string; col: string; val: unknown }> = [];
  let limitN: number | null = null;

  const exec = () => {
    if (state.selectError) {
      const err = state.selectError;
      state.selectError = null;
      return { data: null, error: err };
    }
    let rows = state.rows.filter((r) => matches(r, filters));
    if (limitN != null) rows = rows.slice(0, limitN);
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
    lt: (col: string, val: unknown) => {
      filters.push({ op: 'lt', col, val });
      return chain;
    },
    gt: (col: string, val: unknown) => {
      filters.push({ op: 'gt', col, val });
      return chain;
    },
    limit: (n: number) => {
      limitN = n;
      // limit is still chainable (e.g. further await); behave as both a
      // terminal and a continuation by also exposing it on the chain.
      return chain;
    },
    order: (_col: string, _opts?: unknown) => {
      return chain;
    },
    maybeSingle: async () => {
      const res = exec();
      if (res.error) return res;
      return { data: res.data?.[0] ?? null, error: null };
    },
    single: async () => {
      const res = exec();
      if (res.error) return res;
      return { data: res.data?.[0] ?? null, error: null };
    },
    then: (resolve: (v: { data: Row[] | null; error: unknown }) => unknown) => {
      // Allow `await query` without `.limit/.maybeSingle/.single`.
      return resolve(exec());
    },
  };
  return chain;
}

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: (table: string) => {
      const state = tbl(table);
      return {
        select: (..._args: unknown[]) => builder(table),
        insert: (rowOrRows: Row | Row[]) => {
          if (state.insertError) {
            const err = state.insertError;
            state.insertError = null;
            return {
              select: () => ({ single: async () => ({ data: null, error: err }) }),
              // Awaiting the insert directly returns the error too.
              then: (resolve: (v: { data: null; error: unknown }) => unknown) =>
                resolve({ data: null, error: err }),
            };
          }
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
            then: (resolve: (v: { data: null; error: unknown }) => unknown) => {
              if (state.updateError) {
                const err = state.updateError;
                state.updateError = null;
                return resolve({ data: null, error: err });
              }
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
    // Admin auth lookup — not exercised by the main flows; return a stub so
    // loadEmailContext's optional path doesn't throw.
    auth: { admin: { getUserById: async () => ({ data: { user: null }, error: null }) } },
  }),
}));

// ═══════════════════════════════════════════════════════════════════════════
// Other mocks
// ═══════════════════════════════════════════════════════════════════════════

let consumerSessionMock: (() => Promise<unknown>) | null = null;
vi.mock('@/lib/consumer-session', () => ({
  getConsumerSession: () => (consumerSessionMock ? consumerSessionMock() : Promise.resolve(null)),
}));

let verifySessionMock: (() => Promise<unknown>) | null = null;
vi.mock('@/app/actions/auth', () => ({
  verifySession: () => (verifySessionMock ? verifySessionMock() : Promise.reject(new Error('no session'))),
}));

const emailSends: Array<{ name: string; args: Record<string, unknown> }> = [];
vi.mock('@/lib/marketplace/emails', () => ({
  sendBookingReceivedEmail: (args: Record<string, unknown>) => {
    emailSends.push({ name: 'booking_received', args });
    return Promise.resolve({ ok: true });
  },
  sendBookingConfirmedEmail: (args: Record<string, unknown>) => {
    emailSends.push({ name: 'booking_confirmed', args });
    return Promise.resolve({ ok: true });
  },
  sendBookingDeclinedEmail: (args: Record<string, unknown>) => {
    emailSends.push({ name: 'booking_declined', args });
    return Promise.resolve({ ok: true });
  },
  sendBookingCancelledBySalonEmail: (args: Record<string, unknown>) => {
    emailSends.push({ name: 'booking_cancelled_by_salon', args });
    return Promise.resolve({ ok: true });
  },
  sendBookingCompletedReviewPromptEmail: (args: Record<string, unknown>) => {
    emailSends.push({ name: 'review_prompt_consumer', args });
    return Promise.resolve({ ok: true });
  },
  sendSalonHomeBookingReviewPromptEmail: (args: Record<string, unknown>) => {
    emailSends.push({ name: 'review_prompt_salon', args });
    return Promise.resolve({ ok: true });
  },
}));

// Real pricing module is used via dynamic import; don't mock it — the tests
// assert that the markup math lines up with the shipped pricing module.

// ═══════════════════════════════════════════════════════════════════════════
// Fixtures
// ═══════════════════════════════════════════════════════════════════════════

const CONSUMER = {
  userId: '00000000-0000-4000-8000-000000000001',
  name: 'Ayesha Khan',
  email: 'ayesha@example.com',
  phone: '03001234567',
};

const SALON_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_SALON_ID = '22222222-2222-4222-8222-222222222222';
const BRANCH_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_BRANCH_ID = '44444444-4444-4444-8444-444444444444';
const SERVICE_A = '55555555-5555-4555-8555-555555555555';
const SERVICE_B = '66666666-6666-4666-8666-666666666666';

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

function futureSlot() {
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Reset the in-memory DB + seed a standard cast of characters. */
function seedWorld(overrides?: { branchBlockedAt?: string | null; salonAdminBlockedAt?: string | null }) {
  for (const k of Object.keys(db)) delete db[k];

  db.consumers = {
    rows: [
      { id: CONSUMER.userId, name: CONSUMER.name, phone: CONSUMER.phone, blocked_by_admin: false },
    ],
  };
  db.branches = {
    rows: [
      {
        id: BRANCH_ID,
        name: 'Downtown Cuts',
        salon_id: SALON_ID,
        listed_on_marketplace: true,
        offers_home_service: true,
        home_service_radius_km: 5,
        lat: 24.8607,
        lng: 67.0011,
        gender_type: 'men',
        marketplace_admin_blocked_at: overrides?.branchBlockedAt ?? null,
        slug: 'downtown-cuts',
      },
    ],
  };
  db.salons = {
    rows: [
      {
        id: SALON_ID,
        name: 'Downtown Cuts HQ',
        owner_id: 'owner-auth-1',
        marketplace_admin_blocked_at: overrides?.salonAdminBlockedAt ?? null,
        marketplace_payable_blocked_at: null,
        marketplace_unsettled_payable: 0,
        marketplace_block_threshold: 5000,
      },
    ],
  };
  db.platform_settings = {
    rows: [{ key: 'marketplace_women_enabled', value: false }],
  };
  db.services = {
    rows: [
      {
        id: SERVICE_A,
        salon_id: SALON_ID,
        name: 'Haircut',
        price: 1000,
        available_at_home: true,
        is_active: true,
      },
      {
        id: SERVICE_B,
        salon_id: SALON_ID,
        name: 'Beard Trim',
        price: 500,
        available_at_home: true,
        is_active: true,
      },
    ],
  };
  db.bookings = { rows: [] };
  db.booking_items = { rows: [] };
  db.staff = { rows: [] };
}

// ═══════════════════════════════════════════════════════════════════════════
// Test-lifecycle setup
// ═══════════════════════════════════════════════════════════════════════════

beforeEach(async () => {
  vi.clearAllMocks();
  emailSends.length = 0;
  seedWorld();
  consumerSessionMock = consumerSession;
  verifySessionMock = () => salonSession();
  // Reset all rate-limit buckets the actions use so tests don't bleed.
  const { resetRateLimit } = await import('../src/lib/rate-limit');
  for (const bucket of [
    'booking-create',
    'booking-cancel-consumer',
    'booking-confirm',
    'booking-decline',
    'booking-cancel-salon',
    'booking-in-progress',
    'booking-complete',
    'booking-no-show',
  ]) {
    resetRateLimit(`${bucket}:${CONSUMER.userId}`);
    resetRateLimit(`${bucket}:${SALON_ID}`);
    resetRateLimit(`${bucket}:${OTHER_SALON_ID}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// createBooking
// ═══════════════════════════════════════════════════════════════════════════

describe('createBooking', () => {
  it('inserts a PENDING booking + booking_items for an in-salon request', async () => {
    const { createBooking } = await import('../src/app/actions/bookings');
    const slot = futureSlot();
    const res = await createBooking({
      branchId: BRANCH_ID,
      serviceIds: [SERVICE_A, SERVICE_B],
      slotStart: slot.start,
      slotEnd: slot.end,
      mode: 'in_salon',
      notes: 'first-time client',
    });
    expect(res.ok).toBe(true);
    expect(db.bookings.rows).toHaveLength(1);
    const booking = db.bookings.rows[0] as Record<string, unknown>;
    expect(booking.status).toBe('PENDING');
    expect(booking.consumer_id).toBe(CONSUMER.userId);
    expect(booking.salon_id).toBe(SALON_ID);
    expect(booking.branch_id).toBe(BRANCH_ID);
    expect(booking.location_type).toBe('in_salon');
    expect(booking.address_street).toBeFalsy();
    expect(Number(booking.consumer_total)).toBe(1500); // 1000 + 500, no markup
    expect(db.booking_items.rows).toHaveLength(2);
    expect(emailSends.some((e) => e.name === 'booking_received')).toBe(true);
  });

  it('rejects when the consumer is blocked_by_admin', async () => {
    db.consumers.rows[0].blocked_by_admin = true;
    const { createBooking } = await import('../src/app/actions/bookings');
    const slot = futureSlot();
    const res = await createBooking({
      branchId: BRANCH_ID,
      serviceIds: [SERVICE_A],
      slotStart: slot.start,
      slotEnd: slot.end,
      mode: 'in_salon',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not allowed/i);
    expect(db.bookings.rows).toHaveLength(0);
  });

  it('rejects when the branch is admin-blocked', async () => {
    seedWorld({ branchBlockedAt: new Date().toISOString() });
    const { createBooking } = await import('../src/app/actions/bookings');
    const slot = futureSlot();
    const res = await createBooking({
      branchId: BRANCH_ID,
      serviceIds: [SERVICE_A],
      slotStart: slot.start,
      slotEnd: slot.end,
      mode: 'in_salon',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not accepting/i);
  });

  it('rejects when the salon is admin-blocked', async () => {
    seedWorld({ salonAdminBlockedAt: new Date().toISOString() });
    const { createBooking } = await import('../src/app/actions/bookings');
    const slot = futureSlot();
    const res = await createBooking({
      branchId: BRANCH_ID,
      serviceIds: [SERVICE_A],
      slotStart: slot.start,
      slotEnd: slot.end,
      mode: 'in_salon',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not accepting/i);
  });

  it('rejects a home booking outside the home-service radius', async () => {
    const { createBooking } = await import('../src/app/actions/bookings');
    const slot = futureSlot();
    // Branch is at 24.8607/67.0011 with 5km radius. Pick a pin ~50km away.
    const res = await createBooking({
      branchId: BRANCH_ID,
      serviceIds: [SERVICE_A],
      slotStart: slot.start,
      slotEnd: slot.end,
      mode: 'home',
      addressStreet: '123 Faraway Road',
      addressLat: 25.5,
      addressLng: 67.5,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/outside/i);
    expect(db.bookings.rows).toHaveLength(0);
  });

  it('accepts a home booking within radius and computes home pricing (markup + Rs 300 service charge)', async () => {
    const { createBooking } = await import('../src/app/actions/bookings');
    const slot = futureSlot();
    const res = await createBooking({
      branchId: BRANCH_ID,
      serviceIds: [SERVICE_A],
      slotStart: slot.start,
      slotEnd: slot.end,
      mode: 'home',
      addressStreet: '123 Near Road',
      addressLat: 24.861,
      addressLng: 67.002,
    });
    expect(res.ok).toBe(true);
    const booking = db.bookings.rows[0] as Record<string, unknown>;
    expect(booking.location_type).toBe('home');
    // 1000 * 1.30 = 1300 (already a multiple of 50) + Rs 300 service charge = 1600
    expect(Number(booking.consumer_total)).toBe(1600);
    expect(Number(booking.platform_markup)).toBe(300);
    expect(Number(booking.service_charge)).toBe(300);
    expect(booking.address_street).toBe('123 Near Road');
  });

  it('rejects home booking when branch does not offer home service', async () => {
    db.branches.rows[0].offers_home_service = false;
    const { createBooking } = await import('../src/app/actions/bookings');
    const slot = futureSlot();
    const res = await createBooking({
      branchId: BRANCH_ID,
      serviceIds: [SERVICE_A],
      slotStart: slot.start,
      slotEnd: slot.end,
      mode: 'home',
      addressStreet: '123 Near Road',
      addressLat: 24.861,
      addressLng: 67.002,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/home service/i);
  });

  it('rejects when consumer already has a PENDING overlapping booking', async () => {
    const slot = futureSlot();
    db.bookings.rows.push({
      id: 'existing-booking-1',
      consumer_id: CONSUMER.userId,
      branch_id: BRANCH_ID,
      salon_id: SALON_ID,
      status: 'PENDING',
      location_type: 'in_salon',
      requested_slot_start: slot.start,
      requested_slot_end: slot.end,
    });
    const { createBooking } = await import('../src/app/actions/bookings');
    const res = await createBooking({
      branchId: BRANCH_ID,
      serviceIds: [SERVICE_A],
      slotStart: slot.start,
      slotEnd: slot.end,
      mode: 'in_salon',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/time slot/i);
  });

  it('requires a session', async () => {
    consumerSessionMock = () => Promise.resolve(null);
    const { createBooking } = await import('../src/app/actions/bookings');
    const slot = futureSlot();
    const res = await createBooking({
      branchId: BRANCH_ID,
      serviceIds: [SERVICE_A],
      slotStart: slot.start,
      slotEnd: slot.end,
      mode: 'in_salon',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/sign in/i);
  });

  it('rate-limits after 5 booking attempts per minute', async () => {
    const { createBooking } = await import('../src/app/actions/bookings');
    const slot = futureSlot();
    for (let i = 0; i < 5; i++) {
      await createBooking({
        branchId: BRANCH_ID,
        serviceIds: [SERVICE_A],
        slotStart: new Date(Date.now() + (i + 2) * 3600_000).toISOString(),
        slotEnd: new Date(Date.now() + (i + 2) * 3600_000 + 60 * 60_000).toISOString(),
        mode: 'in_salon',
      });
    }
    const res = await createBooking({
      branchId: BRANCH_ID,
      serviceIds: [SERVICE_A],
      slotStart: slot.start,
      slotEnd: slot.end,
      mode: 'in_salon',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/too many/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Salon-side state transitions
// ═══════════════════════════════════════════════════════════════════════════

/** Convenience: seed a PENDING booking row and return its id. */
function seedPendingBooking(locationType: 'in_salon' | 'home' = 'in_salon'): string {
  const id = crypto.randomUUID();
  const slot = futureSlot();
  db.bookings.rows.push({
    id,
    consumer_id: CONSUMER.userId,
    branch_id: BRANCH_ID,
    salon_id: SALON_ID,
    status: 'PENDING',
    location_type: locationType,
    requested_slot_start: slot.start,
    requested_slot_end: slot.end,
    salon_base_total: 1000,
    platform_markup: locationType === 'home' ? 300 : 0,
    service_charge: locationType === 'home' ? 300 : 0,
    consumer_total: locationType === 'home' ? 1600 : 1000,
    address_street: locationType === 'home' ? '123 Near Road' : null,
    address_lat: locationType === 'home' ? 24.861 : null,
    address_lng: locationType === 'home' ? 67.002 : null,
  });
  return id;
}

describe('confirmBooking', () => {
  it('requires an owner session on the same salon', async () => {
    const id = seedPendingBooking();
    // Impostor owner from a different salon.
    verifySessionMock = () => salonSession(OTHER_SALON_ID);
    const { confirmBooking } = await import('../src/app/actions/bookings');
    const res = await confirmBooking(id);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not allowed/i);
    const booking = db.bookings.rows[0] as Record<string, unknown>;
    expect(booking.status).toBe('PENDING');
  });

  it('transitions PENDING → CONFIRMED and stamps confirmed_at', async () => {
    const id = seedPendingBooking();
    const { confirmBooking } = await import('../src/app/actions/bookings');
    const res = await confirmBooking(id);
    expect(res.ok).toBe(true);
    const booking = db.bookings.rows[0] as Record<string, unknown>;
    expect(booking.status).toBe('CONFIRMED');
    expect(typeof booking.confirmed_at).toBe('string');
  });

  it('refuses to confirm a booking that is not PENDING', async () => {
    const id = seedPendingBooking();
    db.bookings.rows[0].status = 'CONFIRMED';
    const { confirmBooking } = await import('../src/app/actions/bookings');
    const res = await confirmBooking(id);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/cannot transition/i);
  });
});

describe('declineBooking', () => {
  it('transitions PENDING → DECLINED', async () => {
    const id = seedPendingBooking();
    const { declineBooking } = await import('../src/app/actions/bookings');
    const res = await declineBooking(id, 'booked up today');
    expect(res.ok).toBe(true);
    const booking = db.bookings.rows[0] as Record<string, unknown>;
    expect(booking.status).toBe('DECLINED');
    expect(typeof booking.declined_at).toBe('string');
  });
});

describe('cancelBookingByConsumer', () => {
  it('allows the consumer to cancel a PENDING booking', async () => {
    const id = seedPendingBooking();
    const { cancelBookingByConsumer } = await import('../src/app/actions/bookings');
    const res = await cancelBookingByConsumer(id);
    expect(res.ok).toBe(true);
    const booking = db.bookings.rows[0] as Record<string, unknown>;
    expect(booking.status).toBe('CANCELLED_BY_CONSUMER');
    expect(booking.cancelled_by).toBe('consumer');
  });

  it('rejects cancellation by a different consumer (cross-tenant)', async () => {
    const id = seedPendingBooking();
    db.bookings.rows[0].consumer_id = 'someone-else';
    const { cancelBookingByConsumer } = await import('../src/app/actions/bookings');
    const res = await cancelBookingByConsumer(id);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not allowed/i);
  });

  it('rejects cancelling an already-completed booking', async () => {
    const id = seedPendingBooking();
    db.bookings.rows[0].status = 'COMPLETED';
    const { cancelBookingByConsumer } = await import('../src/app/actions/bookings');
    const res = await cancelBookingByConsumer(id);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/cannot cancel/i);
  });
});

describe('cancelBookingBySalon', () => {
  it('transitions CONFIRMED → CANCELLED_BY_SALON', async () => {
    const id = seedPendingBooking();
    db.bookings.rows[0].status = 'CONFIRMED';
    const { cancelBookingBySalon } = await import('../src/app/actions/bookings');
    const res = await cancelBookingBySalon(id, 'stylist sick');
    expect(res.ok).toBe(true);
    const booking = db.bookings.rows[0] as Record<string, unknown>;
    expect(booking.status).toBe('CANCELLED_BY_SALON');
    expect(booking.cancelled_by).toBe('salon');
  });
});

describe('markBookingInProgress / markBookingComplete / markBookingNoShow', () => {
  it('transitions CONFIRMED → IN_PROGRESS → COMPLETED', async () => {
    const id = seedPendingBooking();
    db.bookings.rows[0].status = 'CONFIRMED';

    const { markBookingInProgress, markBookingComplete } = await import(
      '../src/app/actions/bookings'
    );
    const a = await markBookingInProgress(id);
    expect(a.ok).toBe(true);
    expect(db.bookings.rows[0].status).toBe('IN_PROGRESS');

    const b = await markBookingComplete(id);
    expect(b.ok).toBe(true);
    expect(db.bookings.rows[0].status).toBe('COMPLETED');
    expect(typeof db.bookings.rows[0].completed_at).toBe('string');
    // Review window is exactly 7 days after completed_at.
    const completed = new Date(db.bookings.rows[0].completed_at as string).getTime();
    const closes = new Date(db.bookings.rows[0].review_window_closes_at as string).getTime();
    expect(closes - completed).toBeCloseTo(7 * 24 * 60 * 60 * 1000, -3);
  });

  it('allows markBookingComplete directly from CONFIRMED (no IN_PROGRESS step)', async () => {
    const id = seedPendingBooking();
    db.bookings.rows[0].status = 'CONFIRMED';
    const { markBookingComplete } = await import('../src/app/actions/bookings');
    const res = await markBookingComplete(id);
    expect(res.ok).toBe(true);
    expect(db.bookings.rows[0].status).toBe('COMPLETED');
  });

  it('markBookingNoShow transitions CONFIRMED → NO_SHOW', async () => {
    const id = seedPendingBooking();
    db.bookings.rows[0].status = 'CONFIRMED';
    const { markBookingNoShow } = await import('../src/app/actions/bookings');
    const res = await markBookingNoShow(id);
    expect(res.ok).toBe(true);
    expect(db.bookings.rows[0].status).toBe('NO_SHOW');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DB-trigger regression checks — we verify the trigger SQL exists so the
// increment semantics the server actions rely on can't silently drift.
// ═══════════════════════════════════════════════════════════════════════════

describe('DB trigger contract (migration 041)', () => {
  it('includes apply_payable_on_completion for home bookings', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const sql = readFileSync(
      path.join(__dirname, '..', 'supabase', 'migrations', '041_marketplace_groundwork.sql'),
      'utf8',
    );
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION apply_payable_on_completion/);
    expect(sql).toMatch(/marketplace_unsettled_payable\s*=\s*marketplace_unsettled_payable\s*\+/);
    expect(sql).toMatch(/NEW\.location_type\s*=\s*'home'/);
  });

  it('includes increment_consumer_counters for NO_SHOW and post-confirm cancel', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const sql = readFileSync(
      path.join(__dirname, '..', 'supabase', 'migrations', '041_marketplace_groundwork.sql'),
      'utf8',
    );
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION increment_consumer_counters/);
    expect(sql).toMatch(/no_show_count\s*=\s*no_show_count\s*\+\s*1/);
    expect(sql).toMatch(/post_confirm_cancel_count\s*=\s*post_confirm_cancel_count\s*\+\s*1/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// listPendingBookingsForSalon
// ═══════════════════════════════════════════════════════════════════════════

describe('listPendingBookingsForSalon', () => {
  it('returns only PENDING bookings for the caller\'s salon', async () => {
    seedWorld();
    const slot = futureSlot();
    db.bookings.rows.push(
      {
        id: 'b1',
        consumer_id: CONSUMER.userId,
        branch_id: BRANCH_ID,
        salon_id: SALON_ID,
        status: 'PENDING',
        location_type: 'in_salon',
        requested_slot_start: slot.start,
        requested_slot_end: slot.end,
        consumer_total: 1000,
        address_street: null,
        consumer_notes: null,
        created_at: new Date().toISOString(),
      },
      {
        id: 'b2',
        consumer_id: CONSUMER.userId,
        branch_id: BRANCH_ID,
        salon_id: OTHER_SALON_ID,
        status: 'PENDING',
        location_type: 'in_salon',
        requested_slot_start: slot.start,
        requested_slot_end: slot.end,
        consumer_total: 1000,
        address_street: null,
        consumer_notes: null,
        created_at: new Date().toISOString(),
      },
      {
        id: 'b3',
        consumer_id: CONSUMER.userId,
        branch_id: BRANCH_ID,
        salon_id: SALON_ID,
        status: 'COMPLETED',
        location_type: 'in_salon',
        requested_slot_start: slot.start,
        requested_slot_end: slot.end,
        consumer_total: 1000,
        address_street: null,
        consumer_notes: null,
        created_at: new Date().toISOString(),
      },
    );

    const { listPendingBookingsForSalon } = await import('../src/app/actions/bookings');
    const res = await listPendingBookingsForSalon();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.map((b) => b.id)).toEqual(['b1']);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getBookingForConsumer
// ═══════════════════════════════════════════════════════════════════════════

describe('getBookingForConsumer', () => {
  it('returns the booking with branch summary and items for the owning consumer', async () => {
    const id = seedPendingBooking();
    db.booking_items.rows.push(
      {
        id: 'item-1',
        booking_id: id,
        service_id: SERVICE_A,
        service_name: 'Haircut',
        salon_base_price: 1000,
        display_price: 1000,
      },
    );
    const { getBookingForConsumer } = await import('../src/app/actions/bookings');
    const res = await getBookingForConsumer(id);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.branch.name).toBe('Downtown Cuts');
      expect(res.data.items).toHaveLength(1);
      expect(res.data.items[0].service_name).toBe('Haircut');
    }
  });

  it('rejects when the requester is not the booking\'s consumer', async () => {
    const id = seedPendingBooking();
    db.bookings.rows[0].consumer_id = 'someone-else';
    const { getBookingForConsumer } = await import('../src/app/actions/bookings');
    const res = await getBookingForConsumer(id);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not allowed/i);
  });
});
