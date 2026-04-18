/**
 * Structured data for salon profile pages — schema.org `BeautySalon`.
 *
 * Server component (emits a single `<script type="application/ld+json">`).
 * Following the 2026-04-18 marketplace plan SEO section, each profile
 * includes a BeautySalon graph with:
 *
 *   - name, description, image[]
 *   - address (PostalAddress)
 *   - geo (GeoCoordinates) when lat/lng set
 *   - aggregateRating when we have any consumer→salon reviews
 *   - openingHoursSpecification[] (Mon–Sun hours)
 *   - priceRange (coarse indicator — "Rs 500–3000" style; omitted if no
 *     services to infer from)
 *
 * Google uses BeautySalon rich results to surface an entity card in local
 * SERPs with hours, rating, and a booking link — high-value for this
 * directory.
 */
import type { BranchFull, ReviewWithConsumer } from '@/lib/marketplace/queries';

interface JsonLdBeautySalonProps {
  branch: BranchFull;
  reviews: ReviewWithConsumer[];
  /** Canonical URL of the profile page — absolute. */
  url: string;
}

/** Build the `openingHoursSpecification` array from the branch working-hours jsonb. */
function buildOpeningHours(
  workingHours: Record<string, unknown> | null,
): Array<Record<string, unknown>> {
  if (!workingHours || typeof workingHours !== 'object') return [];
  const SCHEMA_DAY: Record<string, string> = {
    mon: 'Monday',
    tue: 'Tuesday',
    wed: 'Wednesday',
    thu: 'Thursday',
    fri: 'Friday',
    sat: 'Saturday',
    sun: 'Sunday',
  };
  const out: Array<Record<string, unknown>> = [];
  for (const [key, label] of Object.entries(SCHEMA_DAY)) {
    const day = (workingHours as Record<string, unknown>)[key];
    if (!day || typeof day !== 'object') continue;
    const d = day as { open?: unknown; close?: unknown; off?: unknown };
    if (d.off === true) continue;
    if (typeof d.open !== 'string' || typeof d.close !== 'string') continue;
    if (!d.open || !d.close) continue;
    out.push({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: label,
      opens: d.open,
      closes: d.close,
    });
  }
  return out;
}

/** Build a coarse `priceRange` from the salon's active service prices. */
function buildPriceRange(branch: BranchFull): string | null {
  const prices = branch.services
    .map((s) => Number(s.base_price))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (prices.length === 0) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) return `Rs ${min}`;
  return `Rs ${min}–${max}`;
}

export default function JsonLdBeautySalon({
  branch,
  reviews,
  url,
}: JsonLdBeautySalonProps) {
  const payload: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'BeautySalon',
    '@id': url,
    url,
    name: branch.name,
  };

  if (branch.about && branch.about.trim().length > 0) {
    payload.description = branch.about.slice(0, 5000);
  }

  const imageUrls = branch.photos.map((p) => p.url).filter((u) => !!u);
  if (imageUrls.length > 0) {
    payload.image = imageUrls;
  }

  if (branch.address) {
    const addr: Record<string, unknown> = {
      '@type': 'PostalAddress',
      streetAddress: branch.address,
      addressCountry: 'PK',
    };
    if (branch.city?.name) addr.addressLocality = branch.city.name;
    payload.address = addr;
  }

  if (branch.lat != null && branch.lng != null) {
    payload.geo = {
      '@type': 'GeoCoordinates',
      latitude: branch.lat,
      longitude: branch.lng,
    };
  }

  if (branch.phone) {
    payload.telephone = branch.phone;
  }

  const priceRange = buildPriceRange(branch);
  if (priceRange) payload.priceRange = priceRange;

  if (
    branch.rating_avg != null &&
    Number.isFinite(Number(branch.rating_avg)) &&
    branch.rating_count > 0
  ) {
    payload.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Number(branch.rating_avg).toFixed(1),
      reviewCount: branch.rating_count,
      bestRating: '5',
      worstRating: '1',
    };
  }

  const hours = buildOpeningHours(branch.working_hours);
  if (hours.length > 0) {
    payload.openingHoursSpecification = hours;
  }

  // Include up to the first 5 public reviews inline. Google's guidance is
  // to keep the inline Review count tractable — more goes in the dedicated
  // reviews page (Phase 2 wave).
  if (reviews.length > 0) {
    payload.review = reviews.slice(0, 5).map((r) => ({
      '@type': 'Review',
      reviewRating: {
        '@type': 'Rating',
        ratingValue: r.rating,
        bestRating: '5',
        worstRating: '1',
      },
      author: { '@type': 'Person', name: r.consumer_first_name },
      datePublished: r.created_at,
      ...(r.comment ? { reviewBody: r.comment } : {}),
    }));
  }

  return (
    <script
      type="application/ld+json"
       
      dangerouslySetInnerHTML={{ __html: JSON.stringify(payload) }}
    />
  );
}
