/**
 * Unit tests for the pure helpers exported from
 * `scripts/seed-marketplace-pilots.ts`.
 *
 * We deliberately only cover the side-effect-free helpers here — anything that
 * touches Supabase (ensureAuthUser, seedOneSalon, main) is integration surface
 * and is out of scope for unit tests.
 *
 * The goal is to prove:
 *   1. The env-guard refuses to run against prod hostnames.
 *   2. Slug generation is deterministic + correctly shaped.
 *   3. Photo URL parsing rejects non-Unsplash-image hosts.
 *   4. Photo picker returns distinct + deterministic choices for a given seed.
 *   5. Requirements check matches `allRequirementsMet` semantics (shared with
 *      the live publish path).
 *   6. Consumer pool generation produces the expected count + unique emails.
 *   7. Password + credentials file formatting matches the contract callers
 *      rely on (CSV shape, header comments, minimum entropy).
 */

import { describe, expect, it } from 'vitest';

import {
  PROD_HOSTNAME_PATTERNS,
  PILOT_PHOTO_POOL,
  PILOT_SERVICE_TEMPLATE,
  PILOT_SPECS,
  PILOT_WORKING_HOURS,
  REVIEW_COMMENT_POOL,
  checkEnvGuards,
  formatConsumerCredentialsFile,
  generateConsumerPassword,
  generateConsumerPool,
  parsePhotoUrlList,
  pickPhotos,
  pilotRequirementsCheck,
  pilotSlug,
  urlTargetsProd,
} from '../scripts/seed-marketplace-pilots-helpers';

import { allRequirementsMet } from '../src/lib/marketplace/settings-shared';

describe('urlTargetsProd', () => {
  it('returns true for every known prod hostname pattern', () => {
    for (const p of PROD_HOSTNAME_PATTERNS) {
      expect(urlTargetsProd(`https://${p}/something`)).toBe(true);
    }
  });

  it('returns true regardless of protocol or path', () => {
    expect(urlTargetsProd('postgres://u:p@91.99.117.168:5432/db')).toBe(true);
    expect(urlTargetsProd('https://supabase.icut.pk')).toBe(true);
    expect(urlTargetsProd('https://ICUT.PK/api')).toBe(true); // case-insensitive
  });

  it('returns false for localhost, staging, and undefined', () => {
    expect(urlTargetsProd('http://localhost:54321')).toBe(false);
    expect(urlTargetsProd('https://staging.example.com')).toBe(false);
    expect(urlTargetsProd(undefined)).toBe(false);
    expect(urlTargetsProd(null)).toBe(false);
    expect(urlTargetsProd('')).toBe(false);
  });
});

describe('checkEnvGuards', () => {
  const baseEnv = {
    SUPABASE_URL: 'http://localhost:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-fake',
  } as NodeJS.ProcessEnv;

  it('passes on localhost + service role', () => {
    expect(checkEnvGuards({ ...baseEnv })).toEqual({ ok: true });
  });

  it('rejects NODE_ENV=production', () => {
    const res = checkEnvGuards({ ...baseEnv, NODE_ENV: 'production' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/production/);
  });

  it('rejects when SUPABASE_URL points at prod VPS', () => {
    const res = checkEnvGuards({ ...baseEnv, SUPABASE_URL: 'https://91.99.117.168' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/prod host/i);
  });

  it('rejects when DATABASE_URL points at prod domain', () => {
    const res = checkEnvGuards({
      ...baseEnv,
      DATABASE_URL: 'postgres://u:p@supabase.icut.pk/db',
    });
    expect(res.ok).toBe(false);
  });

  it('rejects when NEXT_PUBLIC_SUPABASE_URL points at prod', () => {
    const res = checkEnvGuards({
      ...baseEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'https://icut.pk',
    });
    expect(res.ok).toBe(false);
  });

  it('rejects when SUPABASE_URL is missing', () => {
    const res = checkEnvGuards({ SUPABASE_SERVICE_ROLE_KEY: 'k' } as NodeJS.ProcessEnv);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/SUPABASE_URL/);
  });

  it('rejects when service-role key is missing', () => {
    const res = checkEnvGuards({ SUPABASE_URL: 'http://localhost:54321' } as NodeJS.ProcessEnv);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/SERVICE_ROLE/);
  });
});

describe('pilotSlug', () => {
  it('prefixes every slug with pilot- and kebab-cases name + city', () => {
    expect(pilotSlug('Haider Barbers', 'Karachi')).toBe('pilot-haider-barbers-karachi');
  });

  it('strips diacritics and punctuation', () => {
    expect(pilotSlug("Khan's Saloon!", 'Lahore')).toBe('pilot-khan-s-saloon-lahore');
  });

  it('is idempotent for the same inputs', () => {
    expect(pilotSlug('Capital Cuts', 'Islamabad')).toBe(
      pilotSlug('Capital Cuts', 'Islamabad'),
    );
  });

  it('the slug on every PILOT_SPEC matches the generator', () => {
    for (const spec of PILOT_SPECS) {
      expect(spec.slug).toBe(pilotSlug(spec.name, spec.cityName));
    }
  });
});

describe('parsePhotoUrlList', () => {
  it('accepts a whitespace-separated string of Unsplash URLs', () => {
    const raw = `${PILOT_PHOTO_POOL[0]}  ${PILOT_PHOTO_POOL[1]}`;
    const out = parsePhotoUrlList(raw);
    expect(out).toEqual([PILOT_PHOTO_POOL[0], PILOT_PHOTO_POOL[1]]);
  });

  it('accepts a comma-separated string', () => {
    const raw = `${PILOT_PHOTO_POOL[0]},${PILOT_PHOTO_POOL[1]}`;
    expect(parsePhotoUrlList(raw)).toEqual([PILOT_PHOTO_POOL[0], PILOT_PHOTO_POOL[1]]);
  });

  it('accepts an array as-is', () => {
    expect(parsePhotoUrlList([PILOT_PHOTO_POOL[0]])).toEqual([PILOT_PHOTO_POOL[0]]);
  });

  it('rejects non-images.unsplash.com hosts', () => {
    const raw =
      'https://unsplash.com/photos/abc https://cdn.example.com/a.jpg ' +
      PILOT_PHOTO_POOL[0];
    expect(parsePhotoUrlList(raw)).toEqual([PILOT_PHOTO_POOL[0]]);
  });

  it('returns an empty array for empty input', () => {
    expect(parsePhotoUrlList('')).toEqual([]);
    expect(parsePhotoUrlList([])).toEqual([]);
  });
});

describe('pickPhotos', () => {
  it('returns exactly N photos when N < pool size', () => {
    expect(pickPhotos(1, 5).length).toBe(5);
    expect(pickPhotos(7, 3).length).toBe(3);
  });

  it('returns the full pool (copy) when N >= pool size', () => {
    const out = pickPhotos(1, 999);
    expect(out.length).toBe(PILOT_PHOTO_POOL.length);
    expect(out).toEqual([...PILOT_PHOTO_POOL]);
    // must be a copy, not a reference
    expect(out).not.toBe(PILOT_PHOTO_POOL);
  });

  it('returns [] for N <= 0', () => {
    expect(pickPhotos(1, 0)).toEqual([]);
    expect(pickPhotos(1, -1)).toEqual([]);
  });

  it('is deterministic for the same seed', () => {
    expect(pickPhotos(42, 4)).toEqual(pickPhotos(42, 4));
  });

  it('produces distinct entries (no duplicates within one pick)', () => {
    const out = pickPhotos(123, 5);
    expect(new Set(out).size).toBe(out.length);
  });

  it('every returned URL comes from the pool', () => {
    const out = pickPhotos(9, 5);
    for (const u of out) expect(PILOT_PHOTO_POOL.includes(u)).toBe(true);
  });
});

describe('pilotRequirementsCheck', () => {
  const spec = PILOT_SPECS[0];

  it('returns all-true for a fully populated spec with 5 photos + active service', () => {
    const req = pilotRequirementsCheck(spec, PILOT_PHOTO_POOL.slice(0, 5), true);
    expect(req).toEqual({
      hasThreePhotos: true,
      hasAbout: true,
      hasPin: true,
      hasCity: true,
      hasActiveService: true,
      hasGenderType: true,
    });
    expect(allRequirementsMet(req)).toBe(true);
  });

  it('flags hasThreePhotos=false when photo count < 3', () => {
    const req = pilotRequirementsCheck(spec, [PILOT_PHOTO_POOL[0]], true);
    expect(req.hasThreePhotos).toBe(false);
    expect(allRequirementsMet(req)).toBe(false);
  });

  it('flags hasActiveService=false when no service is active', () => {
    const req = pilotRequirementsCheck(spec, PILOT_PHOTO_POOL.slice(0, 3), false);
    expect(req.hasActiveService).toBe(false);
    expect(allRequirementsMet(req)).toBe(false);
  });

  it('every PILOT_SPEC about text clears ABOUT_MIN_CHARS (100)', () => {
    for (const s of PILOT_SPECS) {
      expect(s.about.trim().length).toBeGreaterThanOrEqual(100);
    }
  });

  it('every PILOT_SPEC has a valid lat/lng pair', () => {
    for (const s of PILOT_SPECS) {
      expect(s.lat).toBeGreaterThan(23);
      expect(s.lat).toBeLessThan(35);
      expect(s.lng).toBeGreaterThan(66);
      expect(s.lng).toBeLessThan(75);
    }
  });
});

describe('PILOT_SERVICE_TEMPLATE', () => {
  it('contains exactly 6 services (spec: "6 services with realistic PKR prices")', () => {
    expect(PILOT_SERVICE_TEMPLATE.length).toBe(6);
  });

  it('includes Haircut at 1500 and Beard Trim at 500 (spec examples)', () => {
    const haircut = PILOT_SERVICE_TEMPLATE.find((s) => s.name === 'Haircut');
    const beard = PILOT_SERVICE_TEMPLATE.find((s) => s.name === 'Beard Trim');
    expect(haircut?.base_price).toBe(1500);
    expect(beard?.base_price).toBe(500);
  });

  it('every service has a valid category from the services enum', () => {
    const valid = new Set([
      'haircut', 'color', 'treatment', 'facial', 'waxing',
      'bridal', 'nails', 'massage', 'beard', 'other',
    ]);
    for (const s of PILOT_SERVICE_TEMPLATE) expect(valid.has(s.category)).toBe(true);
  });

  it('every service has positive duration + base_price', () => {
    for (const s of PILOT_SERVICE_TEMPLATE) {
      expect(s.duration_minutes).toBeGreaterThan(0);
      expect(s.base_price).toBeGreaterThan(0);
    }
  });
});

describe('PILOT_WORKING_HOURS', () => {
  it('sets Mon-Sat open 10:00-22:00', () => {
    for (const day of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const) {
      expect(PILOT_WORKING_HOURS[day].open).toBe('10:00');
      expect(PILOT_WORKING_HOURS[day].close).toBe('22:00');
      expect(PILOT_WORKING_HOURS[day].off).toBe(false);
    }
  });

  it('closes on Sunday', () => {
    expect(PILOT_WORKING_HOURS.sun.off).toBe(true);
  });
});

describe('PILOT_SPECS', () => {
  it('has exactly 3 salons (spec: 3 pilot salons)', () => {
    expect(PILOT_SPECS.length).toBe(3);
  });

  it('covers Karachi, Lahore, Islamabad', () => {
    const cities = new Set(PILOT_SPECS.map((s) => s.cityName));
    expect(cities).toEqual(new Set(['Karachi', 'Lahore', 'Islamabad']));
  });

  it('every salon UUID uses the seeder prefix 10000000', () => {
    for (const spec of PILOT_SPECS) {
      expect(spec.id.startsWith('10000000-0000')).toBe(true);
      expect(spec.branchId.startsWith('10000001-0000')).toBe(true);
    }
  });

  it('2 of 3 salons offer home service with 10 km radius (spec)', () => {
    const homeEnabled = PILOT_SPECS.filter((s) => s.offersHomeService);
    expect(homeEnabled.length).toBe(2);
    for (const s of homeEnabled) expect(s.homeServiceRadiusKm).toBe(10);
  });
});

describe('generateConsumerPassword', () => {
  it('produces a 20-char password with no ambiguous chars', () => {
    for (let i = 0; i < 20; i++) {
      const pw = generateConsumerPassword();
      expect(pw.length).toBe(20);
      expect(pw).not.toMatch(/[0OIl1]/);
    }
  });

  it('passwords are overwhelmingly distinct', () => {
    const pool = new Set<string>();
    for (let i = 0; i < 100; i++) pool.add(generateConsumerPassword());
    // Birthday-paradox collision over 55^20 alphabet is effectively zero.
    expect(pool.size).toBe(100);
  });
});

describe('generateConsumerPool', () => {
  it('produces 12 accounts by default (in the 10-15 band)', () => {
    const pool = generateConsumerPool();
    expect(pool.length).toBe(12);
    expect(pool.length).toBeGreaterThanOrEqual(10);
    expect(pool.length).toBeLessThanOrEqual(15);
  });

  it('all emails follow the pilot-consumer-N@icut-test.dev pattern', () => {
    const pool = generateConsumerPool(12);
    for (let i = 0; i < pool.length; i++) {
      expect(pool[i].email).toBe(`pilot-consumer-${i + 1}@icut-test.dev`);
    }
  });

  it('all emails are unique', () => {
    const pool = generateConsumerPool(15);
    expect(new Set(pool.map((c) => c.email)).size).toBe(15);
  });

  it('all phones start with +92', () => {
    for (const c of generateConsumerPool()) expect(c.phone.startsWith('+92')).toBe(true);
  });

  it('respects custom count', () => {
    expect(generateConsumerPool(10).length).toBe(10);
    expect(generateConsumerPool(15).length).toBe(15);
  });
});

describe('formatConsumerCredentialsFile', () => {
  it('includes the DEV/STAGING warning header', () => {
    const out = formatConsumerCredentialsFile([]);
    expect(out).toMatch(/DEV \/ STAGING/i);
    expect(out).toMatch(/Do NOT commit/);
  });

  it('is a well-formed CSV (header + one row per cred)', () => {
    const creds = generateConsumerPool(3);
    const out = formatConsumerCredentialsFile(creds);
    const lines = out.split('\n').filter((l) => !l.startsWith('#') && l.trim() !== '');
    expect(lines[0]).toBe('email,password,phone,name');
    expect(lines.length).toBe(1 + creds.length);
    for (let i = 0; i < creds.length; i++) {
      const cols = lines[i + 1].split(',');
      expect(cols[0]).toBe(creds[i].email);
      expect(cols[1]).toBe(creds[i].password);
      expect(cols[2]).toBe(creds[i].phone);
      expect(cols[3]).toBe(creds[i].name);
    }
  });

  it('includes an ISO timestamp in the generated-at header', () => {
    const out = formatConsumerCredentialsFile([]);
    expect(out).toMatch(/Generated at: \d{4}-\d{2}-\d{2}T/);
  });
});

describe('REVIEW_COMMENT_POOL', () => {
  it('every entry is a 4-star or 5-star review (matches spec)', () => {
    for (const r of REVIEW_COMMENT_POOL) {
      expect([4, 5]).toContain(r.rating);
    }
  });

  it('has enough entries to cover 5-8 bookings per salon without hammering a single comment', () => {
    expect(REVIEW_COMMENT_POOL.length).toBeGreaterThanOrEqual(8);
  });
});
