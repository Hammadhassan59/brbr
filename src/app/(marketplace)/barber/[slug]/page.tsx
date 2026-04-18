/**
 * Salon profile page — `/barber/[slug]`.
 *
 * Server component. Renders the hero carousel, info cards, mode-aware
 * service menu, map snippet, public reviews, and a sticky "Book" CTA that
 * pops into view once the user scrolls past the hero.
 *
 * Mode-awareness (decision 13 in the plan):
 *   - The `icut-mode` cookie drives pricing + service-menu filtering.
 *   - If mode = `at_home` AND the branch doesn't offer home service, we
 *     render a banner nudging the user back to `at_salon` and disable the
 *     Book CTA (the CTA itself reads the flag via props).
 *
 * Visibility gate:
 *   - `getBranchBySlug` applies all the filters (listed, admin-blocked,
 *     payable-blocked, gender gating). Anything that fails returns null
 *     here → `notFound()`.
 *
 * SEO:
 *   - `generateMetadata` builds title/description/canonical/OG tags.
 *   - `JsonLdBeautySalon` emits the BeautySalon graph with geo, hours,
 *     priceRange, aggregateRating, and inline reviews.
 *   - Sibling `opengraph-image.tsx` generates a 1200×630 card with the
 *     salon's first photo + rating.
 *
 * TODO(phase-week-3 wave 2):
 *   - `/book/[slug]` route is owned by a sibling agent — CTA links there
 *     today and will 404 until that lands.
 *   - `/barber/[slug]/reviews` dedicated page is a later wave; "See all"
 *     link in `ReviewsList` already points at it.
 */
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import Breadcrumbs from '../../components/breadcrumbs';
import BookCta from '../../components/book-cta';
import JsonLdBeautySalon from '../../components/jsonld-beautysalon';
import ReviewsList from '../../components/reviews-list';
import SalonHero from '../../components/salon-hero';
import SalonInfo from '../../components/salon-info';
import SalonMap from '../../components/salon-map';
import ServiceMenu from '../../components/service-menu';
import { FavoriteHeart } from '../../components/favorite-heart';
import {
  getBranchBySlug,
  getBranchReviews,
} from '@/lib/marketplace/queries';
import {
  MARKETPLACE_MODE_COOKIE,
  MARKETPLACE_MODE_DEFAULT,
  type MarketplaceMode,
} from '@/lib/marketplace/mode';
import { getConsumerSession } from '@/lib/consumer-session';
import { isFavorite } from '@/app/actions/consumer-favorites';

const SITE_ORIGIN = 'https://icut.pk';
const REVIEWS_ON_PROFILE = 10;

interface PageProps {
  params: Promise<{ slug: string }>;
}

function readMode(cookieValue: string | undefined): MarketplaceMode {
  if (cookieValue === 'at_salon' || cookieValue === 'at_home') {
    return cookieValue;
  }
  return MARKETPLACE_MODE_DEFAULT;
}

/**
 * Trim the branch `about` text to 160 chars on a word boundary, suffixing …
 * when truncated. Used for `<meta name="description">` and OG description.
 * Intentionally separate from the list-card `aboutPreview` helper, which
 * trims to 180 chars — SEO descriptions are capped at 155–160 per Google.
 */
function metaDescription(about: string | null | undefined, salonName: string, cityName: string | null): string {
  const fallback = cityName
    ? `Book ${salonName} in ${cityName} on iCut. Haircuts, beard trims and beauty services — at the salon or at home.`
    : `Book ${salonName} on iCut. Haircuts, beard trims and beauty services — at the salon or at home.`;
  if (!about) return fallback;
  const trimmed = about.trim();
  if (!trimmed) return fallback;
  if (trimmed.length <= 160) return trimmed;
  const cut = trimmed.slice(0, 160);
  const lastSpace = cut.lastIndexOf(' ');
  const safe = lastSpace > 100 ? cut.slice(0, lastSpace) : cut;
  return safe.trimEnd() + '…';
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const branch = await getBranchBySlug(slug);

  if (!branch) {
    return {
      title: 'Not found',
      robots: { index: false, follow: false },
    };
  }

  const cityName = branch.city?.name ?? null;
  const title = cityName
    ? `${branch.name} — ${cityName} · Book on iCut`
    : `${branch.name} · Book on iCut`;
  const description = metaDescription(branch.about, branch.name, cityName);
  const canonical = `${SITE_ORIGIN}/barber/${branch.slug}`;
  const firstPhoto = branch.photos[0]?.url;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'website',
      ...(firstPhoto ? { images: [{ url: firstPhoto }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(firstPhoto ? { images: [firstPhoto] } : {}),
    },
  };
}

export default async function SalonProfilePage({ params }: PageProps) {
  const { slug } = await params;

  const branch = await getBranchBySlug(slug);
  if (!branch) notFound();

  const cookieStore = await cookies();
  const mode = readMode(cookieStore.get(MARKETPLACE_MODE_COOKIE)?.value);

  // Fetch reviews separately — keeps `getBranchBySlug` focused on the
  // profile essentials and lets us tune the review count independently.
  const reviews = await getBranchReviews(branch.id, REVIEWS_ON_PROFILE);

  // Session + favorite state drive the top-right heart toggle. The session
  // check is one cookie read; `isFavorite` is a single indexed row lookup
  // (swallows errors to `false` so it never blocks page render).
  const session = await getConsumerSession();
  const favorited = session ? await isFavorite(branch.id) : false;

  const canonical = `${SITE_ORIGIN}/barber/${branch.slug}`;
  const homeUnavailable = mode === 'at_home' && !branch.offers_home_service;

  return (
    <main className="min-h-screen" style={{ background: '#FAFAF8' }}>
      <div className="mx-auto w-full max-w-md px-5 py-6 pb-28 md:max-w-4xl md:py-10 md:pb-24">
        <Breadcrumbs
          items={[
            { name: 'Home', url: `${SITE_ORIGIN}/` },
            { name: 'Barbers', url: `${SITE_ORIGIN}/barbers` },
            ...(branch.city
              ? [
                  {
                    name: branch.city.name,
                    url: `${SITE_ORIGIN}/barbers/${branch.city.slug}`,
                  },
                ]
              : []),
            { name: branch.name, url: canonical },
          ]}
          className="mb-4"
        />

        <SalonHero branch={branch} />

        {/* Heart toggle — placed near the salon name (directly beneath the
            hero header) so logged-in consumers can save without scrolling.
            The hero header keeps the rating pill on the right; adding the
            heart there would crowd the title. A dedicated row below is the
            simplest clean placement without reorganizing the hero itself. */}
        <div className="-mt-4 mb-6 flex justify-end">
          <FavoriteHeart
            branchId={branch.id}
            initialFavorited={favorited}
            isAuthenticated={session !== null}
            size="md"
            variant="inline"
          />
        </div>

        {/* Mode-aware banner: home mode + branch doesn't offer home → guide
            back to at-salon. Decision 13 + page spec: clear nudge, not a
            hard 404. */}
        {homeUnavailable && (
          <div
            role="alert"
            className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-800"
          >
            <p className="font-semibold">
              This salon is not offering home service yet.
            </p>
            <p className="mt-1">
              Switch to &ldquo;At salon&rdquo; on the home page to book here,
              or{' '}
              <Link
                href="/barbers"
                className="font-semibold underline hover:text-amber-900"
              >
                browse home-service salons
              </Link>
              .
            </p>
          </div>
        )}

        <SalonInfo branch={branch} />

        <ServiceMenu services={branch.services} mode={mode} />

        <SalonMap lat={branch.lat} lng={branch.lng} name={branch.name} />

        <ReviewsList
          reviews={reviews}
          totalCount={branch.rating_count}
          slug={branch.slug}
        />
      </div>

      {/* Sticky bottom CTA — pops in once user scrolls past the hero. */}
      <BookCta
        slug={branch.slug}
        mode={mode}
        homeUnavailable={homeUnavailable}
      />

      <JsonLdBeautySalon branch={branch} reviews={reviews} url={canonical} />
    </main>
  );
}
