'use server';

/**
 * Salon-scoped consumer lookup — used by the salon's "Incoming Bookings" panel
 * to enrich a row with the consumer's contact + (salon-private) rating.
 *
 * Tenant boundary (per marketplace plan decision 30):
 *   - Consumer rating is NOT public. Salons only see it when the consumer has
 *     a booking at their own salon. No fishing for strangers' ratings.
 *
 * This helper exists because `listPendingBookingsForSalon` returns `consumer_id`
 * only — the panel needs name/phone/rating to render a useful row.
 *
 * Auth model (see `src/app/actions/bookings.ts` salon-side helpers for the
 * reference pattern):
 *   1. `verifySession()` must succeed and yield a salon-scoped session.
 *   2. `manage_salon` permission is enforced (same gate that lets the user
 *      Confirm/Decline a booking — if they can't mutate bookings, they can't
 *      see the consumer's private rating either).
 *   3. There MUST be at least one booking row linking this salon to this
 *      consumer. If there is no relationship, we return `NOT_FOUND` — exactly
 *      the same shape as if the consumer doesn't exist, so we don't leak the
 *      consumer's existence across tenants.
 */

import { verifySession } from '@/app/actions/auth';
import { createServerClient } from '@/lib/supabase';
import { requirePermission, tenantErrorMessage } from '@/lib/tenant-guard';
import { UUIDSchema } from '@/lib/schemas/common';
import { safeError } from '@/lib/action-error';

export interface ConsumerForSalonView {
  id: string;
  name: string;
  phone: string;
  rating_avg: number | null;
  rating_count: number;
}

interface Ok<T> { ok: true; data: T }
interface Fail { ok: false; error: string }
export type ActionResult<T> = Ok<T> | Fail;

/**
 * Returns the consumer's display fields + salon-private rating.
 *
 * Returns the same `{ ok: false, error: 'Not found' }` shape for three cases
 * so cross-tenant existence is never leaked:
 *   - consumer id doesn't exist
 *   - consumer exists but has never booked this salon
 *   - any DB error during the ownership check
 *
 * Fields intentionally limited: name, phone, rating_avg, rating_count. No
 * email, no address book — those are out of scope for the panel.
 */
export async function getConsumerByIdForSalon(
  consumerId: string,
): Promise<ActionResult<ConsumerForSalonView>> {
  const parsed = UUIDSchema.safeParse(consumerId);
  if (!parsed.success) return { ok: false, error: 'Invalid consumer id' };

  let session;
  try {
    session = await verifySession();
  } catch {
    return { ok: false, error: 'Not authenticated' };
  }
  if (!session.salonId || session.salonId === 'super-admin') {
    return { ok: false, error: 'No salon context' };
  }
  try {
    requirePermission(session, 'manage_salon');
  } catch (e) {
    return { ok: false, error: tenantErrorMessage(e) ?? 'Not allowed' };
  }

  try {
    const supabase = createServerClient();

    // Step 1: tenant boundary — the consumer must have at least one booking
    // at this salon. If not, return NOT_FOUND to avoid leaking existence.
    const { data: bookingLink, error: linkErr } = await supabase
      .from('bookings')
      .select('id')
      .eq('salon_id', session.salonId)
      .eq('consumer_id', consumerId)
      .limit(1);
    if (linkErr) return { ok: false, error: safeError(linkErr) };
    if (!bookingLink || bookingLink.length === 0) {
      return { ok: false, error: 'Not found' };
    }

    // Step 2: fetch the consumer's limited fields. We select only what the
    // panel renders — never email, never address — so a future leak here is
    // bounded to the rating that decision 26 already classes as salon-private.
    const { data: consumerRow, error: consumerErr } = await supabase
      .from('consumers')
      .select('id, name, phone, rating_avg, rating_count')
      .eq('id', consumerId)
      .maybeSingle();
    if (consumerErr) return { ok: false, error: safeError(consumerErr) };
    if (!consumerRow) return { ok: false, error: 'Not found' };

    const c = consumerRow as {
      id: string;
      name: string | null;
      phone: string | null;
      rating_avg: number | string | null;
      rating_count: number | null;
    };

    return {
      ok: true,
      data: {
        id: c.id,
        name: c.name ?? '',
        phone: c.phone ?? '',
        rating_avg: c.rating_avg == null ? null : Number(c.rating_avg),
        rating_count: Number(c.rating_count ?? 0),
      },
    };
  } catch (err) {
    return { ok: false, error: safeError(err) };
  }
}
