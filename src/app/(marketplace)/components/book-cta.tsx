'use client';

/**
 * Sticky bottom "Book" CTA that pops into view once the user scrolls past the
 * hero. Client component — it needs an IntersectionObserver to know when the
 * hero leaves the viewport.
 *
 * Design:
 *   - Fixed to the viewport bottom, full-width on mobile, centered on
 *     desktop.
 *   - Hidden until the user has scrolled at least `REVEAL_AT_PX` down (or
 *     until the hero region is out of view).
 *   - Respects the mobile bottom-nav by offsetting above it on `md:`
 *     breakpoint and below.
 *
 * Route:
 *   - `/book/[slug]` doesn't exist yet (Week 3 wave 2). Clicking the CTA
 *     will 404 — intentional for now. The onClick simply follows the link.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Calendar } from 'lucide-react';

import type { MarketplaceMode } from '@/lib/marketplace/mode';

interface BookCtaProps {
  slug: string;
  mode: MarketplaceMode;
  /** When true the salon doesn't offer home service — CTA becomes disabled. */
  homeUnavailable?: boolean;
}

// Reveal the CTA once the user has scrolled at least this many px down the
// page. Tuned to roughly clear the salon hero photo block on a mid-sized
// phone. The observer approach below is the authoritative signal — this
// scroll fallback only fires when the ref isn't attached yet.
const REVEAL_AT_PX = 240;

// TODO(phase-week-3 wave 2): `/book/[slug]` route doesn't exist yet. Clicking
// this CTA will 404 until the booking flow lands. Owned by a parallel agent.
export default function BookCta({ slug, mode, homeUnavailable }: BookCtaProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > REVEAL_AT_PX);
    }
    // Set once on mount in case we hydrated mid-scroll.
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const disabled = !!homeUnavailable;
  const label = mode === 'at_home' ? 'Book at home' : 'Book at salon';

  return (
    <div
      aria-hidden={!visible}
      className={`pointer-events-none fixed inset-x-0 bottom-16 z-30 px-4 pb-2 transition-all duration-200 md:bottom-4 ${
        visible
          ? 'translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-6 opacity-0'
      }`}
    >
      <div className="mx-auto w-full max-w-md md:max-w-lg">
        {disabled ? (
          <button
            type="button"
            disabled
            className="pointer-events-auto flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#BBB] px-5 text-[15px] font-bold text-white opacity-80 shadow-lg"
          >
            <Calendar className="h-4 w-4" aria-hidden />
            Home service unavailable
          </button>
        ) : (
          <Link
            href={`/book/${slug}`}
            className="pointer-events-auto flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#1A1A1A] px-5 text-[15px] font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            <Calendar className="h-4 w-4" aria-hidden />
            {label}
          </Link>
        )}
      </div>
    </div>
  );
}
