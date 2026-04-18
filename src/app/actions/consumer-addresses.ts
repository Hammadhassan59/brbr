'use server';

/**
 * Consumer address book — server actions backing the "Address" step of the
 * `/book/[slug]` checkout wizard and the (future) `/account/addresses` page.
 *
 * Shape mirrors migration 041's `consumer_addresses` table:
 *   - `id uuid`
 *   - `consumer_id uuid` (= auth.users.id)
 *   - `label text` ("Home", "Office", etc.)
 *   - `street text`
 *   - `lat numeric(10,7)`
 *   - `lng numeric(10,7)`
 *   - `is_default boolean`
 *   - `created_at timestamptz`
 *
 * RLS policy on the table is "consumers can manage own rows" — but we still
 * stamp `consumer_id = session.userId` on every write and filter every read
 * by it at the app layer too, so a compromised service-role key can't hop
 * accounts.
 *
 * Only two endpoints today (the wizard + future addresses page call these);
 * delete/update can ship in a later wave.
 */

import { z } from 'zod';

import { getConsumerSession } from '@/lib/consumer-session';
import { createServerClient } from '@/lib/supabase';
import { safeError } from '@/lib/action-error';
import { checkRateLimit } from '@/lib/with-rate-limit';
import { UUIDSchema } from '@/lib/schemas/common';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface ConsumerAddress {
  id: string;
  label: string;
  street: string;
  lat: number;
  lng: number;
  is_default: boolean;
  created_at: string;
}

interface Ok<T> { ok: true; data: T }
interface Fail { ok: false; error: string }
export type ActionResult<T> = Ok<T> | Fail;

function ok<T>(data: T): Ok<T> { return { ok: true, data }; }
function fail(error: string): Fail { return { ok: false, error }; }

// ═══════════════════════════════════════════════════════════════════════════
// Input validation
// ═══════════════════════════════════════════════════════════════════════════

const SaveAddressSchema = z.object({
  label: z.string().trim().min(1, 'Label is required').max(60, 'Label is too long'),
  street: z.string().trim().min(3, 'Street is too short').max(500, 'Street is too long'),
  lat: z.number().finite().gte(-90).lte(90),
  lng: z.number().finite().gte(-180).lte(180),
  isDefault: z.boolean().optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
// saveConsumerAddress
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Insert a new address under the current consumer. If `isDefault` is set, all
 * other addresses for this consumer are cleared of `is_default` first so the
 * "only one default" rule holds. Supabase REST doesn't give us a transaction,
 * so the two writes run sequentially — the clear-flag UPDATE is idempotent
 * (running it twice hurts nothing) and failure to clear would leave a
 * consistent pair of defaults that the UI handles gracefully.
 */
export async function saveConsumerAddress(input: {
  label: string;
  street: string;
  lat: number;
  lng: number;
  isDefault?: boolean;
}): Promise<ActionResult<ConsumerAddress>> {
  const parsed = SaveAddressSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Invalid address');
  }
  const v = parsed.data;

  const session = await getConsumerSession();
  if (!session) return fail('Please sign in to save an address');

  // 20/min — gentle. The wizard's happy path hits this once per booking; a
  // burst typically means a buggy client or an abuse pattern.
  const rl = await checkRateLimit('consumer-address-save', session.userId, 20, 60 * 1000);
  if (!rl.ok) return fail(rl.error ?? 'Too many address updates. Try again in a minute.');

  try {
    const supabase = createServerClient();

    if (v.isDefault === true) {
      // Clear any existing defaults. Best-effort — if this errors we still
      // want to insert the new address; the UI will surface the duplicate
      // default on next read but both rows remain correct.
      const { error: clearErr } = await supabase
        .from('consumer_addresses')
        .update({ is_default: false })
        .eq('consumer_id', session.userId)
        .eq('is_default', true);
      if (clearErr) {
         
        console.error('[consumer-addresses] clear defaults failed', clearErr);
      }
    }

    const { data, error } = await supabase
      .from('consumer_addresses')
      .insert({
        consumer_id: session.userId,
        label: v.label,
        street: v.street,
        lat: v.lat,
        lng: v.lng,
        is_default: v.isDefault === true,
      })
      .select('id, label, street, lat, lng, is_default, created_at')
      .single();
    if (error || !data) return fail(safeError(error ?? new Error('Address insert failed')));

    const row = data as {
      id: string;
      label: string;
      street: string;
      lat: number | string;
      lng: number | string;
      is_default: boolean;
      created_at: string;
    };
    return ok({
      id: row.id,
      label: row.label,
      street: row.street,
      lat: Number(row.lat),
      lng: Number(row.lng),
      is_default: row.is_default,
      created_at: row.created_at,
    });
  } catch (err) {
    return fail(safeError(err));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// listConsumerAddresses
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Return the current consumer's saved addresses, defaults first then by
 * recency. Returns `[]` on any failure so UI can render an "add new" CTA
 * without blowing up on first-time users.
 */
export async function listConsumerAddresses(): Promise<ActionResult<ConsumerAddress[]>> {
  const session = await getConsumerSession();
  if (!session) return fail('Please sign in');

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('consumer_addresses')
      .select('id, label, street, lat, lng, is_default, created_at')
      .eq('consumer_id', session.userId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) return fail(safeError(error));

    const rows = ((data ?? []) as Array<{
      id: string;
      label: string;
      street: string;
      lat: number | string;
      lng: number | string;
      is_default: boolean;
      created_at: string;
    }>).map((r) => ({
      id: r.id,
      label: r.label,
      street: r.street,
      lat: Number(r.lat),
      lng: Number(r.lng),
      is_default: r.is_default,
      created_at: r.created_at,
    }));
    return ok(rows);
  } catch (err) {
    return fail(safeError(err));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// getConsumerAddress — single-row fetch used when the wizard resumes mid-flow
// with an `addressId` saved in state. Also scopes by consumer_id so nobody can
// use a saved address they don't own.
// ═══════════════════════════════════════════════════════════════════════════

export async function getConsumerAddress(
  addressId: string,
): Promise<ActionResult<ConsumerAddress>> {
  const idParsed = UUIDSchema.safeParse(addressId);
  if (!idParsed.success) return fail('Invalid address id');

  const session = await getConsumerSession();
  if (!session) return fail('Please sign in');

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('consumer_addresses')
      .select('id, label, street, lat, lng, is_default, created_at')
      .eq('id', addressId)
      .eq('consumer_id', session.userId)
      .maybeSingle();
    if (error) return fail(safeError(error));
    if (!data) return fail('Address not found');
    const r = data as {
      id: string;
      label: string;
      street: string;
      lat: number | string;
      lng: number | string;
      is_default: boolean;
      created_at: string;
    };
    return ok({
      id: r.id,
      label: r.label,
      street: r.street,
      lat: Number(r.lat),
      lng: Number(r.lng),
      is_default: r.is_default,
      created_at: r.created_at,
    });
  } catch (err) {
    return fail(safeError(err));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// updateConsumerAddress
// ═══════════════════════════════════════════════════════════════════════════

const UpdateAddressSchema = z.object({
  id: UUIDSchema,
  label: z.string().trim().min(1, 'Label is required').max(60, 'Label is too long'),
  street: z.string().trim().min(3, 'Street is too short').max(500, 'Street is too long'),
  lat: z.number().finite().gte(-90).lte(90),
  lng: z.number().finite().gte(-180).lte(180),
  isDefault: z.boolean().optional(),
});

/**
 * Update an existing address owned by the current consumer.
 *
 * Ownership check: the UPDATE is filtered by both `id` AND `consumer_id =
 * session.userId` so a forged id for someone else's address cannot write.
 * If `isDefault` is true, other defaults for the same consumer are cleared
 * first (mirroring `saveConsumerAddress`). Rate limited 20/min — same bucket
 * as the save flow so a burst of edits vs. creates share budget.
 */
export async function updateConsumerAddress(input: {
  id: string;
  label: string;
  street: string;
  lat: number;
  lng: number;
  isDefault?: boolean;
}): Promise<ActionResult<ConsumerAddress>> {
  const parsed = UpdateAddressSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Invalid address');
  }
  const v = parsed.data;

  const session = await getConsumerSession();
  if (!session) return fail('Please sign in to update an address');

  const rl = await checkRateLimit('consumer-address-save', session.userId, 20, 60 * 1000);
  if (!rl.ok) return fail(rl.error ?? 'Too many address updates. Try again in a minute.');

  try {
    const supabase = createServerClient();

    // Ownership pre-check: ensures the row exists and belongs to this
    // consumer. Without this the UPDATE silently no-ops for bogus ids —
    // we prefer a clear "Address not found" message.
    const { data: existing, error: findErr } = await supabase
      .from('consumer_addresses')
      .select('id')
      .eq('id', v.id)
      .eq('consumer_id', session.userId)
      .maybeSingle();
    if (findErr) return fail(safeError(findErr));
    if (!existing) return fail('Address not found');

    if (v.isDefault === true) {
      // Clear any existing defaults for this consumer EXCEPT the one being
      // updated. Best-effort: a failure here leaves the DB consistent
      // enough to render.
      const { error: clearErr } = await supabase
        .from('consumer_addresses')
        .update({ is_default: false })
        .eq('consumer_id', session.userId)
        .eq('is_default', true);
      if (clearErr) {
         
        console.error('[consumer-addresses] clear defaults failed', clearErr);
      }
    }

    const patch: Record<string, unknown> = {
      label: v.label,
      street: v.street,
      lat: v.lat,
      lng: v.lng,
    };
    if (v.isDefault !== undefined) patch.is_default = v.isDefault;

    const { error: updErr } = await supabase
      .from('consumer_addresses')
      .update(patch)
      .eq('id', v.id)
      .eq('consumer_id', session.userId);
    if (updErr) return fail(safeError(updErr));

    // Return the fresh row so callers can update local state without a
    // second round trip.
    const { data: fresh, error: fetchErr } = await supabase
      .from('consumer_addresses')
      .select('id, label, street, lat, lng, is_default, created_at')
      .eq('id', v.id)
      .eq('consumer_id', session.userId)
      .maybeSingle();
    if (fetchErr || !fresh) return fail(safeError(fetchErr ?? new Error('Address update failed')));

    const r = fresh as {
      id: string;
      label: string;
      street: string;
      lat: number | string;
      lng: number | string;
      is_default: boolean;
      created_at: string;
    };
    return ok({
      id: r.id,
      label: r.label,
      street: r.street,
      lat: Number(r.lat),
      lng: Number(r.lng),
      is_default: r.is_default,
      created_at: r.created_at,
    });
  } catch (err) {
    return fail(safeError(err));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// deleteConsumerAddress
// ═══════════════════════════════════════════════════════════════════════════

const DeleteAddressSchema = z.object({ id: UUIDSchema });

/** Booking statuses that still reference an address (non-terminal). If an
 * address is attached to any of these, deletion is refused so the booking
 * retains its "Where" record for the salon. Completed / cancelled / declined
 * / no-show bookings are "terminal" and snapshot the street text on the
 * booking row, so deleting the address is safe. */
const NON_TERMINAL_BOOKING_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'IN_PROGRESS',
] as const;

/**
 * Delete an address owned by the current consumer.
 *
 * Blocked when any non-terminal booking still references the row — the
 * salon needs the address for the upcoming visit. Completed / cancelled
 * bookings don't block since they snapshotted the street/lat/lng onto
 * `bookings.address_street/lat/lng` at creation time.
 */
export async function deleteConsumerAddress(input: {
  id: string;
}): Promise<ActionResult<{ id: string }>> {
  const parsed = DeleteAddressSchema.safeParse(input);
  if (!parsed.success) return fail('Invalid address id');
  const { id } = parsed.data;

  const session = await getConsumerSession();
  if (!session) return fail('Please sign in');

  const rl = await checkRateLimit('consumer-address-save', session.userId, 20, 60 * 1000);
  if (!rl.ok) return fail(rl.error ?? 'Too many address updates. Try again in a minute.');

  try {
    const supabase = createServerClient();

    // Ownership pre-check — refuses other consumers' addresses cleanly
    // (RLS would block the delete too, but the UX message is friendlier).
    const { data: existing, error: findErr } = await supabase
      .from('consumer_addresses')
      .select('id')
      .eq('id', id)
      .eq('consumer_id', session.userId)
      .maybeSingle();
    if (findErr) return fail(safeError(findErr));
    if (!existing) return fail('Address not found');

    // Refuse if any non-terminal booking still references this address.
    const { data: refs, error: refErr } = await supabase
      .from('bookings')
      .select('id, status')
      .eq('address_id', id)
      .in('status', NON_TERMINAL_BOOKING_STATUSES as unknown as string[])
      .limit(1);
    if (refErr) return fail(safeError(refErr));
    if (Array.isArray(refs) && refs.length > 0) {
      return fail('This address is used by a pending or confirmed booking.');
    }

    const { error: delErr } = await supabase
      .from('consumer_addresses')
      .delete()
      .eq('id', id)
      .eq('consumer_id', session.userId);
    if (delErr) return fail(safeError(delErr));

    return ok({ id });
  } catch (err) {
    return fail(safeError(err));
  }
}
