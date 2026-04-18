/**
 * robots.txt for the iCut marketplace.
 *
 * Kept in lockstep with `src/app/sitemap.ts` — every path disallowed here
 * is also stripped from the sitemap generator (see `DISALLOWED_PREFIXES`).
 * A test (`test/sitemap.test.ts`) asserts the sitemap never emits a URL
 * under one of these prefixes.
 *
 * `/book/` is disallowed because the booking wizard is login-gated and
 * parameter-heavy — crawling it adds zero SEO value and risks indexing
 * half-filled cart states. The consumer-account area is similarly private.
 *
 * `host` + `sitemap` together tell crawlers the canonical origin and where
 * to fetch the sitemap. Absolute URLs per the plan's SEO section.
 */

import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/dashboard/',
        '/admin/',
        '/agent/',
        '/api/',
        '/account/',
        '/book/',
        '/sign-in',
        '/sign-up',
        '/verify-email',
        '/setup',
        '/login',
        '/reset-password',
        '/paywall',
      ],
    },
    sitemap: 'https://icut.pk/sitemap.xml',
    host: 'https://icut.pk',
  };
}
