/**
 * Marketplace query layer — the single source of truth for the public
 * consumer directory pages (`/barbers`, `/barbers/[city]`, `/barber/[slug]`).
 *
 * Shape + cache semantics (per `docs/superpowers/plans/2026-04-18-marketplace-phase-0-1.md`,
 * "Week 2" + the "Routes" table):
 *
 *   - Every listing query is revalidated on a 6-hour cadence (`'hours'`
 *     profile in Next 16 Cache Components terminology — 1h revalidate /
 *     5m stale / 1d expire). That's fast enough to pick up new salons
 *     and rating changes, slow enough to keep the hot path cheap.
 *   - Tag-based invalidation: `marketplace:branches` purges every list
 *     query in one shot (used by superadmin flag/block actions and by
 *     salon opt-in saves); `branch:{id}` purges a single salon profile.
 *     Paired with `revalidateTag()` from server actions when they
 *     toggle `listed_on_marketplace`, flip `marketplace_admin_blocked_at`,
 *     or update rating aggregates.
 *
 * Why `unstable_cache` and not the `'use cache'` directive?
 *   Next 16's `'use cache'` + `cacheLife('hours')` + `cacheTag(...)` API
 *   requires the `cacheComponents: true` flag in `next.config.ts`. That
 *   flag is project-wide and flips the rendering model for ~68 existing
 *   pages (owner dashboard, admin, agent) — any uncached data fetch not
 *   guarded by `<Suspense>` becomes a build error. That audit is out of
 *   scope for this patch, and shipping the marketplace directory does
 *   not require it: `unstable_cache(fn, keys, { revalidate, tags })` is
 *   explicitly supported in Next 16 and delivers identical semantics
 *   (same cache key derivation, same tag-based invalidation, same
 *   revalidation interval). The migration to `'use cache'` is tracked
 *   in the 2026-04-18 marketplace plan under the Phase 2 notes.
 *
 * Filtering rules (gate for public visibility, all must be true):
 *   1. `branches.listed_on_marketplace = true`
 *   2. `branches.marketplace_admin_blocked_at IS NULL`  (superadmin kill switch)
 *   3. Gender gate: `branches.gender_type = 'men'`
 *         OR `platform_settings.marketplace_women_enabled = true`
 *      (men-only launch — women + mixed are hidden until superadmin flips
 *       the platform flag)
 *   4. Salon not blocked on either side:
 *         `salons.marketplace_payable_blocked_at IS NULL`
 *         AND `salons.marketplace_admin_blocked_at IS NULL`
 *   5. Mode-aware: when `mode === 'at_home'`, also require
 *         `branches.offers_home_service = true`.
 *
 * The SQL is expressed as a `!inner` join to `salons` with predicates on
 * the joined columns — PostgREST renders this as a single query with a
 * server-side filter, so we don't ship a bag of branches that later need
 * trimming in Node. See "key filter SQL" comment block on
 * `listedBranchQuery()` below.
 */

import { unstable_cache } from 'next/cache';

import { createServerClient } from '@/lib/supabase';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

/** Consumer-facing mode — canonical definition in `./mode`. Re-exported here
 * so existing callers that imported from this module keep working. */
export type { MarketplaceMode } from './mode';
import type { MarketplaceMode } from './mode';

/** A city row, trimmed to the columns the consumer UI actually reads. */
export interface City {
  id: string;
  slug: string;
  name: string;
  display_order: number;
}

/** A single card entry in the directory grid. */
export interface BranchListItem {
  id: string;
  name: string;
  slug: string;
  city_slug: string | null;
  /** First photo URL from `branches.photos[]`, or null if the owner hasn't uploaded any. */
  photo: string | null;
  /** Numeric 0.00–5.00 average, or null if no reviews yet. */
  rating_avg: number | null;
  rating_count: number;
  /** First ~180 chars of `branches.about`, trimmed on a word boundary. */
  about_preview: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Cache-tag constants — referenced by server actions that mutate marketplace
// state so they can invalidate precisely (`revalidateTag(MARKETPLACE_BRANCHES_TAG)`).
// ═══════════════════════════════════════════════════════════════════════════

export const MARKETPLACE_BRANCHES_TAG = 'marketplace:branches';
export const PLATFORM_SETTINGS_TAG = 'marketplace:platform-settings';
export const CITIES_TAG = 'marketplace:cities';

/** Per-branch tag used for salon profile (`/barber/[slug]`) invalidation. */
export function branchTag(branchId: string): string {
  return `branch:${branchId}`;
}

/**
 * 6-hour revalidation (per the marketplace plan's "static + ISR 6h" row).
 * Kept as a named constant so tests and call sites agree.
 */
const SIX_HOURS_SECONDS = 60 * 60 * 6;

// ═══════════════════════════════════════════════════════════════════════════
// Internal helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pull the first photo URL from a `branches.photos` jsonb value. The column
 * is `jsonb NOT NULL DEFAULT '[]'::jsonb`, but row-level contents are owner
 * input so we defensively handle `null`, non-arrays, and missing `url`
 * fields without crashing the page.
 */
function firstPhotoUrl(photos: unknown): string | null {
  if (!Array.isArray(photos) || photos.length === 0) return null;
  const first = photos[0];
  if (first && typeof first === 'object' && 'url' in first) {
    const url = (first as { url?: unknown }).url;
    return typeof url === 'string' && url.length > 0 ? url : null;
  }
  return null;
}

/**
 * Trim an `about` text to ~180 chars on a word boundary, suffixing `…` when
 * truncated. Returns `null` for null/empty input so the UI can render a
 * tasteful fallback instead of an empty string.
 */
function aboutPreview(about: string | null | undefined): string | null {
  if (!about) return null;
  const trimmed = about.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= 180) return trimmed;
  const cut = trimmed.slice(0, 180);
  const lastSpace = cut.lastIndexOf(' ');
  const safe = lastSpace > 120 ? cut.slice(0, lastSpace) : cut;
  return safe.trimEnd() + '…';
}

/**
 * Row shape returned by the joined `branches` + `salons` + `cities` select.
 * The embedded relations come back as nested objects per PostgREST; when the
 * row fails the `!inner` join it's dropped, never emitted with a null
 * relation — so we type them as non-null and let a runtime guard drop any
 * edge case that slips through.
 */
interface JoinedBranchRow {
  id: string;
  name: string;
  slug: string | null;
  photos: unknown;
  about: string | null;
  rating_avg: number | null;
  rating_count: number;
  gender_type: string | null;
  offers_home_service: boolean;
  listed_on_marketplace: boolean;
  marketplace_admin_blocked_at: string | null;
  cities: { slug: string } | { slug: string }[] | null;
  salons: {
    marketplace_payable_blocked_at: string | null;
    marketplace_admin_blocked_at: string | null;
  } | Array<{
    marketplace_payable_blocked_at: string | null;
    marketplace_admin_blocked_at: string | null;
  }> | null;
}

/** PostgREST may flatten a to-one relation into either an object or a single-element array. */
function oneOf<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel;
}

/**
 * Shape a joined row into a `BranchListItem`. Also applies the salon-block
 * filter in Node — the DB query already filters by `!inner` join, but the
 * double-check keeps the function honest against schema drift or accidental
 * changes to the PostgREST filter string.
 */
function toBranchListItem(row: JoinedBranchRow): BranchListItem | null {
  const salon = oneOf(row.salons);
  if (!salon) return null;
  if (salon.marketplace_payable_blocked_at !== null) return null;
  if (salon.marketplace_admin_blocked_at !== null) return null;
  if (row.marketplace_admin_blocked_at !== null) return null;
  if (!row.listed_on_marketplace) return null;
  if (!row.slug) return null; // sentinel — unlisted branches get placeholder slugs

  const city = oneOf(row.cities);

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    city_slug: city?.slug ?? null,
    photo: firstPhotoUrl(row.photos),
    rating_avg: row.rating_avg ?? null,
    rating_count: row.rating_count ?? 0,
    about_preview: aboutPreview(row.about),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Platform settings + cities — cheap lookups, heavily cached
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Read the `marketplace_women_enabled` flag from `platform_settings`. The row
 * is seeded `false` in migration 041; superadmin flips it via the admin
 * marketplace settings page.
 *
 * We default to `false` on any error so a transient DB blip never silently
 * exposes women/mixed salons during men-only launch.
 */
export const isMarketplaceWomenEnabled = unstable_cache(
  async (): Promise<boolean> => {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('platform_settings')
      .select('value')
      .eq('key', 'marketplace_women_enabled')
      .maybeSingle();

    if (error || !data) return false;
    // `value` is jsonb; the seed stores a bare boolean (`'false'::jsonb`).
    return data.value === true;
  },
  ['marketplace:women-enabled'],
  { revalidate: SIX_HOURS_SECONDS, tags: [PLATFORM_SETTINGS_TAG] },
);

/**
 * Return every active city ordered by `display_order`. The 5 seeded cities
 * (Karachi, Lahore, Islamabad, Rawalpindi, Faisalabad) fit in a single page
 * — we don't paginate.
 */
export const getAllCities = unstable_cache(
  async (): Promise<City[]> => {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('cities')
      .select('id, slug, name, display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error || !data) return [];
    return data as City[];
  },
  ['marketplace:cities:all'],
  { revalidate: SIX_HOURS_SECONDS, tags: [CITIES_TAG] },
);

/**
 * Single city by slug; returns `null` if the slug doesn't exist or the row is
 * marked inactive (`is_active = false`).
 */
export async function getCityBySlug(slug: string): Promise<City | null> {
  const cached = unstable_cache(
    async (s: string): Promise<City | null> => {
      const supabase = createServerClient();
      const { data, error } = await supabase
        .from('cities')
        .select('id, slug, name, display_order')
        .eq('slug', s)
        .eq('is_active', true)
        .maybeSingle();

      if (error || !data) return null;
      return data as City;
    },
    ['marketplace:city-by-slug', slug],
    { revalidate: SIX_HOURS_SECONDS, tags: [CITIES_TAG] },
  );
  return cached(slug);
}

// ═══════════════════════════════════════════════════════════════════════════
// Branch directory queries
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Options accepted by the public directory queries.
 *
 *   - `mode` (required): `'at_home'` activates the `offers_home_service`
 *     filter and is driven by the consumer-side `icut-mode` cookie.
 *   - `limit` (optional): caps the number of rows returned. Featured lists
 *     use 6; directory pages typically pass nothing and let the page layer
 *     render whatever the query returns (cap at 200 below to keep the
 *     payload bounded).
 */
export interface GetBranchesOpts {
  mode: MarketplaceMode;
  limit?: number;
}

/**
 * Core select + join used by every listing query. Expressed as a single
 * PostgREST `.select()` with embedded `!inner` resources so the SQL that
 * Supabase emits server-side is:
 *
 *     SELECT b.*, c.slug, s.marketplace_payable_blocked_at, s.marketplace_admin_blocked_at
 *     FROM branches b
 *     JOIN salons s ON s.id = b.salon_id
 *     LEFT JOIN cities c ON c.id = b.city_id
 *     WHERE b.listed_on_marketplace = true
 *       AND b.marketplace_admin_blocked_at IS NULL
 *       AND s.marketplace_payable_blocked_at IS NULL
 *       AND s.marketplace_admin_blocked_at IS NULL
 *       [AND b.offers_home_service = true]   -- home mode
 *       [AND b.gender_type = 'men']          -- men-only launch gate
 *       [AND c.slug = $citySlug]             -- city directory
 *     ORDER BY b.rating_avg DESC NULLS LAST, b.rating_count DESC
 *     LIMIT $limit
 */
async function fetchListedBranches(args: {
  mode: MarketplaceMode;
  citySlug: string | null;
  limit: number;
  womenEnabled: boolean;
  orderByRating: boolean;
}): Promise<BranchListItem[]> {
  const supabase = createServerClient();

  // `!inner` on salons is what enforces the salon-block filter — without it
  // a branch whose salon is blocked would still appear with a null `salons`
  // relation. Keep the cities join as a plain LEFT JOIN; city is optional
  // data for the card, we still want to render the row even if city is not
  // yet backfilled (shouldn't happen in prod, but keep it defensive).
  let q = supabase
    .from('branches')
    .select(
      `
      id,
      name,
      slug,
      photos,
      about,
      rating_avg,
      rating_count,
      gender_type,
      offers_home_service,
      listed_on_marketplace,
      marketplace_admin_blocked_at,
      cities ( slug ),
      salons!inner (
        marketplace_payable_blocked_at,
        marketplace_admin_blocked_at
      )
    `,
    )
    .eq('listed_on_marketplace', true)
    .is('marketplace_admin_blocked_at', null)
    .is('salons.marketplace_payable_blocked_at', null)
    .is('salons.marketplace_admin_blocked_at', null);

  if (args.mode === 'at_home') {
    q = q.eq('offers_home_service', true);
  }

  // Men-only launch gate: when the platform flag is off, restrict to
  // `gender_type = 'men'`. When it's on, branches of all gender types are
  // eligible (we still require the column to be non-null via the opt-in
  // checklist).
  if (!args.womenEnabled) {
    q = q.eq('gender_type', 'men');
  }

  if (args.citySlug) {
    // Filter on the embedded relation. PostgREST accepts `table.column`
    // here even though `cities` is LEFT-joined; rows with no city are
    // dropped (correct — a city-scoped page must not show city-less rows).
    q = q.eq('cities.slug', args.citySlug);
  }

  if (args.orderByRating) {
    q = q
      .order('rating_avg', { ascending: false, nullsFirst: false })
      .order('rating_count', { ascending: false });
  } else {
    q = q
      .order('rating_avg', { ascending: false, nullsFirst: false })
      .order('name', { ascending: true });
  }

  q = q.limit(Math.min(args.limit, 200));

  const { data, error } = await q;
  if (error || !data) return [];

  const rows = data as unknown as JoinedBranchRow[];
  const items: BranchListItem[] = [];
  for (const row of rows) {
    const item = toBranchListItem(row);
    if (item) items.push(item);
  }
  return items;
}

/**
 * All marketplace-listed branches in Pakistan, filtered by the current mode.
 *
 * Tagged with `marketplace:branches` for blanket invalidation on any branch
 * opt-in / admin-block change.
 */
export async function getAllListedBranches(
  opts: GetBranchesOpts,
): Promise<BranchListItem[]> {
  const limit = opts.limit ?? 200;
  const womenEnabled = await isMarketplaceWomenEnabled();

  const cached = unstable_cache(
    async (mode: MarketplaceMode, lim: number, women: boolean) =>
      fetchListedBranches({
        mode,
        citySlug: null,
        limit: lim,
        womenEnabled: women,
        orderByRating: false,
      }),
    ['marketplace:branches:all', opts.mode, String(limit), String(womenEnabled)],
    { revalidate: SIX_HOURS_SECONDS, tags: [MARKETPLACE_BRANCHES_TAG] },
  );

  return cached(opts.mode, limit, womenEnabled);
}

/**
 * All marketplace-listed branches in a single city, filtered by the current
 * mode. City is matched against `cities.slug` (lowercased in the DB).
 *
 * Returns `[]` (not `null`) when the city has no listings — the page layer
 * uses that signal to emit `robots: noindex` so thin city pages don't pollute
 * the index (see `/barbers/[city]` implementation).
 */
export async function getListedBranchesForCity(
  citySlug: string,
  opts: GetBranchesOpts,
): Promise<BranchListItem[]> {
  const limit = opts.limit ?? 200;
  const womenEnabled = await isMarketplaceWomenEnabled();

  const cached = unstable_cache(
    async (
      slug: string,
      mode: MarketplaceMode,
      lim: number,
      women: boolean,
    ) =>
      fetchListedBranches({
        mode,
        citySlug: slug,
        limit: lim,
        womenEnabled: women,
        orderByRating: false,
      }),
    [
      'marketplace:branches:city',
      citySlug,
      opts.mode,
      String(limit),
      String(womenEnabled),
    ],
    { revalidate: SIX_HOURS_SECONDS, tags: [MARKETPLACE_BRANCHES_TAG] },
  );

  return cached(citySlug, opts.mode, limit, womenEnabled);
}

/**
 * Top 6 branches by `rating_avg` for the home-page "Featured" carousel. Same
 * filter set as `getAllListedBranches`.
 */
export async function getFeaturedBranches(
  mode: MarketplaceMode,
): Promise<BranchListItem[]> {
  const womenEnabled = await isMarketplaceWomenEnabled();

  const cached = unstable_cache(
    async (m: MarketplaceMode, women: boolean) =>
      fetchListedBranches({
        mode: m,
        citySlug: null,
        limit: 6,
        womenEnabled: women,
        orderByRating: true,
      }),
    ['marketplace:branches:featured', mode, String(womenEnabled)],
    { revalidate: SIX_HOURS_SECONDS, tags: [MARKETPLACE_BRANCHES_TAG] },
  );

  return cached(mode, womenEnabled);
}

// ═══════════════════════════════════════════════════════════════════════════
// Salon profile (single branch) — /barber/[slug]
// ═══════════════════════════════════════════════════════════════════════════

/** One photo entry in `branches.photos` (jsonb array). */
export interface BranchPhoto {
  path: string;
  url: string;
  uploaded_at?: string;
}

/** One service line as rendered in the salon profile service menu. */
export interface BranchService {
  id: string;
  name: string;
  category: string | null;
  duration_minutes: number | null;
  base_price: number;
  available_at_home: boolean;
}

/**
 * Full branch detail returned by `getBranchBySlug`. Shape matches what the
 * `/barber/[slug]` page needs to render the hero, about, service menu, map,
 * and JSON-LD blocks without further queries.
 */
export interface BranchFull {
  id: string;
  name: string;
  slug: string;
  about: string | null;
  photos: BranchPhoto[];
  lat: number | null;
  lng: number | null;
  address: string | null;
  phone: string | null;
  rating_avg: number | null;
  rating_count: number;
  offers_home_service: boolean;
  home_service_radius_km: number | null;
  gender_type: 'men' | 'women' | 'mixed' | null;
  working_hours: Record<string, unknown> | null;
  city: { id: string; slug: string; name: string } | null;
  salon: { id: string; name: string };
  services: BranchService[];
}

/** One public review entry shown on the salon profile's reviews list. */
export interface ReviewWithConsumer {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  /** First name only — privacy by design (decision 30 in the plan). */
  consumer_first_name: string;
}

/**
 * Normalize a `branches.photos` jsonb blob into a typed `BranchPhoto[]`.
 * Resilient to schema drift: a bad entry is dropped rather than crashing the
 * page render.
 */
function normalizePhotos(photos: unknown): BranchPhoto[] {
  if (!Array.isArray(photos)) return [];
  const out: BranchPhoto[] = [];
  for (const p of photos) {
    if (!p || typeof p !== 'object') continue;
    const url = (p as { url?: unknown }).url;
    const path = (p as { path?: unknown }).path;
    if (typeof url !== 'string' || url.length === 0) continue;
    out.push({
      path: typeof path === 'string' ? path : '',
      url,
      uploaded_at:
        typeof (p as { uploaded_at?: unknown }).uploaded_at === 'string'
          ? ((p as { uploaded_at: string }).uploaded_at)
          : undefined,
    });
  }
  return out;
}

/**
 * Return the first word / first-space-token of a name as a privacy-safe
 * display handle. "Asad Khan" → "Asad". "Asad" → "Asad". Empty → "Guest".
 */
function firstName(name: string | null | undefined): string {
  if (!name) return 'Guest';
  const trimmed = name.trim();
  if (!trimmed) return 'Guest';
  const space = trimmed.indexOf(' ');
  return space > 0 ? trimmed.slice(0, space) : trimmed;
}

/**
 * Fetch a single marketplace-listed branch by its public slug, with all the
 * joined data the profile page needs in one shot: salon, city, services.
 *
 * Applies the same visibility filter set as the directory queries:
 *   - `listed_on_marketplace = true`
 *   - `marketplace_admin_blocked_at IS NULL` (branch + salon)
 *   - `marketplace_payable_blocked_at IS NULL` (salon)
 *   - gender-gate vs. `platform_settings.marketplace_women_enabled`
 *
 * Returns `null` if the slug doesn't exist OR any visibility filter rejects
 * it. The calling page converts `null` → `notFound()`.
 *
 * Services are filtered to `is_active = true`; they are NOT filtered by
 * `available_at_home` here — the page layer does that based on the current
 * mode so we can reuse this query across both modes without re-fetching.
 */
export async function getBranchBySlug(
  slug: string,
): Promise<BranchFull | null> {
  const womenEnabled = await isMarketplaceWomenEnabled();

  const cached = unstable_cache(
    async (s: string, women: boolean): Promise<BranchFull | null> => {
      const supabase = createServerClient();

      // One round trip: pull the branch + salon + city; services come in a
      // second round trip because `services.salon_id` joins against
      // `branches.salon_id` (not `branches.id`) and PostgREST's implicit
      // embed machinery requires a direct FK. Splitting keeps the SQL
      // honest and still cheap — both selects hit indexed columns.
      const { data: branchRow, error } = await supabase
        .from('branches')
        .select(
          `
          id,
          name,
          slug,
          about,
          photos,
          lat,
          lng,
          address,
          phone,
          rating_avg,
          rating_count,
          offers_home_service,
          home_service_radius_km,
          gender_type,
          working_hours,
          listed_on_marketplace,
          marketplace_admin_blocked_at,
          salon_id,
          cities ( id, slug, name ),
          salons!inner (
            id,
            name,
            marketplace_payable_blocked_at,
            marketplace_admin_blocked_at
          )
        `,
        )
        .eq('slug', s)
        .eq('listed_on_marketplace', true)
        .is('marketplace_admin_blocked_at', null)
        .is('salons.marketplace_payable_blocked_at', null)
        .is('salons.marketplace_admin_blocked_at', null)
        .maybeSingle();

      if (error || !branchRow) return null;

      // Women gate. When the platform flag is off, only `gender_type = 'men'`
      // branches are visible; the column being null also fails the gate
      // because opt-in requires setting it.
      const gt = (branchRow as { gender_type: string | null }).gender_type;
      if (!women && gt !== 'men') return null;

      const salon = oneOf(
        (branchRow as { salons: unknown }).salons as
          | { id: string; name: string }
          | Array<{ id: string; name: string }>
          | null,
      );
      if (!salon) return null;

      const city = oneOf(
        (branchRow as { cities: unknown }).cities as
          | { id: string; slug: string; name: string }
          | Array<{ id: string; slug: string; name: string }>
          | null,
      );

      // Second fetch: active services for the salon. Services live at salon
      // scope (not per-branch) in the existing POS schema — the marketplace
      // shows the full catalog on the branch profile, same as the dashboard
      // menu. Ordered by sort_order then name for a stable display.
      const { data: serviceRows, error: svcError } = await supabase
        .from('services')
        .select(
          'id, name, category, duration_minutes, base_price, available_at_home, is_active, sort_order',
        )
        .eq('salon_id', (branchRow as { salon_id: string }).salon_id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      const services: BranchService[] = (!svcError && Array.isArray(serviceRows))
        ? serviceRows.map((r) => ({
            id: r.id as string,
            name: r.name as string,
            category: (r.category as string | null) ?? null,
            duration_minutes: (r.duration_minutes as number | null) ?? null,
            base_price: Number(r.base_price ?? 0),
            available_at_home: r.available_at_home !== false,
          }))
        : [];

      return {
        id: (branchRow as { id: string }).id,
        name: (branchRow as { name: string }).name,
        slug: (branchRow as { slug: string }).slug,
        about: (branchRow as { about: string | null }).about,
        photos: normalizePhotos((branchRow as { photos: unknown }).photos),
        lat: (branchRow as { lat: number | null }).lat,
        lng: (branchRow as { lng: number | null }).lng,
        address: (branchRow as { address: string | null }).address,
        phone: (branchRow as { phone: string | null }).phone,
        rating_avg: (branchRow as { rating_avg: number | null }).rating_avg,
        rating_count: (branchRow as { rating_count: number }).rating_count ?? 0,
        offers_home_service: (branchRow as { offers_home_service: boolean }).offers_home_service,
        home_service_radius_km: (branchRow as { home_service_radius_km: number | null })
          .home_service_radius_km,
        gender_type: gt as 'men' | 'women' | 'mixed' | null,
        working_hours: (branchRow as { working_hours: Record<string, unknown> | null })
          .working_hours,
        city: city ?? null,
        salon: { id: salon.id, name: salon.name },
        services,
      };
    },
    ['marketplace:branch-by-slug', slug, String(womenEnabled)],
    {
      revalidate: SIX_HOURS_SECONDS,
      tags: [MARKETPLACE_BRANCHES_TAG, branchTag(slug)],
    },
  );

  return cached(slug, womenEnabled);
}

/**
 * Return the first `limit` public `consumer_of_salon` reviews for a branch,
 * newest first. Joins reviews → bookings → consumers to surface the
 * consumer's first name (privacy-minimized per plan decision 30).
 *
 * Only consumer→salon reviews are returned; `salon_of_consumer` reviews are
 * private (visible to the salon and superadmin only). That filter is applied
 * both in SQL (`direction = 'consumer_of_salon'`) and defensively in Node.
 */
export async function getBranchReviews(
  branchId: string,
  limit: number,
): Promise<ReviewWithConsumer[]> {
  const cap = Math.max(1, Math.min(limit, 100));

  const cached = unstable_cache(
    async (id: string, n: number): Promise<ReviewWithConsumer[]> => {
      const supabase = createServerClient();
      const { data, error } = await supabase
        .from('reviews')
        .select(
          `
          id,
          rating,
          comment,
          created_at,
          direction,
          bookings!inner (
            branch_id,
            consumers!inner ( name )
          )
        `,
        )
        .eq('direction', 'consumer_of_salon')
        .eq('bookings.branch_id', id)
        .order('created_at', { ascending: false })
        .limit(n);

      if (error || !data) return [];

      const rows: ReviewWithConsumer[] = [];
      for (const raw of data as unknown as Array<{
        id: string;
        rating: number;
        comment: string | null;
        created_at: string;
        direction: string;
        bookings:
          | { branch_id: string; consumers: { name: string } | { name: string }[] | null }
          | Array<{ branch_id: string; consumers: { name: string } | { name: string }[] | null }>
          | null;
      }>) {
        if (raw.direction !== 'consumer_of_salon') continue;
        const booking = oneOf(raw.bookings);
        if (!booking) continue;
        const consumer = oneOf(booking.consumers);
        rows.push({
          id: raw.id,
          rating: Number(raw.rating),
          comment: raw.comment,
          created_at: raw.created_at,
          consumer_first_name: firstName(consumer?.name ?? null),
        });
      }
      return rows;
    },
    ['marketplace:branch-reviews', branchId, String(cap)],
    {
      revalidate: SIX_HOURS_SECONDS,
      tags: [MARKETPLACE_BRANCHES_TAG, branchTag(branchId)],
    },
  );

  return cached(branchId, cap);
}

// ═══════════════════════════════════════════════════════════════════════════
// Marketplace services taxonomy — /services/[slug]-in-[city] SEO pages
// ═══════════════════════════════════════════════════════════════════════════

/**
 * One row from the `marketplace_services` taxonomy table. The 10 seeded
 * services (haircut, beard-trim, hair-color, facial, waxing, bridal, nails,
 * massage, keratin, hair-treatment) drive the programmatic-SEO URL fleet at
 * `/services/[slug]-in-[city]` (and `home-[slug]-in-[city]`).
 *
 * `matches_categories` is a PG text array — it's what lets a service slug
 * like `haircut` resolve to every `services.category = 'haircut'` row across
 * the salon catalog, even though salon-level `services` have no FK into the
 * taxonomy table.
 */
export interface MarketplaceService {
  id: string;
  slug: string;
  name: string;
  display_name: string;
  matches_categories: string[];
  display_order: number;
  is_active: boolean;
  available_at_home: boolean;
}

/**
 * Per-service tag for precise cache invalidation when a salon adds/removes a
 * service that matches the taxonomy — mostly an insurance policy; the broad
 * `MARKETPLACE_BRANCHES_TAG` already covers the common case.
 */
export function marketplaceServiceTag(slug: string): string {
  return `marketplace:service:${slug}`;
}

/** Per-city tag so city-scoped invalidations (rare) don't blow the whole fleet. */
export function marketplaceCityTag(slug: string): string {
  return `marketplace:city:${slug}`;
}

/**
 * Every active marketplace service, ordered by `display_order`. Small table
 * (10 rows), heavily cached. Used by:
 *   - `generateStaticParams` for `/services/[slug]/page.tsx` — iterates
 *     services × cities × modes to pre-render 100 programmatic SEO pages.
 *   - The "Popular services in {City}" pill row on `/barbers/[city]`.
 */
export const getAllMarketplaceServices = unstable_cache(
  async (): Promise<MarketplaceService[]> => {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('marketplace_services')
      .select(
        'id, slug, name, display_name, matches_categories, display_order, is_active, available_at_home',
      )
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error || !data) return [];
    return data as MarketplaceService[];
  },
  ['marketplace:services:all'],
  { revalidate: SIX_HOURS_SECONDS, tags: [MARKETPLACE_BRANCHES_TAG] },
);

/**
 * Single marketplace service by slug; returns `null` when unknown or inactive.
 * Called from `/services/[slug]/page.tsx` and `generateMetadata` to resolve
 * the taxonomy row for pricing, display copy, and `matches_categories` lookup.
 */
export async function getMarketplaceServiceBySlug(
  slug: string,
): Promise<MarketplaceService | null> {
  const cached = unstable_cache(
    async (s: string): Promise<MarketplaceService | null> => {
      const supabase = createServerClient();
      const { data, error } = await supabase
        .from('marketplace_services')
        .select(
          'id, slug, name, display_name, matches_categories, display_order, is_active, available_at_home',
        )
        .eq('slug', s)
        .eq('is_active', true)
        .maybeSingle();

      if (error || !data) return null;
      return data as MarketplaceService;
    },
    ['marketplace:service-by-slug', slug],
    {
      revalidate: SIX_HOURS_SECONDS,
      tags: [MARKETPLACE_BRANCHES_TAG, marketplaceServiceTag(slug)],
    },
  );
  return cached(slug);
}

/**
 * Options accepted by `getListedBranchesForServiceInCity`.
 *
 *   - `serviceSlug`: row key in `marketplace_services` (e.g. `haircut`).
 *   - `citySlug`:    row key in `cities` (e.g. `lahore`).
 *   - `mode`:        `'at_salon'` or `'at_home'`. In home mode we also require
 *                    `branches.offers_home_service = true` AND
 *                    `services.available_at_home = true`.
 */
export interface GetBranchesForServiceInCityOpts {
  serviceSlug: string;
  citySlug: string;
  mode: MarketplaceMode;
}

/**
 * Fetch every listed branch in `citySlug` that offers at least one active
 * service matching the `marketplace_services.matches_categories` array for
 * `serviceSlug`, applying the full visibility filter set.
 *
 * SQL shape (expressed via PostgREST `!inner` joins):
 *
 *     SELECT DISTINCT b.*, c.slug
 *     FROM branches b
 *     JOIN salons   s ON s.id = b.salon_id
 *     JOIN cities   c ON c.id = b.city_id
 *     JOIN services sv ON sv.salon_id = b.salon_id
 *                      AND sv.is_active = true
 *                      AND sv.category = ANY ($matches_categories)
 *                      [AND sv.available_at_home = true]   -- home mode only
 *     WHERE c.slug = $citySlug
 *       AND b.listed_on_marketplace = true
 *       AND b.marketplace_admin_blocked_at IS NULL
 *       AND s.marketplace_payable_blocked_at IS NULL
 *       AND s.marketplace_admin_blocked_at IS NULL
 *       [AND b.gender_type = 'men']            -- women-flag OFF
 *       [AND b.offers_home_service = true]     -- home mode only
 *
 * De-duplication: PostgREST emits one row per matching service, so a salon
 * with multiple haircut services in its catalog would appear multiple times.
 * We dedup in Node (order preserved, first wins) after shaping.
 *
 * Cache: keyed by `['marketplace:service-city-branches', serviceSlug, citySlug,
 * mode, String(womenEnabled)]`, tagged with the broad marketplace tag plus
 * per-service + per-city tags so targeted invalidations stay cheap.
 *
 * Returns `[]` when no category matches exist or no salons pass the filter —
 * the page layer uses that signal to emit `robots: noindex` per the thin-
 * content guard (plan's risk table).
 */
export async function getListedBranchesForServiceInCity(
  opts: GetBranchesForServiceInCityOpts,
): Promise<BranchListItem[]> {
  const womenEnabled = await isMarketplaceWomenEnabled();

  const cached = unstable_cache(
    async (
      serviceSlug: string,
      citySlug: string,
      mode: MarketplaceMode,
      women: boolean,
    ): Promise<BranchListItem[]> => {
      const service = await getMarketplaceServiceBySlug(serviceSlug);
      if (!service) return [];

      // Empty taxonomy → no match possible. Never expect this (seed data is
      // NOT NULL with default ARRAY length ≥ 1), but a defensive guard keeps
      // the page render honest if someone manually updates the row.
      if (!service.matches_categories || service.matches_categories.length === 0) {
        return [];
      }

      const supabase = createServerClient();

      // Joined query: branches → salons!inner → cities!inner → services!inner.
      // `!inner` on services pulls only branches whose salon owns a matching
      // active service. PostgREST translates the `.in()` filter on the
      // embedded resource into `services.category IN (...)` server-side.
      let q = supabase
        .from('branches')
        .select(
          `
          id,
          name,
          slug,
          photos,
          about,
          rating_avg,
          rating_count,
          gender_type,
          offers_home_service,
          listed_on_marketplace,
          marketplace_admin_blocked_at,
          cities!inner ( slug ),
          salons!inner (
            marketplace_payable_blocked_at,
            marketplace_admin_blocked_at
          ),
          services!inner (
            id,
            category,
            is_active,
            available_at_home
          )
        `,
        )
        .eq('listed_on_marketplace', true)
        .is('marketplace_admin_blocked_at', null)
        .is('salons.marketplace_payable_blocked_at', null)
        .is('salons.marketplace_admin_blocked_at', null)
        .eq('cities.slug', citySlug)
        .eq('services.is_active', true)
        .in('services.category', service.matches_categories);

      if (!women) {
        q = q.eq('gender_type', 'men');
      }

      if (mode === 'at_home') {
        q = q.eq('offers_home_service', true);
        q = q.eq('services.available_at_home', true);
      }

      q = q
        .order('rating_avg', { ascending: false, nullsFirst: false })
        .order('rating_count', { ascending: false })
        .limit(200);

      const { data, error } = await q;
      if (error || !data) return [];

      // Dedup by branch id (the services join causes one row per match).
      const seen = new Set<string>();
      const items: BranchListItem[] = [];
      for (const row of data as unknown as JoinedBranchRow[]) {
        if (seen.has(row.id)) continue;
        const item = toBranchListItem(row);
        if (!item) continue;
        seen.add(row.id);
        items.push(item);
      }
      return items;
    },
    [
      'marketplace:service-city-branches',
      opts.serviceSlug,
      opts.citySlug,
      opts.mode,
      String(womenEnabled),
    ],
    {
      revalidate: SIX_HOURS_SECONDS,
      tags: [
        MARKETPLACE_BRANCHES_TAG,
        marketplaceServiceTag(opts.serviceSlug),
        marketplaceCityTag(opts.citySlug),
      ],
    },
  );

  return cached(opts.serviceSlug, opts.citySlug, opts.mode, womenEnabled);
}

/**
 * Return the subset of `serviceSlugs` that have ≥1 listed branch in the given
 * city under the `at_salon` mode. Used by the "Popular services in {City}"
 * pill row on `/barbers/[city]` to hide pills with zero salons (thin-content
 * guard for the nav hook — we'd rather not link to an empty page).
 *
 * The cheap implementation: run `getListedBranchesForServiceInCity` per
 * service slug (results cached) and collect the non-empty ones. All lookups
 * hit the same cache keys the page itself uses, so the cost amortises to
 * ~zero after the first page render in the 6h window.
 */
export async function getPopularServicesForCity(
  citySlug: string,
  serviceSlugs: string[],
): Promise<string[]> {
  const checks = await Promise.all(
    serviceSlugs.map(async (serviceSlug) => {
      const branches = await getListedBranchesForServiceInCity({
        serviceSlug,
        citySlug,
        mode: 'at_salon',
      });
      return branches.length > 0 ? serviceSlug : null;
    }),
  );
  return checks.filter((s): s is string => s !== null);
}

// ═══════════════════════════════════════════════════════════════════════════
// Internal exports for tests — keep a small seam so the test file can hit
// the pure transform layer without spinning a Supabase mock. Nothing here is
// public API; do not import from app code.
// ═══════════════════════════════════════════════════════════════════════════

export const _internal = {
  firstPhotoUrl,
  aboutPreview,
  toBranchListItem,
  normalizePhotos,
  firstName,
  SIX_HOURS_SECONDS,
};
