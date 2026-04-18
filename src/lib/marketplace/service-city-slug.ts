/**
 * Parser for the programmatic-SEO compound slug at
 * `/services/[slug]-in-[city]` and its home-service variant
 * `/services/home-[slug]-in-[city]`.
 *
 * Why a single `[slug]` param (not separate `[service]/[city]` segments):
 *   Flat URL slugs rank better than deep nesting for "{service} in {city}"
 *   queries — this is the biggest organic-discovery lever for iCut. Having
 *   the city inline (not at `/city/{city}/service/{service}`) keeps us
 *   aligned with how competitors like Fresha, Booksy, Glamify rank on
 *   Google. See the Week 6 deliverable notes in
 *   `docs/superpowers/plans/2026-04-18-marketplace-phase-0-1.md`.
 *
 * Parser shape (regex-driven):
 *
 *     /^(home-)?([a-z0-9-]+)-in-([a-z0-9-]+)$/
 *
 * Three capture groups:
 *   1. `home-` literal prefix (optional)     → `mode = 'at_home' | 'at_salon'`
 *   2. Service slug (kebab, a-z0-9+dashes)   → `serviceSlug`
 *   3. City slug (kebab, a-z0-9+dashes)      → `citySlug`
 *
 * Ambiguity note: service slugs like `haircut-in-lahore` have the literal
 * token `-in-` inside them — but the regex is greedy on the second group
 * which means `haircut-in-lahore` parses as service=`haircut`, city=`lahore`.
 * We rely on `marketplace_services.slug` NEVER containing the literal
 * substring `-in-`. Enforced by code review — the 10 seeded slugs today don't
 * and we'd reject a new entry at schema-review time. Also guarded by the
 * `notFound()` fallback on the page: if the parse produces a service/city
 * that doesn't exist in the DB, the render 404s.
 *
 * Edge cases rejected:
 *   - Empty string, leading/trailing dashes, uppercase characters.
 *   - Double-home prefix (`home-home-…`).
 *   - Missing `-in-` separator (`haircut-lahore`).
 *   - Empty service or city segment (`home--in-lahore`, `haircut-in-`).
 */

import type { MarketplaceMode } from './mode';

export interface ServiceCityParse {
  serviceSlug: string;
  citySlug: string;
  mode: MarketplaceMode;
}

/**
 * Exported for tests — the regex source, so we can document exactly one
 * truth and callers never inline their own.
 */
export const SERVICE_CITY_SLUG_REGEX = /^(home-)?([a-z0-9]+(?:-[a-z0-9]+)*)-in-([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/**
 * Parse a compound slug into `{ serviceSlug, citySlug, mode }`. Returns
 * `null` on any parse failure — the page turns that into `notFound()`.
 *
 * Does NOT validate the service or city exists in the DB; that's the page's
 * follow-up responsibility and drives the 404 path for typo'd URLs.
 */
export function parseServiceCitySlug(
  input: string,
): ServiceCityParse | null {
  if (typeof input !== 'string' || input.length === 0) return null;

  const match = input.match(SERVICE_CITY_SLUG_REGEX);
  if (!match) return null;

  const homePrefix = match[1];
  const serviceSlug = match[2];
  const citySlug = match[3];

  // Defensive: the regex already enforces non-empty segments via its
  // character class, but explicit guards document the invariant and survive
  // anyone loosening the regex in the future.
  if (!serviceSlug || !citySlug) return null;

  return {
    serviceSlug,
    citySlug,
    mode: homePrefix ? 'at_home' : 'at_salon',
  };
}

/**
 * Inverse of `parseServiceCitySlug`: build the compound slug from its parts.
 * Used by the "Popular services in {City}" nav pills on `/barbers/[city]`
 * and by sitemap / test helpers.
 */
export function buildServiceCitySlug(
  serviceSlug: string,
  citySlug: string,
  mode: MarketplaceMode,
): string {
  const prefix = mode === 'at_home' ? 'home-' : '';
  return `${prefix}${serviceSlug}-in-${citySlug}`;
}
