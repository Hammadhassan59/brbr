/**
 * Open Graph image for a single-city directory page (`/barbers/[city]`).
 *
 * 1200×630 via `next/og`'s `ImageResponse`. Reads the city row by slug via
 * `getCityBySlug`; falls back gracefully to a generic "Pakistan" card when
 * the slug doesn't resolve (handled without throwing so crawlers never see
 * a 500 they'd cache).
 *
 * Text + gradient only, no external images (per Week-6 spec).
 */
import { ImageResponse } from 'next/og';

import { getCityBySlug } from '@/lib/marketplace/queries';

export const alt = 'Best Barbers & Salons in Pakistan — iCut';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

interface OgProps {
  params: Promise<{ city: string }>;
}

export default async function OgImage({ params }: OgProps) {
  const { city: citySlug } = await params;

  let cityName: string | null = null;
  try {
    const city = await getCityBySlug(citySlug);
    cityName = city?.name ?? null;
  } catch {
    // Swallow — render the fallback below.
  }

  // Graceful fallback: when the slug is unknown we still emit a branded card
  // that reads as "Salons in Pakistan" rather than leaking an `undefined`
  // into the title. Keeps crawlers happy even if they hit an old URL.
  const displayName = cityName ?? 'Pakistan';

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
        {/* Top — logo + city pill */}
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

          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: '#F0B000',
              padding: '10px 20px',
              border: '2px solid #F0B000',
              borderRadius: 999,
            }}
          >
            {displayName}
          </div>
        </div>

        {/* Main headline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: '#F0B000',
            }}
          >
            Best barbers & salons in
          </div>
          <div
            style={{
              fontSize: 128,
              fontWeight: 900,
              lineHeight: 0.95,
              letterSpacing: '-0.04em',
              color: '#F2F2F2',
            }}
          >
            {displayName}
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
            color: '#F2F2F2',
          }}
        >
          <div style={{ color: '#E8DDC1' }}>
            At the salon or at home · Verified reviews
          </div>
          <div style={{ color: '#F0B000' }}>Book on iCut →</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
