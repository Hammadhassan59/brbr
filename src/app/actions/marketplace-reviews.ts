'use server';

/**
 * Marketplace reviews — two-way Uber-style rating submission for bookings.
 *
 * Week 4 deliverable (marketplace Phase 0+1 plan, decisions 28-31). After a
 * booking flips to `COMPLETED`, both sides get a 7-day review window:
 *
 *   - Consumer → salon (direction='consumer_of_salon'): at-salon + home bookings.
 *     Public on the salon profile.
 *   - Salon → consumer (direction='salon_of_consumer'): home bookings only.
 *     Salon-private; feeds the "Incoming Bookings" rating badge and the
 *     superadmin consumer-flag dashboard.
 *
 * DB contract (migration 041_marketplace_groundwork.sql):
 *   - `reviews` table has UNIQUE (booking_id, direction), a CHECK on
 *     rating 1-5, and FKs to bookings.
 *   - Trigger `enforce_salon_review_home_only` rejects a salon_of_consumer
 *     review when the underlying booking is not a home booking. We surface
 *     a friendlier error before the DB error by asserting in app code.
 *   - Triggers `update_branch_rating_agg` + `update_consumer_rating_agg`
 *     keep `branches.rating_avg/count` and `consumers.rating_avg/count` in
 *     lock-step. We do NOT recompute aggregates here.
 *
 * App invariants enforced here (not by the DB):
 *   - Booking status = COMPLETED.
 *   - Booking's `review_window_closes_at > now()`.
 *   - Caller owns the booking (consumer or salon tenant).
 *   - No pre-existing review in the same direction.
 *   - Rate limits: 10/day per consumer, 50/day per salon.
 *
 * Parallel-agent contract: Agent 9's `reviews-list.tsx` reads via
 * `getBranchReviews(branchId, limit)` — a `reviews!inner…bookings` join that
 * projects `consumer_first_name`. We add rows here; we do NOT touch that
 * read path. The aggregate triggers + cache tags (`MARKETPLACE_BRANCHES_TAG`,
 * `branchTag(branchId)`) are the cross-seam contract; our inserts trigger
 * both so the profile page's cache revalidates on next hit.
 */

import { z } from 'zod';

import { verifySession } from './auth';
import { getConsumerSession } from '@/lib/consumer-session';
import { createServerClient } from '@/lib/supabase';
import { UUIDSchema } from '@/lib/schemas/common';
import { checkRateLimit } from '@/lib/with-rate-limit';
import { safeError } from '@/lib/action-error';
import { requirePermission, tenantErrorMessage } from '@/lib/tenant-guard';

// ═══════════════════════════════════════════════════════════════════════════
// Types + action-result shape
// ═══════════════════════════════════════════════════════════════════════════

interface Ok<T> { ok: true; data: T }
interface Fail { ok: false; error: string }
export type ReviewActionResult<T> = Ok<T> | Fail;

function ok<T>(data: T): Ok<T> { return { ok: true, data }; }
function fail(error: string): Fail { return { ok: false, error }; }

// ═══════════════════════════════════════════════════════════════════════════
// Input schemas
// ═══════════════════════════════════════════════════════════════════════════

const SubmitReviewSchema = z.object({
  bookingId: UUIDSchema,
  rating: z
    .number()
    .int('Rating must be an integer')
    .min(1, 'Rating must be 1-5')
    .max(5, 'Rating must be 1-5'),
  comment: z.string().trim().max(2000, 'Comment is too long').optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
// Shared helpers
// ═══════════════════════════════════════════════════════════════════════════

interface BookingContext {
  id: string;
  consumer_id: string;
  salon_id: string;
  status: string;
  location_type: 'in_salon' | 'home';
  review_window_closes_at: string | null;
}

/**
 * Read the minimal booking context needed to validate a review submission.
 * Returns `null` on lookup failure so the caller surfaces a uniform
 * "Booking not found" error.
 */
async function loadBookingForReview(bookingId: string): Promise<BookingContext | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, consumer_id, salon_id, status, location_type, review_window_closes_at',
    )
    .eq('id', bookingId)
    .maybeSingle();
  if (error || !data) return null;
  return data as BookingContext;
}

/**
 * Return true when the 7-day review window is still open. A missing closes-at
 * timestamp is treated as closed — the column is only stamped when a booking
 * reaches COMPLETED, so a null here implies the booking never completed.
 */
function windowIsOpen(closesAt: string | null): boolean {
  if (!closesAt) return false;
  const t = new Date(closesAt).getTime();
  if (Number.isNaN(t)) return false;
  return t > Date.now();
}

/**
 * Check whether a review in the given direction already exists for a booking.
 * The UNIQUE constraint on (booking_id, direction) would also catch this, but
 * surfacing a friendly error beats leaking a DB constraint violation string.
 */
async function reviewExists(
  bookingId: string,
  direction: 'consumer_of_salon' | 'salon_of_consumer',
): Promise<boolean> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('reviews')
    .select('id')
    .eq('booking_id', bookingId)
    .eq('direction', direction)
    .maybeSingle();
  return !!data;
}

// ═══════════════════════════════════════════════════════════════════════════
// submitConsumerReview — consumer rates salon (public)
// ═══════════════════════════════════════════════════════════════════════════

export async function submitConsumerReview(input: {
  bookingId: string;
  rating: number;
  comment?: string;
}): Promise<ReviewActionResult<{ reviewId: string }>> {
  const parsed = SubmitReviewSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Invalid input');
  }
  const v = parsed.data;

  const session = await getConsumerSession();
  if (!session) return fail('Please sign in to leave a review');

  // 10/day per consumer. Broad abuse would take them well over this, but a
  // consumer with 10 completed bookings/day can absolutely review all of them.
  const rl = await checkRateLimit('review-submit-consumer', session.userId, 10, 24 * 60 * 60 * 1000);
  if (!rl.ok) return fail(rl.error ?? 'Too many reviews today. Try again tomorrow.');

  try {
    const booking = await loadBookingForReview(v.bookingId);
    if (!booking) return fail('Booking not found');

    if (booking.consumer_id !== session.userId) return fail('Not allowed');
    if (booking.status !== 'COMPLETED') {
      return fail('You can only review a completed booking');
    }
    if (!windowIsOpen(booking.review_window_closes_at)) {
      return fail('The 7-day review window has closed for this booking');
    }

    if (await reviewExists(v.bookingId, 'consumer_of_salon')) {
      return fail('You have already reviewed this booking');
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('reviews')
      .insert({
        booking_id: v.bookingId,
        direction: 'consumer_of_salon',
        rating: v.rating,
        comment: v.comment && v.comment.length > 0 ? v.comment : null,
      })
      .select('id')
      .single();
    if (error || !data) return fail(safeError(error ?? new Error('Review insert failed')));

    return ok({ reviewId: (data as { id: string }).id });
  } catch (err) {
    return fail(safeError(err));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// submitSalonReview — salon rates consumer (home bookings only; private)
// ═══════════════════════════════════════════════════════════════════════════

export async function submitSalonReview(input: {
  bookingId: string;
  rating: number;
  comment?: string;
}): Promise<ReviewActionResult<{ reviewId: string }>> {
  const parsed = SubmitReviewSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Invalid input');
  }
  const v = parsed.data;

  let session;
  try {
    session = await verifySession();
  } catch {
    return fail('Not authenticated');
  }
  if (!session.salonId || session.salonId === 'super-admin') {
    return fail('No salon context');
  }
  try {
    requirePermission(session, 'manage_salon');
  } catch (e) {
    return fail(tenantErrorMessage(e) ?? 'Not allowed');
  }

  // 50/day per salon — covers a busy multi-branch operation while still
  // catching runaway review automation.
  const rl = await checkRateLimit('review-submit-salon', session.salonId, 50, 24 * 60 * 60 * 1000);
  if (!rl.ok) return fail(rl.error ?? 'Too many reviews today. Try again tomorrow.');

  try {
    const booking = await loadBookingForReview(v.bookingId);
    if (!booking) return fail('Booking not found');

    if (booking.salon_id !== session.salonId) return fail('Not allowed');
    if (booking.status !== 'COMPLETED') {
      return fail('You can only review a completed booking');
    }
    if (booking.location_type !== 'home') {
      // Friendlier than the Postgres trigger message.
      return fail('You can only review consumers on home bookings');
    }
    if (!windowIsOpen(booking.review_window_closes_at)) {
      return fail('The 7-day review window has closed for this booking');
    }

    if (await reviewExists(v.bookingId, 'salon_of_consumer')) {
      return fail('You have already reviewed this customer');
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('reviews')
      .insert({
        booking_id: v.bookingId,
        direction: 'salon_of_consumer',
        rating: v.rating,
        comment: v.comment && v.comment.length > 0 ? v.comment : null,
      })
      .select('id')
      .single();
    if (error || !data) return fail(safeError(error ?? new Error('Review insert failed')));

    return ok({ reviewId: (data as { id: string }).id });
  } catch (err) {
    return fail(safeError(err));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// getReviewStatusForBooking — both-sides review status
// ═══════════════════════════════════════════════════════════════════════════

export interface ReviewStatus {
  consumerHasReviewed: boolean;
  salonHasReviewed: boolean;
  windowOpen: boolean;
  closesAt: string | null;
}

/**
 * Returns review state flags for a booking. Works for either a consumer or a
 * salon session — the caller must be the booking's consumer OR own the salon.
 *
 * Used by:
 *   - consumer-side review form page (deciding whether to render the form or
 *     the "already reviewed"/"window closed" card).
 *   - salon-side "Rate customer" button in the Incoming Bookings panel.
 */
export async function getReviewStatusForBooking(
  bookingId: string,
): Promise<ReviewActionResult<ReviewStatus>> {
  const idParsed = UUIDSchema.safeParse(bookingId);
  if (!idParsed.success) return fail('Invalid booking id');

  // Try consumer session first; fall back to salon session. Either is enough
  // to read this booking's review status — access is gated by tenant membership
  // (consumer_id match OR salon_id match) below.
  const consumerSession = await getConsumerSession();
  let salonSessionId: string | null = null;
  if (!consumerSession) {
    try {
      const s = await verifySession();
      if (s.salonId && s.salonId !== 'super-admin') {
        salonSessionId = s.salonId;
      }
    } catch {
      // neither session — will fall through to "not authenticated"
    }
  }

  if (!consumerSession && !salonSessionId) return fail('Not authenticated');

  try {
    const booking = await loadBookingForReview(bookingId);
    if (!booking) return fail('Booking not found');

    const isConsumerCaller = consumerSession?.userId === booking.consumer_id;
    const isSalonCaller = salonSessionId === booking.salon_id;
    if (!isConsumerCaller && !isSalonCaller) return fail('Not allowed');

    const supabase = createServerClient();
    const { data } = await supabase
      .from('reviews')
      .select('id, direction')
      .eq('booking_id', bookingId);
    const rows = (data ?? []) as Array<{ id: string; direction: string }>;

    return ok({
      consumerHasReviewed: rows.some((r) => r.direction === 'consumer_of_salon'),
      salonHasReviewed: rows.some((r) => r.direction === 'salon_of_consumer'),
      windowOpen: windowIsOpen(booking.review_window_closes_at),
      closesAt: booking.review_window_closes_at,
    });
  } catch (err) {
    return fail(safeError(err));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// listRecentConsumerReviewsByConsumer — lean list for Week-5 dashboard
// ═══════════════════════════════════════════════════════════════════════════

export interface ConsumerOwnReview {
  id: string;
  booking_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  /** Salon name, joined through the booking. May be empty if the branch was removed. */
  salon_name: string;
  /** Branch slug for deep-linking to the salon profile. */
  branch_slug: string | null;
}

/**
 * Return the current consumer's most recent `consumer_of_salon` reviews.
 * Lean version — no pagination, just a capped `limit`. Week 5 dashboard will
 * wrap this with "Edit review" / "See details" actions; Week 4 ships it so
 * the consumer can confirm their submission landed.
 */
export async function listRecentConsumerReviewsByConsumer(
  limit = 20,
): Promise<ReviewActionResult<ConsumerOwnReview[]>> {
  const session = await getConsumerSession();
  if (!session) return fail('Please sign in');

  const cap = Math.max(1, Math.min(Math.floor(limit), 100));

  try {
    const supabase = createServerClient();

    // Stage 1: pull the consumer's bookings and their branches. We batch the
    // review lookup after so the query stays well within the supabase-js
    // builder's capabilities (no nested inner joins that depend on relation
    // hints the tests don't mock).
    const { data: bookingRows, error: bErr } = await supabase
      .from('bookings')
      .select('id, branch_id, salon_id')
      .eq('consumer_id', session.userId);
    if (bErr) return fail(safeError(bErr));

    const bookings = ((bookingRows ?? []) as Array<{
      id: string;
      branch_id: string;
      salon_id: string;
    }>);
    if (bookings.length === 0) return ok([]);

    const bookingIds = bookings.map((b) => b.id);
    const { data: reviewRows, error: rErr } = await supabase
      .from('reviews')
      .select('id, booking_id, rating, comment, created_at, direction')
      .in('booking_id', bookingIds);
    if (rErr) return fail(safeError(rErr));

    const reviews = ((reviewRows ?? []) as Array<{
      id: string;
      booking_id: string;
      rating: number;
      comment: string | null;
      created_at: string;
      direction: string;
    }>).filter((r) => r.direction === 'consumer_of_salon');

    if (reviews.length === 0) return ok([]);

    // Stage 2: hydrate branch + salon names. Separate reads so the test mock
    // doesn't need relationship joins.
    const bookingMap = new Map(bookings.map((b) => [b.id, b]));
    const branchIds = Array.from(
      new Set(reviews.map((r) => bookingMap.get(r.booking_id)?.branch_id).filter(Boolean) as string[]),
    );
    const salonIds = Array.from(
      new Set(reviews.map((r) => bookingMap.get(r.booking_id)?.salon_id).filter(Boolean) as string[]),
    );

    const [{ data: branchRows }, { data: salonRows }] = await Promise.all([
      branchIds.length > 0
        ? supabase.from('branches').select('id, slug').in('id', branchIds)
        : Promise.resolve({ data: [] as Array<{ id: string; slug: string | null }> }),
      salonIds.length > 0
        ? supabase.from('salons').select('id, name').in('id', salonIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    ]);
    const branchById = new Map(
      ((branchRows ?? []) as Array<{ id: string; slug: string | null }>).map((b) => [b.id, b]),
    );
    const salonById = new Map(
      ((salonRows ?? []) as Array<{ id: string; name: string }>).map((s) => [s.id, s]),
    );

    const out: ConsumerOwnReview[] = reviews
      .sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      .slice(0, cap)
      .map((r) => {
        const booking = bookingMap.get(r.booking_id);
        const branch = booking ? branchById.get(booking.branch_id) : undefined;
        const salon = booking ? salonById.get(booking.salon_id) : undefined;
        return {
          id: r.id,
          booking_id: r.booking_id,
          rating: Number(r.rating),
          comment: r.comment,
          created_at: r.created_at,
          salon_name: salon?.name ?? '',
          branch_slug: branch?.slug ?? null,
        };
      });

    return ok(out);
  } catch (err) {
    return fail(safeError(err));
  }
}
