/**
 * Salon profile hero — photo carousel + name + city + rating.
 *
 * Server component. Uses native horizontal scroll with CSS scroll-snap for
 * the carousel (no JS carousel library, no hydration cost). Works on every
 * browser that supports scroll-snap — which, as of 2025, is every browser
 * we target.
 *
 * Accessibility:
 *   - The gallery is exposed as a `<section aria-label="Photos">` with each
 *     slide a plain `<img>` that has descriptive alt text ("{salon name}
 *     photo 2 of 4"). Keyboard users can tab into the scroll container and
 *     arrow-scroll horizontally on most browsers.
 *   - When there are zero photos we render a single neutral placeholder
 *     with the salon's initial, matching the style used by `SalonCard`.
 *
 * Design (per plan's "Mobile-first rules"):
 *   - Single above-the-fold asset → first image gets `loading="eager"` +
 *     `fetchpriority="high"` to speed up LCP.
 *   - Height uses viewport-relative sizing so the hero feels right on both
 *     phone and desktop without media queries.
 */
import { Star } from 'lucide-react';

import type { BranchFull } from '@/lib/marketplace/queries';

interface SalonHeroProps {
  branch: BranchFull;
}

function cityLabel(branch: BranchFull): string {
  return branch.city?.name ?? '';
}

export default function SalonHero({ branch }: SalonHeroProps) {
  const photos = branch.photos;
  const rating = branch.rating_avg != null ? Number(branch.rating_avg) : null;

  return (
    <section
      aria-label={`${branch.name} photos and summary`}
      className="mb-6"
    >
      {/* ── Photo carousel ── */}
      {photos.length > 0 ? (
        <div
          className="scrollbar-hide -mx-5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-5 pb-2"
          style={{ scrollBehavior: 'smooth' }}
          role="list"
        >
          {photos.map((photo, idx) => (
            <div
              key={photo.path || photo.url}
              role="listitem"
              className="relative aspect-[4/3] w-[85%] flex-shrink-0 snap-center overflow-hidden rounded-2xl bg-[#F5F5F5] md:w-[60%]"
            >
              {/* Plain <img>: photos live in a public Supabase Storage bucket
                  with URLs not whitelisted for next/image. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={`${branch.name} photo ${idx + 1} of ${photos.length}`}
                loading={idx === 0 ? 'eager' : 'lazy'}
                fetchPriority={idx === 0 ? 'high' : 'auto'}
                decoding="async"
                className="h-full w-full object-cover"
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-gradient-to-br from-[#F5F5F5] to-[#E8E8E8]">
          <div className="flex h-full w-full items-center justify-center" aria-hidden>
            <span className="text-6xl font-bold text-[#BBB]">
              {branch.name.trim().charAt(0).toUpperCase() || 'i'}
            </span>
          </div>
        </div>
      )}

      {/* ── Heading + rating pill ── */}
      <header className="mt-5 flex items-start justify-between gap-3">
        <div>
          <h1
            className="font-heading text-[1.5rem] font-black text-[#1A1A1A] md:text-[2rem]"
            style={{ lineHeight: 1.1, letterSpacing: '-0.02em' }}
          >
            {branch.name}
          </h1>
          {cityLabel(branch) && (
            <p className="mt-1 text-[11px] font-bold uppercase tracking-[1.5px] text-[#888]">
              {cityLabel(branch)}
            </p>
          )}
        </div>
        {rating != null && branch.rating_count > 0 && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[12px] font-semibold text-amber-700">
            <Star
              className="h-3.5 w-3.5 fill-amber-500 stroke-amber-500"
              aria-hidden
            />
            {rating.toFixed(1)}
            <span className="text-amber-600/70">({branch.rating_count})</span>
          </span>
        )}
      </header>
    </section>
  );
}
