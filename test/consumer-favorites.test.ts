/**
 * Tests for `src/app/actions/consumer-favorites.ts`:
 *
 *   - toggleFavorite        — idempotent on/off/on
 *   - listFavorites         — applies marketplace visibility filters
 *   - listFavorites         — cross-tenant: consumer A cannot see B's rows
 *   - isFavorite            — true/false per-branch lookup
 *
 * Same in-memory Supabase mock style as
 * `test/consumer-addresses-crud.test.ts` — shipped inline so the mock
 * understands the joined `select()` shape that `listFavorites` emits
 * (`branch:branches!inner(..., cities(...), salons!inner(...))`).
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

/**
 * For `consumer_favorites` selects, we need to fake the embedded join down
 * to `branches` → `cities` + `salons`. We detect a `branch:` key in the
 * select string via a flag set by the builder; when set, we enrich each
 * favorite row with the joined data before returning.
 */
function selectBuilder(tableName: string, selectStr: string) {
  const state = tbl(tableName);
  const filters: Array<{ op: string; col: string; val: unknown }> = [];

  const wantsJoinedBranch =
    tableName === 'consumer_favorites' && selectStr.includes('branches');

  const enrich = (rows: Row[]): Row[] => {
    if (!wantsJoinedBranch) return rows;
    const branches = tbl('branches').rows;
    const salons = tbl('salons').rows;
    const cities = tbl('cities').rows;
    const out: Row[] = [];
    for (const fav of rows) {
      const branch = branches.find(
        (b) => (b as Record<string, unknown>).id === (fav as Record<string, unknown>).branch_id,
      );
      if (!branch) continue; // !inner drop
      const salon = salons.find(
        (s) => (s as Record<string, unknown>).id === (branch as Record<string, unknown>).salon_id,
      );
      if (!salon) continue; // !inner drop
      const city = cities.find(
        (c) => (c as Record<string, unknown>).id === (branch as Record<string, unknown>).city_id,
      );
      out.push({
        created_at: (fav as Record<string, unknown>).created_at,
        branch: {
          ...(branch as Record<string, unknown>),
          cities: city ?? null,
          salons: salon ?? null,
        },
      });
    }
    return out;
  };

  const exec = () => {
    const rows = state.rows.filter((r) => matches(r, filters));
    return { data: enrich(rows), error: null };
  };

  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      filters.push({ op: 'eq', col, val });
      return chain;
    },
    order: () => chain,
    limit: () => chain,
    is: () => chain,
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
        select: (cols?: string) => selectBuilder(table, cols ?? ''),
        insert: (rowOrRows: Row | Row[]) => {
          const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
          for (const r of rows) {
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
// Cross-module mocks
// ═══════════════════════════════════════════════════════════════════════════

const CONSUMER_A = {
  userId: '00000000-0000-4000-8000-000000000aaa',
  name: 'Ayesha',
  email: 'ayesha@example.com',
  phone: '03001234567',
};
const CONSUMER_B = {
  userId: '00000000-0000-4000-8000-000000000bbb',
  name: 'Bilal',
  email: 'bilal@example.com',
  phone: '03007654321',
};

let sessionMock: (() => Promise<unknown>) | null = () => Promise.resolve({ ...CONSUMER_A });
vi.mock('@/lib/consumer-session', () => ({
  getConsumerSession: () => (sessionMock ? sessionMock() : Promise.resolve(null)),
}));

// Default to women disabled (the men-only launch default) — tests flip via
// this setter when they need the wider gate.
let womenEnabled = false;
vi.mock('@/lib/marketplace/queries', async () => {
  const actual = await vi.importActual<typeof import('@/lib/marketplace/queries')>(
    '@/lib/marketplace/queries',
  );
  return {
    ...actual,
    isMarketplaceWomenEnabled: () => Promise.resolve(womenEnabled),
  };
});

// ═══════════════════════════════════════════════════════════════════════════
// Lifecycle + fixtures
// ═══════════════════════════════════════════════════════════════════════════

const SALON_ID = '11111111-1111-4111-8111-111111111111';
const BLOCKED_SALON_ID = '22222222-2222-4222-8222-222222222222';

const BRANCH_LISTED = '33333333-3333-4333-8333-333333333333';
const BRANCH_BLOCKED = '44444444-4444-4444-8444-444444444444';
const BRANCH_UNLISTED = '55555555-5555-4555-8555-555555555555';
const BRANCH_SALON_BLOCKED = '66666666-6666-4666-8666-666666666666';
const BRANCH_WOMEN_ONLY = '77777777-7777-4777-8777-777777777777';

const CITY_ID = '88888888-8888-4888-8888-888888888888';

beforeEach(async () => {
  for (const k of Object.keys(db)) delete db[k];
  db.consumer_favorites = { rows: [] };
  sessionMock = () => Promise.resolve({ ...CONSUMER_A });
  womenEnabled = false;
  const { resetRateLimit } = await import('../src/lib/rate-limit');
  resetRateLimit(`consumer-favorite-toggle:${CONSUMER_A.userId}`);
  resetRateLimit(`consumer-favorite-toggle:${CONSUMER_B.userId}`);
});

function seedCatalog() {
  db.salons = {
    rows: [
      {
        id: SALON_ID,
        marketplace_payable_blocked_at: null,
        marketplace_admin_blocked_at: null,
      },
      {
        id: BLOCKED_SALON_ID,
        marketplace_payable_blocked_at: null,
        marketplace_admin_blocked_at: '2026-04-01T00:00:00.000Z',
      },
    ],
  };
  db.cities = {
    rows: [{ id: CITY_ID, slug: 'karachi', name: 'Karachi' }],
  };
  db.branches = {
    rows: [
      {
        id: BRANCH_LISTED,
        name: 'Listed Cuts',
        slug: 'listed-cuts',
        photos: [],
        about: 'Nice place',
        rating_avg: 4.6,
        rating_count: 10,
        gender_type: 'men',
        offers_home_service: true,
        listed_on_marketplace: true,
        marketplace_admin_blocked_at: null,
        salon_id: SALON_ID,
        city_id: CITY_ID,
      },
      {
        id: BRANCH_BLOCKED,
        name: 'Admin Blocked',
        slug: 'admin-blocked',
        photos: [],
        about: null,
        rating_avg: null,
        rating_count: 0,
        gender_type: 'men',
        offers_home_service: false,
        listed_on_marketplace: true,
        marketplace_admin_blocked_at: '2026-04-01T00:00:00.000Z',
        salon_id: SALON_ID,
        city_id: CITY_ID,
      },
      {
        id: BRANCH_UNLISTED,
        name: 'Unlisted Branch',
        slug: 'unlisted-branch',
        photos: [],
        about: null,
        rating_avg: null,
        rating_count: 0,
        gender_type: 'men',
        offers_home_service: false,
        listed_on_marketplace: false,
        marketplace_admin_blocked_at: null,
        salon_id: SALON_ID,
        city_id: CITY_ID,
      },
      {
        id: BRANCH_SALON_BLOCKED,
        name: 'Salon Blocked',
        slug: 'salon-blocked',
        photos: [],
        about: null,
        rating_avg: null,
        rating_count: 0,
        gender_type: 'men',
        offers_home_service: false,
        listed_on_marketplace: true,
        marketplace_admin_blocked_at: null,
        salon_id: BLOCKED_SALON_ID,
        city_id: CITY_ID,
      },
      {
        id: BRANCH_WOMEN_ONLY,
        name: 'Women Only',
        slug: 'women-only',
        photos: [],
        about: null,
        rating_avg: null,
        rating_count: 0,
        gender_type: 'women',
        offers_home_service: false,
        listed_on_marketplace: true,
        marketplace_admin_blocked_at: null,
        salon_id: SALON_ID,
        city_id: CITY_ID,
      },
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// toggleFavorite
// ═══════════════════════════════════════════════════════════════════════════

describe('toggleFavorite', () => {
  it('rejects when no session', async () => {
    sessionMock = () => Promise.resolve(null);
    const { toggleFavorite } = await import('@/app/actions/consumer-favorites');
    const res = await toggleFavorite({ branchId: BRANCH_LISTED });
    expect(res.ok).toBe(false);
  });

  it('rejects invalid branch id', async () => {
    const { toggleFavorite } = await import('@/app/actions/consumer-favorites');
    const res = await toggleFavorite({ branchId: 'not-a-uuid' });
    expect(res.ok).toBe(false);
  });

  it('flips on, off, and back on idempotently', async () => {
    const { toggleFavorite } = await import('@/app/actions/consumer-favorites');

    // First tap — create.
    const res1 = await toggleFavorite({ branchId: BRANCH_LISTED });
    expect(res1.ok).toBe(true);
    if (res1.ok) expect(res1.data.favorited).toBe(true);
    expect(db.consumer_favorites.rows).toHaveLength(1);

    // Second tap — delete.
    const res2 = await toggleFavorite({ branchId: BRANCH_LISTED });
    expect(res2.ok).toBe(true);
    if (res2.ok) expect(res2.data.favorited).toBe(false);
    expect(db.consumer_favorites.rows).toHaveLength(0);

    // Third tap — create again.
    const res3 = await toggleFavorite({ branchId: BRANCH_LISTED });
    expect(res3.ok).toBe(true);
    if (res3.ok) expect(res3.data.favorited).toBe(true);
    expect(db.consumer_favorites.rows).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// isFavorite
// ═══════════════════════════════════════════════════════════════════════════

describe('isFavorite', () => {
  it('returns false when no session', async () => {
    sessionMock = () => Promise.resolve(null);
    const { isFavorite } = await import('@/app/actions/consumer-favorites');
    const res = await isFavorite(BRANCH_LISTED);
    expect(res).toBe(false);
  });

  it('returns false for a non-favorited branch', async () => {
    const { isFavorite } = await import('@/app/actions/consumer-favorites');
    const res = await isFavorite(BRANCH_LISTED);
    expect(res).toBe(false);
  });

  it('returns true for a favorited branch', async () => {
    db.consumer_favorites.rows.push({
      consumer_id: CONSUMER_A.userId,
      branch_id: BRANCH_LISTED,
      created_at: '2026-04-01T00:00:00.000Z',
    });
    const { isFavorite } = await import('@/app/actions/consumer-favorites');
    const res = await isFavorite(BRANCH_LISTED);
    expect(res).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// listFavorites — visibility filters + cross-tenant isolation
// ═══════════════════════════════════════════════════════════════════════════

describe('listFavorites', () => {
  it('rejects when no session', async () => {
    sessionMock = () => Promise.resolve(null);
    const { listFavorites } = await import('@/app/actions/consumer-favorites');
    const res = await listFavorites();
    expect(res.ok).toBe(false);
  });

  it('applies visibility filters: drops unlisted, admin-blocked, salon-blocked, and women-only during men-only launch', async () => {
    seedCatalog();
    db.consumer_favorites.rows.push(
      {
        consumer_id: CONSUMER_A.userId,
        branch_id: BRANCH_LISTED,
        created_at: '2026-04-05T00:00:00.000Z',
      },
      {
        consumer_id: CONSUMER_A.userId,
        branch_id: BRANCH_BLOCKED,
        created_at: '2026-04-04T00:00:00.000Z',
      },
      {
        consumer_id: CONSUMER_A.userId,
        branch_id: BRANCH_UNLISTED,
        created_at: '2026-04-03T00:00:00.000Z',
      },
      {
        consumer_id: CONSUMER_A.userId,
        branch_id: BRANCH_SALON_BLOCKED,
        created_at: '2026-04-02T00:00:00.000Z',
      },
      {
        consumer_id: CONSUMER_A.userId,
        branch_id: BRANCH_WOMEN_ONLY,
        created_at: '2026-04-01T00:00:00.000Z',
      },
    );

    const { listFavorites } = await import('@/app/actions/consumer-favorites');
    const res = await listFavorites();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.map((b) => b.id)).toEqual([BRANCH_LISTED]);
  });

  it('shows women-only favorite when the platform flag is on', async () => {
    seedCatalog();
    womenEnabled = true;
    db.consumer_favorites.rows.push({
      consumer_id: CONSUMER_A.userId,
      branch_id: BRANCH_WOMEN_ONLY,
      created_at: '2026-04-01T00:00:00.000Z',
    });
    const { listFavorites } = await import('@/app/actions/consumer-favorites');
    const res = await listFavorites();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.map((b) => b.id)).toContain(BRANCH_WOMEN_ONLY);
  });

  it("cross-tenant: consumer A cannot see consumer B's favorites", async () => {
    seedCatalog();
    // Both consumers have favorites, but only CONSUMER_B's would match.
    db.consumer_favorites.rows.push({
      consumer_id: CONSUMER_B.userId,
      branch_id: BRANCH_LISTED,
      created_at: '2026-04-01T00:00:00.000Z',
    });

    const { listFavorites } = await import('@/app/actions/consumer-favorites');

    // Consumer A lists — should be empty.
    const resA = await listFavorites();
    expect(resA.ok).toBe(true);
    if (!resA.ok) return;
    expect(resA.data).toHaveLength(0);

    // Switch session to consumer B — should see their one favorite.
    sessionMock = () => Promise.resolve({ ...CONSUMER_B });
    const resB = await listFavorites();
    expect(resB.ok).toBe(true);
    if (!resB.ok) return;
    expect(resB.data.map((b) => b.id)).toEqual([BRANCH_LISTED]);
  });
});
