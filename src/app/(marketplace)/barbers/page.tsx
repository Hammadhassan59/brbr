/**
 * All-PK directory index — `/barbers`.
 *
 * Server component. Lists every marketplace-listed salon that passes the
 * shared filter set (women flag, payable block, admin block, men-only
 * launch gate) for the current consumer mode, grouped by a city-cards
 * header and a collapsible "All salons" grid below.
 *
 * Cache + mode-awareness:
 *   - The data fetch calls `getAllListedBranches({ mode })` and
 *     `getAllCities()`, both of which are 6-hour-revalidated via the
 *     cache-tag strategy in `src/lib/marketplace/queries.ts`.
 *   - Mode is read from the `icut-mode` cookie (home-first toggle on `/`).
 *     Reading a cookie opts this route into dynamic rendering — intentional,
 *     because the filter must reflect the persisted selection; the
 *     underlying listing *data* is still cached through the shared query
 *     layer.
 *
 * SEO (per `docs/superpowers/plans/2026-04-18-marketplace-phase-0-1.md` →
 * "SEO implementation"):
 *   - Title: "Best Barbers & Salons in Pakistan — iCut".
 *   - `CollectionPage` JSON-LD with an `ItemList` of the listed salons.
 *   - `BreadcrumbList` JSON-LD via the shared Breadcrumbs component.
 *   - Canonical `https://icut.pk/barbers` (mode is a UX-level filter, not a
 *     separate indexable surface — one canonical avoids thin-duplicate
 *     complaints from Search Console).
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';

import Breadcrumbs from '../components/breadcrumbs';
import JsonLdCollectionPage from '../components/jsonld-collectionpage';
import SalonCard from '../components/salon-card';
import {
  getAllCities,
  getAllListedBranches,
  type MarketplaceMode,
} from '@/lib/marketplace/queries';
import {
  MARKETPLACE_MODE_COOKIE,
  MARKETPLACE_MODE_DEFAULT,
} from '@/lib/marketplace/mode';
import { getConsumerSession } from '@/lib/consumer-session';
import { getFavoriteBranchIds } from '@/app/actions/consumer-favorites';

const SITE_ORIGIN = 'https://icut.pk';

export const metadata: Metadata = {
  title: 'Best Barbers & Salons in Pakistan — iCut',
  description:
    'Browse top-rated salons and barbers across Pakistan. Book at the salon or at home — all in one app. Karachi, Lahore, Islamabad, Rawalpindi, Faisalabad.',
  alternates: {
    canonical: `${SITE_ORIGIN}/barbers`,
  },
  openGraph: {
    title: 'Best Barbers & Salons in Pakistan — iCut',
    description:
      'Browse top-rated salons and barbers across Pakistan. Book at the salon or at home.',
    url: `${SITE_ORIGIN}/barbers`,
    type: 'website',
  },
};

function readMode(cookieValue: string | undefined): MarketplaceMode {
  if (cookieValue === 'at_salon' || cookieValue === 'at_home') {
    return cookieValue;
  }
  return MARKETPLACE_MODE_DEFAULT;
}

export default async function BarbersIndexPage() {
  // Read the mode cookie outside any cache scope — the query helpers
  // accept `mode` as an argument, so the cache key is mode-aware without
  // needing to read cookies from inside a cached function (which would
  // error under Cache Components, per the Next 16 use-cache docs).
  const cookieStore = await cookies();
  const mode = readMode(cookieStore.get(MARKETPLACE_MODE_COOKIE)?.value);

  // Parallel fetches — both are independently cached, no ordering dependency.
  const [cities, branches, session, favoriteIds] = await Promise.all([
    getAllCities(),
    getAllListedBranches({ mode }),
    getConsumerSession(),
    getFavoriteBranchIds(),
  ]);
  const isAuthenticated = session !== null;

  // Shape the ItemList payload for schema.org. Absolute URLs are required.
  const itemListUrl = `${SITE_ORIGIN}/barbers`;
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
          ]}
          className="mb-4"
        />

        <header className="mb-6 md:mb-8">
          <h1
            className="font-heading text-[1.75rem] md:text-[2.5rem] font-black text-[#1A1A1A]"
            style={{ lineHeight: 1.1, letterSpacing: '-0.02em' }}
          >
            {mode === 'at_home'
              ? 'Home-service salons across Pakistan'
              : 'Best barbers & salons in Pakistan'}
          </h1>
          <p className="text-[14px] md:text-[15px] text-[#6B7280] leading-relaxed mt-3 max-w-xl">
            {mode === 'at_home'
              ? 'Salons that come to your place — pick a city or browse the full list below.'
              : 'Top-rated salons near you. Pick your city or browse every listing.'}
          </p>
        </header>

        {/* ── Cities grid ── */}
        {cities.length > 0 && (
          <section className="mb-10" aria-labelledby="barbers-cities">
            <h2
              id="barbers-cities"
              className="text-[11px] font-bold text-gold uppercase tracking-[1.5px] mb-3"
            >
              Browse by city
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {cities.map((city) => (
                <Link
                  key={city.id}
                  href={`/barbers/${city.slug}`}
                  className="group flex items-center justify-between gap-3 rounded-2xl border border-[#E8E8E8] bg-white p-4 min-h-[64px] transition-all hover:-translate-y-0.5 hover:border-[#1A1A1A]/20 hover:shadow-md"
                >
                  <span className="text-[15px] font-bold text-[#1A1A1A]">
                    {city.name}
                  </span>
                  <span
                    aria-hidden
                    className="text-[#888] group-hover:text-[#1A1A1A] transition-colors text-lg"
                  >
                    →
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── All salons ── */}
        <section aria-labelledby="barbers-all">
          <details open className="group">
            <summary
              id="barbers-all"
              className="mb-3 cursor-pointer list-none text-[11px] font-bold text-gold uppercase tracking-[1.5px] flex items-center justify-between"
            >
              <span>All salons ({branches.length})</span>
              <span
                aria-hidden
                className="text-[#888] transition-transform group-open:rotate-180"
              >
                ▾
              </span>
            </summary>
            {branches.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#E8E8E8] bg-white/50 p-6 text-center">
                <p className="text-[13px] text-[#888]">
                  {mode === 'at_home'
                    ? 'No home-service salons are listed yet. Try switching to "At salon" on the home page.'
                    : 'No salons listed yet. Check back soon.'}
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
          </details>
        </section>
      </div>

      <JsonLdCollectionPage
        name="Best Barbers & Salons in Pakistan — iCut"
        url={itemListUrl}
        description="Top-rated salons and barbers across Pakistan. Browse by city or view the full list."
        items={jsonLdItems}
      />
    </main>
  );
}
