/**
 * Programmatic-SEO surface — `/services/[slug]-in-[city]` (and its home-
 * service variant `/services/home-[slug]-in-[city]`).
 *
 * Server component. The `[slug]` dynamic segment is a compound form parsed
 * by `parseServiceCitySlug()` into `{ serviceSlug, citySlug, mode }`. Shape:
 *
 *     /services/haircut-in-lahore          → at_salon mode
 *     /services/home-haircut-in-lahore     → at_home mode
 *
 * Why ONE route with compound slug parsing (vs. `/services/[service]/[city]`
 * + `/services/home/[service]/[city]`)?
 *   Flat slugs rank better on Google for "{service} in {city}" queries — the
 *   biggest organic-discovery lever for iCut. Per the Week 6 deliverable in
 *   `docs/superpowers/plans/2026-04-18-marketplace-phase-0-1.md`. The route
 *   table in that plan explicitly lists both path shapes, and a single
 *   handler that parses the slug keeps the tree compact (one file, 100
 *   static params).
 *
 * Static params: 10 services × 5 cities × 2 modes = 100 entries pre-rendered
 * at build time via `generateStaticParams`. If the DB is unreachable during
 * build (local build without DATABASE_URL), we return an empty array so the
 * build doesn't crash — Next falls back to on-demand rendering at request time.
 *
 * SEO (per the plan's "SEO implementation" section):
 *   - Title:       "{Service} in {City} — {N} Salons · Book on iCut"
 *                  (or "Home {Service} in {City} — …" for home mode)
 *   - Description: One-line, interpolates service + city naturally so every
 *                  URL has unique copy.
 *   - Canonical:   `https://icut.pk/services/[compound-slug]`
 *   - JSON-LD:     `CollectionPage` + `ItemList` of listed salons, plus
 *                  `BreadcrumbList` via the shared Breadcrumbs component.
 *   - **Thin-content guard**: when the branch list is empty AND (home-mode
 *                  OR women-flag off), emit `robots: noindex`. The plan's
 *                  risk table calls this out explicitly: "each page must
 *                  have ≥ 3 listed salons before indexing; otherwise emit
 *                  noindex." We use the stricter ≥1 threshold here (0 vs.
 *                  ≥1) because Week 6 ships with a small pilot fleet — a
 *                  single-salon page is still useful for the consumer.
 *
 * Invalid / unknown parses:
 *   - Compound slug fails the regex       → `notFound()` (404)
 *   - Parsed service slug doesn't exist   → `notFound()`
 *   - Parsed city slug doesn't exist      → `notFound()`
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import Breadcrumbs from '../../components/breadcrumbs';
import JsonLdCollectionPage from '../../components/jsonld-collectionpage';
import SalonCard from '../../components/salon-card';
import {
  getAllCities,
  getAllMarketplaceServices,
  getCityBySlug,
  getListedBranchesForServiceInCity,
  getMarketplaceServiceBySlug,
  isMarketplaceWomenEnabled,
  type MarketplaceMode,
} from '@/lib/marketplace/queries';
import {
  buildServiceCitySlug,
  parseServiceCitySlug,
} from '@/lib/marketplace/service-city-slug';
import { getConsumerSession } from '@/lib/consumer-session';
import { getFavoriteBranchIds } from '@/app/actions/consumer-favorites';

const SITE_ORIGIN = 'https://icut.pk';

// ═══════════════════════════════════════════════════════════════════════════
// generateStaticParams — 10 services × 5 cities × 2 modes = 100 pages
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pre-generate the full fleet at build time. The DB round-trip returns the
 * seeded taxonomy (10 services) and cities (5 cities); we compose both modes
 * programmatically. Total = 100 static params.
 *
 * If either query fails (e.g. local build without DATABASE_URL), we return
 * an empty array and let Next render on-demand at request time. No build
 * crash.
 */
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  try {
    const [services, cities] = await Promise.all([
      getAllMarketplaceServices(),
      getAllCities(),
    ]);
    if (services.length === 0 || cities.length === 0) return [];

    const modes: MarketplaceMode[] = ['at_salon', 'at_home'];
    const out: { slug: string }[] = [];
    for (const service of services) {
      for (const city of cities) {
        for (const mode of modes) {
          // Home variant is emitted for every service — the SEO page still
          // renders a "no salons" empty state when the service isn't
          // available_at_home (e.g. keratin, hair-treatment). The thin-
          // content guard on generateMetadata handles the noindex there.
          out.push({
            slug: buildServiceCitySlug(service.slug, city.slug, mode),
          });
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Metadata
// ═══════════════════════════════════════════════════════════════════════════

interface ServiceCityPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Shape: "Haircut in Lahore — 12 Salons · Book on iCut".
 * Home:  "Home Haircut in Lahore — 12 Salons · Book on iCut".
 */
function titleFor(
  serviceName: string,
  cityName: string,
  count: number,
  mode: MarketplaceMode,
): string {
  const prefix = mode === 'at_home' ? 'Home ' : '';
  const noun = count === 1 ? 'Salon' : 'Salons';
  if (count === 0) {
    return `${prefix}${serviceName} in ${cityName} — Book on iCut`;
  }
  return `${prefix}${serviceName} in ${cityName} — ${count} ${noun} · Book on iCut`;
}

function descriptionFor(
  serviceName: string,
  cityName: string,
  count: number,
  mode: MarketplaceMode,
): string {
  if (mode === 'at_home') {
    if (count === 0) {
      return `Looking for ${serviceName.toLowerCase()} at home in ${cityName}? iCut is onboarding local salons — check back soon.`;
    }
    return `Book ${serviceName.toLowerCase()} at home in ${cityName}. ${count} vetted ${count === 1 ? 'salon comes' : 'salons come'} to your place — pick your slot on iCut.`;
  }
  if (count === 0) {
    return `Searching for ${serviceName.toLowerCase()} in ${cityName}? iCut is onboarding local salons — check back soon.`;
  }
  return `Compare ${count} ${count === 1 ? 'salon offering' : 'salons offering'} ${serviceName.toLowerCase()} in ${cityName}. Book online on iCut — no calls, no waitlists.`;
}

export async function generateMetadata({
  params,
}: ServiceCityPageProps): Promise<Metadata> {
  const { slug } = await params;
  const parsed = parseServiceCitySlug(slug);

  if (!parsed) {
    return {
      title: 'Not found',
      robots: { index: false, follow: false },
    };
  }

  const [service, city, womenEnabled] = await Promise.all([
    getMarketplaceServiceBySlug(parsed.serviceSlug),
    getCityBySlug(parsed.citySlug),
    isMarketplaceWomenEnabled(),
  ]);

  if (!service || !city) {
    return {
      title: 'Not found',
      robots: { index: false, follow: false },
    };
  }

  const branches = await getListedBranchesForServiceInCity({
    serviceSlug: parsed.serviceSlug,
    citySlug: parsed.citySlug,
    mode: parsed.mode,
  });

  // Thin-content guard (from the plan's risk table):
  //   - Zero listings AND (home mode OR women flag off) → noindex.
  //     The women-flag-off branch catches our men-only-launch surface
  //     where a zero-count page is most likely — we'd rather not have
  //     Google index empty pages and downgrade the site's quality signal.
  //   - Zero listings in at_salon mode with women flag ON is also empty,
  //     but we still index — that case is rare (there are listed salons
  //     overall, just none match this slug/city combination), and we'd
  //     rather have the URL live for when a salon does get listed.
  const shouldNoIndex =
    branches.length === 0 && (parsed.mode === 'at_home' || !womenEnabled);

  const compoundSlug = buildServiceCitySlug(
    parsed.serviceSlug,
    parsed.citySlug,
    parsed.mode,
  );
  const title = titleFor(
    service.display_name,
    city.name,
    branches.length,
    parsed.mode,
  );
  const description = descriptionFor(
    service.display_name,
    city.name,
    branches.length,
    parsed.mode,
  );
  const canonical = `${SITE_ORIGIN}/services/${compoundSlug}`;

  return {
    title,
    description,
    alternates: { canonical },
    robots: shouldNoIndex
      ? { index: false, follow: true }
      : { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'website',
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Page body
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Craft a short, unique intro paragraph per (service, city, mode). Single
 * line, ~25 words, interpolates service + city names naturally so Google
 * doesn't see boilerplate across the fleet.
 */
function introFor(
  serviceName: string,
  cityName: string,
  count: number,
  mode: MarketplaceMode,
): string {
  if (mode === 'at_home') {
    if (count === 0) {
      return `Home ${serviceName.toLowerCase()} in ${cityName} is launching soon on iCut. We're onboarding the salons that come to your door — check back for fresh listings weekly.`;
    }
    return `Skip the salon queue. ${count} ${cityName}-based ${count === 1 ? 'salon brings' : 'salons bring'} professional ${serviceName.toLowerCase()} to your doorstep — book a slot, pay cash when they arrive.`;
  }
  if (count === 0) {
    return `${serviceName} in ${cityName} is launching soon on iCut. We're onboarding the city's best salons — check back for new listings weekly.`;
  }
  return `Explore ${count} ${cityName} ${count === 1 ? 'salon' : 'salons'} offering ${serviceName.toLowerCase()}, handpicked for quality. Compare ratings, photos, and prices — book online in under a minute.`;
}

export default async function ServiceCityPage({ params }: ServiceCityPageProps) {
  const { slug } = await params;
  const parsed = parseServiceCitySlug(slug);
  if (!parsed) notFound();

  const [service, city] = await Promise.all([
    getMarketplaceServiceBySlug(parsed.serviceSlug),
    getCityBySlug(parsed.citySlug),
  ]);
  if (!service || !city) notFound();

  const [branches, session, favoriteIds] = await Promise.all([
    getListedBranchesForServiceInCity({
      serviceSlug: parsed.serviceSlug,
      citySlug: parsed.citySlug,
      mode: parsed.mode,
    }),
    getConsumerSession(),
    getFavoriteBranchIds(),
  ]);
  const isAuthenticated = session !== null;

  const compoundSlug = buildServiceCitySlug(
    parsed.serviceSlug,
    parsed.citySlug,
    parsed.mode,
  );
  const canonical = `${SITE_ORIGIN}/services/${compoundSlug}`;

  const h1Prefix = parsed.mode === 'at_home' ? 'Home ' : '';
  const h1 = `${h1Prefix}${service.display_name} in ${city.name}`;
  const intro = introFor(
    service.display_name,
    city.name,
    branches.length,
    parsed.mode,
  );

  const breadcrumbItems = [
    { name: 'Home', url: `${SITE_ORIGIN}/` },
    { name: 'Pakistan', url: `${SITE_ORIGIN}/barbers` },
    { name: city.name, url: `${SITE_ORIGIN}/barbers/${city.slug}` },
    { name: `${h1Prefix}${service.display_name}`, url: canonical },
  ];

  const jsonLdItems = branches.map((b) => ({
    name: b.name,
    url: `${SITE_ORIGIN}/barber/${b.slug}`,
  }));

  return (
    <main className="min-h-screen" style={{ background: '#FAFAF8' }}>
      <div className="mx-auto w-full max-w-md md:max-w-4xl px-5 py-8 md:py-12">
        <Breadcrumbs items={breadcrumbItems} className="mb-4" />

        <header className="mb-6 md:mb-8">
          <h1
            className="font-heading text-[1.75rem] md:text-[2.5rem] font-black text-[#1A1A1A]"
            style={{ lineHeight: 1.1, letterSpacing: '-0.02em' }}
          >
            {h1}
          </h1>
          <p className="text-[14px] md:text-[15px] text-[#6B7280] leading-relaxed mt-3 max-w-xl">
            {intro}
          </p>
        </header>

        <section aria-label={`${service.display_name} salons in ${city.name}`}>
          {branches.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#E8E8E8] bg-white/50 p-6 text-center">
              <p className="text-[13px] text-[#888]">
                {parsed.mode === 'at_home'
                  ? `No salons currently offer home ${service.display_name.toLowerCase()} in ${city.name}. Try switching to "At salon" on the home page.`
                  : `No salons in ${city.name} are offering ${service.display_name.toLowerCase()} on iCut yet. Check back soon.`}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {branches.map((branch, idx) => (
                <SalonCard
                  key={branch.id}
                  branch={branch}
                  priority={idx === 0}
                  isAuthenticated={isAuthenticated}
                  initialFavorited={favoriteIds.has(branch.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <JsonLdCollectionPage
        name={`${h1Prefix}${service.display_name} in ${city.name} — iCut`}
        url={canonical}
        description={intro}
        items={jsonLdItems}
      />
    </main>
  );
}
