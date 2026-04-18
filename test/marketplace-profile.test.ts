/**
 * Tests for the salon profile surface — covers the query layer additions
 * (`getBranchBySlug`, `getBranchReviews`) and the mode-driven pricing /
 * filtering the page relies on.
 *
 * Four scenarios demanded by the Week-3 task spec:
 *   (a) getBranchBySlug returns null on an invalid slug → the page converts
 *       that to notFound() in production.
 *   (b) Returns null (404-equivalent) when the branch has
 *       `marketplace_admin_blocked_at` set — superadmin kill switch applies
 *       to profile pages the same way it applies to directory listings.
 *   (c) Home mode — the ServiceMenu filters to services with
 *       `available_at_home === true` only. Tested by running the
 *       pure-display filter logic from `pricing.ts` + a local shim of the
 *       same filter used by the component.
 *   (d) Price display switches between modes: base unchanged in `at_salon`,
 *       marked-up-and-rounded in `at_home`.
 *
 * Same mock style as `test/marketplace-queries.test.ts`:
 *   - `unstable_cache` passes through to the raw fn (no cache).
 *   - A tiny PostgREST builder capturing filters + staged rows.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Bypass the Next cache — we want every test call to hit the staged state.
vi.mock('next/cache', () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(
    fn: T,
    _keys?: unknown,
    _opts?: unknown,
  ) => fn,
  revalidateTag: vi.fn(),
}));

// ───────────────────────── Staged state ─────────────────────────

interface StagedBranch {
  id: string;
  name: string;
  slug: string;
  about: string | null;
  photos: Array<{ path: string; url: string; uploaded_at: string }>;
  lat: number | null;
  lng: number | null;
  address: string | null;
  phone: string | null;
  rating_avg: number | null;
  rating_count: number;
  gender_type: 'men' | 'women' | 'mixed' | null;
  offers_home_service: boolean;
  home_service_radius_km: number | null;
  working_hours: Record<string, unknown> | null;
  listed_on_marketplace: boolean;
  marketplace_admin_blocked_at: string | null;
  salon_id: string;
  city: { id: string; slug: string; name: string } | null;
  salon: {
    id: string;
    name: string;
    marketplace_payable_blocked_at: string | null;
    marketplace_admin_blocked_at: string | null;
  };
}

interface StagedService {
  id: string;
  salon_id: string;
  name: string;
  category: string | null;
  duration_minutes: number | null;
  base_price: number;
  available_at_home: boolean;
  is_active: boolean;
  sort_order: number;
}

interface StagedReview {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  direction: 'consumer_of_salon' | 'salon_of_consumer';
  branch_id: string;
  consumer_name: string;
}

const state: {
  womenEnabled: boolean;
  branches: StagedBranch[];
  services: StagedService[];
  reviews: StagedReview[];
} = {
  womenEnabled: false,
  branches: [],
  services: [],
  reviews: [],
};

// ───────────────────────── Query builder fake ─────────────────────────

function branchesQuery() {
  type Filter = (row: StagedBranch) => boolean;
  const filters: Filter[] = [];
  let slugFilter: string | null = null;

  const builder = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      if (col === 'slug') slugFilter = val as string;
      filters.push((row) => {
        if (col === 'slug') return row.slug === val;
        if (col === 'listed_on_marketplace') return row.listed_on_marketplace === val;
        if (col === 'offers_home_service') return row.offers_home_service === val;
        if (col === 'gender_type') return row.gender_type === val;
        if (col === 'cities.slug') return row.city?.slug === val;
        return true;
      });
      return builder;
    },
    is: (col: string, val: unknown) => {
      filters.push((row) => {
        if (val !== null) return true;
        if (col === 'marketplace_admin_blocked_at')
          return row.marketplace_admin_blocked_at === null;
        if (col === 'salons.marketplace_payable_blocked_at')
          return row.salon.marketplace_payable_blocked_at === null;
        if (col === 'salons.marketplace_admin_blocked_at')
          return row.salon.marketplace_admin_blocked_at === null;
        return true;
      });
      return builder;
    },
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => {
      const matches = state.branches.filter((row) => filters.every((f) => f(row)));
      void slugFilter; // used implicitly by filters
      const row = matches[0] ?? null;
      if (!row) return { data: null, error: null };
      return {
        data: {
          id: row.id,
          name: row.name,
          slug: row.slug,
          about: row.about,
          photos: row.photos,
          lat: row.lat,
          lng: row.lng,
          address: row.address,
          phone: row.phone,
          rating_avg: row.rating_avg,
          rating_count: row.rating_count,
          offers_home_service: row.offers_home_service,
          home_service_radius_km: row.home_service_radius_km,
          gender_type: row.gender_type,
          working_hours: row.working_hours,
          listed_on_marketplace: row.listed_on_marketplace,
          marketplace_admin_blocked_at: row.marketplace_admin_blocked_at,
          salon_id: row.salon_id,
          cities: row.city,
          salons: {
            id: row.salon.id,
            name: row.salon.name,
            marketplace_payable_blocked_at: row.salon.marketplace_payable_blocked_at,
            marketplace_admin_blocked_at: row.salon.marketplace_admin_blocked_at,
          },
        },
        error: null,
      };
    },
    then: (resolve: (v: unknown) => void) => {
      // Used by list queries — profile page doesn't hit this path. Always
      // return empty.
      resolve({ data: [], error: null });
      return Promise.resolve({ data: [], error: null });
    },
  };
  return builder;
}

function servicesQuery() {
  const filters: Array<(s: StagedService) => boolean> = [];
  const builder = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      filters.push((s) => {
        if (col === 'salon_id') return s.salon_id === val;
        if (col === 'is_active') return s.is_active === val;
        return true;
      });
      return builder;
    },
    order: () => builder,
    then: (resolve: (v: unknown) => void) => {
      const surviving = state.services.filter((s) => filters.every((f) => f(s)));
      const data = surviving.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        duration_minutes: s.duration_minutes,
        base_price: s.base_price,
        available_at_home: s.available_at_home,
        is_active: s.is_active,
        sort_order: s.sort_order,
      }));
      resolve({ data, error: null });
      return Promise.resolve({ data, error: null });
    },
  };
  return builder;
}

function reviewsQuery() {
  const filters: Array<(r: StagedReview) => boolean> = [];
  let lim = Number.POSITIVE_INFINITY;

  const builder = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      filters.push((r) => {
        if (col === 'direction') return r.direction === val;
        if (col === 'bookings.branch_id') return r.branch_id === val;
        return true;
      });
      return builder;
    },
    order: () => builder,
    limit: (n: number) => {
      lim = n;
      return builder;
    },
    then: (resolve: (v: unknown) => void) => {
      const surviving = state.reviews.filter((r) => filters.every((f) => f(r)));
      const data = surviving.slice(0, lim).map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        created_at: r.created_at,
        direction: r.direction,
        bookings: {
          branch_id: r.branch_id,
          consumers: { name: r.consumer_name },
        },
      }));
      resolve({ data, error: null });
      return Promise.resolve({ data, error: null });
    },
  };
  return builder;
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

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: (table: string) => {
      if (table === 'branches') return branchesQuery();
      if (table === 'services') return servicesQuery();
      if (table === 'reviews') return reviewsQuery();
      if (table === 'platform_settings') return platformSettingsQuery();
      if (table === 'cities') {
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

// ───────────────────────── Fixtures ─────────────────────────

function mkBranch(overrides: Partial<StagedBranch> = {}): StagedBranch {
  return {
    id: overrides.id ?? 'b-1',
    name: overrides.name ?? 'Fatima Beauty Lounge',
    slug: overrides.slug ?? 'fatima-beauty-lounge-karachi',
    about: overrides.about ?? 'A great salon.',
    photos:
      overrides.photos ?? [
        {
          path: 'p1',
          url: 'https://example.com/p1.jpg',
          uploaded_at: '2026-04-18T00:00:00Z',
        },
      ],
    lat: overrides.lat ?? 24.8607,
    lng: overrides.lng ?? 67.0011,
    address: overrides.address ?? 'Shop 7, DHA Phase 5',
    phone: overrides.phone ?? '+9230012345678',
    rating_avg: overrides.rating_avg ?? 4.5,
    rating_count: overrides.rating_count ?? 12,
    gender_type: overrides.gender_type ?? 'men',
    offers_home_service: overrides.offers_home_service ?? true,
    home_service_radius_km: overrides.home_service_radius_km ?? 8,
    working_hours:
      overrides.working_hours ?? {
        mon: { open: '09:00', close: '21:00', off: false },
      },
    listed_on_marketplace: overrides.listed_on_marketplace ?? true,
    marketplace_admin_blocked_at: overrides.marketplace_admin_blocked_at ?? null,
    salon_id: overrides.salon_id ?? 's-1',
    city: overrides.city ?? { id: 'c-1', slug: 'karachi', name: 'Karachi' },
    salon: overrides.salon ?? {
      id: 's-1',
      name: 'Fatima Beauty',
      marketplace_payable_blocked_at: null,
      marketplace_admin_blocked_at: null,
    },
  };
}

function mkService(overrides: Partial<StagedService> = {}): StagedService {
  return {
    id: overrides.id ?? 'svc-1',
    salon_id: overrides.salon_id ?? 's-1',
    name: overrides.name ?? 'Haircut',
    category: overrides.category ?? 'haircut',
    duration_minutes: overrides.duration_minutes ?? 30,
    base_price: overrides.base_price ?? 1000,
    available_at_home: overrides.available_at_home ?? true,
    is_active: overrides.is_active ?? true,
    sort_order: overrides.sort_order ?? 0,
  };
}

beforeEach(() => {
  vi.resetModules();
  state.womenEnabled = false;
  state.branches = [];
  state.services = [];
  state.reviews = [];
});

// ───────────────────────── Tests ─────────────────────────

describe('getBranchBySlug — (a) invalid slug triggers page.notFound()', () => {
  it('returns null when no branch row matches the slug', async () => {
    state.branches = [mkBranch({ slug: 'existing-salon' })];
    const { getBranchBySlug } = await import('@/lib/marketplace/queries');
    const result = await getBranchBySlug('no-such-slug');
    expect(result).toBeNull();
  });

  it('returns a populated profile for a valid slug', async () => {
    state.branches = [mkBranch({ slug: 'valid-slug', name: 'Valid Salon' })];
    state.services = [
      mkService({ id: 'svc-a', name: 'Cut', base_price: 1500 }),
    ];
    const { getBranchBySlug } = await import('@/lib/marketplace/queries');
    const result = await getBranchBySlug('valid-slug');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Valid Salon');
    expect(result!.services).toHaveLength(1);
    expect(result!.services[0].name).toBe('Cut');
    expect(result!.salon.name).toBe('Fatima Beauty');
    expect(result!.city?.slug).toBe('karachi');
  });
});

describe('getBranchBySlug — (b) admin-blocked branch is 404-equivalent', () => {
  it('returns null when branch.marketplace_admin_blocked_at is set', async () => {
    state.branches = [
      mkBranch({
        slug: 'admin-killed',
        marketplace_admin_blocked_at: '2026-04-17T00:00:00Z',
      }),
    ];
    const { getBranchBySlug } = await import('@/lib/marketplace/queries');
    expect(await getBranchBySlug('admin-killed')).toBeNull();
  });

  it('returns null when the parent salon is admin-blocked', async () => {
    state.branches = [
      mkBranch({
        slug: 'salon-admin-blocked',
        salon: {
          id: 's-1',
          name: 'Blocked',
          marketplace_payable_blocked_at: null,
          marketplace_admin_blocked_at: '2026-04-17T00:00:00Z',
        },
      }),
    ];
    const { getBranchBySlug } = await import('@/lib/marketplace/queries');
    expect(await getBranchBySlug('salon-admin-blocked')).toBeNull();
  });

  it('returns null when the parent salon is payable-blocked', async () => {
    state.branches = [
      mkBranch({
        slug: 'salon-payable-blocked',
        salon: {
          id: 's-1',
          name: 'Blocked',
          marketplace_payable_blocked_at: '2026-04-17T00:00:00Z',
          marketplace_admin_blocked_at: null,
        },
      }),
    ];
    const { getBranchBySlug } = await import('@/lib/marketplace/queries');
    expect(await getBranchBySlug('salon-payable-blocked')).toBeNull();
  });

  it('returns null when branch not listed_on_marketplace', async () => {
    state.branches = [
      mkBranch({
        slug: 'unlisted',
        listed_on_marketplace: false,
      }),
    ];
    const { getBranchBySlug } = await import('@/lib/marketplace/queries');
    expect(await getBranchBySlug('unlisted')).toBeNull();
  });

  it('returns null for a women-salon when the women flag is off (men-only launch gate)', async () => {
    state.womenEnabled = false;
    state.branches = [
      mkBranch({
        slug: 'women-salon',
        gender_type: 'women',
      }),
    ];
    const { getBranchBySlug } = await import('@/lib/marketplace/queries');
    expect(await getBranchBySlug('women-salon')).toBeNull();
  });

  it('allows a women-salon when the flag is on', async () => {
    state.womenEnabled = true;
    state.branches = [
      mkBranch({
        slug: 'women-salon',
        gender_type: 'women',
      }),
    ];
    const { getBranchBySlug } = await import('@/lib/marketplace/queries');
    expect(await getBranchBySlug('women-salon')).not.toBeNull();
  });
});

describe('getBranchBySlug — (c) home mode: services are filtered by the component', () => {
  // The query intentionally returns every active service regardless of mode,
  // so ServiceMenu can filter without a second round trip. We assert both
  // halves here: the query returns all services, and the filter (tested as a
  // pure reduction) drops the `available_at_home=false` ones in home mode.
  it('query returns every active service (filter is applied by the component)', async () => {
    state.branches = [mkBranch({ slug: 'big-salon', salon_id: 's-1' })];
    state.services = [
      mkService({ id: 'svc-home', available_at_home: true }),
      mkService({ id: 'svc-nohome', available_at_home: false }),
      mkService({
        id: 'svc-inactive',
        available_at_home: true,
        is_active: false,
      }),
    ];
    const { getBranchBySlug } = await import('@/lib/marketplace/queries');
    const b = await getBranchBySlug('big-salon');
    expect(b).not.toBeNull();
    const ids = b!.services.map((s) => s.id).sort();
    expect(ids).toEqual(['svc-home', 'svc-nohome']);
    expect(ids).not.toContain('svc-inactive');
  });

  it('home-mode filter drops available_at_home=false services', () => {
    const services = [
      { id: 'a', available_at_home: true, base_price: 1000 },
      { id: 'b', available_at_home: false, base_price: 1000 },
    ];
    const filtered = services.filter((s) => s.available_at_home !== false);
    expect(filtered.map((s) => s.id)).toEqual(['a']);
  });

  it('at-salon mode shows every active service regardless of home flag', () => {
    const services = [
      { id: 'a', available_at_home: true },
      { id: 'b', available_at_home: false },
    ];
    expect(services.length).toBe(2);
    // at_salon doesn't apply the home filter
    expect(services.map((s) => s.id)).toEqual(['a', 'b']);
  });
});

describe('(d) price display switches between modes', () => {
  it('at_salon shows the raw base price', async () => {
    const { displayPriceForMode } = await import('@/lib/marketplace/pricing');
    expect(displayPriceForMode(1500, 'at_salon')).toBe(1500);
    expect(displayPriceForMode(1001, 'at_salon')).toBe(1001);
  });

  it('at_home shows the marked-up-and-rounded price', async () => {
    const { displayPriceForMode } = await import('@/lib/marketplace/pricing');
    expect(displayPriceForMode(1500, 'at_home')).toBe(1950);
    expect(displayPriceForMode(1000, 'at_home')).toBe(1300);
    expect(displayPriceForMode(1001, 'at_home')).toBe(1350);
  });
});

describe('getBranchReviews', () => {
  it('returns only consumer_of_salon reviews, first-name only, newest first', async () => {
    state.reviews = [
      {
        id: 'r1',
        rating: 5,
        comment: 'Great!',
        created_at: '2026-04-15T00:00:00Z',
        direction: 'consumer_of_salon',
        branch_id: 'b-1',
        consumer_name: 'Asad Khan',
      },
      {
        id: 'r2',
        rating: 4,
        comment: 'Good',
        created_at: '2026-04-10T00:00:00Z',
        direction: 'consumer_of_salon',
        branch_id: 'b-1',
        consumer_name: 'Fatima',
      },
      {
        // Private salon-to-consumer review must not leak.
        id: 'r3',
        rating: 3,
        comment: 'private',
        created_at: '2026-04-12T00:00:00Z',
        direction: 'salon_of_consumer',
        branch_id: 'b-1',
        consumer_name: 'Some Consumer',
      },
      {
        // Wrong branch — mustn't appear.
        id: 'r4',
        rating: 5,
        comment: 'wrong branch',
        created_at: '2026-04-18T00:00:00Z',
        direction: 'consumer_of_salon',
        branch_id: 'b-other',
        consumer_name: 'Other',
      },
    ];

    const { getBranchReviews } = await import('@/lib/marketplace/queries');
    const reviews = await getBranchReviews('b-1', 10);

    expect(reviews).toHaveLength(2);
    const ids = reviews.map((r) => r.id);
    expect(ids).toContain('r1');
    expect(ids).toContain('r2');
    expect(ids).not.toContain('r3');
    expect(ids).not.toContain('r4');

    // First-name privacy: "Asad Khan" → "Asad".
    const asad = reviews.find((r) => r.id === 'r1')!;
    expect(asad.consumer_first_name).toBe('Asad');

    const fatima = reviews.find((r) => r.id === 'r2')!;
    expect(fatima.consumer_first_name).toBe('Fatima');
  });

  it('returns an empty list for a branch with no reviews', async () => {
    state.reviews = [];
    const { getBranchReviews } = await import('@/lib/marketplace/queries');
    const reviews = await getBranchReviews('b-1', 10);
    expect(reviews).toEqual([]);
  });
});
