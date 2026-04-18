/**
 * Open Graph image for the nationwide directory (`/barbers`).
 *
 * 1200×630 via `next/og`'s `ImageResponse`. Text + gradient + inline SVG
 * only — no external image fetches (per Week-6 spec).
 *
 * Brand palette matches `src/app/(marketplace)/opengraph-image.tsx` and the
 * existing salon OG: `#1A1A1A` background, `#F2F2F2` text, `#F0B000` gold.
 */
import { ImageResponse } from 'next/og';

export const alt = 'Directory of Salons in Pakistan — iCut';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
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
        {/* Top row — logo + label */}
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
              padding: '10px 18px',
              border: '2px solid #F0B000',
              borderRadius: 999,
            }}
          >
            Nationwide Directory
          </div>
        </div>

        {/* Main headline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div
            style={{
              fontSize: 92,
              fontWeight: 900,
              lineHeight: 1.02,
              letterSpacing: '-0.03em',
              color: '#F2F2F2',
              maxWidth: '980px',
            }}
          >
            Salons across Pakistan
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: '0.01em',
              color: '#E8DDC1',
              maxWidth: '900px',
            }}
          >
            Browse top-rated barbers, beauty lounges, and home-service pros in every city.
          </div>
        </div>

        {/* Bottom row — city pills */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          {['Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad'].map(
            (name) => (
              <div
                key={name}
                style={{
                  padding: '10px 20px',
                  borderRadius: 999,
                  background: 'rgba(240, 176, 0, 0.16)',
                  border: '1px solid rgba(240, 176, 0, 0.45)',
                  color: '#F0B000',
                  fontSize: 22,
                  fontWeight: 700,
                }}
              >
                {name}
              </div>
            ),
          )}
        </div>
      </div>
    ),
    { ...size },
  );
}
