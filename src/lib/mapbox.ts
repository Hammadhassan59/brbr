// Mapbox client library for the iCut marketplace.
//
// Forward + reverse geocoding via the Mapbox Geocoding v6 API, plus a pure
// haversine `distanceKm` used for in-radius checks on the home-service
// booking flow. All HTTP calls happen server-side with
// `MAPBOX_GEOCODING_TOKEN`; the public `NEXT_PUBLIC_MAPBOX_TOKEN` is reserved
// for the browser map component (URL-restricted to icut.pk domains in
// Mapbox's dashboard).
//
// Results are biased to Pakistan (country=PK) — every geocode request
// includes the country filter and, when relevant, the PK bbox/proximity
// hints so "F-8 markaz" resolves to Islamabad rather than a F-8 elsewhere.
//
// Rate limiting: the free tier allows 100K geocoding requests/month. We
// don't throttle client-side; the Mapbox API returns HTTP 429 which this
// module surfaces as a thrown Error with the `status` attached. Callers
// should catch and degrade gracefully (e.g. fall back to manual pin drop).

const MAPBOX_API = 'https://api.mapbox.com';
const PK_COUNTRY = 'pk';
// Rough PK bbox [minLng, minLat, maxLng, maxLat] — used to bias forward
// geocoding within country (Mapbox accepts bbox as an additional hint on
// top of `country` filter).
const PK_BBOX: readonly [number, number, number, number] = [
  60.872972, 23.634501, 77.840555, 37.084107,
];

export interface GeocodeResult {
  name: string;
  lat: number;
  lng: number;
  /** Mapbox-provided bounding box `[minLng, minLat, maxLng, maxLat]`, when available. */
  bbox?: [number, number, number, number];
}

interface MapboxV6Feature {
  properties?: {
    full_address?: string;
    name?: string;
    name_preferred?: string;
    bbox?: [number, number, number, number];
    coordinates?: { latitude: number; longitude: number };
  };
  geometry?: {
    type: string;
    coordinates: [number, number]; // [lng, lat]
  };
  bbox?: [number, number, number, number];
}

interface MapboxV6Response {
  type: string;
  features: MapboxV6Feature[];
}

class MapboxError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'MapboxError';
  }
}

function getServerToken(): string {
  const token = process.env.MAPBOX_GEOCODING_TOKEN;
  if (!token) {
    throw new MapboxError(
      'MAPBOX_GEOCODING_TOKEN is not set — required for geocoding on the server'
    );
  }
  return token;
}

function featureToResult(feature: MapboxV6Feature): GeocodeResult | null {
  // v6 places coords in properties.coordinates; fallback to geometry.coordinates [lng, lat].
  const coords = feature.properties?.coordinates;
  let lat: number | undefined;
  let lng: number | undefined;
  if (coords && typeof coords.latitude === 'number' && typeof coords.longitude === 'number') {
    lat = coords.latitude;
    lng = coords.longitude;
  } else if (feature.geometry?.coordinates) {
    const [gLng, gLat] = feature.geometry.coordinates;
    lat = gLat;
    lng = gLng;
  }
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;

  const name =
    feature.properties?.full_address ??
    feature.properties?.name_preferred ??
    feature.properties?.name ??
    '';

  const bbox = feature.properties?.bbox ?? feature.bbox;

  return {
    name,
    lat,
    lng,
    ...(bbox ? { bbox } : {}),
  };
}

/**
 * Forward geocode a free-text query, biased to Pakistan.
 *
 * Uses Mapbox Geocoding v6. Returns up to 5 features ordered by relevance.
 * Throws `MapboxError` on HTTP failure with the status code attached so
 * callers can distinguish 429 (rate-limit) from 401 (bad token) from
 * network errors.
 */
export async function geocode(query: string): Promise<GeocodeResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const token = getServerToken();
  const url = new URL(`${MAPBOX_API}/search/geocode/v6/forward`);
  url.searchParams.set('q', trimmed);
  url.searchParams.set('country', PK_COUNTRY);
  url.searchParams.set('limit', '5');
  url.searchParams.set('bbox', PK_BBOX.join(','));
  url.searchParams.set('access_token', token);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new MapboxError(
      `Mapbox forward geocode failed: HTTP ${res.status}`,
      res.status
    );
  }

  const data = (await res.json()) as MapboxV6Response;
  if (!data.features || !Array.isArray(data.features)) return [];

  return data.features
    .map(featureToResult)
    .filter((r): r is GeocodeResult => r !== null);
}

/**
 * Reverse geocode a lat/lng to a human-readable address.
 *
 * Returns the top feature's full address string, or an empty string if
 * Mapbox returns no features for the coordinate.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new MapboxError('reverseGeocode requires finite lat/lng');
  }
  if (lat < -90 || lat > 90) {
    throw new MapboxError('reverseGeocode: lat out of range (-90..90)');
  }
  if (lng < -180 || lng > 180) {
    throw new MapboxError('reverseGeocode: lng out of range (-180..180)');
  }

  const token = getServerToken();
  const url = new URL(`${MAPBOX_API}/search/geocode/v6/reverse`);
  url.searchParams.set('longitude', String(lng));
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('limit', '1');
  url.searchParams.set('access_token', token);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new MapboxError(
      `Mapbox reverse geocode failed: HTTP ${res.status}`,
      res.status
    );
  }

  const data = (await res.json()) as MapboxV6Response;
  const feature = data.features?.[0];
  if (!feature) return '';
  const result = featureToResult(feature);
  return result?.name ?? '';
}

/**
 * Haversine distance between two points, in kilometers.
 *
 * Pure function — no API, no I/O. Safe to call on every keystroke in the
 * address picker to compute "is this pin within the salon's radius?"
 * checks. Mean earth radius = 6371 km.
 */
export function distanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // km
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const rLat1 = toRad(lat1);
  const rLat2 = toRad(lat2);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export { MapboxError };
