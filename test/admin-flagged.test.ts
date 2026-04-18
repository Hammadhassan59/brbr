import { describe, it, expect, vi, beforeEach } from 'vitest';

// Zod's UUID validator requires a proper version digit (1-5) in the 15th
// character. Use real v4 UUIDs so the SUT's `.uuid()` Zod check passes and
// we exercise the post-validation code paths.
const SALON_UUID = '1a111111-1111-4111-8111-111111111111';
const CONSUMER_UUID = '2a222222-2222-4222-8222-222222222222';

// ─────────────────────────────────────────────────────────────────────────
// Mocks
//
// The admin-flagged actions run under requireAdminRole(['super_admin']). We
// stub it to read a mutable `session` captured by each test, so a test can
// flip to role: 'owner' to assert unauthorized rejection.
//
// The supabase client is a hand-rolled mock that maps (table, op) → response.
// The actions call shapes like:
//   .from('branches').select(...).lt('rating_avg', 2).gte('rating_count', 5)
//   .from('salons').select(...).in('id', [...]).is('marketplace_admin_blocked_at', null)
//   .from('salons').select(...).not('marketplace_admin_blocked_at','is',null).order(...)
//   .from('consumers').select(...).eq('blocked_by_admin', false|true)
//   .from('salons').select(...).eq('id', x).maybeSingle()
//   .from('salons').update({...}).eq('id', x)
//   .from('admin_audit_log').insert(row)
//
// We model this with a simple builder that returns `Promise.resolve({data,error})`
// when awaited at any terminal step, plus explicit maybeSingle().
// ─────────────────────────────────────────────────────────────────────────

type Session = { salonId: string; staffId: string; role: string };
let session: Session = { salonId: 'super-admin', staffId: 'admin-1', role: 'super_admin' };

// Recorded inserts/updates so tests can assert on them.
const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
const updates: Array<{ table: string; patch: Record<string, unknown>; where: { col: string; val: unknown } }> = [];

// Fixtures the tests can tune per-case. Each is a Record<string, ...> keyed
// by the table / filter so different select shapes return different data.
interface Fixtures {
  branchesLowRated: Array<{
    id: string;
    salon_id: string;
    name: string;
    rating_avg: number | null;
    rating_count: number;
    listed_on_marketplace: boolean;
  }>;
  branchesBySalon: Array<{
    id: string;
    salon_id: string;
    name: string;
    rating_avg: number | null;
    rating_count: number;
    listed_on_marketplace: boolean;
  }>;
  flaggableSalons: Array<{
    id: string;
    name: string;
    marketplace_admin_blocked_at: string | null;
    owner_id?: string | null;
  }>;
  blockedSalons: Array<{
    id: string;
    name: string;
    marketplace_admin_blocked_at: string | null;
  }>;
  consumersNotBlocked: Array<{
    id: string;
    name: string;
    phone: string;
    rating_avg: number | null;
    rating_count: number;
    no_show_count: number;
    post_confirm_cancel_count: number;
    blocked_by_admin: boolean;
    blocked_at: string | null;
  }>;
  consumersBlocked: Array<{
    id: string;
    name: string;
    phone: string;
    rating_avg: number | null;
    rating_count: number;
    no_show_count: number;
    post_confirm_cancel_count: number;
    blocked_by_admin: boolean;
    blocked_at: string | null;
  }>;
  salonByIdBlockField: string | null;
  consumerByIdState: { blocked_by_admin: boolean; blocked_at: string | null };
  branchesForSalonReviews: Array<{ id: string; name: string }>;
  reviewRows: Array<{
    id: string;
    rating: number;
    comment: string | null;
    created_at: string;
    bookings: { branch_id: string };
  }>;
}

const fixtures: Fixtures = {
  branchesLowRated: [],
  branchesBySalon: [],
  flaggableSalons: [],
  blockedSalons: [],
  consumersNotBlocked: [],
  consumersBlocked: [],
  salonByIdBlockField: null,
  consumerByIdState: { blocked_by_admin: false, blocked_at: null },
  branchesForSalonReviews: [],
  reviewRows: [],
};

// Track query shape the SUT built, so tests can verify threshold filters.
const queryTrace: Array<{ table: string; op: string; args: unknown[] }> = [];

function makeSelectBuilder(table: string) {
  // The builder exposes chainable filters AND is awaitable (thenable).
  // Each terminal filter resolves with `resolveData()`.
  const filters: Array<{ name: string; args: unknown[] }> = [];

  function resolveData(): { data: unknown; error: null } {
    queryTrace.push({ table, op: 'select', args: filters });

    if (table === 'branches') {
      // distinguish "low-rated lookup" (has .lt rating_avg + .gte rating_count)
      // vs "branches-by-salon" (has .in salon_id)
      if (filters.find((f) => f.name === 'lt' && f.args[0] === 'rating_avg')) {
        return { data: fixtures.branchesLowRated, error: null };
      }
      if (filters.find((f) => f.name === 'in' && f.args[0] === 'salon_id')) {
        const idsArg = filters.find((f) => f.name === 'in' && f.args[0] === 'salon_id')!
          .args[1] as string[];
        return {
          data: fixtures.branchesBySalon.filter((b) => idsArg.includes(b.salon_id)),
          error: null,
        };
      }
      if (filters.find((f) => f.name === 'eq' && f.args[0] === 'salon_id')) {
        return { data: fixtures.branchesForSalonReviews, error: null };
      }
      return { data: [], error: null };
    }

    if (table === 'salons') {
      if (filters.find((f) => f.name === 'not' && f.args[0] === 'marketplace_admin_blocked_at')) {
        return { data: fixtures.blockedSalons, error: null };
      }
      if (filters.find((f) => f.name === 'is' && f.args[0] === 'marketplace_admin_blocked_at')) {
        return { data: fixtures.flaggableSalons, error: null };
      }
      return { data: [], error: null };
    }

    if (table === 'consumers') {
      const eqFilter = filters.find((f) => f.name === 'eq' && f.args[0] === 'blocked_by_admin');
      if (eqFilter) {
        return eqFilter.args[1] === true
          ? { data: fixtures.consumersBlocked, error: null }
          : { data: fixtures.consumersNotBlocked, error: null };
      }
      return { data: [], error: null };
    }

    if (table === 'reviews') {
      return { data: fixtures.reviewRows, error: null };
    }

    return { data: [], error: null };
  }

  const builder: Record<string, unknown> = {};

  function addFilter(name: string) {
    return (...args: unknown[]) => {
      filters.push({ name, args });
      return builder;
    };
  }

  builder.eq = addFilter('eq');
  builder.lt = addFilter('lt');
  builder.gte = addFilter('gte');
  builder.in = addFilter('in');
  builder.is = addFilter('is');
  builder.not = addFilter('not');
  builder.order = addFilter('order');
  builder.limit = addFilter('limit');

  builder.maybeSingle = () => {
    // For salon-by-id fetch (block/unblock salon): return the current
    // marketplace_admin_blocked_at value.
    if (table === 'salons') {
      return Promise.resolve({
        data: { marketplace_admin_blocked_at: fixtures.salonByIdBlockField },
        error: null,
      });
    }
    // For consumer-by-id fetch (block/unblock consumer).
    if (table === 'consumers') {
      return Promise.resolve({ data: { ...fixtures.consumerByIdState }, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  };

  builder.then = <R>(
    onResolve: (v: ReturnType<typeof resolveData>) => R,
    onReject?: (e: unknown) => R,
  ): Promise<R> => Promise.resolve(resolveData()).then(onResolve, onReject);

  return builder;
}

const fromMock = vi.fn((table: string) => {
  return {
    select: (_cols: string) => makeSelectBuilder(table),
    update: (patch: Record<string, unknown>) => ({
      eq: (col: string, val: unknown) => {
        updates.push({ table, patch, where: { col, val } });
        return Promise.resolve({ error: null });
      },
    }),
    insert: (row: Record<string, unknown>) => {
      inserts.push({ table, row });
      return Promise.resolve({ error: null });
    },
  };
});

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({ from: fromMock }),
}));

vi.mock('@/app/actions/auth', () => ({
  requireAdminRole: async (allowed: string[]) => {
    if (!session || !allowed.includes(session.role)) {
      throw new Error('Unauthorized');
    }
    return session;
  },
  verifySession: async () => session,
}));

// ─────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  session = { salonId: 'super-admin', staffId: 'admin-1', role: 'super_admin' };
  inserts.length = 0;
  updates.length = 0;
  queryTrace.length = 0;
  fixtures.branchesLowRated = [];
  fixtures.branchesBySalon = [];
  fixtures.flaggableSalons = [];
  fixtures.blockedSalons = [];
  fixtures.consumersNotBlocked = [];
  fixtures.consumersBlocked = [];
  fixtures.salonByIdBlockField = null;
  fixtures.consumerByIdState = { blocked_by_admin: false, blocked_at: null };
  fixtures.branchesForSalonReviews = [];
  fixtures.reviewRows = [];
});

// ═════════════════════════════════════════════════════════════════════════
// Auth rejection — every action must refuse non-super_admin callers.
// ═════════════════════════════════════════════════════════════════════════

describe('admin-flagged: auth gating', () => {
  it('listFlaggedSalons returns an error for non-super_admin', async () => {
    session = { ...session, role: 'customer_support' };
    const { listFlaggedSalons } = await import('../src/app/actions/admin-flagged');
    const res = await listFlaggedSalons();
    expect(res.data).toEqual([]);
    expect(res.error).toMatch(/unauthorized/i);
  });

  it('listBlockedSalons returns an error for non-super_admin', async () => {
    session = { ...session, role: 'technical_support' };
    const { listBlockedSalons } = await import('../src/app/actions/admin-flagged');
    const res = await listBlockedSalons();
    expect(res.error).toMatch(/unauthorized/i);
  });

  it('listFlaggedConsumers returns an error for non-super_admin', async () => {
    session = { ...session, role: 'owner' };
    const { listFlaggedConsumers } = await import('../src/app/actions/admin-flagged');
    const res = await listFlaggedConsumers();
    expect(res.error).toMatch(/unauthorized/i);
  });

  it('listBlockedConsumers returns an error for non-super_admin', async () => {
    session = { ...session, role: 'leads_team' };
    const { listBlockedConsumers } = await import('../src/app/actions/admin-flagged');
    const res = await listBlockedConsumers();
    expect(res.error).toMatch(/unauthorized/i);
  });

  it('blockSalonMarketplace throws for non-super_admin', async () => {
    session = { ...session, role: 'customer_support' };
    const { blockSalonMarketplace } = await import('../src/app/actions/admin-flagged');
    await expect(
      blockSalonMarketplace({
        salonId: SALON_UUID,
        reason: 'bad',
      }),
    ).rejects.toThrow(/unauthorized/i);
  });

  it('unblockSalonMarketplace throws for non-super_admin', async () => {
    session = { ...session, role: 'customer_support' };
    const { unblockSalonMarketplace } = await import('../src/app/actions/admin-flagged');
    await expect(
      unblockSalonMarketplace({ salonId: SALON_UUID }),
    ).rejects.toThrow(/unauthorized/i);
  });

  it('blockConsumer throws for non-super_admin', async () => {
    session = { ...session, role: 'owner' };
    const { blockConsumer } = await import('../src/app/actions/admin-flagged');
    await expect(
      blockConsumer({
        consumerId: CONSUMER_UUID,
        reason: 'bad',
      }),
    ).rejects.toThrow(/unauthorized/i);
  });

  it('unblockConsumer throws for non-super_admin', async () => {
    session = { ...session, role: 'owner' };
    const { unblockConsumer } = await import('../src/app/actions/admin-flagged');
    await expect(
      unblockConsumer({ consumerId: CONSUMER_UUID }),
    ).rejects.toThrow(/unauthorized/i);
  });

  it('getRecentReviewsForSalon returns an error for non-super_admin', async () => {
    session = { ...session, role: 'customer_support' };
    const { getRecentReviewsForSalon } = await import('../src/app/actions/admin-flagged');
    const res = await getRecentReviewsForSalon(SALON_UUID);
    expect(res.error).toMatch(/unauthorized/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// List threshold filters — exercise the query builders.
// ═════════════════════════════════════════════════════════════════════════

describe('listFlaggedSalons threshold filter', () => {
  it('applies .lt(rating_avg, 2) and .gte(rating_count, 5) to branches query', async () => {
    fixtures.branchesLowRated = [];
    const { listFlaggedSalons } = await import('../src/app/actions/admin-flagged');
    await listFlaggedSalons();
    const selectTraces = queryTrace.filter((t) => t.table === 'branches' && t.op === 'select');
    expect(selectTraces.length).toBeGreaterThan(0);
    const filters = selectTraces[0].args as Array<{ name: string; args: unknown[] }>;
    const lt = filters.find((f) => f.name === 'lt');
    const gte = filters.find((f) => f.name === 'gte');
    expect(lt).toEqual({ name: 'lt', args: ['rating_avg', 2] });
    expect(gte).toEqual({ name: 'gte', args: ['rating_count', 5] });
  });

  it('excludes already-admin-blocked salons via .is(..., null)', async () => {
    // One bad branch pointing to salon-A, which is flagged but NOT blocked.
    fixtures.branchesLowRated = [
      {
        id: 'br-1', salon_id: 'salon-A', name: 'Main',
        rating_avg: 1.5, rating_count: 7, listed_on_marketplace: true,
      },
    ];
    fixtures.flaggableSalons = [
      { id: 'salon-A', name: 'Salon A', marketplace_admin_blocked_at: null },
    ];
    fixtures.branchesBySalon = [
      {
        id: 'br-1', salon_id: 'salon-A', name: 'Main',
        rating_avg: 1.5, rating_count: 7, listed_on_marketplace: true,
      },
    ];
    const { listFlaggedSalons } = await import('../src/app/actions/admin-flagged');
    const res = await listFlaggedSalons();
    expect(res.error).toBeNull();
    expect(res.data).toHaveLength(1);
    expect(res.data[0].salon_id).toBe('salon-A');
    expect(res.data[0].worst_rating_avg).toBe(1.5);
    // The salons query must have asked for marketplace_admin_blocked_at IS null.
    const salonTrace = queryTrace.find((t) => t.table === 'salons')!;
    const salonFilters = salonTrace.args as Array<{ name: string; args: unknown[] }>;
    const isFilter = salonFilters.find((f) => f.name === 'is');
    expect(isFilter).toEqual({
      name: 'is',
      args: ['marketplace_admin_blocked_at', null],
    });
  });

  it('returns empty when no branches cross the threshold', async () => {
    fixtures.branchesLowRated = [];
    const { listFlaggedSalons } = await import('../src/app/actions/admin-flagged');
    const res = await listFlaggedSalons();
    expect(res.data).toEqual([]);
  });
});

describe('listFlaggedConsumers threshold filter', () => {
  it('includes only consumers crossing ANY of the three thresholds', async () => {
    fixtures.consumersNotBlocked = [
      // CROSSES: rating 1.5 avg with 4 reviews
      {
        id: 'c-low-rating', name: 'Low Rating', phone: '03001111111',
        rating_avg: 1.5, rating_count: 4,
        no_show_count: 0, post_confirm_cancel_count: 0,
        blocked_by_admin: false, blocked_at: null,
      },
      // CROSSES: 3 no-shows
      {
        id: 'c-noshow', name: 'No Show', phone: '03002222222',
        rating_avg: 4.5, rating_count: 10,
        no_show_count: 3, post_confirm_cancel_count: 0,
        blocked_by_admin: false, blocked_at: null,
      },
      // CROSSES: 5 post-confirm cancels
      {
        id: 'c-canceller', name: 'Canceller', phone: '03003333333',
        rating_avg: 4.0, rating_count: 2,
        no_show_count: 0, post_confirm_cancel_count: 5,
        blocked_by_admin: false, blocked_at: null,
      },
      // DOES NOT cross — rating 1.9 but only 2 reviews (< 3 minimum)
      {
        id: 'c-ok-few-reviews', name: 'Few Reviews', phone: '03004444444',
        rating_avg: 1.9, rating_count: 2,
        no_show_count: 0, post_confirm_cancel_count: 0,
        blocked_by_admin: false, blocked_at: null,
      },
      // DOES NOT cross — 2 no-shows (< 3), 4 cancels (< 5)
      {
        id: 'c-borderline', name: 'Borderline', phone: '03005555555',
        rating_avg: null, rating_count: 0,
        no_show_count: 2, post_confirm_cancel_count: 4,
        blocked_by_admin: false, blocked_at: null,
      },
    ];
    const { listFlaggedConsumers } = await import('../src/app/actions/admin-flagged');
    const res = await listFlaggedConsumers();
    expect(res.error).toBeNull();
    const ids = res.data.map((r) => r.id).sort();
    expect(ids).toEqual(['c-canceller', 'c-low-rating', 'c-noshow']);
    // Flag reasons are attached per-row, covering the tripped conditions.
    const lowRating = res.data.find((r) => r.id === 'c-low-rating')!;
    expect(lowRating.flag_reasons.some((r) => /low rating/i.test(r))).toBe(true);
    const noshow = res.data.find((r) => r.id === 'c-noshow')!;
    expect(noshow.flag_reasons.some((r) => /no-shows/i.test(r))).toBe(true);
    const canceller = res.data.find((r) => r.id === 'c-canceller')!;
    expect(canceller.flag_reasons.some((r) => /cancel/i.test(r))).toBe(true);
  });

  it('queries consumers with blocked_by_admin = false', async () => {
    fixtures.consumersNotBlocked = [];
    const { listFlaggedConsumers } = await import('../src/app/actions/admin-flagged');
    await listFlaggedConsumers();
    const trace = queryTrace.find((t) => t.table === 'consumers')!;
    const filters = trace.args as Array<{ name: string; args: unknown[] }>;
    const eq = filters.find((f) => f.name === 'eq' && f.args[0] === 'blocked_by_admin');
    expect(eq).toEqual({ name: 'eq', args: ['blocked_by_admin', false] });
  });
});

describe('listBlockedConsumers', () => {
  it('queries consumers with blocked_by_admin = true', async () => {
    fixtures.consumersBlocked = [
      {
        id: 'c-blocked', name: 'Blocked Person', phone: '03000000000',
        rating_avg: 1.0, rating_count: 5,
        no_show_count: 2, post_confirm_cancel_count: 1,
        blocked_by_admin: true, blocked_at: '2026-04-10T00:00:00Z',
      },
    ];
    const { listBlockedConsumers } = await import('../src/app/actions/admin-flagged');
    const res = await listBlockedConsumers();
    expect(res.error).toBeNull();
    expect(res.data).toHaveLength(1);
    expect(res.data[0].id).toBe('c-blocked');
    const trace = queryTrace.find((t) => t.table === 'consumers')!;
    const filters = trace.args as Array<{ name: string; args: unknown[] }>;
    const eq = filters.find((f) => f.name === 'eq' && f.args[0] === 'blocked_by_admin');
    expect(eq).toEqual({ name: 'eq', args: ['blocked_by_admin', true] });
  });
});

// ═════════════════════════════════════════════════════════════════════════
// Mutations — stamp/clear fields and write admin_audit_log
// ═════════════════════════════════════════════════════════════════════════

describe('blockSalonMarketplace', () => {
  const salonId = SALON_UUID;

  it('rejects invalid uuid salonId', async () => {
    const { blockSalonMarketplace } = await import('../src/app/actions/admin-flagged');
    const res = await blockSalonMarketplace({ salonId: 'not-a-uuid', reason: 'x' });
    expect(res.error).toMatch(/invalid id/i);
  });

  it('rejects empty reason', async () => {
    const { blockSalonMarketplace } = await import('../src/app/actions/admin-flagged');
    const res = await blockSalonMarketplace({ salonId, reason: '   ' });
    expect(res.error).toMatch(/reason is required/i);
  });

  it('stamps marketplace_admin_blocked_at and writes admin_audit_log', async () => {
    fixtures.salonByIdBlockField = null;
    const { blockSalonMarketplace } = await import('../src/app/actions/admin-flagged');
    const res = await blockSalonMarketplace({ salonId, reason: 'Repeated 1-star reviews' });
    expect(res.error).toBeNull();

    // Update went to salons with the right patch + where.
    const salonUpd = updates.find((u) => u.table === 'salons');
    expect(salonUpd).toBeDefined();
    expect(salonUpd!.patch).toHaveProperty('marketplace_admin_blocked_at');
    expect(typeof salonUpd!.patch.marketplace_admin_blocked_at).toBe('string');
    expect(salonUpd!.where).toEqual({ col: 'id', val: salonId });

    // admin_audit_log insert captures action + target + metadata.
    const audit = inserts.find((i) => i.table === 'admin_audit_log');
    expect(audit).toBeDefined();
    expect(audit!.row.action).toBe('marketplace_block_salon');
    expect(audit!.row.target_table).toBe('salons');
    expect(audit!.row.target_id).toBe(salonId);
    expect(audit!.row.admin_auth_user_id).toBe('admin-1');
    const meta = audit!.row.metadata as {
      reason: string;
      prior_state: { marketplace_admin_blocked_at: string | null };
      new_state: { marketplace_admin_blocked_at: string };
    };
    expect(meta.reason).toBe('Repeated 1-star reviews');
    expect(meta.prior_state.marketplace_admin_blocked_at).toBeNull();
    expect(typeof meta.new_state.marketplace_admin_blocked_at).toBe('string');
  });
});

describe('unblockSalonMarketplace', () => {
  const salonId = SALON_UUID;

  it('clears the field and writes admin_audit_log', async () => {
    fixtures.salonByIdBlockField = '2026-04-10T00:00:00.000Z';
    const { unblockSalonMarketplace } = await import('../src/app/actions/admin-flagged');
    const res = await unblockSalonMarketplace({ salonId });
    expect(res.error).toBeNull();

    const salonUpd = updates.find((u) => u.table === 'salons');
    expect(salonUpd!.patch.marketplace_admin_blocked_at).toBeNull();
    expect(salonUpd!.where).toEqual({ col: 'id', val: salonId });

    const audit = inserts.find((i) => i.table === 'admin_audit_log');
    expect(audit).toBeDefined();
    expect(audit!.row.action).toBe('marketplace_unblock_salon');
    const meta = audit!.row.metadata as {
      prior_state: { marketplace_admin_blocked_at: string | null };
      new_state: { marketplace_admin_blocked_at: string | null };
    };
    expect(meta.prior_state.marketplace_admin_blocked_at).toBe(
      '2026-04-10T00:00:00.000Z',
    );
    expect(meta.new_state.marketplace_admin_blocked_at).toBeNull();
  });
});

describe('blockConsumer', () => {
  const consumerId = CONSUMER_UUID;

  it('rejects invalid uuid consumerId', async () => {
    const { blockConsumer } = await import('../src/app/actions/admin-flagged');
    const res = await blockConsumer({ consumerId: 'not-a-uuid', reason: 'x' });
    expect(res.error).toMatch(/invalid id/i);
  });

  it('rejects empty reason', async () => {
    const { blockConsumer } = await import('../src/app/actions/admin-flagged');
    const res = await blockConsumer({ consumerId, reason: '   ' });
    expect(res.error).toMatch(/reason is required/i);
  });

  it('sets blocked_by_admin=true + blocked_at=now and writes admin_audit_log', async () => {
    fixtures.consumerByIdState = { blocked_by_admin: false, blocked_at: null };
    const { blockConsumer } = await import('../src/app/actions/admin-flagged');
    const res = await blockConsumer({
      consumerId,
      reason: 'Multiple no-shows and abuse reports',
    });
    expect(res.error).toBeNull();

    const upd = updates.find((u) => u.table === 'consumers');
    expect(upd!.patch.blocked_by_admin).toBe(true);
    expect(typeof upd!.patch.blocked_at).toBe('string');
    expect(upd!.where).toEqual({ col: 'id', val: consumerId });

    const audit = inserts.find((i) => i.table === 'admin_audit_log');
    expect(audit).toBeDefined();
    expect(audit!.row.action).toBe('marketplace_block_consumer');
    expect(audit!.row.target_table).toBe('consumers');
    expect(audit!.row.target_id).toBe(consumerId);
    const meta = audit!.row.metadata as {
      reason: string;
      prior_state: { blocked_by_admin: boolean; blocked_at: string | null };
      new_state: { blocked_by_admin: boolean; blocked_at: string };
    };
    expect(meta.reason).toBe('Multiple no-shows and abuse reports');
    expect(meta.prior_state).toEqual({ blocked_by_admin: false, blocked_at: null });
    expect(meta.new_state.blocked_by_admin).toBe(true);
    expect(typeof meta.new_state.blocked_at).toBe('string');
  });
});

describe('unblockConsumer', () => {
  const consumerId = CONSUMER_UUID;

  it('clears both block fields and writes admin_audit_log', async () => {
    fixtures.consumerByIdState = {
      blocked_by_admin: true,
      blocked_at: '2026-04-10T00:00:00.000Z',
    };
    const { unblockConsumer } = await import('../src/app/actions/admin-flagged');
    const res = await unblockConsumer({ consumerId });
    expect(res.error).toBeNull();

    const upd = updates.find((u) => u.table === 'consumers');
    expect(upd!.patch.blocked_by_admin).toBe(false);
    expect(upd!.patch.blocked_at).toBeNull();

    const audit = inserts.find((i) => i.table === 'admin_audit_log');
    expect(audit!.row.action).toBe('marketplace_unblock_consumer');
    const meta = audit!.row.metadata as {
      prior_state: { blocked_by_admin: boolean; blocked_at: string | null };
      new_state: { blocked_by_admin: boolean; blocked_at: string | null };
    };
    expect(meta.prior_state).toEqual({
      blocked_by_admin: true,
      blocked_at: '2026-04-10T00:00:00.000Z',
    });
    expect(meta.new_state).toEqual({ blocked_by_admin: false, blocked_at: null });
  });
});
