import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Session shim — mutable so individual tests can flip to non-admin roles.
// ─────────────────────────────────────────────────────────────────────────────
type Session = {
  salonId: string;
  staffId: string;
  role: string;
  primaryBranchId: string;
  branchId: string;
};
let session: Session = {
  salonId: 'super-admin',
  staffId: 'admin-1',
  role: 'super_admin',
  primaryBranchId: '',
  branchId: '',
};

vi.mock('@/app/actions/auth', () => ({
  verifySession: () => Promise.resolve(session),
  requireAdminRole: async (allowed: string[]) => {
    if (!session || !allowed.includes(session.role)) {
      throw new Error('Unauthorized');
    }
    return session;
  },
}));

// Bypass the rate-limiter — not what we're testing here. Always "ok".
vi.mock('@/lib/with-rate-limit', () => ({
  checkRateLimit: async () => ({ ok: true }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Supabase mock — table-keyed. Each table returns its own fluent-chain stub
// and pushes into `calls` so tests can assert what happened.
//
// The action calls we cover here:
//   listSalonsWithUnsettled:
//     salons        → .select(...).gt(...).order(...)
//     staff         → .select(...).in(...).eq(...)
//     salon_settlements → .select(...).in(...).order(...)
//     bookings      → .select(...).in(...).eq(...).eq(...)
//   recordSettlementPayment:
//     salons        → .select(...).eq(...).maybeSingle()  (prior)
//     salon_settlements → .insert(...).select(...).single()
//     salons        → .select(...).eq(...).maybeSingle()  (after)
//     admin_audit_log   → .insert(...)
// ─────────────────────────────────────────────────────────────────────────────

type SupaResult<T> = { data: T; error: { message: string } | null };

interface Fixture {
  salons: Array<{
    id: string;
    name: string;
    owner_id: string;
    marketplace_unsettled_payable: number;
    marketplace_block_threshold: number;
    marketplace_payable_blocked_at: string | null;
    is_demo: boolean | null;
  }>;
  staff: Array<{ salon_id: string; name: string; phone: string | null; role: string }>;
  salon_settlements: Array<{
    id: string;
    salon_id: string;
    amount: number;
    paid_at: string;
    recorded_by: string;
    note: string | null;
  }>;
  bookings: Array<{
    id: string;
    salon_id: string;
    consumer_id: string;
    status: string;
    location_type: string;
    completed_at: string | null;
    requested_slot_start: string;
    platform_markup: number;
    service_charge: number;
    consumer_total: number;
    address_street: string | null;
  }>;
  consumers: Array<{ id: string; name: string }>;
}

let fixture: Fixture;

const insertCalls: Array<{ table: string; row: unknown }> = [];
const insertResults: Record<string, { id?: string; error: { message: string } | null }> = {};

function makeFromMock() {
  return vi.fn((table: string) => {
    // Shared chain builder — each filter returns `this` so chains compose. A
    // terminal .order() or .maybeSingle() / .single() resolves to data.
    const ctx: {
      filters: Array<{ op: string; col?: string; val?: unknown }>;
    } = { filters: [] };

    function applyFilters<T extends { salon_id?: string; status?: string; location_type?: string; role?: string; id?: string; is_demo?: unknown }>(
      rows: T[],
    ): T[] {
      return rows.filter((r) => {
        for (const f of ctx.filters) {
          const v = (r as unknown as Record<string, unknown>)[f.col ?? ''];
          if (f.op === 'eq' && v !== f.val) return false;
          if (f.op === 'gt') {
            // Support both numeric (unsettled payable) and ISO-string
            // (completed_at) columns. String compare is lexicographic but
            // ISO-8601 timestamps sort identically to chronological order.
            if (typeof v === 'number' && !(v > (f.val as number))) return false;
            if (typeof v === 'string' && !(v > (f.val as string))) return false;
            if (v === null || v === undefined) return false;
          }
          if (f.op === 'in' && !(f.val as unknown[]).includes(v as unknown)) return false;
        }
        return true;
      });
    }

    function resolveList(): SupaResult<unknown[]> {
      let rows: unknown[] = [];
      if (table === 'salons') rows = applyFilters(fixture.salons);
      else if (table === 'staff') rows = applyFilters(fixture.staff);
      else if (table === 'salon_settlements') rows = applyFilters(fixture.salon_settlements);
      else if (table === 'bookings') rows = applyFilters(fixture.bookings);
      else if (table === 'consumers') rows = applyFilters(fixture.consumers);
      return { data: rows, error: null };
    }

    function resolveSingle(): SupaResult<unknown | null> {
      const list = resolveList().data;
      return { data: list[0] ?? null, error: null };
    }

    const chain: {
      select: (..._a: unknown[]) => typeof chain;
      insert: (row: unknown) => typeof chain;
      update: (row: unknown) => typeof chain;
      eq: (col: string, val: unknown) => typeof chain;
      gt: (col: string, val: unknown) => typeof chain;
      in: (col: string, val: unknown[]) => typeof chain;
      order: (..._a: unknown[]) => Promise<SupaResult<unknown[]>>;
      maybeSingle: () => Promise<SupaResult<unknown | null>>;
      single: () => Promise<SupaResult<unknown | null>>;
      then: <R>(cb: (v: SupaResult<unknown[]>) => R) => Promise<R>;
    } = {
      select(..._a: unknown[]) {
        return chain;
      },
      insert(row: unknown) {
        insertCalls.push({ table, row });
        const stored = insertResults[table];
        // For salon_settlements we tell the trigger to also decrement the
        // balance here — the mock doesn't fire Postgres triggers, so the
        // action's "read after insert" relies on this side-effect. The
        // trigger uses GREATEST(0, …) so clamp at zero.
        if (table === 'salon_settlements') {
          const r = row as { salon_id: string; amount: number };
          const s = fixture.salons.find((x) => x.id === r.salon_id);
          if (s) {
            s.marketplace_unsettled_payable = Math.max(
              0,
              s.marketplace_unsettled_payable - r.amount,
            );
          }
          // Stash for select().single() → return the generated id.
          ctx.filters = [];
          return {
            ...chain,
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: stored?.id ?? 'settlement-new' },
                  error: stored?.error ?? null,
                }),
            }),
          } as unknown as typeof chain;
        }
        return {
          ...chain,
          select: () => ({
            single: () => Promise.resolve({ data: null, error: stored?.error ?? null }),
          }),
          then: <R,>(cb: (v: { error: { message: string } | null }) => R) =>
            Promise.resolve({ error: stored?.error ?? null }).then(cb),
        } as unknown as typeof chain;
      },
      update(_row: unknown) {
        return chain;
      },
      eq(col: string, val: unknown) {
        ctx.filters.push({ op: 'eq', col, val });
        return chain;
      },
      gt(col: string, val: unknown) {
        ctx.filters.push({ op: 'gt', col, val });
        return chain;
      },
      in(col: string, val: unknown[]) {
        ctx.filters.push({ op: 'in', col, val });
        return chain;
      },
      order(_col: string, opts?: { ascending?: boolean }) {
        const res = resolveList();
        const ascending = opts?.ascending !== false;
        const col = _col as keyof (typeof res.data)[number];
        const sorted = [...res.data].sort((a, b) => {
          const av = (a as unknown as Record<string, unknown>)[col as string];
          const bv = (b as unknown as Record<string, unknown>)[col as string];
          if (typeof av === 'number' && typeof bv === 'number') {
            return ascending ? av - bv : bv - av;
          }
          const as = String(av ?? '');
          const bs = String(bv ?? '');
          return ascending ? as.localeCompare(bs) : bs.localeCompare(as);
        });
        return Promise.resolve({ data: sorted, error: null });
      },
      maybeSingle() {
        return Promise.resolve(resolveSingle());
      },
      single() {
        return Promise.resolve(resolveSingle());
      },
      then<R>(cb: (v: SupaResult<unknown[]>) => R) {
        return Promise.resolve(resolveList()).then(cb);
      },
    };

    return chain;
  });
}

const fromMock = makeFromMock();
vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({ from: fromMock }),
}));

// Real UUIDs — zod .uuid() rejects SALON_HIGH style ids. Using these
// constants lets us keep the fixtures readable while still passing schema
// validation.
const SALON_HIGH = '11111111-1111-4111-a111-111111111111';
const SALON_BLOCKED = '22222222-2222-4222-a222-222222222222';
const SALON_LOW = '33333333-3333-4333-a333-333333333333';
const SALON_ZERO = '44444444-4444-4444-a444-444444444444';
const SALON_DEMO = '55555555-5555-4555-a555-555555555555';

function resetFixture() {
  fixture = {
    salons: [
      {
        id: SALON_HIGH,
        name: 'High Owed Salon',
        owner_id: 'owner-high',
        marketplace_unsettled_payable: 4500,
        marketplace_block_threshold: 5000,
        marketplace_payable_blocked_at: null,
        is_demo: false,
      },
      {
        id: SALON_BLOCKED,
        name: 'Blocked Salon',
        owner_id: 'owner-blocked',
        marketplace_unsettled_payable: 6200,
        marketplace_block_threshold: 5000,
        marketplace_payable_blocked_at: '2026-04-10T12:00:00Z',
        is_demo: false,
      },
      {
        id: SALON_LOW,
        name: 'Low Owed Salon',
        owner_id: 'owner-low',
        marketplace_unsettled_payable: 600,
        marketplace_block_threshold: 5000,
        marketplace_payable_blocked_at: null,
        is_demo: false,
      },
      {
        id: SALON_ZERO,
        name: 'Settled Salon',
        owner_id: 'owner-zero',
        marketplace_unsettled_payable: 0,
        marketplace_block_threshold: 5000,
        marketplace_payable_blocked_at: null,
        is_demo: false,
      },
      {
        id: SALON_DEMO,
        name: 'Demo Salon',
        owner_id: 'owner-demo',
        marketplace_unsettled_payable: 9999,
        marketplace_block_threshold: 5000,
        marketplace_payable_blocked_at: '2026-04-01T00:00:00Z',
        is_demo: true,
      },
    ],
    staff: [
      { salon_id: SALON_HIGH, name: 'Ayesha K.', phone: '+923001112222', role: 'owner' },
      { salon_id: SALON_BLOCKED, name: 'Bilal R.', phone: '+923002223333', role: 'owner' },
      { salon_id: SALON_LOW, name: 'Chandni P.', phone: null, role: 'owner' },
    ],
    salon_settlements: [
      {
        id: 'settle-1',
        salon_id: SALON_LOW,
        amount: 500,
        paid_at: '2026-04-01T10:00:00Z',
        recorded_by: 'admin-1',
        note: 'old',
      },
    ],
    bookings: [
      {
        id: 'b-1',
        salon_id: SALON_HIGH,
        consumer_id: 'c-1',
        status: 'COMPLETED',
        location_type: 'home',
        completed_at: '2026-04-15T12:00:00Z',
        requested_slot_start: '2026-04-15T11:00:00Z',
        platform_markup: 2000,
        service_charge: 300,
        consumer_total: 2300,
        address_street: '10 Main Rd',
      },
      {
        id: 'b-2',
        salon_id: SALON_HIGH,
        consumer_id: 'c-2',
        status: 'COMPLETED',
        location_type: 'home',
        completed_at: '2026-04-16T12:00:00Z',
        requested_slot_start: '2026-04-16T11:00:00Z',
        platform_markup: 1900,
        service_charge: 300,
        consumer_total: 2200,
        address_street: '20 Second Ave',
      },
      // A pre-last-settlement booking for salon-low; should be excluded
      // from the contributing count since it happened before the last payment.
      {
        id: 'b-3',
        salon_id: SALON_LOW,
        consumer_id: 'c-1',
        status: 'COMPLETED',
        location_type: 'home',
        completed_at: '2026-03-01T09:00:00Z',
        requested_slot_start: '2026-03-01T08:00:00Z',
        platform_markup: 500,
        service_charge: 300,
        consumer_total: 800,
        address_street: '33 Old Rd',
      },
      // And one AFTER the last settlement — should be counted.
      {
        id: 'b-4',
        salon_id: SALON_LOW,
        consumer_id: 'c-2',
        status: 'COMPLETED',
        location_type: 'home',
        completed_at: '2026-04-12T09:00:00Z',
        requested_slot_start: '2026-04-12T08:00:00Z',
        platform_markup: 300,
        service_charge: 300,
        consumer_total: 600,
        address_street: '44 New Rd',
      },
    ],
    consumers: [
      { id: 'c-1', name: 'Consumer One' },
      { id: 'c-2', name: 'Consumer Two' },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  session = {
    salonId: 'super-admin',
    staffId: 'admin-1',
    role: 'super_admin',
    primaryBranchId: '',
    branchId: '',
  };
  insertCalls.length = 0;
  Object.keys(insertResults).forEach((k) => delete insertResults[k]);
  insertResults.salon_settlements = { id: 'settle-new', error: null };
  insertResults.admin_audit_log = { error: null };
  resetFixture();
});

describe('listSalonsWithUnsettled', () => {
  it('rejects non-admin callers', async () => {
    session = { ...session, role: 'owner' };
    const { listSalonsWithUnsettled } = await import('@/app/actions/admin-settlements');
    const res = await listSalonsWithUnsettled();
    expect(res.error).toMatch(/unauthorized/i);
    expect(res.data).toEqual([]);
  });

  it('allows technical_support (finance-ish role, same as /admin/payments)', async () => {
    session = { ...session, role: 'technical_support' };
    const { listSalonsWithUnsettled } = await import('@/app/actions/admin-settlements');
    const res = await listSalonsWithUnsettled();
    expect(res.error).toBeNull();
  });

  it('rejects customer_support and leads_team', async () => {
    const { listSalonsWithUnsettled } = await import('@/app/actions/admin-settlements');
    for (const role of ['customer_support', 'leads_team']) {
      session = { ...session, role };
      const res = await listSalonsWithUnsettled();
      expect(res.error).toMatch(/unauthorized/i);
    }
  });

  it('returns only salons with positive unsettled balance, ordered by amount desc, demo excluded', async () => {
    const { listSalonsWithUnsettled } = await import('@/app/actions/admin-settlements');
    const res = await listSalonsWithUnsettled({ sort: 'amount_desc' });
    expect(res.error).toBeNull();
    // Blocked (6200) > High (4500) > Low (600). Zero + Demo excluded.
    expect(res.data.map((r) => r.salon_id)).toEqual([
      SALON_BLOCKED,
      SALON_HIGH,
      SALON_LOW,
    ]);
  });

  it('computes status correctly: BLOCKED wins, WARNING at 80%+, else OK', async () => {
    const { listSalonsWithUnsettled } = await import('@/app/actions/admin-settlements');
    const res = await listSalonsWithUnsettled({ sort: 'amount_desc' });
    const byId = new Map(res.data.map((r) => [r.salon_id, r]));
    expect(byId.get(SALON_BLOCKED)?.status).toBe('BLOCKED');
    // 4500 / 5000 = 90% → WARNING
    expect(byId.get(SALON_HIGH)?.status).toBe('WARNING');
    // 600 / 5000 = 12% → OK
    expect(byId.get(SALON_LOW)?.status).toBe('OK');
  });

  it('counts only home bookings COMPLETED since the last settlement', async () => {
    const { listSalonsWithUnsettled } = await import('@/app/actions/admin-settlements');
    const res = await listSalonsWithUnsettled();
    const byId = new Map(res.data.map((r) => [r.salon_id, r]));
    // salon-high has no prior settlement → both b-1 and b-2 count.
    expect(byId.get(SALON_HIGH)?.home_bookings_contributing).toBe(2);
    // salon-low last settled 2026-04-01 → b-3 (2026-03-01) excluded, b-4 (2026-04-12) included.
    expect(byId.get(SALON_LOW)?.home_bookings_contributing).toBe(1);
  });

  it('attaches owner name + phone when an owner staff row exists', async () => {
    const { listSalonsWithUnsettled } = await import('@/app/actions/admin-settlements');
    const res = await listSalonsWithUnsettled();
    const high = res.data.find((r) => r.salon_id === SALON_HIGH);
    expect(high?.owner_name).toBe('Ayesha K.');
    expect(high?.owner_phone).toBe('+923001112222');
  });

  it('sort=last_payment_asc puts never-paid salons first', async () => {
    const { listSalonsWithUnsettled } = await import('@/app/actions/admin-settlements');
    const res = await listSalonsWithUnsettled({ sort: 'last_payment_asc' });
    // salon-high and salon-blocked have no settlements → come first.
    // salon-low has a settlement at 2026-04-01 → last.
    expect(res.data[res.data.length - 1]?.salon_id).toBe(SALON_LOW);
  });
});

describe('recordSettlementPayment', () => {
  it('rejects non-admin callers', async () => {
    session = { ...session, role: 'owner' };
    const { recordSettlementPayment } = await import('@/app/actions/admin-settlements');
    const res = await recordSettlementPayment({
      salonId: '00000000-0000-0000-0000-000000000001',
      amount: 500,
    });
    expect(res.error).toMatch(/unauthorized/i);
  });

  it('inserts a salon_settlements row and writes an audit log entry', async () => {
    const { recordSettlementPayment } = await import('@/app/actions/admin-settlements');
    const res = await recordSettlementPayment({
      salonId: SALON_HIGH,
      amount: 4500,
      note: 'Bank transfer TXN-1',
    });
    expect(res.error).toBeNull();
    expect(res.data?.settlementId).toBe('settle-new');

    const settleInsert = insertCalls.find((c) => c.table === 'salon_settlements');
    expect(settleInsert).toBeTruthy();
    const row = settleInsert!.row as Record<string, unknown>;
    expect(row.salon_id).toBe(SALON_HIGH);
    expect(row.amount).toBe(4500);
    expect(row.recorded_by).toBe('admin-1');
    expect(row.note).toBe('Bank transfer TXN-1');
    expect(typeof row.paid_at).toBe('string');

    const audit = insertCalls.find((c) => c.table === 'admin_audit_log');
    expect(audit).toBeTruthy();
    const auditRow = audit!.row as Record<string, unknown>;
    expect(auditRow.action).toBe('settlement_payment_recorded');
    expect(auditRow.admin_auth_user_id).toBe('admin-1');
    expect(auditRow.target_table).toBe('salon_settlements');
    expect(auditRow.salon_id).toBe(SALON_HIGH);
    const meta = auditRow.metadata as Record<string, unknown>;
    expect(meta.salon_id).toBe(SALON_HIGH);
    expect(meta.amount).toBe(4500);
    expect(meta.note).toBe('Bank transfer TXN-1');
    expect(meta.prior_unsettled).toBe(4500);
    // Mock "trigger" decrements the balance to 0 after insert.
    expect(meta.new_unsettled).toBe(0);
  });

  it('rejects zero amount', async () => {
    const { recordSettlementPayment } = await import('@/app/actions/admin-settlements');
    const res = await recordSettlementPayment({ salonId: SALON_HIGH, amount: 0 });
    expect(res.error).toMatch(/greater than 0/i);
    expect(insertCalls.find((c) => c.table === 'salon_settlements')).toBeUndefined();
  });

  it('rejects negative amount', async () => {
    const { recordSettlementPayment } = await import('@/app/actions/admin-settlements');
    const res = await recordSettlementPayment({ salonId: SALON_HIGH, amount: -100 });
    expect(res.error).toMatch(/greater than 0/i);
    expect(insertCalls.find((c) => c.table === 'salon_settlements')).toBeUndefined();
  });

  it('rejects over-cap amount (> Rs 10,000,000)', async () => {
    const { recordSettlementPayment } = await import('@/app/actions/admin-settlements');
    const res = await recordSettlementPayment({
      salonId: SALON_HIGH,
      amount: 10_000_001,
    });
    expect(res.error).toMatch(/unreasonably large/i);
    expect(insertCalls.find((c) => c.table === 'salon_settlements')).toBeUndefined();
  });

  it('rejects non-uuid salon id', async () => {
    const { recordSettlementPayment } = await import('@/app/actions/admin-settlements');
    const res = await recordSettlementPayment({
      salonId: 'not-a-uuid',
      amount: 100,
    });
    expect(res.error).toMatch(/invalid salon id/i);
    expect(insertCalls.find((c) => c.table === 'salon_settlements')).toBeUndefined();
  });
});

describe('getSalonSettlementDetail', () => {
  it('rejects non-admin callers', async () => {
    session = { ...session, role: 'customer_support' };
    const { getSalonSettlementDetail } = await import('@/app/actions/admin-settlements');
    const res = await getSalonSettlementDetail(SALON_HIGH);
    expect(res.error).toMatch(/unauthorized/i);
  });

  it('returns contributing bookings since last settlement plus full history', async () => {
    const { getSalonSettlementDetail } = await import('@/app/actions/admin-settlements');
    const res = await getSalonSettlementDetail(SALON_LOW);
    expect(res.error).toBeNull();
    expect(res.data?.salon.name).toBe('Low Owed Salon');
    // b-3 (before last settlement 2026-04-01) excluded; b-4 (after) included.
    expect(res.data?.contributing_bookings.map((b) => b.id)).toEqual(['b-4']);
    expect(res.data?.contributing_total).toBe(600); // 300 + 300
    expect(res.data?.history.map((h) => h.id)).toEqual(['settle-1']);
  });
});
