/**
 * Tests for the `/services/[slug]-in-[city]` (and `home-[slug]-in-[city]`)
 * programmatic-SEO surface — the Week 6 deliverable from
 * `docs/superpowers/plans/2026-04-18-marketplace-phase-0-1.md`.
 *
 * Four test areas, matching the task spec:
 *
 *   1. Slug parser (`parseServiceCitySlug`) — handles both `home-` and
 *      non-`home-` variants, rejects bad input, enforces kebab-case segments.
 *
 *   2. `getListedBranchesForServiceInCity` — the PostgREST-backed query
 *      layer applies:
 *        a. men-only gate (women-flag off → only `gender_type = 'men'`)
 *        b. service category match via `services.category = ANY(matches_categories)`
 *        c. city match via `cities.slug = :citySlug`
 *
 *   3. `generateStaticParams` of the page module — returns 10 × 5 × 2 = 100
 *      entries when both taxonomy queries succeed, or an empty array when
 *      the DB is down (fallback path for local builds without DATABASE_URL).
 *
 *   4. Thin-content guard in `generateMetadata` — when the branch list is
 *      empty AND (home mode OR women flag off), `robots: { index: false }`
 *      is emitted so Search Console doesn't flag the page as thin content.
 *
 * Mock strategy:
 *   - `next/cache` is mocked to a passthrough (no caching in tests).
 *   - `@/lib/supabase` is mocked to a hand-rolled PostgREST fake that speaks
 *     the operator chain the real query layer emits. Matches the style used
 *     in `test/marketplace-queries.test.ts`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════
// Environment setup — mocks registered before any dynamic import
// ═══════════════════════════════════════════════════════════════════════════

vi.mock('next/cache', () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(
    fn: T,
    _keys?: unknown,
    _opts?: unknown,
  ) => fn,
  revalidateTag: vi.fn(),
}));

// Consumer session + favorites are irrelevant to the page-level tests below.
// We stub them out so the page module can import without network calls.
vi.mock('@/lib/consumer-session', () => ({
  getConsumerSession: vi.fn(async () => null),
}));
vi.mock('@/app/actions/consumer-favorites', () => ({
  getFavoriteBranchIds: vi.fn(async () => new Set<string>()),
}));

// ─── Row shapes staged per-test ────────────────────────────────────────────

interface StagedService {
  id: string;
  salon_id: string;
  category: string;
  is_active: boolean;
  available_at_home: boolean;
}

interface StagedBranch {
  id: string;
  name: string;
  slug: string;
  salon_id: string;
  photos: Array<{ path: string; url: string; uploaded_at: string }>;
  about: string | null;
  rating_avg: number | null;
  rating_count: number;
  gender_type: 'men' | 'women' | 'mixed' | null;
  offers_home_service: boolean;
  listed_on_marketplace: boolean;
  marketplace_admin_blocked_at: string | null;
  city_slug: string | null;
  salon_payable_blocked_at: string | null;
  salon_admin_blocked_at: string | null;
  /** attached services owned by this branch's salon */
  services: StagedService[];
}

interface StagedMarketplaceService {
  id: string;
  slug: string;
  name: string;
  display_name: string;
  matches_categories: string[];
  display_order: number;
  is_active: boolean;
  available_at_home: boolean;
}

interface StagedCity {
  id: string;
  slug: string;
  name: string;
  display_order: number;
}

const state: {
  womenEnabled: boolean;
  branches: StagedBranch[];
  marketplaceServices: StagedMarketplaceService[];
  cities: StagedCity[];
  /** If true, the supabase mock throws — simulates DB unreachable. */
  throwOnSupabase: boolean;
} = {
  womenEnabled: false,
  branches: [],
  marketplaceServices: [],
  cities: [],
  throwOnSupabase: false,
};

/**
 * Branches fake query builder. Records predicates and applies them at await
 * time. Handles the operator chain the real query emits:
 *   .select().eq().is().in().order().limit() + `then`
 */
function branchesQuery() {
  type Filter = (row: StagedBranch) => boolean;
  const filters: Filter[] = [];
  let limitN = Number.POSITIVE_INFINITY;
  let requireServiceMatch = false;

  const builder = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      filters.push((row) => {
        if (col === 'listed_on_marketplace') return row.listed_on_marketplace === val;
        if (col === 'offers_home_service') return row.offers_home_service === val;
        if (col === 'gender_type') return row.gender_type === val;
        if (col === 'cities.slug') return row.city_slug === val;
        if (col === 'services.is_active') {
          requireServiceMatch = true;
          return row.services.some((s) => s.is_active === val);
        }
        if (col === 'services.available_at_home') {
          requireServiceMatch = true;
          return row.services.some((s) => s.available_at_home === val);
        }
        return true;
      });
      return builder;
    },
    is: (col: string, val: unknown) => {
      filters.push((row) => {
        if (val !== null) return true;
        if (col === 'marketplace_admin_blocked_at') return row.marketplace_admin_blocked_at === null;
        if (col === 'salons.marketplace_payable_blocked_at') return row.salon_payable_blocked_at === null;
        if (col === 'salons.marketplace_admin_blocked_at') return row.salon_admin_blocked_at === null;
        return true;
      });
      return builder;
    },
    in: (col: string, vals: unknown[]) => {
      filters.push((row) => {
        if (col === 'services.category') {
          requireServiceMatch = true;
          return row.services.some((s) => vals.includes(s.category));
        }
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
      // Real PostgREST emits one row per matching service (cartesian via
      // !inner join). The production code dedups by branch id. To exercise
      // that dedup path we emit each matching branch-service pair.
      const data: unknown[] = [];
      for (const row of surviving) {
        if (requireServiceMatch) {
          const matching = row.services.filter((s) => s.is_active);
          for (const _svc of matching) {
            data.push(shapeBranchRow(row));
            if (data.length >= limitN) break;
          }
        } else {
          data.push(shapeBranchRow(row));
        }
        if (data.length >= limitN) break;
      }
      resolve({ data, error: null });
      return Promise.resolve({ data, error: null });
    },
  };
  return builder;
}

function shapeBranchRow(row: StagedBranch) {
  return {
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
  };
}

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

function citiesQuery() {
  const filters: Array<(row: StagedCity) => boolean> = [];
  const builder = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      filters.push((row) => {
        if (col === 'is_active') return true;
        if (col === 'slug') return row.slug === val;
        return true;
      });
      return builder;
    },
    order: async () => {
      const data = state.cities.filter((r) => filters.every((f) => f(r)));
      return { data, error: null };
    },
    maybeSingle: async () => {
      const data = state.cities.find((r) => filters.every((f) => f(r)));
      return { data: data ?? null, error: null };
    },
  };
  return builder;
}

function marketplaceServicesQuery() {
  const filters: Array<(row: StagedMarketplaceService) => boolean> = [];
  const builder = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      filters.push((row) => {
        if (col === 'is_active') return row.is_active === val;
        if (col === 'slug') return row.slug === val;
        return true;
      });
      return builder;
    },
    order: async () => {
      const data = state.marketplaceServices.filter((r) =>
        filters.every((f) => f(r)),
      );
      return { data, error: null };
    },
    maybeSingle: async () => {
      const data = state.marketplaceServices.find((r) =>
        filters.every((f) => f(r)),
      );
      return { data: data ?? null, error: null };
    },
  };
  return builder;
}

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => {
    if (state.throwOnSupabase) {
      throw new Error('Supabase unreachable');
    }
    return {
      from: (table: string) => {
        if (table === 'branches') return branchesQuery();
        if (table === 'platform_settings') return platformSettingsQuery();
        if (table === 'cities') return citiesQuery();
        if (table === 'marketplace_services') return marketplaceServicesQuery();
        throw new Error(`Unexpected table: ${table}`);
      },
    };
  },
}));

// ═══════════════════════════════════════════════════════════════════════════
// Fixtures
// ═══════════════════════════════════════════════════════════════════════════

function mkBranch(overrides: Partial<StagedBranch>): StagedBranch {
  return {
    id: overrides.id ?? 'branch-id',
    name: overrides.name ?? 'Test Salon',
    slug: overrides.slug ?? 'test-salon',
    salon_id: overrides.salon_id ?? 'salon-id',
    photos: overrides.photos ?? [],
    about: overrides.about ?? 'A great salon.',
    rating_avg: overrides.rating_avg ?? 4.5,
    rating_count: overrides.rating_count ?? 10,
    gender_type: overrides.gender_type ?? 'men',
    offers_home_service: overrides.offers_home_service ?? false,
    listed_on_marketplace: overrides.listed_on_marketplace ?? true,
    marketplace_admin_blocked_at: overrides.marketplace_admin_blocked_at ?? null,
    city_slug: overrides.city_slug ?? 'lahore',
    salon_payable_blocked_at: overrides.salon_payable_blocked_at ?? null,
    salon_admin_blocked_at: overrides.salon_admin_blocked_at ?? null,
    services: overrides.services ?? [
      {
        id: 'svc-1',
        salon_id: overrides.salon_id ?? 'salon-id',
        category: 'haircut',
        is_active: true,
        available_at_home: true,
      },
    ],
  };
}

function seedHaircutService() {
  state.marketplaceServices.push({
    id: 'mp-haircut',
    slug: 'haircut',
    name: 'Haircut',
    display_name: 'Haircut',
    matches_categories: ['haircut'],
    display_order: 1,
    is_active: true,
    available_at_home: true,
  });
}

function seedCities() {
  state.cities.push(
    { id: 'c-karachi', slug: 'karachi', name: 'Karachi', display_order: 1 },
    { id: 'c-lahore', slug: 'lahore', name: 'Lahore', display_order: 2 },
    { id: 'c-islamabad', slug: 'islamabad', name: 'Islamabad', display_order: 3 },
    { id: 'c-rawalpindi', slug: 'rawalpindi', name: 'Rawalpindi', display_order: 4 },
    { id: 'c-faisalabad', slug: 'faisalabad', name: 'Faisalabad', display_order: 5 },
  );
}

function seedTenServices() {
  const defs: Array<[string, string, string[], boolean]> = [
    ['haircut', 'Haircut', ['haircut'], true],
    ['beard-trim', 'Beard Trim', ['beard'], true],
    ['hair-color', 'Hair Color', ['color'], true],
    ['facial', 'Facial', ['facial'], true],
    ['waxing', 'Waxing', ['waxing'], true],
    ['bridal', 'Bridal Makeup', ['bridal'], true],
    ['nails', 'Nails & Manicure', ['nails'], true],
    ['massage', 'Massage', ['massage'], true],
    ['keratin', 'Keratin Treatment', ['treatment'], false],
    ['hair-treatment', 'Hair Treatment', ['treatment'], false],
  ];
  let order = 1;
  for (const [slug, display, cats, home] of defs) {
    state.marketplaceServices.push({
      id: `mp-${slug}`,
      slug,
      name: display,
      display_name: display,
      matches_categories: cats,
      display_order: order++,
      is_active: true,
      available_at_home: home,
    });
  }
}

beforeEach(() => {
  vi.resetModules();
  state.womenEnabled = false;
  state.branches = [];
  state.marketplaceServices = [];
  state.cities = [];
  state.throwOnSupabase = false;
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. Slug parser
// ═══════════════════════════════════════════════════════════════════════════

describe('parseServiceCitySlug', () => {
  it('parses the non-home variant', async () => {
    const { parseServiceCitySlug } = await import(
      '@/lib/marketplace/service-city-slug'
    );
    expect(parseServiceCitySlug('haircut-in-lahore')).toEqual({
      serviceSlug: 'haircut',
      citySlug: 'lahore',
      mode: 'at_salon',
    });
  });

  it('parses the home-prefixed variant', async () => {
    const { parseServiceCitySlug } = await import(
      '@/lib/marketplace/service-city-slug'
    );
    expect(parseServiceCitySlug('home-haircut-in-lahore')).toEqual({
      serviceSlug: 'haircut',
      citySlug: 'lahore',
      mode: 'at_home',
    });
  });

  it('parses multi-segment service and city slugs', async () => {
    const { parseServiceCitySlug } = await import(
      '@/lib/marketplace/service-city-slug'
    );
    expect(parseServiceCitySlug('hair-color-in-rawalpindi')).toEqual({
      serviceSlug: 'hair-color',
      citySlug: 'rawalpindi',
      mode: 'at_salon',
    });
    expect(parseServiceCitySlug('home-hair-treatment-in-islamabad')).toEqual({
      serviceSlug: 'hair-treatment',
      citySlug: 'islamabad',
      mode: 'at_home',
    });
  });

  it('returns null for missing "-in-" separator', async () => {
    const { parseServiceCitySlug } = await import(
      '@/lib/marketplace/service-city-slug'
    );
    expect(parseServiceCitySlug('haircut-lahore')).toBeNull();
  });

  it('returns null for empty input', async () => {
    const { parseServiceCitySlug } = await import(
      '@/lib/marketplace/service-city-slug'
    );
    expect(parseServiceCitySlug('')).toBeNull();
  });

  it('returns null for uppercase / non-kebab input', async () => {
    const { parseServiceCitySlug } = await import(
      '@/lib/marketplace/service-city-slug'
    );
    expect(parseServiceCitySlug('Haircut-In-Lahore')).toBeNull();
    expect(parseServiceCitySlug('haircut_in_lahore')).toBeNull();
  });

  it('returns null for leading/trailing dashes or empty segments', async () => {
    const { parseServiceCitySlug } = await import(
      '@/lib/marketplace/service-city-slug'
    );
    expect(parseServiceCitySlug('-haircut-in-lahore')).toBeNull();
    expect(parseServiceCitySlug('haircut-in-lahore-')).toBeNull();
    expect(parseServiceCitySlug('haircut-in-')).toBeNull();
    expect(parseServiceCitySlug('home--in-lahore')).toBeNull();
  });

  it('buildServiceCitySlug round-trips both modes', async () => {
    const { buildServiceCitySlug, parseServiceCitySlug } = await import(
      '@/lib/marketplace/service-city-slug'
    );
    const a = buildServiceCitySlug('haircut', 'lahore', 'at_salon');
    expect(a).toBe('haircut-in-lahore');
    expect(parseServiceCitySlug(a)?.mode).toBe('at_salon');

    const b = buildServiceCitySlug('haircut', 'lahore', 'at_home');
    expect(b).toBe('home-haircut-in-lahore');
    expect(parseServiceCitySlug(b)?.mode).toBe('at_home');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. getListedBranchesForServiceInCity — SQL filter correctness
// ═══════════════════════════════════════════════════════════════════════════

describe('getListedBranchesForServiceInCity', () => {
  it('applies the men-only gate when the women flag is off', async () => {
    state.womenEnabled = false;
    seedHaircutService();
    state.branches = [
      mkBranch({ id: 'b-men', slug: 'men-salon', gender_type: 'men' }),
      mkBranch({ id: 'b-women', slug: 'women-salon', gender_type: 'women' }),
      mkBranch({ id: 'b-mixed', slug: 'mixed-salon', gender_type: 'mixed' }),
    ];

    const { getListedBranchesForServiceInCity } = await import(
      '@/lib/marketplace/queries'
    );
    const results = await getListedBranchesForServiceInCity({
      serviceSlug: 'haircut',
      citySlug: 'lahore',
      mode: 'at_salon',
    });

    expect(results.map((b) => b.id)).toEqual(['b-men']);
  });

  it('surfaces every gender when the women flag is on', async () => {
    state.womenEnabled = true;
    seedHaircutService();
    state.branches = [
      mkBranch({ id: 'b-men', slug: 'men-salon', gender_type: 'men' }),
      mkBranch({ id: 'b-women', slug: 'women-salon', gender_type: 'women' }),
      mkBranch({ id: 'b-mixed', slug: 'mixed-salon', gender_type: 'mixed' }),
    ];

    const { getListedBranchesForServiceInCity } = await import(
      '@/lib/marketplace/queries'
    );
    const results = await getListedBranchesForServiceInCity({
      serviceSlug: 'haircut',
      citySlug: 'lahore',
      mode: 'at_salon',
    });

    expect(results.map((b) => b.id).sort()).toEqual([
      'b-men',
      'b-mixed',
      'b-women',
    ]);
  });

  it('matches services only on matches_categories (excludes non-matching)', async () => {
    state.womenEnabled = false;
    seedHaircutService();
    state.branches = [
      mkBranch({
        id: 'b-haircut',
        slug: 'haircut-salon',
        services: [
          {
            id: 's1',
            salon_id: 'salon-id',
            category: 'haircut',
            is_active: true,
            available_at_home: true,
          },
        ],
      }),
      mkBranch({
        id: 'b-facial-only',
        slug: 'facial-salon',
        salon_id: 'salon-2',
        services: [
          {
            id: 's2',
            salon_id: 'salon-2',
            category: 'facial',
            is_active: true,
            available_at_home: true,
          },
        ],
      }),
    ];

    const { getListedBranchesForServiceInCity } = await import(
      '@/lib/marketplace/queries'
    );
    const results = await getListedBranchesForServiceInCity({
      serviceSlug: 'haircut',
      citySlug: 'lahore',
      mode: 'at_salon',
    });

    const ids = results.map((b) => b.id);
    expect(ids).toEqual(['b-haircut']);
    expect(ids).not.toContain('b-facial-only');
  });

  it('excludes branches from other cities', async () => {
    state.womenEnabled = false;
    seedHaircutService();
    state.branches = [
      mkBranch({ id: 'b-lahore', slug: 'lhr-salon', city_slug: 'lahore' }),
      mkBranch({
        id: 'b-karachi',
        slug: 'khi-salon',
        salon_id: 'salon-2',
        city_slug: 'karachi',
      }),
    ];

    const { getListedBranchesForServiceInCity } = await import(
      '@/lib/marketplace/queries'
    );
    const results = await getListedBranchesForServiceInCity({
      serviceSlug: 'haircut',
      citySlug: 'lahore',
      mode: 'at_salon',
    });

    expect(results.map((b) => b.id)).toEqual(['b-lahore']);
  });

  it('returns an empty array for an unknown service slug', async () => {
    state.womenEnabled = false;
    // Intentionally do NOT seed the service.
    state.branches = [mkBranch({ id: 'b-1' })];

    const { getListedBranchesForServiceInCity } = await import(
      '@/lib/marketplace/queries'
    );
    const results = await getListedBranchesForServiceInCity({
      serviceSlug: 'nonexistent',
      citySlug: 'lahore',
      mode: 'at_salon',
    });

    expect(results).toEqual([]);
  });

  it('dedups a branch that owns multiple matching services', async () => {
    state.womenEnabled = false;
    seedHaircutService();
    // One branch with two haircut services — real PostgREST would emit two
    // rows, and the query layer dedups by branch id.
    state.branches = [
      mkBranch({
        id: 'b-multi',
        slug: 'multi-salon',
        services: [
          {
            id: 's-a',
            salon_id: 'salon-id',
            category: 'haircut',
            is_active: true,
            available_at_home: true,
          },
          {
            id: 's-b',
            salon_id: 'salon-id',
            category: 'haircut',
            is_active: true,
            available_at_home: true,
          },
        ],
      }),
    ];

    const { getListedBranchesForServiceInCity } = await import(
      '@/lib/marketplace/queries'
    );
    const results = await getListedBranchesForServiceInCity({
      serviceSlug: 'haircut',
      citySlug: 'lahore',
      mode: 'at_salon',
    });

    expect(results.length).toBe(1);
    expect(results[0].id).toBe('b-multi');
  });

  it('home mode also requires offers_home_service = true on the branch', async () => {
    state.womenEnabled = false;
    seedHaircutService();
    state.branches = [
      mkBranch({
        id: 'b-home',
        slug: 'home-salon',
        offers_home_service: true,
      }),
      mkBranch({
        id: 'b-salon-only',
        slug: 'salon-only',
        salon_id: 'salon-2',
        offers_home_service: false,
      }),
    ];

    const { getListedBranchesForServiceInCity } = await import(
      '@/lib/marketplace/queries'
    );
    const results = await getListedBranchesForServiceInCity({
      serviceSlug: 'haircut',
      citySlug: 'lahore',
      mode: 'at_home',
    });

    expect(results.map((b) => b.id)).toEqual(['b-home']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. generateStaticParams — 10 × 5 × 2 = 100 entries
// ═══════════════════════════════════════════════════════════════════════════

describe('generateStaticParams for /services/[slug]', () => {
  it('emits 100 entries (10 services × 5 cities × 2 modes)', async () => {
    seedTenServices();
    seedCities();

    const mod = await import('@/app/(marketplace)/services/[slug]/page');
    const params = await mod.generateStaticParams();

    expect(params.length).toBe(100);
    // Spot-check both variants for a known combination.
    const slugs = params.map((p) => p.slug);
    expect(slugs).toContain('haircut-in-lahore');
    expect(slugs).toContain('home-haircut-in-lahore');
    expect(slugs).toContain('keratin-in-karachi');
    expect(slugs).toContain('home-keratin-in-karachi');
  });

  it('returns an empty array when the DB is unreachable (build fallback)', async () => {
    state.throwOnSupabase = true;

    const mod = await import('@/app/(marketplace)/services/[slug]/page');
    const params = await mod.generateStaticParams();

    expect(params).toEqual([]);
  });

  it('returns an empty array when the services table is empty', async () => {
    // Cities seeded but no services → 0 × 5 × 2 = 0.
    seedCities();

    const mod = await import('@/app/(marketplace)/services/[slug]/page');
    const params = await mod.generateStaticParams();

    expect(params).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Thin-content guard in generateMetadata
// ═══════════════════════════════════════════════════════════════════════════

describe('generateMetadata thin-content guard', () => {
  it('sets robots noindex when zero branches AND women flag is OFF', async () => {
    state.womenEnabled = false;
    seedTenServices();
    seedCities();
    // No branches staged → zero listings in Lahore for haircut.

    const mod = await import('@/app/(marketplace)/services/[slug]/page');
    const metadata = await mod.generateMetadata({
      params: Promise.resolve({ slug: 'haircut-in-lahore' }),
    });

    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it('sets robots noindex when zero branches AND home mode (even with women flag ON)', async () => {
    state.womenEnabled = true;
    seedTenServices();
    seedCities();
    // No branches staged; home-mode slug.

    const mod = await import('@/app/(marketplace)/services/[slug]/page');
    const metadata = await mod.generateMetadata({
      params: Promise.resolve({ slug: 'home-haircut-in-lahore' }),
    });

    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it('leaves robots as indexable when there is at least one listed branch', async () => {
    state.womenEnabled = false;
    seedTenServices();
    seedCities();
    state.branches = [
      mkBranch({ id: 'b-1', slug: 'good-salon', city_slug: 'lahore' }),
    ];

    const mod = await import('@/app/(marketplace)/services/[slug]/page');
    const metadata = await mod.generateMetadata({
      params: Promise.resolve({ slug: 'haircut-in-lahore' }),
    });

    expect(metadata.robots).toEqual({ index: true, follow: true });
  });

  it('stays indexable when zero branches but women-flag ON and at_salon mode', async () => {
    state.womenEnabled = true;
    seedTenServices();
    seedCities();
    // No branches, but women flag is on → still index the placeholder page.

    const mod = await import('@/app/(marketplace)/services/[slug]/page');
    const metadata = await mod.generateMetadata({
      params: Promise.resolve({ slug: 'haircut-in-lahore' }),
    });

    expect(metadata.robots).toEqual({ index: true, follow: true });
  });

  it('sets noindex for an invalid compound slug', async () => {
    seedTenServices();
    seedCities();

    const mod = await import('@/app/(marketplace)/services/[slug]/page');
    const metadata = await mod.generateMetadata({
      params: Promise.resolve({ slug: 'not-a-valid-slug' }),
    });

    // Regex rejects "not-a-valid-slug" (no "-in-" separator) → parsed is
    // null → metadata returns { title: 'Not found', robots: noindex+nofollow }.
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('interpolates service + city naturally into the title', async () => {
    state.womenEnabled = false;
    seedTenServices();
    seedCities();
    state.branches = [
      mkBranch({ id: 'b-1', slug: 'good-salon', city_slug: 'lahore' }),
    ];

    const mod = await import('@/app/(marketplace)/services/[slug]/page');
    const metadata = await mod.generateMetadata({
      params: Promise.resolve({ slug: 'haircut-in-lahore' }),
    });

    expect(metadata.title).toBe(
      'Haircut in Lahore — 1 Salon · Book on iCut',
    );
  });

  it('prefixes "Home " in the title for home-mode slugs', async () => {
    state.womenEnabled = false;
    seedTenServices();
    seedCities();
    state.branches = [
      mkBranch({
        id: 'b-1',
        slug: 'home-salon',
        city_slug: 'lahore',
        offers_home_service: true,
      }),
    ];

    const mod = await import('@/app/(marketplace)/services/[slug]/page');
    const metadata = await mod.generateMetadata({
      params: Promise.resolve({ slug: 'home-haircut-in-lahore' }),
    });

    expect(String(metadata.title)).toMatch(/^Home Haircut in Lahore/);
  });
});
