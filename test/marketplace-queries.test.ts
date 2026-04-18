/**
 * Tests for `src/lib/marketplace/queries.ts` — the shared query layer for
 * the public consumer directory pages.
 *
 * The four scenarios demanded by the Week-2 task spec:
 *
 *   1. Women filtering when the `marketplace_women_enabled` platform flag
 *      is OFF → only `gender_type = 'men'` branches are surfaced.
 *   2. Women filtering when the flag is ON → every gender_type is eligible
 *      (we still keep the filter machinery intact; just no gender gate).
 *   3. Salon-side `marketplace_payable_blocked_at` filters the whole salon
 *      out. The block lives on `salons`, so a PostgREST `!inner` join to
 *      salons with a null-check on that column is the enforcement point.
 *   4. Branch-side `marketplace_admin_blocked_at` (superadmin kill switch)
 *      filters the specific branch out.
 *
 * Implementation note on the mock:
 *   We mock `@/lib/supabase` with a hand-rolled fake PostgREST query builder
 *   that captures the filter chain and returns whatever rows the test
 *   staged. This matches the style used by `test/marketplace-settings.test.ts`
 *   and `test/consumer-auth.test.ts` — both of which speak to the service-
 *   role client via the same seam.
 *
 *   The fake applies the filters in Node rather than going to a real DB,
 *   so the assertions reflect what a correct SQL implementation would
 *   emit. That's a gap — the real DB could behave differently — but it's
 *   enough to regression-catch the common mistake of building the wrong
 *   `.eq()` / `.is()` chain in the query layer.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════
// Environment setup — Next's cache helpers (unstable_cache) and the
// supabase service-role client are both mocked before the module loads.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `unstable_cache(fn, keys, opts)` normally returns a function that hits
 * Next's build-time cache. In tests we want the *current* DB state to drive
 * every call so we bypass the cache entirely — return the raw function.
 */
vi.mock('next/cache', () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(
    fn: T,
    _keys?: unknown,
    _opts?: unknown,
  ) => fn,
  revalidateTag: vi.fn(),
}));

// ─── Row shapes staged per-test ────────────────────────────────────────────

interface StagedBranch {
  id: string;
  name: string;
  slug: string;
  photos: Array<{ path: string; url: string; uploaded_at: string }>;
  about: string | null;
  rating_avg: number | null;
  rating_count: number;
  gender_type: 'men' | 'women' | 'mixed' | null;
  offers_home_service: boolean;
  listed_on_marketplace: boolean;
  marketplace_admin_blocked_at: string | null;
  /** joined city row */
  city_slug: string | null;
  /** joined salon row */
  salon_payable_blocked_at: string | null;
  salon_admin_blocked_at: string | null;
}

const state: {
  womenEnabled: boolean;
  branches: StagedBranch[];
} = {
  womenEnabled: false,
  branches: [],
};

/**
 * Minimal PostgREST query-builder fake. Supports the operator chain the
 * query layer emits: `.select().eq().is().order().limit()`. Each `.eq()` /
 * `.is()` returns the same chainable object; awaiting it resolves to a
 * `{ data, error }` shaped like a real PostgREST response.
 *
 * We record the filter predicates and apply them to the staged rows at
 * await time. `order()` is a no-op (tests check set membership, not
 * ordering). `limit()` truncates the result so the real limit argument
 * is exercised.
 */
function branchesQuery() {
  type Filter = (row: StagedBranch) => boolean;
  const filters: Filter[] = [];
  let limitN = Number.POSITIVE_INFINITY;

  const builder = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      filters.push((row) => {
        if (col === 'listed_on_marketplace') return row.listed_on_marketplace === val;
        if (col === 'offers_home_service') return row.offers_home_service === val;
        if (col === 'gender_type') return row.gender_type === val;
        if (col === 'cities.slug') return row.city_slug === val;
        return true;
      });
      return builder;
    },
    is: (col: string, val: unknown) => {
      filters.push((row) => {
        if (val !== null) return true; // only `.is(col, null)` is used
        if (col === 'marketplace_admin_blocked_at') return row.marketplace_admin_blocked_at === null;
        if (col === 'salons.marketplace_payable_blocked_at') return row.salon_payable_blocked_at === null;
        if (col === 'salons.marketplace_admin_blocked_at') return row.salon_admin_blocked_at === null;
        return true;
      });
      return builder;
    },
    order: () => builder,
    limit: (n: number) => {
      limitN = n;
      return builder;
    },
    then: (resolve: (v: { data: unknown; error: null }) => void) => {
      const surviving = state.branches.filter((row) => filters.every((f) => f(row)));
      // Shape each row into the joined response the query layer expects.
      const data = surviving.slice(0, limitN).map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        photos: row.photos,
        about: row.about,
        rating_avg: row.rating_avg,
        rating_count: row.rating_count,
        gender_type: row.gender_type,
        offers_home_service: row.offers_home_service,
        listed_on_marketplace: row.listed_on_marketplace,
        marketplace_admin_blocked_at: row.marketplace_admin_blocked_at,
        cities: row.city_slug ? { slug: row.city_slug } : null,
        salons: {
          marketplace_payable_blocked_at: row.salon_payable_blocked_at,
          marketplace_admin_blocked_at: row.salon_admin_blocked_at,
        },
      }));
      resolve({ data, error: null });
      return Promise.resolve({ data, error: null });
    },
  };
  return builder;
}

/** Platform-settings lookup for `marketplace_women_enabled`. */
function platformSettingsQuery() {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({
      data: { value: state.womenEnabled },
      error: null,
    }),
  };
  return builder;
}

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: (table: string) => {
      if (table === 'branches') return branchesQuery();
      if (table === 'platform_settings') return platformSettingsQuery();
      if (table === 'cities') {
        // Not exercised by these tests, but the module imports it.
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: [], error: null }),
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

// ═══════════════════════════════════════════════════════════════════════════
// Fixtures
// ═══════════════════════════════════════════════════════════════════════════

function mkBranch(overrides: Partial<StagedBranch>): StagedBranch {
  return {
    id: overrides.id ?? 'branch-id',
    name: overrides.name ?? 'Test Salon',
    slug: overrides.slug ?? 'test-salon',
    photos: overrides.photos ?? [
      {
        path: 'p1',
        url: 'https://example.com/p1.jpg',
        uploaded_at: '2026-04-18T00:00:00Z',
      },
    ],
    about: overrides.about ?? 'A great salon with talented stylists.',
    rating_avg: overrides.rating_avg ?? 4.5,
    rating_count: overrides.rating_count ?? 12,
    gender_type: overrides.gender_type ?? 'men',
    offers_home_service: overrides.offers_home_service ?? false,
    listed_on_marketplace: overrides.listed_on_marketplace ?? true,
    marketplace_admin_blocked_at: overrides.marketplace_admin_blocked_at ?? null,
    city_slug: overrides.city_slug ?? 'karachi',
    salon_payable_blocked_at: overrides.salon_payable_blocked_at ?? null,
    salon_admin_blocked_at: overrides.salon_admin_blocked_at ?? null,
  };
}

beforeEach(() => {
  vi.resetModules();
  state.womenEnabled = false;
  state.branches = [];
});

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('getAllListedBranches — women-flag gating', () => {
  it('hides women-only and mixed branches when the platform flag is off (men-only launch)', async () => {
    state.womenEnabled = false;
    state.branches = [
      mkBranch({ id: 'b-men', slug: 'men-salon', gender_type: 'men' }),
      mkBranch({ id: 'b-women', slug: 'women-salon', gender_type: 'women' }),
      mkBranch({ id: 'b-mixed', slug: 'mixed-salon', gender_type: 'mixed' }),
    ];

    const { getAllListedBranches } = await import('@/lib/marketplace/queries');
    const results = await getAllListedBranches({ mode: 'at_salon' });

    const ids = results.map((b) => b.id);
    expect(ids).toEqual(['b-men']);
    expect(ids).not.toContain('b-women');
    expect(ids).not.toContain('b-mixed');
  });

  it('surfaces every gender_type when the platform flag is on', async () => {
    state.womenEnabled = true;
    state.branches = [
      mkBranch({ id: 'b-men', slug: 'men-salon', gender_type: 'men' }),
      mkBranch({ id: 'b-women', slug: 'women-salon', gender_type: 'women' }),
      mkBranch({ id: 'b-mixed', slug: 'mixed-salon', gender_type: 'mixed' }),
    ];

    const { getAllListedBranches } = await import('@/lib/marketplace/queries');
    const results = await getAllListedBranches({ mode: 'at_salon' });

    const ids = results.map((b) => b.id).sort();
    expect(ids).toEqual(['b-men', 'b-mixed', 'b-women']);
  });
});

describe('getAllListedBranches — salon-level payable block', () => {
  it('filters out branches whose salon has marketplace_payable_blocked_at set', async () => {
    state.womenEnabled = false;
    state.branches = [
      mkBranch({
        id: 'b-ok',
        slug: 'ok-salon',
        gender_type: 'men',
        salon_payable_blocked_at: null,
      }),
      mkBranch({
        id: 'b-blocked',
        slug: 'blocked-salon',
        gender_type: 'men',
        salon_payable_blocked_at: '2026-04-17T10:00:00Z',
      }),
    ];

    const { getAllListedBranches } = await import('@/lib/marketplace/queries');
    const results = await getAllListedBranches({ mode: 'at_salon' });

    const ids = results.map((b) => b.id);
    expect(ids).toEqual(['b-ok']);
    expect(ids).not.toContain('b-blocked');
  });
});

describe('getAllListedBranches — branch-level admin block', () => {
  it('filters out branches whose own marketplace_admin_blocked_at is set (silent superadmin kill switch)', async () => {
    state.womenEnabled = false;
    state.branches = [
      mkBranch({
        id: 'b-ok',
        slug: 'ok-salon',
        gender_type: 'men',
        marketplace_admin_blocked_at: null,
      }),
      mkBranch({
        id: 'b-admin-blocked',
        slug: 'admin-blocked-salon',
        gender_type: 'men',
        marketplace_admin_blocked_at: '2026-04-17T10:00:00Z',
      }),
    ];

    const { getAllListedBranches } = await import('@/lib/marketplace/queries');
    const results = await getAllListedBranches({ mode: 'at_salon' });

    const ids = results.map((b) => b.id);
    expect(ids).toEqual(['b-ok']);
    expect(ids).not.toContain('b-admin-blocked');
  });

  it('also filters out branches whose parent salon has marketplace_admin_blocked_at set', async () => {
    state.womenEnabled = false;
    state.branches = [
      mkBranch({
        id: 'b-ok',
        slug: 'ok-salon',
        gender_type: 'men',
        salon_admin_blocked_at: null,
      }),
      mkBranch({
        id: 'b-salon-blocked',
        slug: 'salon-blocked',
        gender_type: 'men',
        salon_admin_blocked_at: '2026-04-17T10:00:00Z',
      }),
    ];

    const { getAllListedBranches } = await import('@/lib/marketplace/queries');
    const results = await getAllListedBranches({ mode: 'at_salon' });

    const ids = results.map((b) => b.id);
    expect(ids).toEqual(['b-ok']);
    expect(ids).not.toContain('b-salon-blocked');
  });
});

describe('getAllListedBranches — home-mode additional filter', () => {
  it('only returns branches with offers_home_service = true when mode is at_home', async () => {
    state.womenEnabled = false;
    state.branches = [
      mkBranch({
        id: 'b-home',
        slug: 'home-salon',
        gender_type: 'men',
        offers_home_service: true,
      }),
      mkBranch({
        id: 'b-salon-only',
        slug: 'salon-only',
        gender_type: 'men',
        offers_home_service: false,
      }),
    ];

    const { getAllListedBranches } = await import('@/lib/marketplace/queries');
    const results = await getAllListedBranches({ mode: 'at_home' });

    const ids = results.map((b) => b.id);
    expect(ids).toEqual(['b-home']);
  });
});

describe('_internal helpers', () => {
  it('aboutPreview trims long text on a word boundary with an ellipsis', async () => {
    const { _internal } = await import('@/lib/marketplace/queries');
    const long =
      'This salon offers the very best service in town and has been in business for decades, serving thousands of happy customers who come back every single month for haircuts, color, beard trims, and home-service visits across the entire city.';
    // Sanity: input must exceed the 180-char truncation threshold so the
    // helper's branching path is actually exercised.
    expect(long.length).toBeGreaterThan(180);
    const preview = _internal.aboutPreview(long);
    expect(preview).not.toBeNull();
    expect(preview!.length).toBeLessThanOrEqual(181);
    expect(preview!.endsWith('…')).toBe(true);
    // Must not truncate mid-word.
    expect(preview!.slice(0, -1).endsWith(' ')).toBe(false);
  });

  it('aboutPreview returns null for empty / whitespace / null input', async () => {
    const { _internal } = await import('@/lib/marketplace/queries');
    expect(_internal.aboutPreview(null)).toBeNull();
    expect(_internal.aboutPreview(undefined)).toBeNull();
    expect(_internal.aboutPreview('   ')).toBeNull();
    expect(_internal.aboutPreview('')).toBeNull();
  });

  it('firstPhotoUrl returns the first photo url, or null for empty / malformed', async () => {
    const { _internal } = await import('@/lib/marketplace/queries');
    expect(
      _internal.firstPhotoUrl([
        { path: 'p', url: 'https://x/y.jpg', uploaded_at: 'z' },
      ]),
    ).toBe('https://x/y.jpg');
    expect(_internal.firstPhotoUrl([])).toBeNull();
    expect(_internal.firstPhotoUrl(null)).toBeNull();
    expect(_internal.firstPhotoUrl([{ path: 'p' }])).toBeNull();
  });
});
