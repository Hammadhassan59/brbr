/**
 * Open Graph image for the marketplace home page (`/`).
 *
 * 1200×630, generated via `next/og`'s `ImageResponse`. No external fetches —
 * only text + CSS gradients + inline SVG (per Week-6 spec: external images
 * hurt build + risk failures).
 *
 * Brand palette (matches the salon profile OG at
 * `src/app/(marketplace)/barber/[slug]/opengraph-image.tsx` and the PWA
 * manifest): background `#1A1A1A`, text `#F2F2F2`, gold accent `#F0B000`.
 */
import { ImageResponse } from 'next/og';

export const alt =
  'iCut — Book Haircuts & Beauty Services in Pakistan';
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
            'linear-gradient(135deg, #1A1A1A 0%, #2A2420 55%, #3D2F18 100%)',
          color: '#F2F2F2',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Top row — logo + wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: 16,
              background: '#F0B000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#1A1A1A',
              fontSize: 40,
              fontWeight: 900,
            }}
          >
            i
          </div>
          <div
            style={{
              fontSize: 40,
              fontWeight: 900,
              letterSpacing: '-0.02em',
              color: '#F2F2F2',
            }}
          >
            iCut
          </div>
        </div>

        {/* Main headline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div
            style={{
              fontSize: 82,
              fontWeight: 900,
              lineHeight: 1.05,
              letterSpacing: '-0.03em',
              color: '#F2F2F2',
              maxWidth: '950px',
            }}
          >
            Book Haircuts & Beauty Services in Pakistan
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: '0.02em',
              color: '#F0B000',
              maxWidth: '900px',
            }}
          >
            At the salon or at home · Real-time booking · Verified reviews
          </div>
        </div>

        {/* Bottom accent bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: '12px',
              fontSize: 22,
              fontWeight: 700,
              color: '#F2F2F2',
              letterSpacing: '0.02em',
            }}
          >
            <span>Karachi</span>
            <span style={{ color: '#F0B000' }}>·</span>
            <span>Lahore</span>
            <span style={{ color: '#F0B000' }}>·</span>
            <span>Islamabad</span>
            <span style={{ color: '#F0B000' }}>·</span>
            <span>Rawalpindi</span>
            <span style={{ color: '#F0B000' }}>·</span>
            <span>Faisalabad</span>
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 800,
              color: '#F0B000',
              letterSpacing: '0.02em',
            }}
          >
            icut.pk →
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
