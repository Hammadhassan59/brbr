/**
 * Shared salon card — rendered across every directory surface:
 *
 *   - `/barbers`                     (all-PK list)
 *   - `/barbers/[city]`              (city directory)
 *   - home page "Featured salons"    (`featured-salons.tsx`)
 *   - any future `/services/*` SEO  (Week 6)
 *
 * Design target (per `docs/superpowers/plans/2026-04-18-marketplace-phase-0-1.md`,
 * "Mobile-first rules"):
 *   - Height-uniform so a grid doesn't go ragged when one salon has a long
 *     name or about blurb. Enforced via min-h on the body + `line-clamp`.
 *   - Tap target ≥ 44px — the whole card is a Link.
 *   - First photo lazy-loaded by default; pass `priority` on the single
 *     above-the-fold card to upgrade to eager + fetchpriority="high".
 *   - Mode-agnostic card (no "at home" vs "at salon" CTA here); the page
 *     header is responsible for the current-mode framing.
 *
 * Accepts the shared `BranchListItem` shape from
 * `src/lib/marketplace/queries.ts` so every listing surface can feed its
 * cached query result straight in without an adapter.
 *
 * Default export preserved for compatibility with existing callers
 * (`import SalonCard from './salon-card'` — see `featured-salons.tsx`).
 *
 * TODO(phase-week-3): `/barber/[slug]` ships Week 3. The href is wired
 * here already so nothing shifts when the profile page lands — clicking a
 * card during Week-2 QA will 404. Intentional.
 */

import Link from 'next/link';
import { Star } from 'lucide-react';

import type { BranchListItem } from '@/lib/marketplace/queries';

import { FavoriteHeart } from './favorite-heart';

interface SalonCardProps {
  branch: BranchListItem;
  /**
   * When `true`, renders the image with `loading="eager"` +
   * `fetchPriority="high"` for a single above-the-fold hero card. Default
   * `false` (lazy-loaded).
   */
  priority?: boolean;
  /**
   * When `true`, overlays a `<FavoriteHeart />` in the top-right of the
   * image tile. Default `false` (no heart shown for anonymous browsing).
   * Parent pages read the consumer session once and forward the result so
   * every card on that page agrees without re-checking auth per-card.
   *
   * When `false`, callers that still want to show a "sign-in to save"
   * affordance can pass `showFavorite` + `isAuthenticated={false}`.
   */
  isAuthenticated?: boolean;
  /**
   * Pre-filled favorite state for the current consumer. Only read when
   * `isAuthenticated` is true. Ignore for anonymous / non-favorite
   * renderings — the heart defaults to unfilled.
   */
  initialFavorited?: boolean;
  /**
   * When `true`, render the `<FavoriteHeart />` even for anonymous users
   * (shown as a sign-in prompt). Default `true` on the favorites page,
   * but we default `false` here so legacy callers don't suddenly start
   * showing heart affordances in directory grids they don't own.
   */
  showFavorite?: boolean;
}

/** Turn `karachi` into `Karachi`; `faisal-town` into `Faisal Town`. */
function formatCityLabel(slug: string): string {
  if (!slug) return '';
  return slug
    .split('-')
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join(' ');
}

export default function SalonCard({
  branch,
  priority = false,
  isAuthenticated = false,
  initialFavorited = false,
  showFavorite = false,
}: SalonCardProps) {
  const rating = branch.rating_avg != null ? Number(branch.rating_avg) : null;
  const ratingCount = branch.rating_count ?? 0;
  const cityLabel = branch.city_slug ? formatCityLabel(branch.city_slug) : '';

  // Only logged-in consumers get the heart by default — anonymous browsers
  // see a clean card. Callers can opt anonymous visitors into the
  // sign-in-prompt variant via `showFavorite=true`.
  const renderFavorite = showFavorite || isAuthenticated;

  return (
    <Link
      href={`/barber/${branch.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-[#E8E8E8] bg-white transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      aria-label={`Open ${branch.name} profile`}
    >
      {/* 4:3 media tile — uniform aspect ratio keeps the grid tidy. */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#F5F5F5]">
        {branch.photo ? (
          // Plain <img>: branch photos live in a public Supabase Storage
          // bucket with URLs not whitelisted for next/image. Aspect-ratio
          // wrapper prevents CLS.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={branch.photo}
            alt={`${branch.name} interior`}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={priority ? 'high' : 'auto'}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#F5F5F5] to-[#E8E8E8]"
            aria-hidden
          >
            <span className="text-4xl font-bold text-[#BBB]">
              {branch.name.trim().charAt(0).toUpperCase() || 'i'}
            </span>
          </div>
        )}

        {renderFavorite && (
          <div className="absolute right-2 top-2 z-10">
            <FavoriteHeart
              branchId={branch.id}
              initialFavorited={initialFavorited}
              isAuthenticated={isAuthenticated}
              size="sm"
              variant="overlay"
            />
          </div>
        )}
      </div>

      {/* Uniform body height — min-h keeps the grid even when some cards
          lack about_preview or have short names. */}
      <div className="flex min-h-[132px] flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 text-[15px] font-bold text-[#1A1A1A]">
            {branch.name}
          </p>
          {rating != null && ratingCount > 0 ? (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
              <Star
                className="h-3 w-3 fill-amber-500 stroke-amber-500"
                aria-hidden
              />
              {rating.toFixed(1)}
              <span className="text-amber-600/70">({ratingCount})</span>
            </span>
          ) : null}
        </div>

        {cityLabel && (
          <p className="text-[10px] font-bold uppercase tracking-[1.2px] text-[#888]">
            {cityLabel}
          </p>
        )}

        {branch.about_preview && (
          <p className="line-clamp-2 text-[13px] text-[#666]">
            {branch.about_preview}
          </p>
        )}

        <span className="mt-auto text-[13px] font-semibold text-gold transition-colors group-hover:text-[#1A1A1A]">
          View →
        </span>
      </div>
    </Link>
  );
}
