/**
 * City directory — `/barbers/[city]`.
 *
 * Server component. Lists every marketplace-listed salon in a single city
 * that passes the shared filter set.
 *
 * Static params: the 5 seeded cities (Karachi, Lahore, Islamabad,
 * Rawalpindi, Faisalabad) are pre-generated at build time via
 * `generateStaticParams` so the initial render is as fast as possible.
 * Unknown city slugs fall through to `notFound()` (404).
 *
 * SEO (per `docs/superpowers/plans/2026-04-18-marketplace-phase-0-1.md` →
 * "SEO implementation" and "Risks + mitigations"):
 *   - Title: "Best Barbers in {City} — iCut".
 *   - `CollectionPage` + `ItemList` JSON-LD of the listed salons.
 *   - `BreadcrumbList` JSON-LD (Home > Pakistan > {City}) via the shared
 *     Breadcrumbs component.
 *   - **Thin-content guard**: if the men-only launch gate would produce
 *     zero listings for this city (women flag is off AND there are no
 *     men's-only salons listed here), emit `robots: noindex` so Search
 *     Console doesn't log us for thin content. The plan's risk table calls
 *     this out explicitly: "use noindex on pages with zero listed salons."
 *
 * Cookie + mode:
 *   - Read `icut-mode` via `cookies()` at page level and pass into
 *     `getListedBranchesForCity({ mode })`. Opts the page into dynamic
 *     rendering (dynamicParams for the cookie read). The underlying
 *     listing data is still cached through the shared query layer — the
 *     cookie only determines which cached key we hit.
 */

import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

import Link from 'next/link';

import Breadcrumbs from '../../components/breadcrumbs';
import JsonLdCollectionPage from '../../components/jsonld-collectionpage';
import SalonCard from '../../components/salon-card';
import {
  getAllCities,
  getAllMarketplaceServices,
  getCityBySlug,
  getListedBranchesForCity,
  getPopularServicesForCity,
  isMarketplaceWomenEnabled,
  type MarketplaceMode,
} from '@/lib/marketplace/queries';
import {
  MARKETPLACE_MODE_COOKIE,
  MARKETPLACE_MODE_DEFAULT,
} from '@/lib/marketplace/mode';
import { buildServiceCitySlug } from '@/lib/marketplace/service-city-slug';
import { getConsumerSession } from '@/lib/consumer-session';
import { getFavoriteBranchIds } from '@/app/actions/consumer-favorites';

const SITE_ORIGIN = 'https://icut.pk';

/**
 * Pre-generate the 5 seeded cities at build time. Returning a non-empty
 * list opts Next into static generation for those slugs; any slug not in
 * the list falls through to dynamic rendering + `notFound()` when the
 * city row doesn't exist.
 *
 * During `next build`, the query layer hits the DB — if it's unreachable
 * (local build without DATABASE_URL) we fall back to an empty array so the
 * build doesn't crash. Fine because Next will then render those routes
 * on-demand at request time.
 */
export async function generateStaticParams(): Promise<{ city: string }[]> {
  try {
    const cities = await getAllCities();
    return cities.map((c) => ({ city: c.slug }));
  } catch {
    return [];
  }
}

interface CityPageProps {
  params: Promise<{ city: string }>;
}

export async function generateMetadata({
  params,
}: CityPageProps): Promise<Metadata> {
  const { city: citySlug } = await params;
  const city = await getCityBySlug(citySlug);

  if (!city) {
    // The page itself will 404 — return a minimal metadata block so the
    // transient error page doesn't leak "undefined" into titles.
    return {
      title: 'Not found',
      robots: { index: false, follow: false },
    };
  }

  // Thin-content guard: check upfront whether we'd render zero listings.
  // We do this here (not in the page body alone) so generateMetadata can
  // flip `robots: noindex` before the HTML is emitted.
  const [womenEnabled, branches] = await Promise.all([
    isMarketplaceWomenEnabled(),
    getListedBranchesForCity(citySlug, { mode: 'at_salon' }),
  ]);

  // If the women flag is OFF AND there are no men's-only branches for this
  // city, we have a guaranteed-empty page — noindex per plan's risk notes.
  // We check against the `at_salon` mode because it's the broader superset
  // (`at_home` applies an extra filter). If at_salon is empty, at_home is
  // empty too.
  const shouldNoIndex = !womenEnabled && branches.length === 0;

  const title = `Best Barbers in ${city.name} — iCut`;
  const description = `Top-rated salons and barbers in ${city.name}. Book at the salon or at home — all in one app.`;

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_ORIGIN}/barbers/${city.slug}`,
    },
    robots: shouldNoIndex
      ? { index: false, follow: true }
      : { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: `${SITE_ORIGIN}/barbers/${city.slug}`,
      type: 'website',
    },
  };
}

function readMode(cookieValue: string | undefined): MarketplaceMode {
  if (cookieValue === 'at_salon' || cookieValue === 'at_home') {
    return cookieValue;
  }
  return MARKETPLACE_MODE_DEFAULT;
}

export default async function BarbersCityPage({ params }: CityPageProps) {
  const { city: citySlug } = await params;

  const city = await getCityBySlug(citySlug);
  if (!city) notFound();

  const cookieStore = await cookies();
  const mode = readMode(cookieStore.get(MARKETPLACE_MODE_COOKIE)?.value);

  const [branches, session, favoriteIds, allServices] = await Promise.all([
    getListedBranchesForCity(citySlug, { mode }),
    getConsumerSession(),
    getFavoriteBranchIds(),
    getAllMarketplaceServices(),
  ]);
  const isAuthenticated = session !== null;

  // "Popular services in {City}" pills — only show services that have ≥1
  // listed salon in this city (at_salon mode, since it's the broader
  // superset). Hides thin links; keeps the SQL cheap by reusing the same
  // cache keys the /services/[slug]-in-[city] page itself hits.
  const popularServiceSlugs = await getPopularServicesForCity(
    citySlug,
    allServices.map((s) => s.slug),
  );
  const popularServices = allServices.filter((s) =>
    popularServiceSlugs.includes(s.slug),
  );

  const itemListUrl = `${SITE_ORIGIN}/barbers/${city.slug}`;
  const jsonLdItems = branches.map((b) => ({
    name: b.name,
    url: `${SITE_ORIGIN}/barber/${b.slug}`,
  }));

  return (
    <main className="min-h-screen" style={{ background: '#FAFAF8' }}>
      <div className="mx-auto w-full max-w-md md:max-w-4xl px-5 py-8 md:py-12">
        <Breadcrumbs
          items={[
            { name: 'Home', url: `${SITE_ORIGIN}/` },
            { name: 'Pakistan', url: `${SITE_ORIGIN}/barbers` },
            { name: city.name, url: itemListUrl },
          ]}
          className="mb-4"
        />

        <header className="mb-6 md:mb-8">
          <h1
            className="font-heading text-[1.75rem] md:text-[2.5rem] font-black text-[#1A1A1A]"
            style={{ lineHeight: 1.1, letterSpacing: '-0.02em' }}
          >
            {mode === 'at_home'
              ? `Home-service salons in ${city.name}`
              : `Best barbers & salons in ${city.name}`}
          </h1>
          <p className="text-[14px] md:text-[15px] text-[#6B7280] leading-relaxed mt-3 max-w-xl">
            {mode === 'at_home'
              ? `Salons in ${city.name} that come to your place — tap any card to view details.`
              : `Top-rated salons in ${city.name}. Tap any card to view details, hours and services.`}
          </p>
        </header>

        {popularServices.length > 0 && (
          <section
            className="mb-8"
            aria-labelledby="popular-services"
          >
            <h2
              id="popular-services"
              className="text-[11px] font-bold text-gold uppercase tracking-[1.5px] mb-3"
            >
              Popular services in {city.name}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {popularServices.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={`/services/${buildServiceCitySlug(s.slug, city.slug, 'at_salon')}`}
                    className="inline-flex items-center rounded-full border border-[#E8E8E8] bg-white px-3 py-1.5 text-[13px] font-medium text-[#1A1A1A] transition-all hover:border-[#1A1A1A]/20 hover:shadow-sm min-h-[32px]"
                  >
                    {s.display_name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-label={`Salons in ${city.name}`}>
          {branches.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#E8E8E8] bg-white/50 p-6 text-center">
              <p className="text-[13px] text-[#888]">
                {mode === 'at_home'
                  ? `No home-service salons listed in ${city.name} yet. Try switching to "At salon" on the home page.`
                  : `No salons listed in ${city.name} yet. Check back soon.`}
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
        name={`Best Barbers in ${city.name} — iCut`}
        url={itemListUrl}
        description={`Top-rated salons and barbers in ${city.name}. Book at the salon or at home.`}
        items={jsonLdItems}
      />
    </main>
  );
}
