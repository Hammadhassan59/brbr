'use server';

/**
 * Consumer favorites — the "saved salons" list backing `/account/favorites`
 * plus the heart-toggle on every `<SalonCard />` and the profile page.
 *
 * Backed by migration 041's `consumer_favorites` table:
 *   - PRIMARY KEY (consumer_id, branch_id)
 *   - `created_at timestamptz`
 *   - ON DELETE CASCADE from both `consumers` and `branches`
 *
 * Three server actions, all consumer-session-gated:
 *
 *   1. `toggleFavorite({ branchId })` — add-or-remove. Idempotent. Used by
 *      the heart-icon buttons. Rate-limited 60/min because an impatient
 *      consumer can tap this several times in a row without it being abuse.
 *
 *   2. `listFavorites()` — rich list for `/account/favorites`. Joins down
 *      to `branches` + `salons` + `cities` and applies the SAME visibility
 *      filters as the public directory:
 *        * branch listed + not admin-blocked
 *        * salon not payable-blocked + not admin-blocked
 *        * gender gate against `platform_settings.marketplace_women_enabled`
 *      A favorited branch that subsequently unlists or gets blocked is
 *      silently dropped from the list — we don't want to show the consumer
 *      something they cannot open. The row stays in the DB so if the salon
 *      re-lists, their favorite returns without needing a re-tap.
 *
 *   3. `isFavorite(branchId)` — cheap single-row boolean used by cards on
 *      the directory surfaces to pre-fill the heart. Returns `false` on
 *      any failure (including "not signed in") so UI never gets stuck.
 *
 * RLS note: `consumer_favorites` has RLS "consumer manages own rows" per
 * migration 041. We still filter by `consumer_id = session.userId` at the
 * app layer because the server-actions here run with the service role — a
 * compromised service-role key must not be able to hop accounts via this
 * file.
 */

import { z } from 'zod';

import { getConsumerSession } from '@/lib/consumer-session';
import { createServerClient } from '@/lib/supabase';
import { safeError } from '@/lib/action-error';
import { checkRateLimit } from '@/lib/with-rate-limit';
import { UUIDSchema } from '@/lib/schemas/common';
import {
  isMarketplaceWomenEnabled,
  type BranchListItem,
} from '@/lib/marketplace/queries';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface Ok<T> { ok: true; data: T }
interface Fail { ok: false; error: string }
export type ActionResult<T> = Ok<T> | Fail;

function ok<T>(data: T): Ok<T> { return { ok: true, data }; }
function fail(error: string): Fail { return { ok: false, error }; }

// ═══════════════════════════════════════════════════════════════════════════
// Input validation
// ═══════════════════════════════════════════════════════════════════════════

const ToggleSchema = z.object({ branchId: UUIDSchema });

// ═══════════════════════════════════════════════════════════════════════════
// toggleFavorite
// ═══════════════════════════════════════════════════════════════════════════

export interface ToggleFavoriteResult {
  /** `true` if the branch is now a favorite, `false` if we just removed it. */
  favorited: boolean;
}

/**
 * Toggle a branch in/out of the current consumer's favorites. Idempotent —
 * calling twice with the same branch ends in a consistent state.
 *
 * We look up the row first rather than blind-inserting-with-upsert so we can
 * return the terminal state (`favorited`) to the client for optimistic UI.
 *
 * 60/min is generous on purpose: a user flipping through 30 cards and
 * testing the heart on each shouldn't hit the limiter. Abuse patterns
 * (bots cycling) land well above 60.
 */
export async function toggleFavorite(input: {
  branchId: string;
}): Promise<ActionResult<ToggleFavoriteResult>> {
  const parsed = ToggleSchema.safeParse(input);
  if (!parsed.success) return fail('Invalid branch id');
  const { branchId } = parsed.data;

  const session = await getConsumerSession();
  if (!session) return fail('Please sign in to save favorites');

  const rl = await checkRateLimit('consumer-favorite-toggle', session.userId, 60, 60 * 1000);
  if (!rl.ok) return fail(rl.error ?? 'Too many requests. Try again in a minute.');

  try {
    const supabase = createServerClient();

    const { data: existing, error: findErr } = await supabase
      .from('consumer_favorites')
      .select('consumer_id, branch_id')
      .eq('consumer_id', session.userId)
      .eq('branch_id', branchId)
      .maybeSingle();
    if (findErr) return fail(safeError(findErr));

    if (existing) {
      const { error: delErr } = await supabase
        .from('consumer_favorites')
        .delete()
        .eq('consumer_id', session.userId)
        .eq('branch_id', branchId);
      if (delErr) return fail(safeError(delErr));
      return ok({ favorited: false });
    }

    const { error: insErr } = await supabase
      .from('consumer_favorites')
      .insert({
        consumer_id: session.userId,
        branch_id: branchId,
      });
    if (insErr) return fail(safeError(insErr));

    return ok({ favorited: true });
  } catch (err) {
    return fail(safeError(err));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// isFavorite
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Has the current consumer favorited this branch? Swallows every error path
 * to `false` so UI always has a clean boolean to render. Not rate-limited:
 * called per-card on list pages and should be cheap.
 */
export async function isFavorite(branchId: string): Promise<boolean> {
  const parsed = UUIDSchema.safeParse(branchId);
  if (!parsed.success) return false;

  const session = await getConsumerSession();
  if (!session) return false;

  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('consumer_favorites')
      .select('consumer_id')
      .eq('consumer_id', session.userId)
      .eq('branch_id', branchId)
      .maybeSingle();
    return data != null;
  } catch {
    return false;
  }
}

/**
 * Batch version of `isFavorite` — returns a `Set<string>` of branch ids the
 * current consumer has favorited. Used on directory pages to pre-fill every
 * card's heart in a single query instead of N per-card round trips.
 *
 * Returns an empty set on any failure (including "not signed in") so the UI
 * renders without hearts rather than crashing.
 */
export async function getFavoriteBranchIds(): Promise<Set<string>> {
  const session = await getConsumerSession();
  if (!session) return new Set();

  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('consumer_favorites')
      .select('branch_id')
      .eq('consumer_id', session.userId);
    const ids = new Set<string>();
    if (Array.isArray(data)) {
      for (const r of data as Array<{ branch_id: string }>) {
        if (r.branch_id) ids.add(r.branch_id);
      }
    }
    return ids;
  } catch {
    return new Set();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// listFavorites
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pull the current consumer's favorited branches, joined down to the same
 * `BranchListItem` shape the directory pages use so `<SalonCard />` renders
 * unchanged. Applies every visibility filter from the public directory —
 * anything blocked/unlisted is dropped (but the favorite row stays, so a
 * re-list brings it back).
 */
export async function listFavorites(): Promise<ActionResult<BranchListItem[]>> {
  const session = await getConsumerSession();
  if (!session) return fail('Please sign in');

  try {
    const supabase = createServerClient();
    const womenEnabled = await isMarketplaceWomenEnabled();

    const { data, error } = await supabase
      .from('consumer_favorites')
      .select(
        `
        created_at,
        branch:branches!inner (
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
        )
        `,
      )
      .eq('consumer_id', session.userId)
      .order('created_at', { ascending: false });
    if (error) return fail(safeError(error));

    type Row = {
      created_at: string;
      branch:
        | {
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
            salons:
              | {
                  marketplace_payable_blocked_at: string | null;
                  marketplace_admin_blocked_at: string | null;
                }
              | Array<{
                  marketplace_payable_blocked_at: string | null;
                  marketplace_admin_blocked_at: string | null;
                }>
              | null;
          }
        | Array<{
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
            salons:
              | {
                  marketplace_payable_blocked_at: string | null;
                  marketplace_admin_blocked_at: string | null;
                }
              | Array<{
                  marketplace_payable_blocked_at: string | null;
                  marketplace_admin_blocked_at: string | null;
                }>
              | null;
          }>
        | null;
    };

    // PostgREST returns a to-one embed as either an object or a
    // single-element array depending on the client. Handle both.
    const oneOf = <T>(rel: T | T[] | null | undefined): T | null => {
      if (!rel) return null;
      if (Array.isArray(rel)) return rel[0] ?? null;
      return rel;
    };

    const firstPhotoUrl = (photos: unknown): string | null => {
      if (!Array.isArray(photos) || photos.length === 0) return null;
      const first = photos[0];
      if (first && typeof first === 'object' && 'url' in first) {
        const url = (first as { url?: unknown }).url;
        return typeof url === 'string' && url.length > 0 ? url : null;
      }
      return null;
    };

    const aboutPreview = (about: string | null): string | null => {
      if (!about) return null;
      const t = about.trim();
      if (!t) return null;
      if (t.length <= 180) return t;
      const cut = t.slice(0, 180);
      const last = cut.lastIndexOf(' ');
      return (last > 120 ? cut.slice(0, last) : cut).trimEnd() + '…';
    };

    const items: BranchListItem[] = [];
    for (const raw of (data ?? []) as Row[]) {
      const b = oneOf(raw.branch);
      if (!b) continue;
      if (!b.listed_on_marketplace) continue;
      if (b.marketplace_admin_blocked_at !== null) continue;
      if (!b.slug) continue;
      if (!womenEnabled && b.gender_type !== 'men') continue;

      const salon = oneOf(b.salons);
      if (!salon) continue;
      if (salon.marketplace_payable_blocked_at !== null) continue;
      if (salon.marketplace_admin_blocked_at !== null) continue;

      const city = oneOf(b.cities);

      items.push({
        id: b.id,
        name: b.name,
        slug: b.slug,
        city_slug: city?.slug ?? null,
        photo: firstPhotoUrl(b.photos),
        rating_avg: b.rating_avg ?? null,
        rating_count: b.rating_count ?? 0,
        about_preview: aboutPreview(b.about),
      });
    }

    return ok(items);
  } catch (err) {
    return fail(safeError(err));
  }
}
