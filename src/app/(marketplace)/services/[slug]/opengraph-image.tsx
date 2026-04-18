/**
 * Open Graph image for a service-in-city programmatic SEO page
 * (`/services/[slug]` where slug is `{svc}-in-{city}` or
 * `home-{svc}-in-{city}`).
 *
 * 1200×630 via `next/og`'s `ImageResponse`. Parses the slug the same way
 * the (parallel-owned) page component does and resolves the human-readable
 * service + city names against the DB. Falls back to a generic branded
 * card when either lookup fails — crawlers never see a 500.
 *
 * Slug grammar:
 *   - `{svc}-in-{city}`          → in-salon mode (e.g. `haircut-in-karachi`)
 *   - `home-{svc}-in-{city}`     → home mode    (e.g. `home-haircut-in-karachi`)
 *
 * Service slugs can contain hyphens (`beard-trim`, `hair-color`), so we
 * split on the canonical ` -in- ` separator exactly once, then peel an
 * optional `home-` prefix off the service half. That keeps
 * `home-hair-color-in-lahore` parsing correctly.
 *
 * Text + gradient only — no external image fetches (per Week-6 spec).
 */
import { ImageResponse } from 'next/og';

import { getCityBySlug } from '@/lib/marketplace/queries';
import { createServerClient } from '@/lib/supabase';

export const alt = 'Book on iCut';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

interface OgProps {
  params: Promise<{ slug: string }>;
}

interface ParsedSlug {
  serviceSlug: string;
  citySlug: string;
  isHome: boolean;
}

/**
 * Split a `{svc}-in-{city}` or `home-{svc}-in-{city}` slug into its parts.
 * Returns `null` when the slug doesn't contain the `-in-` separator — the
 * caller renders a neutral fallback card in that case.
 */
function parseServiceCitySlug(slug: string): ParsedSlug | null {
  const separator = '-in-';
  const idx = slug.indexOf(separator);
  if (idx <= 0 || idx >= slug.length - separator.length) return null;

  const left = slug.slice(0, idx);
  const citySlug = slug.slice(idx + separator.length);
  if (!left || !citySlug) return null;

  const isHome = left.startsWith('home-') && left.length > 'home-'.length;
  const serviceSlug = isHome ? left.slice('home-'.length) : left;
  return { serviceSlug, citySlug, isHome };
}

/**
 * Resolve a marketplace_services row by slug into a display name. Falls
 * back to a title-cased version of the slug (`hair-color` → `Hair Color`)
 * when the DB is unavailable or the slug isn't in the taxonomy — the OG
 * card stays readable even if the service was retired.
 */
async function lookupServiceName(slug: string): Promise<string> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('marketplace_services')
      .select('display_name, name')
      .eq('slug', slug)
      .maybeSingle();
    if (!error && data) {
      const name =
        (data as { display_name?: string; name?: string }).display_name ??
        (data as { name?: string }).name;
      if (name && name.length > 0) return name;
    }
  } catch {
    // fall through
  }
  // Fallback: kebab → Title Case.
  return slug
    .split('-')
    .map((p) => (p.length > 0 ? p[0].toUpperCase() + p.slice(1) : p))
    .join(' ');
}

export default async function OgImage({ params }: OgProps) {
  const { slug } = await params;

  const parsed = parseServiceCitySlug(slug);

  let serviceName = 'Beauty Services';
  let cityName = 'Pakistan';
  let isHome = false;

  if (parsed) {
    isHome = parsed.isHome;
    try {
      const [name, city] = await Promise.all([
        lookupServiceName(parsed.serviceSlug),
        getCityBySlug(parsed.citySlug),
      ]);
      serviceName = name;
      cityName = city?.name ?? titleCase(parsed.citySlug);
    } catch {
      // Render fallback card below.
      serviceName = titleCase(parsed.serviceSlug);
      cityName = titleCase(parsed.citySlug);
    }
  }

  const headline = isHome
    ? `${serviceName} at home in ${cityName}`
    : `${serviceName} in ${cityName}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '80px',
          background:
            'linear-gradient(135deg, #1A1A1A 0%, #2A2420 50%, #3D2F18 100%)',
          color: '#F2F2F2',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Top row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background: '#F0B000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#1A1A1A',
                fontSize: 34,
                fontWeight: 900,
              }}
            >
              i
            </div>
            <div
              style={{
                fontSize: 34,
                fontWeight: 900,
                letterSpacing: '-0.02em',
              }}
            >
              iCut
            </div>
          </div>

          {isHome && (
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: '#1A1A1A',
                background: '#F0B000',
                padding: '10px 20px',
                borderRadius: 999,
              }}
            >
              At home
            </div>
          )}
        </div>

        {/* Main headline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: '#F0B000',
            }}
          >
            {isHome ? 'Home service' : 'At salon'}
          </div>
          <div
            style={{
              fontSize: 92,
              fontWeight: 900,
              lineHeight: 1.0,
              letterSpacing: '-0.03em',
              color: '#F2F2F2',
              maxWidth: '980px',
            }}
          >
            {headline}
          </div>
        </div>

        {/* Bottom */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 26,
            fontWeight: 700,
          }}
        >
          <div style={{ color: '#E8DDC1' }}>
            Compare top-rated salons · Book in minutes
          </div>
          <div style={{ color: '#F0B000' }}>Book on iCut →</div>
        </div>
      </div>
    ),
    { ...size },
  );
}

function titleCase(kebab: string): string {
  return kebab
    .split('-')
    .map((p) => (p.length > 0 ? p[0].toUpperCase() + p.slice(1) : p))
    .join(' ');
}
