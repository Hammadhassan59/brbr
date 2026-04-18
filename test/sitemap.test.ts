/**
 * Tests for `src/app/sitemap.ts` — the auto-generated sitemap feeding
 * Google Search Console.
 *
 * Covers the four behaviors Week-6 requires:
 *   1. Static marketing pages are always present (DB or no DB).
 *   2. DB-unreachable path produces the static-only portion instead of a
 *      build-crashing throw.
 *   3. When cities / salons / marketplace_services rows are staged, the
 *      city-directory, salon-profile, and service-in-city entries all
 *      show up with the right URL shape.
 *   4. No emitted entry starts with a disallowed prefix — sitemap and
 *      robots stay in lockstep.
 *
 * Mocking approach (mirrors `test/marketplace-queries.test.ts`): we mock
 * `next/cache` so `unstable_cache` becomes identity, mock
 * `@/lib/marketplace/queries` so the sitemap's `getAllCities` /
 * `getAllListedBranches` calls resolve to staged fixtures, and mock
 * `@/lib/supabase` so the `marketplace_services` read hits our fake.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ───────────────────────────────────────────────────────────────────────────
// Mocks
// ───────────────────────────────────────────────────────────────────────────

vi.mock('next/cache', () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  revalidateTag: vi.fn(),
}));

/** In-test state staged per case. */
const state: {
  cities: Array<{ id: string; slug: string; name: string; display_order: number }>;
  branches: Array<{
    id: string;
    name: string;
    slug: string;
    city_slug: string | null;
    photo: string | null;
    rating_avg: number | null;
    rating_count: number;
    about_preview: string | null;
  }>;
  services: Array<{ slug: string; available_at_home: boolean }>;
  citiesThrows: boolean;
  branchesThrows: boolean;
  servicesThrows: boolean;
} = {
  cities: [],
  branches: [],
  services: [],
  citiesThrows: false,
  branchesThrows: false,
  servicesThrows: false,
};

vi.mock('@/lib/marketplace/queries', () => ({
  getAllCities: vi.fn(async () => {
    if (state.citiesThrows) throw new Error('db offline');
    return state.cities;
  }),
  getAllListedBranches: vi.fn(async () => {
    if (state.branchesThrows) throw new Error('db offline');
    return state.branches;
  }),
}));

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: (table: string) => {
      if (table !== 'marketplace_services') {
        throw new Error(`unexpected table ${table}`);
      }
      // Query shape used by sitemap:
      //   .from('marketplace_services').select(...).eq('is_active', true).order(...)
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: async () => {
          if (state.servicesThrows) return { data: null, error: new Error('offline') };
          return { data: state.services, error: null };
        },
      };
      return builder;
    },
  }),
}));

// ───────────────────────────────────────────────────────────────────────────
// Fixture helpers
// ───────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetModules();
  state.cities = [];
  state.branches = [];
  state.services = [];
  state.citiesThrows = false;
  state.branchesThrows = false;
  state.servicesThrows = false;
});

const STATIC_PAGES = [
  '/',
  '/barbers',
  '/business',
  '/about',
  '/contact',
  '/privacy',
  '/refund',
  '/terms',
];

function paths(entries: Array<{ url: string }>): string[] {
  return entries.map((e) => {
    try {
      return new URL(e.url).pathname;
    } catch {
      return e.url;
    }
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Tests
// ───────────────────────────────────────────────────────────────────────────

describe('sitemap — static pages', () => {
  it('always includes the eight static marketing pages', async () => {
    const { default: sitemap } = await import('@/app/sitemap');
    const entries = await sitemap();
    const gotPaths = paths(entries);
    for (const expected of STATIC_PAGES) {
      expect(gotPaths).toContain(expected);
    }
  });

  it('sets the home page to priority 1.0', async () => {
    const { default: sitemap } = await import('@/app/sitemap');
    const entries = await sitemap();
    const home = entries.find((e) => new URL(e.url).pathname === '/');
    expect(home).toBeDefined();
    expect(home!.priority).toBe(1.0);
  });

  it('sets /barbers to priority 0.9 and /business to 0.5', async () => {
    const { default: sitemap } = await import('@/app/sitemap');
    const entries = await sitemap();
    const barbers = entries.find((e) => new URL(e.url).pathname === '/barbers');
    const business = entries.find((e) => new URL(e.url).pathname === '/business');
    expect(barbers?.priority).toBe(0.9);
    expect(business?.priority).toBe(0.5);
  });
});

describe('sitemap — DB unreachable graceful fallback', () => {
  it('returns the static portion when cities/branches/services all throw', async () => {
    state.citiesThrows = true;
    state.branchesThrows = true;
    state.servicesThrows = true;

    const { default: sitemap } = await import('@/app/sitemap');
    const entries = await sitemap();
    const gotPaths = paths(entries);

    // All static pages are emitted.
    for (const expected of STATIC_PAGES) {
      expect(gotPaths).toContain(expected);
    }
    // Nothing dynamic sneaks through.
    expect(gotPaths.every((p) => STATIC_PAGES.includes(p))).toBe(true);
  });

  it('falls back to the seeded 10-service list when marketplace_services read fails but cities load', async () => {
    state.cities = [
      { id: 'c-1', slug: 'karachi', name: 'Karachi', display_order: 1 },
    ];
    state.servicesThrows = true;
    // Branches empty — focus on the services fallback.
    state.branches = [];

    const { default: sitemap } = await import('@/app/sitemap');
    const entries = await sitemap();
    const gotPaths = paths(entries);

    // Fallback includes haircut + beard-trim + hair-color + facial + waxing
    // + bridal + nails + massage (home OK) and keratin + hair-treatment
    // (home NOT OK — only at-salon variant emitted).
    expect(gotPaths).toContain('/services/haircut-in-karachi');
    expect(gotPaths).toContain('/services/home-haircut-in-karachi');
    expect(gotPaths).toContain('/services/beard-trim-in-karachi');
    expect(gotPaths).toContain('/services/home-beard-trim-in-karachi');
    expect(gotPaths).toContain('/services/keratin-in-karachi');
    expect(gotPaths).not.toContain('/services/home-keratin-in-karachi');
    expect(gotPaths).toContain('/services/hair-treatment-in-karachi');
    expect(gotPaths).not.toContain('/services/home-hair-treatment-in-karachi');
  });
});

describe('sitemap — dynamic entries', () => {
  it('emits /barbers/{citySlug} for each active city', async () => {
    state.cities = [
      { id: 'c-1', slug: 'karachi', name: 'Karachi', display_order: 1 },
      { id: 'c-2', slug: 'lahore', name: 'Lahore', display_order: 2 },
    ];
    const { default: sitemap } = await import('@/app/sitemap');
    const entries = await sitemap();
    const gotPaths = paths(entries);
    expect(gotPaths).toContain('/barbers/karachi');
    expect(gotPaths).toContain('/barbers/lahore');
  });

  it('emits /barber/{slug} for each listed branch', async () => {
    state.branches = [
      {
        id: 'b-1',
        name: 'Fatima Lounge',
        slug: 'fatima-lounge-karachi',
        city_slug: 'karachi',
        photo: null,
        rating_avg: 4.5,
        rating_count: 10,
        about_preview: null,
      },
      {
        id: 'b-2',
        name: 'Asad Barbers',
        slug: 'asad-barbers-lahore',
        city_slug: 'lahore',
        photo: null,
        rating_avg: 4.2,
        rating_count: 5,
        about_preview: null,
      },
    ];
    const { default: sitemap } = await import('@/app/sitemap');
    const entries = await sitemap();
    const gotPaths = paths(entries);
    expect(gotPaths).toContain('/barber/fatima-lounge-karachi');
    expect(gotPaths).toContain('/barber/asad-barbers-lahore');
  });

  it('emits /services/{svc}-in-{city} and /services/home-{svc}-in-{city} for every combo', async () => {
    state.cities = [
      { id: 'c-1', slug: 'karachi', name: 'Karachi', display_order: 1 },
      { id: 'c-2', slug: 'lahore', name: 'Lahore', display_order: 2 },
    ];
    state.services = [
      { slug: 'haircut', available_at_home: true },
      { slug: 'keratin', available_at_home: false },
    ];
    const { default: sitemap } = await import('@/app/sitemap');
    const entries = await sitemap();
    const gotPaths = paths(entries);

    // At-salon variants: every (service × city) combo.
    expect(gotPaths).toContain('/services/haircut-in-karachi');
    expect(gotPaths).toContain('/services/haircut-in-lahore');
    expect(gotPaths).toContain('/services/keratin-in-karachi');
    expect(gotPaths).toContain('/services/keratin-in-lahore');

    // Home variants: only for `available_at_home: true` services.
    expect(gotPaths).toContain('/services/home-haircut-in-karachi');
    expect(gotPaths).toContain('/services/home-haircut-in-lahore');
    expect(gotPaths).not.toContain('/services/home-keratin-in-karachi');
    expect(gotPaths).not.toContain('/services/home-keratin-in-lahore');
  });

  it('assigns the documented priorities to dynamic sections', async () => {
    state.cities = [
      { id: 'c-1', slug: 'karachi', name: 'Karachi', display_order: 1 },
    ];
    state.services = [{ slug: 'haircut', available_at_home: true }];
    state.branches = [
      {
        id: 'b-1',
        name: 'X',
        slug: 'x-karachi',
        city_slug: 'karachi',
        photo: null,
        rating_avg: null,
        rating_count: 0,
        about_preview: null,
      },
    ];
    const { default: sitemap } = await import('@/app/sitemap');
    const entries = await sitemap();

    const cityEntry = entries.find(
      (e) => new URL(e.url).pathname === '/barbers/karachi',
    );
    const serviceCityEntry = entries.find(
      (e) => new URL(e.url).pathname === '/services/haircut-in-karachi',
    );
    const salonEntry = entries.find(
      (e) => new URL(e.url).pathname === '/barber/x-karachi',
    );
    expect(cityEntry?.priority).toBe(0.8);
    expect(serviceCityEntry?.priority).toBe(0.7);
    expect(salonEntry?.priority).toBe(0.9);
  });
});

describe('sitemap — disallowed-prefix guarantee', () => {
  /**
   * Kept in lockstep with robots.ts / sitemap.ts `DISALLOWED_PREFIXES`. If
   * someone adds a new disallowed prefix, this test must be updated in the
   * same PR — the failure mode is explicit rather than silent.
   */
  const forbidden = [
    '/dashboard/',
    '/admin/',
    '/agent/',
    '/account/',
    '/book/',
    '/sign-in',
    '/sign-up',
    '/verify-email',
    '/api/',
    '/setup',
    '/login',
    '/reset-password',
    '/paywall',
  ];

  it('never emits an entry whose path starts with a disallowed prefix', async () => {
    // Stage non-empty data in every dynamic section so every code path
    // runs. None of these fixtures should produce a disallowed URL, but
    // this is a regression guard against future edits that wire in a
    // `/dashboard/...` accidentally.
    state.cities = [
      { id: 'c-1', slug: 'karachi', name: 'Karachi', display_order: 1 },
    ];
    state.services = [{ slug: 'haircut', available_at_home: true }];
    state.branches = [
      {
        id: 'b-1',
        name: 'X',
        slug: 'x-karachi',
        city_slug: 'karachi',
        photo: null,
        rating_avg: null,
        rating_count: 0,
        about_preview: null,
      },
    ];

    const { default: sitemap } = await import('@/app/sitemap');
    const entries = await sitemap();
    for (const e of entries) {
      const path = new URL(e.url).pathname;
      for (const bad of forbidden) {
        // Exact match or startsWith.
        expect(
          path === bad || path.startsWith(bad) || path.startsWith(bad + '/'),
          `sitemap emitted disallowed path: ${path}`,
        ).toBe(false);
      }
    }
  });
});
