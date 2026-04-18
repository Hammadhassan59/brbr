import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  distanceKm,
  geocode,
  reverseGeocode,
  MapboxError,
  type GeocodeResult,
} from '../src/lib/mapbox';

describe('distanceKm', () => {
  it('returns 0 for identical points', () => {
    expect(distanceKm(24.8607, 67.0011, 24.8607, 67.0011)).toBe(0);
  });

  it('Karachi to Lahore is ~1030 km', () => {
    // Karachi 24.8607, 67.0011  <->  Lahore 31.5204, 74.3587
    const d = distanceKm(24.8607, 67.0011, 31.5204, 74.3587);
    expect(d).toBeGreaterThan(1000);
    expect(d).toBeLessThan(1060);
  });

  it('Lahore to Islamabad is ~300 km', () => {
    // Lahore 31.5204, 74.3587  <->  Islamabad 33.6844, 73.0479
    const d = distanceKm(31.5204, 74.3587, 33.6844, 73.0479);
    expect(d).toBeGreaterThan(260);
    expect(d).toBeLessThan(310);
  });

  it('is symmetric', () => {
    const ab = distanceKm(24.8607, 67.0011, 31.5204, 74.3587);
    const ba = distanceKm(31.5204, 74.3587, 24.8607, 67.0011);
    expect(ab).toBeCloseTo(ba, 9);
  });

  it('short intra-city distance (~15 km)', () => {
    // Islamabad sectors F-8 to G-11 are roughly 7 km apart; use two Islamabad
    // area points ~15 km apart for a sanity check on small distances.
    // Islamabad center 33.6844, 73.0479 <-> Rawalpindi 33.5651, 73.0169
    const d = distanceKm(33.6844, 73.0479, 33.5651, 73.0169);
    expect(d).toBeGreaterThan(10);
    expect(d).toBeLessThan(20);
  });
});

// --- geocode / reverseGeocode -------------------------------------------

const FIXTURE_FORWARD = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        name: 'F-8 Markaz',
        name_preferred: 'F-8 Markaz',
        full_address: 'F-8 Markaz, Islamabad, Pakistan',
        coordinates: { latitude: 33.7073, longitude: 73.0353 },
        bbox: [73.030, 33.703, 73.040, 33.712] as [number, number, number, number],
      },
      geometry: { type: 'Point', coordinates: [73.0353, 33.7073] },
    },
    {
      type: 'Feature',
      properties: {
        name: 'Gulshan-e-Iqbal',
        full_address: 'Gulshan-e-Iqbal, Karachi, Pakistan',
        coordinates: { latitude: 24.9200, longitude: 67.0900 },
      },
      geometry: { type: 'Point', coordinates: [67.0900, 24.9200] },
    },
  ],
};

const FIXTURE_REVERSE = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        name: 'Constitution Avenue',
        full_address: 'Constitution Avenue, Islamabad, Pakistan',
        coordinates: { latitude: 33.7294, longitude: 73.0931 },
      },
      geometry: { type: 'Point', coordinates: [73.0931, 33.7294] },
    },
  ],
};

describe('geocode', () => {
  const originalFetch = global.fetch;
  const originalToken = process.env.MAPBOX_GEOCODING_TOKEN;

  beforeEach(() => {
    process.env.MAPBOX_GEOCODING_TOKEN = 'test-token';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalToken === undefined) {
      delete process.env.MAPBOX_GEOCODING_TOKEN;
    } else {
      process.env.MAPBOX_GEOCODING_TOKEN = originalToken;
    }
    vi.restoreAllMocks();
  });

  it('returns parsed features from Mapbox v6 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => FIXTURE_FORWARD,
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const results: GeocodeResult[] = await geocode('F-8 Markaz');
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      name: 'F-8 Markaz, Islamabad, Pakistan',
      lat: 33.7073,
      lng: 73.0353,
    });
    expect(results[0].bbox).toEqual([73.030, 33.703, 73.040, 33.712]);
    expect(results[1].name).toBe('Gulshan-e-Iqbal, Karachi, Pakistan');
  });

  it('biases to Pakistan (country=pk)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => FIXTURE_FORWARD,
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await geocode('Liberty Market');
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain('country=pk');
    expect(calledUrl).toContain('access_token=test-token');
    expect(calledUrl).toContain('/search/geocode/v6/forward');
    expect(calledUrl).toContain('q=Liberty+Market');
    expect(calledUrl).toContain('bbox=');
  });

  it('returns empty array for empty query without calling fetch', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    expect(await geocode('   ')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws MapboxError with status on HTTP failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    await expect(geocode('anything')).rejects.toMatchObject({
      name: 'MapboxError',
      status: 429,
    });
  });

  it('throws MapboxError when token is missing', async () => {
    delete process.env.MAPBOX_GEOCODING_TOKEN;
    await expect(geocode('anything')).rejects.toBeInstanceOf(MapboxError);
  });

  it('handles missing features array gracefully', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ type: 'FeatureCollection' }),
    }) as unknown as typeof fetch;
    expect(await geocode('nowhere')).toEqual([]);
  });
});

describe('reverseGeocode', () => {
  const originalFetch = global.fetch;
  const originalToken = process.env.MAPBOX_GEOCODING_TOKEN;

  beforeEach(() => {
    process.env.MAPBOX_GEOCODING_TOKEN = 'test-token';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalToken === undefined) {
      delete process.env.MAPBOX_GEOCODING_TOKEN;
    } else {
      process.env.MAPBOX_GEOCODING_TOKEN = originalToken;
    }
    vi.restoreAllMocks();
  });

  it('returns the first feature address string', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => FIXTURE_REVERSE,
    }) as unknown as typeof fetch;

    const addr = await reverseGeocode(33.7294, 73.0931);
    expect(addr).toBe('Constitution Avenue, Islamabad, Pakistan');
  });

  it('passes lat/lng in the correct query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => FIXTURE_REVERSE,
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await reverseGeocode(24.8607, 67.0011);
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain('/search/geocode/v6/reverse');
    expect(calledUrl).toContain('latitude=24.8607');
    expect(calledUrl).toContain('longitude=67.0011');
  });

  it('returns empty string when no features match', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ type: 'FeatureCollection', features: [] }),
    }) as unknown as typeof fetch;

    expect(await reverseGeocode(0, 0)).toBe('');
  });

  it('rejects out-of-range coordinates before hitting Mapbox', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(reverseGeocode(95, 0)).rejects.toBeInstanceOf(MapboxError);
    await expect(reverseGeocode(0, 200)).rejects.toBeInstanceOf(MapboxError);
    await expect(reverseGeocode(Number.NaN, 0)).rejects.toBeInstanceOf(MapboxError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws MapboxError with status on HTTP failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    await expect(reverseGeocode(33, 73)).rejects.toMatchObject({
      name: 'MapboxError',
      status: 401,
    });
  });
});
