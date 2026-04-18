/**
 * Pure helpers for `scripts/seed-marketplace-pilots.ts`.
 *
 * Split into its own file so `test/seed-marketplace-pilots.test.ts` can import
 * these without pulling in `@supabase/auth-helpers-nextjs` (which transitively
 * loads the Next.js runtime at module-eval time and deadlocks vitest's worker
 * during test collection).
 *
 * Rule of thumb: anything side-effect-free + synchronous lives here. Anything
 * that talks to Supabase, writes to the filesystem, or calls `fetch()` stays
 * in the main script.
 */
import { randomBytes } from 'node:crypto';

import {
  ABOUT_MIN_CHARS,
  type ListingRequirements,
} from '../src/lib/marketplace/settings-shared';

// ═════════════════════════════════════════════════════════════════════════════
// Env guards
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Known prod hostnames the seed script must never connect to. Matches both the
 * self-hosted Supabase VPS IP and the user-facing domain. If a dev accidentally
 * sets SUPABASE_URL to prod, we bail before any write.
 */
export const PROD_HOSTNAME_PATTERNS: readonly string[] = [
  '91.99.117.168',
  '138.199.175.90',
  'icut.pk',
  'supabase.icut.pk',
];

/** True when any prod hostname pattern appears in the candidate URL. */
export function urlTargetsProd(url: string | undefined | null): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return PROD_HOSTNAME_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}

/**
 * Guard entry point. Returns `{ ok: true }` when the script may proceed.
 * Returns `{ ok: false, reason }` when the caller must abort.
 *
 * Extracted from main() so the unit tests can exercise every branch without
 * spinning up Supabase.
 */
export function checkEnvGuards(
  env: NodeJS.ProcessEnv,
): { ok: true } | { ok: false; reason: string } {
  if (env.NODE_ENV === 'production') {
    return { ok: false, reason: 'NODE_ENV=production — seed script is dev-only' };
  }
  const targets = [env.SUPABASE_URL, env.DATABASE_URL, env.NEXT_PUBLIC_SUPABASE_URL];
  for (const target of targets) {
    if (urlTargetsProd(target)) {
      return {
        ok: false,
        reason: `Database URL points at a known prod host (${target}) — refusing to seed`,
      };
    }
  }
  if (!env.SUPABASE_URL) {
    return { ok: false, reason: 'SUPABASE_URL env is required' };
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, reason: 'SUPABASE_SERVICE_ROLE_KEY env is required' };
  }
  return { ok: true };
}

// ═════════════════════════════════════════════════════════════════════════════
// Slugs + photos
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Slugify a salon name for use as the branch.slug.
 *
 * Pilot slugs are always prefixed `pilot-` so they're trivially identifiable in
 * the DB and easy to wipe with a single query. The suffix is kebab-case from
 * the salon name + city, mirroring the live slug format from
 * `src/lib/marketplace/slug.ts`.
 *
 * @example
 *   pilotSlug('Haider Barbers', 'Karachi') // => 'pilot-haider-barbers-karachi'
 */
export function pilotSlug(salonName: string, cityName: string): string {
  const clean = (s: string) =>
    s
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  return `pilot-${clean(salonName)}-${clean(cityName)}`;
}

/**
 * Unsplash URLs for barbershop photos, all hosted under `images.unsplash.com`
 * so the returned link is directly renderable in an <img> without the
 * `utm_source` tracking-parameter dance. We use the `?w=1200&q=80` sizing
 * query so each image lands <500KB.
 *
 * These are real barbershop photos under the Unsplash License
 * (https://unsplash.com/license — free commercial and non-commercial use, no
 * permission needed). Five per salon matches the deliverable spec.
 */
export const PILOT_PHOTO_POOL: readonly string[] = [
  'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=1200&q=80',
  'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=1200&q=80',
  'https://images.unsplash.com/photo-1521322800607-8c38375eef04?w=1200&q=80',
  'https://images.unsplash.com/photo-1622296089863-eb7fc530daa8?w=1200&q=80',
  'https://images.unsplash.com/photo-1596728325488-58c87691e9af?w=1200&q=80',
  'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=1200&q=80',
  'https://images.unsplash.com/photo-1512690459411-b9245aed614b?w=1200&q=80',
  'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=1200&q=80',
];

/**
 * Parse a whitespace- or comma-separated list of Unsplash URLs and return only
 * those that are actual `https://images.unsplash.com/...` entries. Protects
 * against a careless paste that slipped in a bare `unsplash.com/photos/...`
 * page URL (not a raw image) or a tracking link.
 *
 * Returns a fresh array; never mutates the input.
 */
export function parsePhotoUrlList(raw: string | string[]): string[] {
  const tokens = Array.isArray(raw)
    ? raw
    : raw
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
  const out: string[] = [];
  for (const t of tokens) {
    if (/^https:\/\/images\.unsplash\.com\/[A-Za-z0-9_\-?=&%.]+$/.test(t)) {
      out.push(t);
    }
  }
  return out;
}

/**
 * Pick N distinct photos from the pool. Deterministic w.r.t. the `seed` arg so
 * two runs with the same seed produce the same five photos.
 *
 * Implementation note: we use Math.imul for the LCG multiplication because a
 * naive `state * 1103515245` overflows JS's double-precision mantissa (≈ 2^53)
 * whenever `state` is near 2^31, which then breaks the `& 0x7fffffff` mask and
 * lands the PRNG on a fixed point — manifesting as an infinite loop while
 * waiting for the next unused index. Math.imul performs a true 32-bit signed
 * multiply, which is what glibc's rand() assumes.
 */
export function pickPhotos(seed: number, n: number): string[] {
  if (n <= 0) return [];
  if (n >= PILOT_PHOTO_POOL.length) return [...PILOT_PHOTO_POOL];
  const out: string[] = [];
  const used = new Set<number>();
  let state = Math.max(1, Math.floor(seed)) | 0;
  // Cap iterations as a belt-and-suspenders guard — we should converge in at
  // most O(pool_size) steps for any sane input, but an infinite loop would
  // deadlock the seeder + tests so we'd rather throw a deterministic error.
  const maxIter = PILOT_PHOTO_POOL.length * 32;
  for (let i = 0; i < maxIter && out.length < n; i++) {
    state = (Math.imul(state, 1103515245) + 12345) & 0x7fffffff;
    const idx = state % PILOT_PHOTO_POOL.length;
    if (!used.has(idx)) {
      used.add(idx);
      out.push(PILOT_PHOTO_POOL[idx]);
    }
  }
  // Fallback: if the PRNG somehow failed to cover `n` distinct indices, fill
  // the remainder in-order from the pool so we never return a short list.
  for (let i = 0; out.length < n && i < PILOT_PHOTO_POOL.length; i++) {
    if (!used.has(i)) {
      used.add(i);
      out.push(PILOT_PHOTO_POOL[i]);
    }
  }
  return out;
}

// ═════════════════════════════════════════════════════════════════════════════
// Services + working hours
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Men-only launch requires a services menu that maps cleanly to the
 * marketplace taxonomy in migration 041. We ship 6 services per salon with
 * realistic PKR prices. Category strings must match the enum from
 * `services.category` (001_initial_schema: haircut, beard, color, facial,
 * waxing, bridal, nails, massage, treatment, other).
 */
export interface PilotService {
  name: string;
  category: 'haircut' | 'beard' | 'color' | 'facial' | 'massage' | 'treatment' | 'other';
  duration_minutes: number;
  base_price: number;
}

export const PILOT_SERVICE_TEMPLATE: readonly PilotService[] = [
  { name: 'Haircut', category: 'haircut', duration_minutes: 30, base_price: 1500 },
  { name: 'Beard Trim', category: 'beard', duration_minutes: 20, base_price: 500 },
  { name: 'Hot Towel Shave', category: 'beard', duration_minutes: 30, base_price: 800 },
  { name: 'Hair Color (Men)', category: 'color', duration_minutes: 60, base_price: 2500 },
  { name: 'Head Massage', category: 'massage', duration_minutes: 25, base_price: 1000 },
  { name: 'Facial (Men)', category: 'facial', duration_minutes: 45, base_price: 2000 },
];

/**
 * Default working hours for a pilot: Mon-Sat 10:00-22:00, Sun closed. Matches
 * the spec ("Mon-Sat 10am-10pm Sun closed") and the JSONB shape expected by
 * `branches.working_hours` (001_initial_schema.sql L35).
 */
export const PILOT_WORKING_HOURS = {
  mon: { open: '10:00', close: '22:00', off: false },
  tue: { open: '10:00', close: '22:00', off: false },
  wed: { open: '10:00', close: '22:00', off: false },
  thu: { open: '10:00', close: '22:00', off: false },
  fri: { open: '10:00', close: '22:00', off: false, jummah_break: true },
  sat: { open: '10:00', close: '22:00', off: false },
  sun: { open: '10:00', close: '22:00', off: true },
} as const;

// ═════════════════════════════════════════════════════════════════════════════
// Pilot salon specs + requirements check
// ═════════════════════════════════════════════════════════════════════════════

export interface PilotSalonSpec {
  id: string; // salon uuid with 10000000 prefix
  branchId: string; // branch uuid with 10000001 prefix
  name: string;
  slug: string;
  cityName: 'Karachi' | 'Lahore' | 'Islamabad';
  neighborhood: string;
  address: string;
  phone: string;
  lat: number;
  lng: number;
  about: string;
  offersHomeService: boolean;
  homeServiceRadiusKm: number | null;
}

/**
 * Hand-tuned geo coordinates for the three pilot neighborhoods. Verified
 * against Google Maps (2026-04 data) and well within each city's bbox from
 * migration 041's cities seed.
 */
export const PILOT_SPECS: readonly PilotSalonSpec[] = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    branchId: '10000001-0000-4000-8000-000000000001',
    name: 'Haider Barbers',
    slug: 'pilot-haider-barbers-karachi',
    cityName: 'Karachi',
    neighborhood: 'Clifton Block 2',
    address: 'Shop 14, Bukhari Commercial, Clifton Block 2, Karachi',
    phone: '03001111201',
    lat: 24.8138,
    lng: 67.0299,
    about:
      "Haider Barbers has been cutting hair in Clifton Block 2 for over eleven years. Known locally for classic men's cuts, precise beard shaping, and hot-towel straight-razor shaves. Walk-ins welcome; appointments guaranteed on time. Every tool is sterilised between clients. We proudly serve the Clifton community six days a week and now offer home service across DHA and Clifton.",
    offersHomeService: true,
    homeServiceRadiusKm: 10,
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    branchId: '10000001-0000-4000-8000-000000000002',
    name: 'Khan Saloon',
    slug: 'pilot-khan-saloon-lahore',
    cityName: 'Lahore',
    neighborhood: 'DHA Phase 5',
    address: 'Plot 44-C, Commercial Area, DHA Phase 5, Lahore',
    phone: '03001111202',
    lat: 31.4723,
    lng: 74.4087,
    about:
      'Khan Saloon in DHA Phase 5 is a modern grooming studio for men. Our senior stylists specialise in fades, skin-fades, and bespoke beard sculpting. We use imported clippers and only professional-grade products from Schwarzkopf and L\u2019Or\u00e9al Men Expert. Clean, air-conditioned, punctual. Appointment recommended on weekends. Home service available across DHA Phase 5 and Phase 6.',
    offersHomeService: true,
    homeServiceRadiusKm: 10,
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    branchId: '10000001-0000-4000-8000-000000000003',
    name: 'Capital Cuts',
    slug: 'pilot-capital-cuts-islamabad',
    cityName: 'Islamabad',
    neighborhood: 'F-7 Markaz',
    address: 'Shop 3, Street 5, F-7 Markaz, Islamabad',
    phone: '03001111203',
    lat: 33.7151,
    lng: 73.0472,
    about:
      "Capital Cuts in F-7 Markaz is Islamabad's go-to for professional men's grooming. Our team trained in Dubai and London; every cut is consultation-first and finished with a complimentary hot-towel treatment. Open every day except Sunday, from 10 in the morning till 10 at night. Minimum wait on weekdays. We also run a membership card for regulars: every sixth haircut free.",
    offersHomeService: false,
    homeServiceRadiusKm: null,
  },
];

/**
 * Build the full ListingRequirements record for a pilot spec so we can run
 * the exact same check the server-side `updateMarketplaceListing` action
 * performs before flipping `listed_on_marketplace = true`. If this returns
 * false the seeder refuses to mark the branch published — the same as an
 * owner clicking Publish with an incomplete checklist.
 */
export function pilotRequirementsCheck(
  spec: PilotSalonSpec,
  photos: string[],
  hasActiveService: boolean,
): ListingRequirements {
  return {
    hasThreePhotos: photos.length >= 3,
    hasAbout:
      typeof spec.about === 'string' && spec.about.trim().length >= ABOUT_MIN_CHARS,
    hasPin: spec.lat != null && spec.lng != null,
    hasCity: true, // seed fills in city_id from the cities table at insert time
    hasActiveService,
    hasGenderType: true, // pilots are always 'men'
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Consumer credentials
// ═════════════════════════════════════════════════════════════════════════════

export interface PilotConsumerCredential {
  email: string;
  password: string;
  phone: string;
  name: string;
}

/**
 * Generate a random plaintext password for a pilot consumer. 20 chars from an
 * unambiguous alphabet (no 0/O/I/l/1 collisions). Used only locally — consumer
 * logs in via the standard `/login` flow with this password.
 */
export function generateConsumerPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const raw = randomBytes(24);
  let out = '';
  for (let i = 0; i < 20; i++) {
    out += alphabet[raw[i] % alphabet.length];
  }
  return out;
}

/**
 * Generate the pool of consumer credentials. 12 accounts (in the 10-15 band
 * requested by the spec). Emails follow the agreed `pilot-consumer-N@icut-test.dev`
 * pattern so they're easy to spot + bulk-delete later.
 */
export function generateConsumerPool(count = 12): PilotConsumerCredential[] {
  const firstNames = [
    'Asad', 'Bilal', 'Danish', 'Ehsan', 'Faizan', 'Ghulam',
    'Hamza', 'Imran', 'Junaid', 'Kamran', 'Luqman', 'Mudassir',
    'Nadeem', 'Omer', 'Qasim',
  ];
  const lastInitials = ['A.', 'B.', 'K.', 'M.', 'R.', 'S.'];
  const out: PilotConsumerCredential[] = [];
  for (let i = 1; i <= count; i++) {
    const first = firstNames[(i - 1) % firstNames.length];
    const last = lastInitials[(i - 1) % lastInitials.length];
    out.push({
      email: `pilot-consumer-${i}@icut-test.dev`,
      password: generateConsumerPassword(),
      phone: `+92300100${String(i).padStart(4, '0')}`,
      name: `${first} ${last}`,
    });
  }
  return out;
}

/**
 * Format the consumer credentials file. Plaintext on purpose — these are
 * disposable test accounts on dev/staging and go into a gitignored file.
 * Header calls out the environment constraint.
 */
export function formatConsumerCredentialsFile(
  creds: readonly PilotConsumerCredential[],
): string {
  const lines: string[] = [];
  lines.push('# Pilot consumer accounts — DEV / STAGING ONLY');
  lines.push('# Do NOT commit. Regenerated on every `npm run seed:marketplace-pilots` run.');
  lines.push(`# Generated at: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('email,password,phone,name');
  for (const c of creds) {
    lines.push(`${c.email},${c.password},${c.phone},${c.name}`);
  }
  lines.push('');
  return lines.join('\n');
}

// ═════════════════════════════════════════════════════════════════════════════
// Review fixtures
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Generate the sample review comment pool. We rotate through these on the
 * seeded COMPLETED bookings so each salon profile shows a mix of 4★ and 5★
 * feedback with real-looking text.
 */
export const REVIEW_COMMENT_POOL: readonly { rating: 4 | 5; comment: string }[] = [
  { rating: 5, comment: 'Best cut I\'ve had in Karachi. Punctual and very clean.' },
  { rating: 5, comment: 'Booked via iCut, walked in 10 min early, was done in 25 min. Amazing.' },
  { rating: 5, comment: 'My go-to barber now. Beard line-up was sharp.' },
  { rating: 4, comment: 'Good haircut, slight wait but worth it.' },
  { rating: 4, comment: 'Professional service. Will come again.' },
  { rating: 5, comment: 'Hot towel shave was excellent, felt like new.' },
  { rating: 5, comment: 'Home service arrived on time. Very neat and hygienic.' },
  { rating: 4, comment: 'Good value. Friendly staff.' },
];
