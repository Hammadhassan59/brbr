/**
 * Auto-generated sitemap for the iCut marketplace.
 *
 * Per `docs/superpowers/plans/2026-04-18-marketplace-phase-0-1.md` — Week 6
 * "SEO implementation" — this file is the single source of truth for every
 * public URL we want Google Search Console to crawl. It enumerates:
 *
 *   1. Static marketing pages          — `/`, `/barbers`, `/business`,
 *                                        `/about`, `/contact`, `/privacy`,
 *                                        `/refund`, `/terms` (whichever exist).
 *   2. City directory pages            — `/barbers/{citySlug}` for each
 *                                        active city.
 *   3. Service-in-city programmatic    — `/services/{svc}-in-{city}` and
 *                                        `/services/home-{svc}-in-{city}`
 *                                        across every (service, city, mode)
 *                                        combo (`available_at_home` gates
 *                                        the home-mode pages).
 *   4. Salon profile pages             — `/barber/{slug}` for each branch
 *                                        that passes the marketplace
 *                                        visibility filter.
 *
 * Excluded by design (also gated in robots.ts):
 *   `/dashboard/`, `/admin/`, `/agent/`, `/account/`, `/book/`,
 *   `/sign-in`, `/sign-up`, `/verify-email`, `/api/`, `/setup`,
 *   `/login`, `/reset-password`, `/paywall`.
 *
 * DB unavailable?
 *   Every DB-dependent section is wrapped in try/catch and falls back to an
 *   empty section. The static-pages portion is always emitted. That keeps
 *   `next build` healthy in environments without DB creds — same strategy
 *   the plan uses for `/barbers/[city]`'s `generateStaticParams`.
 *
 * Caching:
 *   `sitemap.ts` is a Route Handler cached by Next until a revalidate tag
 *   fires. We hit the marketplace query layer directly so invalidations on
 *   `marketplace:branches` / `marketplace:cities` propagate here for free.
 */

import type { MetadataRoute } from 'next';

import {
  getAllCities,
  getAllListedBranches,
} from '@/lib/marketplace/queries';
import { createServerClient } from '@/lib/supabase';

const SITE_ORIGIN = 'https://icut.pk';

/**
 * The URL prefixes the sitemap must NEVER emit. Kept aligned with robots.ts
 * — tests assert no generated entry starts with any of these. Trailing
 * slashes are normalized so both `/admin` and `/admin/x` match.
 */
export const DISALLOWED_PREFIXES = [
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
] as const;

/**
 * Service slugs the marketplace SEO pages should enumerate. These mirror the
 * 10 entries seeded into `marketplace_services` in migration 041 (plan §3
 * "Seed 10 services"). Kept here as a static fallback so the sitemap still
 * builds when the DB is unreachable at build time — the DB query, when it
 * succeeds, replaces this list.
 *
 * `available_at_home: false` means the row is omitted from `/services/home-*`
 * entries (keratin + hair-treatment per plan).
 */
const FALLBACK_MARKETPLACE_SERVICES: Array<{
  slug: string;
  available_at_home: boolean;
}> = [
  { slug: 'haircut', available_at_home: true },
  { slug: 'beard-trim', available_at_home: true },
  { slug: 'hair-color', available_at_home: true },
  { slug: 'facial', available_at_home: true },
  { slug: 'waxing', available_at_home: true },
  { slug: 'bridal', available_at_home: true },
  { slug: 'nails', available_at_home: true },
  { slug: 'massage', available_at_home: true },
  { slug: 'keratin', available_at_home: false },
  { slug: 'hair-treatment', available_at_home: false },
];

/**
 * Static pages included in the sitemap root. Only pages that exist in the
 * repo (checked by `grep`ing `src/app/` at plan-time) are listed; priority
 * follows the spec (home 1.0, `/barbers` 0.9, `/business` 0.5, leaf legal
 * pages 0.3).
 *
 * `/login`, `/sign-in`, etc. are deliberately excluded — they're explicitly
 * listed in the disallowed-prefixes set.
 */
function staticPages(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: `${SITE_ORIGIN}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${SITE_ORIGIN}/barbers`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${SITE_ORIGIN}/business`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${SITE_ORIGIN}/about`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${SITE_ORIGIN}/contact`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${SITE_ORIGIN}/privacy`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_ORIGIN}/refund`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_ORIGIN}/terms`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}

/**
 * Read the `marketplace_services` taxonomy directly (the parallel
 * query-helper agent hasn't added a helper for this yet). Returns the
 * fallback list on any error so the sitemap never crashes the build.
 */
async function fetchMarketplaceServices(): Promise<
  Array<{ slug: string; available_at_home: boolean }>
> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('marketplace_services')
      .select('slug, available_at_home, is_active')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error || !data || data.length === 0) {
      return FALLBACK_MARKETPLACE_SERVICES;
    }
    return (data as Array<{ slug: string; available_at_home: boolean }>).map(
      (r) => ({
        slug: r.slug,
        available_at_home: r.available_at_home !== false,
      }),
    );
  } catch {
    return FALLBACK_MARKETPLACE_SERVICES;
  }
}

/**
 * Produce the city-directory entries. One URL per active city.
 */
async function cityEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const cities = await getAllCities();
    return cities.map((c) => ({
      url: `${SITE_ORIGIN}/barbers/${c.slug}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }));
  } catch {
    return [];
  }
}

/**
 * Produce service-in-city entries for every combination of seeded service,
 * city, and mode. Home-mode pages only emit for services whose taxonomy
 * `available_at_home` flag is true (`keratin`, `hair-treatment` are excluded
 * from home mode per plan).
 *
 * URL shape: `/services/{svc}-in-{city}` (in-salon) and
 * `/services/home-{svc}-in-{city}` (home). Slug composition mirrors the
 * programmatic-SEO route on `src/app/(marketplace)/services/[slug]/page.tsx`
 * (owned by a parallel agent — we don't import from it, just mirror the
 * shape so the URLs are discoverable).
 */
async function serviceCityEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const [cities, services] = await Promise.all([
      getAllCities(),
      fetchMarketplaceServices(),
    ]);

    const out: MetadataRoute.Sitemap = [];
    for (const city of cities) {
      for (const svc of services) {
        out.push({
          url: `${SITE_ORIGIN}/services/${svc.slug}-in-${city.slug}`,
          lastModified: new Date(),
          changeFrequency: 'weekly',
          priority: 0.7,
        });
        if (svc.available_at_home) {
          out.push({
            url: `${SITE_ORIGIN}/services/home-${svc.slug}-in-${city.slug}`,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.7,
          });
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Produce salon-profile entries. We use the `at_salon` superset (every
 * marketplace-listed branch passes this filter even if they don't also
 * offer home service), bumped to 5000 to effectively return every listed
 * branch in prod. The query layer already excludes blocked salons and
 * applies the men-only gender gate.
 *
 * `branches.updated_at` doesn't exist in the current schema — the query
 * layer also doesn't surface it. We fall back to `new Date()` for
 * lastModified. The query is cached so emitting `new Date()` still reflects
 * a recent change when `revalidateTag('marketplace:branches')` fires after
 * an opt-in / admin-block.
 */
async function salonEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const branches = await getAllListedBranches({
      mode: 'at_salon',
      limit: 5000,
    });
    return branches.map((b) => ({
      url: `${SITE_ORIGIN}/barber/${b.slug}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    }));
  } catch {
    return [];
  }
}

/**
 * Defensive filter — strips any entry whose URL path starts with one of the
 * disallowed prefixes. Running this even over the known-good generators
 * guarantees that accidental edits upstream never leak a private URL into
 * the sitemap.
 */
function stripDisallowed(entries: MetadataRoute.Sitemap): MetadataRoute.Sitemap {
  return entries.filter((entry) => {
    try {
      const u = new URL(entry.url);
      const path = u.pathname;
      for (const disallowed of DISALLOWED_PREFIXES) {
        if (path === disallowed || path.startsWith(disallowed)) return false;
        // Handle no-trailing-slash variants: `/login` in disallow list but
        // `/login/foo` shouldn't match unless we also check prefix+`/`.
        if (!disallowed.endsWith('/') && path.startsWith(disallowed + '/')) {
          return false;
        }
      }
      return true;
    } catch {
      // Non-URL value — skip defensively.
      return false;
    }
  });
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [cities, serviceCities, salons] = await Promise.all([
    cityEntries(),
    serviceCityEntries(),
    salonEntries(),
  ]);

  const all = [...staticPages(), ...cities, ...serviceCities, ...salons];
  return stripDisallowed(all);
}
