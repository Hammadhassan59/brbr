/**
 * Rebook prefill helper — given an old `bookingId` and the branch the
 * consumer is currently checking out on, returns the subset of the old
 * booking's state that's safe to carry over into a fresh cart:
 *
 *   - serviceIds — only services that still belong to this branch's salon
 *   - addressId  — only if the old booking was a home booking AND the
 *                  address still exists in the consumer's address book
 *
 * Slot is intentionally NOT carried over — the consumer picks a fresh time.
 *
 * Graceful no-op on any mismatch:
 *   - booking doesn't exist
 *   - booking belongs to another consumer
 *   - booking belongs to a different salon
 *
 * Used by `/book/[slug]/page.tsx` when `?rebook=<bookingId>` is present.
 * Called from a server component, so we reuse the same service-role client
 * used elsewhere in the marketplace query layer.
 */

import { createServerClient } from '@/lib/supabase';

export interface RebookPrefill {
  serviceIds: string[];
  addressId: string | null;
}

const EMPTY: RebookPrefill = { serviceIds: [], addressId: null };

function isValidUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

/**
 * Load the rebook prefill. Returns an empty prefill for any failure path
 * (the caller treats this as a silent no-op — the wizard still renders,
 * just without pre-selection).
 *
 * @param bookingId    the `?rebook=` param from the URL
 * @param branchId     the branch the consumer is currently booking at
 * @param consumerId   the authenticated consumer's user id
 */
export async function getRebookPrefillForBranch(
  bookingId: string,
  branchId: string,
  consumerId: string,
): Promise<RebookPrefill> {
  if (!bookingId || !branchId || !consumerId) return EMPTY;
  if (!isValidUuid(bookingId)) return EMPTY;

  try {
    const supabase = createServerClient();

    // Fetch the old booking. Ownership + branch/salon match gate up front.
    const { data: row } = await supabase
      .from('bookings')
      .select('id, consumer_id, branch_id, salon_id, location_type, address_id')
      .eq('id', bookingId)
      .maybeSingle();
    if (!row) return EMPTY;
    const booking = row as {
      id: string;
      consumer_id: string;
      branch_id: string;
      salon_id: string;
      location_type: 'in_salon' | 'home';
      address_id: string | null;
    };
    if (booking.consumer_id !== consumerId) return EMPTY;

    // Resolve the current branch's salon. If it doesn't match the old
    // booking's salon, re-using services would be meaningless — abort.
    const { data: branchRow } = await supabase
      .from('branches')
      .select('id, salon_id')
      .eq('id', branchId)
      .maybeSingle();
    if (!branchRow) return EMPTY;
    const currentSalonId = (branchRow as { salon_id: string }).salon_id;
    if (currentSalonId !== booking.salon_id) return EMPTY;

    // Pull the old booking's services. Map back to the salon's active
    // `services` table — the IDs in `booking_items.service_id` reference the
    // live catalog, not a frozen snapshot, so we confirm each is still active
    // before returning it.
    const { data: itemRows } = await supabase
      .from('booking_items')
      .select('service_id')
      .eq('booking_id', bookingId);
    const oldServiceIds = ((itemRows ?? []) as Array<{ service_id: string }>).map(
      (r) => r.service_id,
    );

    let serviceIds: string[] = [];
    if (oldServiceIds.length > 0) {
      const { data: svcRows } = await supabase
        .from('services')
        .select('id, is_active')
        .in('id', oldServiceIds)
        .eq('salon_id', currentSalonId);
      const activeIds = new Set(
        ((svcRows ?? []) as Array<{ id: string; is_active: boolean | null }>)
          .filter((s) => s.is_active !== false)
          .map((s) => s.id),
      );
      // Preserve original order so the cart renders in a familiar sequence.
      serviceIds = oldServiceIds.filter((id) => activeIds.has(id));
    }

    // Address prefill: only for home bookings, and only if the address row
    // still exists and still belongs to this consumer.
    let addressId: string | null = null;
    if (booking.location_type === 'home' && booking.address_id) {
      const { data: addrRow } = await supabase
        .from('consumer_addresses')
        .select('id, consumer_id')
        .eq('id', booking.address_id)
        .maybeSingle();
      if (addrRow && (addrRow as { consumer_id: string }).consumer_id === consumerId) {
        addressId = (addrRow as { id: string }).id;
      }
    }

    return { serviceIds, addressId };
  } catch {
    return EMPTY;
  }
}
