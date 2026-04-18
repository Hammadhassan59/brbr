/**
 * Consumer marketplace home — icut.pk/
 *
 * Server Component. The old business-owner landing moved to `/business`
 * (see `src/app/business/page.tsx`); this route now owns the root.
 *
 * Three stacked sections (mobile-first, max-w-md on mobile, max-w-4xl on
 * desktop):
 *
 *   1. Minimal hero — logo/wordmark + tagline.
 *   2. Mode toggle — At salon / At home. The selection persists in the
 *      `icut-mode` cookie (see `src/app/actions/marketplace-mode.ts`) and
 *      filters every downstream directory / profile page. We read the
 *      cookie here via `cookies()` so first paint reflects the persisted
 *      choice — no client-side flicker.
 *   3. City picker — 5 tappable cards linking to `/barbers/[city]`.
 *   4. Featured salons — up to 6 branches, rating-desc, filtered by mode.
 *
 * SEO: sets a canonical + description that matches the plan's home-page
 * row in `docs/superpowers/plans/2026-04-18-marketplace-phase-0-1.md`
 * → "SEO implementation". JSON-LD for WebSite + BreadcrumbList inlined
 * at the bottom of the page so it's crawlable without JS.
 */

import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { Scissors } from 'lucide-react';

import CityPicker from './components/city-picker';
import FeaturedSalons from './components/featured-salons';
import ModeToggle from './components/mode-toggle';
import {
  MARKETPLACE_MODE_COOKIE,
  MARKETPLACE_MODE_DEFAULT,
  type MarketplaceMode,
} from '@/lib/marketplace/mode';

export const metadata: Metadata = {
  title: 'Book Haircuts & Beauty Services in Pakistan — iCut',
  description:
    'Browse top-rated salons and barbers across Karachi, Lahore, Islamabad, Rawalpindi and Faisalabad. Book at the salon or at home — all in one app.',
  alternates: {
    canonical: 'https://icut.pk/',
  },
  openGraph: {
    title: 'Book Haircuts & Beauty Services in Pakistan — iCut',
    description:
      'Browse top-rated salons and barbers across Pakistan. Book at the salon or at home.',
    url: 'https://icut.pk/',
    type: 'website',
  },
};

// Reading cookies opts the route into dynamic rendering, which is what we
// want — the mode toggle's selected state must reflect the live cookie, and
// the featured-salons filter depends on it.
export const dynamic = 'force-dynamic';

function readMode(cookieValue: string | undefined): MarketplaceMode {
  if (cookieValue === 'at_salon' || cookieValue === 'at_home') {
    return cookieValue;
  }
  return MARKETPLACE_MODE_DEFAULT;
}

export default async function ConsumerHome() {
  const cookieStore = await cookies();
  const mode = readMode(cookieStore.get(MARKETPLACE_MODE_COOKIE)?.value);

  // JSON-LD payloads. Kept inline so they render SSR (crawlers don't wait
  // for client JS). Shape follows schema.org guidelines for WebSite +
  // BreadcrumbList; the SearchAction is a placeholder for when in-app search
  // lands — pointing at /barbers in the meantime keeps crawlers happy.
  const websiteLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'iCut',
    url: 'https://icut.pk/',
    potentialAction: {
      '@type': 'SearchAction',
      target: 'https://icut.pk/barbers?q={search_term_string}',
      'query-input': 'required name=search_term_string',
    },
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://icut.pk/',
      },
    ],
  };

  return (
    <main className="min-h-screen" style={{ background: '#FAFAF8' }}>
      <div className="mx-auto w-full max-w-md md:max-w-4xl px-5 py-8 md:py-12">
        {/* ── Hero ── */}
        <section className="text-center mb-8 md:mb-12">
          <Link
            href="/"
            className="inline-flex items-center gap-2 mb-6"
            aria-label="iCut home"
          >
            <span
              className="w-9 h-9 bg-[#1A1A1A] flex items-center justify-center"
              style={{ borderRadius: '10px' }}
            >
              <Scissors className="w-4 h-4 text-gold" />
            </span>
            <span className="font-heading font-black text-[20px] md:text-[22px] text-[#1A1A1A] tracking-tight">
              iCut
            </span>
          </Link>
          <h1
            className="font-heading text-[1.75rem] md:text-[2.5rem] font-black text-[#1A1A1A]"
            style={{ lineHeight: 1.1, letterSpacing: '-0.02em' }}
          >
            Book haircuts &amp; beauty
            <br className="hidden md:block" />
            services in Pakistan
          </h1>
          <p className="text-[14px] md:text-[15px] text-[#6B7280] leading-relaxed mt-3 max-w-md mx-auto">
            Top-rated salons and barbers, at the salon or at home.
          </p>
        </section>

        {/* ── Mode toggle ── */}
        <section className="mb-8 md:mb-12" aria-label="Choose service mode">
          <ModeToggle currentMode={mode} />
        </section>

        {/* ── City picker ── */}
        <section className="mb-8 md:mb-12">
          <CityPicker />
        </section>

        {/* ── Featured salons ── */}
        <section className="mb-8 md:mb-12">
          <FeaturedSalons mode={mode} />
        </section>

        {/* ── Footer link to business owner landing ── */}
        <section className="text-center pb-4">
          <p className="text-[12px] text-[#888]">
            Own a salon?{' '}
            <Link
              href="/business"
              className="text-[#1A1A1A] font-semibold hover:underline"
            >
              List on iCut &rarr;
            </Link>
          </p>
        </section>
      </div>

      {/* JSON-LD for crawlers — inline so it's SSR-available. */}
      <script
        type="application/ld+json"
         
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteLd) }}
      />
      <script
        type="application/ld+json"
         
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
    </main>
  );
}
