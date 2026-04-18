/**
 * Salon map snippet — Mapbox Static Images API with a graceful fallback when
 * the public token isn't configured in the environment.
 *
 * Server component. We intentionally render the static image (an `<img>`
 * tag pointed at Mapbox's URL-signed static tiles endpoint) rather than an
 * interactive map — faster initial paint, zero client JS cost, and the
 * public token can be URL-restricted on Mapbox's dashboard to `icut.pk`
 * domains only (decision 15 in the plan).
 *
 * Token contract:
 *   - `NEXT_PUBLIC_MAPBOX_TOKEN` — the public token. Read at runtime so a
 *     build without the env var doesn't hard-fail; at runtime we render the
 *     "map available in app" fallback card instead of a broken image.
 *
 * If the branch has no lat/lng (owner hasn't set the pin yet), we also
 * render the fallback — a map over "0,0" would be embarrassing.
 *
 * Zoom + style: 15 gives a tight street-level view suitable for a salon
 * profile. `streets-v12` is the default style; switch to `satellite-streets-v12`
 * if we ever want a prettier look.
 */

interface SalonMapProps {
  lat: number | null;
  lng: number | null;
  name: string;
}

const MAPBOX_STYLE = 'streets-v12';
const ZOOM = 15;
const WIDTH = 600;
const HEIGHT = 300;

function mapboxStaticUrl(lat: number, lng: number, token: string): string {
  // Pin format: `pin-s+1a1a1a(lng,lat)` — small pin, hex colour `1a1a1a`
  // (our brand dark). Static Images v1 takes coords as `lng,lat` — the
  // opposite order from most mapping APIs, so we must not swap these.
  const pin = `pin-l+1a1a1a(${lng},${lat})`;
  const at = `${lng},${lat},${ZOOM},0`;
  return `https://api.mapbox.com/styles/v1/mapbox/${MAPBOX_STYLE}/static/${pin}/${at}/${WIDTH}x${HEIGHT}@2x?access_token=${encodeURIComponent(token)}`;
}

export default function SalonMap({ lat, lng, name }: SalonMapProps) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const hasCoords = lat != null && lng != null;

  // Fallback: no token or no coordinates → neutral placeholder card. Keeps
  // the section visible so the page layout doesn't jump when the token
  // eventually lands.
  if (!token || !hasCoords) {
    return (
      <section className="mb-6" aria-labelledby="salon-map-heading">
        <h2
          id="salon-map-heading"
          className="mb-3 text-[11px] font-bold uppercase tracking-[1.5px] text-gold"
        >
          Location
        </h2>
        <div
          role="img"
          aria-label={`Map for ${name} is available in the iCut app`}
          className="flex h-[180px] items-center justify-center rounded-2xl border border-dashed border-[#E8E8E8] bg-gradient-to-br from-[#F5F5F5] to-[#EEEEEE] p-6 text-center"
        >
          <p className="text-[13px] text-[#666]">Map available in app</p>
        </div>
      </section>
    );
  }

  const url = mapboxStaticUrl(lat, lng, token);

  return (
    <section className="mb-6" aria-labelledby="salon-map-heading">
      <h2
        id="salon-map-heading"
        className="mb-3 text-[11px] font-bold uppercase tracking-[1.5px] text-gold"
      >
        Location
      </h2>
      <div className="overflow-hidden rounded-2xl border border-[#E8E8E8] bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={`Map showing the location of ${name}`}
          loading="lazy"
          decoding="async"
          width={WIDTH}
          height={HEIGHT}
          className="h-auto w-full"
        />
      </div>
    </section>
  );
}
