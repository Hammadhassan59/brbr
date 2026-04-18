/**
 * Dynamic Open Graph image for salon profiles — 1200×630, generated via
 * Next 16's `ImageResponse` API (satori under the hood).
 *
 * Design target (per the 2026-04-18 marketplace plan's SEO section):
 *   - Dark background, white text, brand gold accent.
 *   - Salon name + city + rating stars on the left.
 *   - First salon photo on the right (cropped to fill).
 *   - "iCut" wordmark in a corner for source recognition.
 *
 * Runtime:
 *   - Default (edge) runtime would work, but satori's HTTP `<img>` fetch
 *     behaves slightly differently across runtimes. Keeping the default is
 *     fine — Mapbox-hosted or Supabase-hosted photos both serve CORS-OK.
 *   - When the salon is not found or has no photos, we still emit a card
 *     (gradient background + name) so nobody shares a blank OG card.
 *
 * Error handling:
 *   - We never throw from the image route — a failed ImageResponse returns
 *     a 500 and crawlers will cache that. Instead we catch DB errors and
 *     fall back to a minimal no-photo design.
 */
import { ImageResponse } from 'next/og';

import { getBranchBySlug } from '@/lib/marketplace/queries';

export const alt = 'Salon profile on iCut';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

interface OgProps {
  params: Promise<{ slug: string }>;
}

export default async function OgImage({ params }: OgProps) {
  const { slug } = await params;
  let branch = null;
  try {
    branch = await getBranchBySlug(slug);
  } catch {
    // Swallow — we'll render the fallback card.
  }

  const name = branch?.name ?? 'iCut';
  const cityName = branch?.city?.name ?? '';
  const rating = branch?.rating_avg != null ? Number(branch.rating_avg) : null;
  const ratingCount = branch?.rating_count ?? 0;
  const photoUrl = branch?.photos[0]?.url ?? null;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#1A1A1A',
          color: '#FFFFFF',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Left text column */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '60px',
            width: photoUrl ? '600px' : '1200px',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: '#C9A961',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#1A1A1A',
                fontSize: 28,
                fontWeight: 900,
              }}
            >
              i
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 900,
                letterSpacing: '-0.02em',
              }}
            >
              iCut
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div
              style={{
                fontSize: 60,
                fontWeight: 900,
                lineHeight: 1.05,
                letterSpacing: '-0.02em',
              }}
            >
              {name}
            </div>
            {cityName && (
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  letterSpacing: '1.5px',
                  textTransform: 'uppercase',
                  color: '#C9A961',
                }}
              >
                {cityName}
              </div>
            )}
            {rating != null && ratingCount > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: 28,
                  fontWeight: 700,
                }}
              >
                <span style={{ color: '#F59E0B', fontSize: 34 }}>★</span>
                <span>{rating.toFixed(1)}</span>
                <span style={{ color: '#888' }}>({ratingCount})</span>
              </div>
            )}
          </div>

          <div style={{ fontSize: 22, fontWeight: 600, color: '#C9A961' }}>
            Book on iCut →
          </div>
        </div>

        {/* Right photo column */}
        {photoUrl && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <img
              src={photoUrl}
              width={600}
              height={630}
              style={{
                width: 600,
                height: 630,
                objectFit: 'cover',
              }}
            />
          </div>
        )}
      </div>
    ),
    { ...size },
  );
}
