'use server';

/**
 * Marketplace bookings — server actions for consumer checkout and salon-side
 * confirm/decline/complete flow.
 *
 * Two audiences share this file:
 *
 *   Consumer side (session via `getConsumerSession()`; Supabase auth cookie):
 *     - createBooking              — checkout cart → bookings row PENDING
 *     - cancelBookingByConsumer    — consumer withdraws a PENDING/CONFIRMED booking
 *     - getBookingForConsumer      — order-details read for "My bookings"
 *
 *   Salon side (session via `verifySession()`; custom JWT):
 *     - confirmBooking             — PENDING → CONFIRMED
 *     - declineBooking             — PENDING → DECLINED
 *     - cancelBookingBySalon       — CONFIRMED → CANCELLED_BY_SALON
 *     - markBookingInProgress      — CONFIRMED → IN_PROGRESS
 *     - markBookingComplete        — IN_PROGRESS|CONFIRMED → COMPLETED
 *     - markBookingNoShow          — CONFIRMED → NO_SHOW
 *     - listPendingBookingsForSalon — realtime panel feed (read-only)
 *
 * State machine (see migration 041_marketplace_groundwork.sql):
 *
 *   PENDING ──confirmBooking──►          CONFIRMED
 *   PENDING ──declineBooking──►          DECLINED               (terminal)
 *   PENDING ──cancelBookingByConsumer──► CANCELLED_BY_CONSUMER  (terminal)
 *
 *   CONFIRMED ──cancelBookingByConsumer──► CANCELLED_BY_CONSUMER
 *     (triggers `increment_consumer_counters` → post_confirm_cancel_count++)
 *   CONFIRMED ──cancelBookingBySalon──►   CANCELLED_BY_SALON
 *   CONFIRMED ──markBookingInProgress──►  IN_PROGRESS
 *   CONFIRMED ──markBookingComplete──►    COMPLETED
 *     (triggers `apply_payable_on_completion` on home bookings → salon payable++)
 *   CONFIRMED ──markBookingNoShow──►      NO_SHOW
 *     (triggers `increment_consumer_counters` → no_show_count++)
 *
 *   IN_PROGRESS ──markBookingComplete──►  COMPLETED
 *
 * Invariants enforced here (not by the DB):
 *   - consumer.blocked_by_admin=false before any booking is created.
 *   - Branch is listed (listed_on_marketplace), not admin-blocked, and matches
 *     the marketplace gender gate (men-only launch or platform flag on).
 *   - Consumer slot doesn't overlap another PENDING/CONFIRMED booking of theirs
 *     (best-effort — not a hard DB constraint since overlapping can race).
 *   - For mode='home': branch opt-in, address inside radius (haversine).
 *
 * Supabase Realtime: salon dashboards subscribe to `public.bookings` inserts
 * filtered on `salon_id=eq.<salonId>`. A plain `INSERT` is enough — we do not
 * broadcast anything manually. Same for status updates: an UPDATE on the row
 * fires the replication event, consumer/salon UIs can subscribe as needed.
 *
 * Parallel-agent imports:
 *   - `@/lib/marketplace/pricing`  — owned by a sibling agent. Imported via a
 *     lazy `import()` with inline fallback so this file keeps compiling even
 *     if the module signature drifts before ship. Mode names differ between
 *     the two files (`'in_salon'|'home'` here vs `'at_salon'|'at_home'` in
 *     pricing) — we map at the call site.
 *   - `@/lib/marketplace/emails`   — same pattern. Every send is wrapped in a
 *     try/catch so a Resend hiccup can never fail the booking write.
 *
 * week-5 addition: `listBookingsForConsumer` — reads only; powers the
 * `/account/bookings` list page (Week 5 deliverable). Same tenant-guard
 * pattern as `getBookingForConsumer` — every row filtered by
 * `consumer_id = session.userId` at the app layer.
 */

import { z } from 'zod';

import { verifySession } from './auth';
import { getConsumerSession } from '@/lib/consumer-session';
import { createServerClient } from '@/lib/supabase';
import { UUIDSchema } from '@/lib/schemas/common';
import { checkRateLimit } from '@/lib/with-rate-limit';
import { safeError } from '@/lib/action-error';
import { distanceKm } from '@/lib/mapbox';
import { requirePermission, tenantErrorMessage } from '@/lib/tenant-guard';

// ═══════════════════════════════════════════════════════════════════════════
// Types + action-result shape
// ═══════════════════════════════════════════════════════════════════════════

export type BookingStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'DECLINED'
  | 'CANCELLED_BY_CONSUMER'
  | 'CANCELLED_BY_SALON'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'NO_SHOW';

export type BookingMode = 'in_salon' | 'home';

interface Ok<T> { ok: true; data: T }
interface Fail { ok: false; error: string }
export type ActionResult<T> = Ok<T> | Fail;

function ok<T>(data: T): Ok<T> { return { ok: true, data }; }
function fail(error: string): Fail { return { ok: false, error }; }

// ═══════════════════════════════════════════════════════════════════════════
// Pricing — defensive wrapper
// ═══════════════════════════════════════════════════════════════════════════
// The canonical pricing math lives in `@/lib/marketplace/pricing` (parallel
// agent). That module exports `computeBookingTotals({ items: [{base}], mode })`
// where `mode` is the CONSUMER-facing `'at_salon'|'at_home'` string. We accept
// the bookings-table mode (`'in_salon'|'home'`) here and translate in-line.
//
// If the module is missing at runtime (mid-merge drift), we compute the same
// formula inline so the booking still goes through. The inline code matches
// decisions 18-20 of the 2026-04-18 marketplace plan.
//
// TODO(marketplace/pricing): once `@/lib/marketplace/pricing` is pinned and on
// `main`, drop the inline fallback and make the import static.

interface PricingItemInput {
  service_id: string;
  service_name: string;
  salon_base_price: number;
}

interface PricingItem extends PricingItemInput {
  display_price: number;
}

interface PricingTotals {
  items: PricingItem[];
  salon_base_total: number;
  platform_markup: number;
  service_charge: number;
  consumer_total: number;
}

function roundUp50(n: number): number {
  return Math.ceil(n / 50) * 50;
}

function inlineComputePricing(items: PricingItemInput[], mode: BookingMode): PricingTotals {
  const HOME_MARKUP_MULT = 1.3;
  const HOME_SERVICE_CHARGE = 300;

  let salonBaseTotal = 0;
  let displayTotal = 0;
  const priced: PricingItem[] = items.map((it) => {
    const base = Number(it.salon_base_price);
    const display = mode === 'home' ? roundUp50(base * HOME_MARKUP_MULT) : base;
    salonBaseTotal += base;
    displayTotal += display;
    return { ...it, salon_base_price: base, display_price: display };
  });

  const service_charge = mode === 'home' && salonBaseTotal > 0 ? HOME_SERVICE_CHARGE : 0;
  const platform_markup = displayTotal - salonBaseTotal;
  const consumer_total = displayTotal + service_charge;
  return {
    items: priced,
    salon_base_total: salonBaseTotal,
    platform_markup,
    service_charge,
    consumer_total,
  };
}

async function computePricing(
  items: PricingItemInput[],
  mode: BookingMode,
): Promise<PricingTotals> {
  try {
    const mod = (await import('@/lib/marketplace/pricing').catch(() => null)) as
      | {
          computeBookingTotals?: (args: {
            items: Array<{ base: number }>;
            mode: 'at_salon' | 'at_home';
          }) => {
            salon_base_total: number;
            platform_markup: number;
            service_charge: number;
            consumer_total: number;
          };
          displayPriceForMode?: (base: number, mode: 'at_salon' | 'at_home') => number;
        }
      | null;
    if (mod?.computeBookingTotals && mod.displayPriceForMode) {
      const moduleMode: 'at_salon' | 'at_home' = mode === 'home' ? 'at_home' : 'at_salon';
      const totals = mod.computeBookingTotals({
        items: items.map((it) => ({ base: Number(it.salon_base_price) })),
        mode: moduleMode,
      });
      const priced: PricingItem[] = items.map((it) => ({
        service_id: it.service_id,
        service_name: it.service_name,
        salon_base_price: Number(it.salon_base_price),
        display_price: mod.displayPriceForMode!(Number(it.salon_base_price), moduleMode),
      }));
      return {
        items: priced,
        salon_base_total: totals.salon_base_total,
        platform_markup: totals.platform_markup,
        service_charge: totals.service_charge,
        consumer_total: totals.consumer_total,
      };
    }
  } catch {
    // fall through to inline
  }
  return inlineComputePricing(items, mode);
}

// ═══════════════════════════════════════════════════════════════════════════
// Emails — defensive wrapper
// ═══════════════════════════════════════════════════════════════════════════
// `@/lib/marketplace/emails` exports one function per template. We wrap each
// call in try/catch so a transport failure (unset RESEND_API_KEY, network
// error, rate-limited) never cascades into the booking action. The wrapper
// functions here accept a minimal payload and resolve missing fields (e.g.
// salonName, consumerName) from the caller.
//
// If the module is missing entirely, every call becomes a no-op. The booking
// lifecycle must remain correct without any email ever firing.

type EmailCall = () => Promise<unknown>;

async function safeSend(call: EmailCall): Promise<void> {
  try {
    await call();
  } catch (err) {
    // Log only; never throw.
     
    console.error('[bookings] email send failed', err);
  }
}

type EmailsModule = typeof import('@/lib/marketplace/emails');

async function loadEmails(): Promise<EmailsModule | null> {
  try {
    const mod = await import('@/lib/marketplace/emails');
    return mod;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Input schemas
// ═══════════════════════════════════════════════════════════════════════════

const ISODateTime = z
  .string()
  .refine((s) => !Number.isNaN(new Date(s).getTime()), 'Invalid ISO-8601 datetime');

const CreateBookingSchema = z
  .object({
    branchId: UUIDSchema,
    serviceIds: z.array(UUIDSchema).min(1, 'At least one service is required').max(10, 'Too many services'),
    slotStart: ISODateTime,
    slotEnd: ISODateTime,
    mode: z.enum(['in_salon', 'home']),
    addressId: UUIDSchema.optional(),
    addressStreet: z.string().trim().min(3).max(500).optional(),
    addressLat: z.number().gte(-90).lte(90).optional(),
    addressLng: z.number().gte(-180).lte(180).optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .refine((v) => new Date(v.slotEnd).getTime() > new Date(v.slotStart).getTime(), {
    message: 'slotEnd must be after slotStart',
    path: ['slotEnd'],
  });

const DeclineSchema = z.object({
  bookingId: UUIDSchema,
  reason: z.string().trim().max(500).optional(),
});

const CancelBySalonSchema = z.object({
  bookingId: UUIDSchema,
  reason: z.string().trim().max(500).optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
// createBooking — consumer-side
// ═══════════════════════════════════════════════════════════════════════════

export async function createBooking(input: {
  branchId: string;
  serviceIds: string[];
  slotStart: string;
  slotEnd: string;
  mode: BookingMode;
  addressId?: string;
  addressStreet?: string;
  addressLat?: number;
  addressLng?: number;
  notes?: string;
}): Promise<ActionResult<{ bookingId: string }>> {
  const parsed = CreateBookingSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Invalid input');
  }
  const v = parsed.data;

  const session = await getConsumerSession();
  if (!session) return fail('Please sign in to book');

  const rl = await checkRateLimit('booking-create', session.userId, 5, 60 * 1000);
  if (!rl.ok) return fail(rl.error ?? 'Too many booking requests. Try again in a minute.');

  try {
    const supabase = createServerClient();

    // 1. Consumer block gate.
    const { data: consumerRow, error: consumerErr } = await supabase
      .from('consumers')
      .select('id, name, blocked_by_admin')
      .eq('id', session.userId)
      .maybeSingle();
    if (consumerErr) return fail(safeError(consumerErr));
    if (!consumerRow) return fail('Consumer profile not found');
    const consumer = consumerRow as { id: string; name: string; blocked_by_admin: boolean };
    if (consumer.blocked_by_admin) {
      return fail('Your account is not allowed to create bookings. Contact support.');
    }

    // 2. Branch visibility gate.
    const { data: branchRow, error: branchErr } = await supabase
      .from('branches')
      .select(
        `id, name, salon_id, listed_on_marketplace, offers_home_service,
         home_service_radius_km, lat, lng, gender_type,
         marketplace_admin_blocked_at`,
      )
      .eq('id', v.branchId)
      .maybeSingle();
    if (branchErr) return fail(safeError(branchErr));
    if (!branchRow) return fail('Salon not found');
    const branch = branchRow as {
      id: string;
      name: string;
      salon_id: string;
      listed_on_marketplace: boolean;
      offers_home_service: boolean;
      home_service_radius_km: number | null;
      lat: number | null;
      lng: number | null;
      gender_type: 'men' | 'women' | 'mixed' | null;
      marketplace_admin_blocked_at: string | null;
    };

    if (!branch.listed_on_marketplace) return fail('Salon is not accepting bookings');
    if (branch.marketplace_admin_blocked_at) return fail('Salon is not accepting bookings');

    // 3. Salon block gate (admin + payable).
    const { data: salonRow, error: salonErr } = await supabase
      .from('salons')
      .select('id, name, marketplace_admin_blocked_at, marketplace_payable_blocked_at')
      .eq('id', branch.salon_id)
      .maybeSingle();
    if (salonErr) return fail(safeError(salonErr));
    if (!salonRow) return fail('Salon not found');
    const salon = salonRow as {
      id: string;
      name: string;
      marketplace_admin_blocked_at: string | null;
      marketplace_payable_blocked_at: string | null;
    };
    if (salon.marketplace_admin_blocked_at) return fail('Salon is not accepting bookings');

    // 4. Gender gate — men-only launch. If salon is women/mixed, check the
    //    `marketplace_women_enabled` platform flag.
    if (branch.gender_type !== 'men') {
      const { data: flagRow } = await supabase
        .from('platform_settings')
        .select('value')
        .eq('key', 'marketplace_women_enabled')
        .maybeSingle();
      const womenEnabled = (flagRow as { value?: unknown } | null)?.value === true;
      if (!womenEnabled) return fail('Salon is not accepting bookings');
    }

    // 5. Home-mode rules.
    if (v.mode === 'home') {
      if (!branch.offers_home_service) return fail('This salon does not offer home service');
      if (salon.marketplace_payable_blocked_at) {
        return fail('Salon is temporarily not accepting new home bookings');
      }
      if (v.addressLat === undefined || v.addressLng === undefined || !v.addressStreet) {
        return fail('Address is required for home service');
      }
      if (branch.lat != null && branch.lng != null && branch.home_service_radius_km != null) {
        const dist = distanceKm(
          Number(branch.lat),
          Number(branch.lng),
          v.addressLat,
          v.addressLng,
        );
        if (dist > Number(branch.home_service_radius_km)) {
          return fail("Address is outside the salon's home-service area");
        }
      }
    } else {
      // in_salon: reject stray address fields so the DB CHECK constraint
      // doesn't reject us later with a generic error.
      if (v.addressId || v.addressStreet || v.addressLat !== undefined || v.addressLng !== undefined) {
        return fail('Address cannot be provided for in-salon bookings');
      }
    }

    // 6. Services fetch. All services must belong to this branch's salon and
    //    be active. For home mode we additionally require `available_at_home`.
    const { data: serviceRows, error: svcErr } = await supabase
      .from('services')
      .select('id, salon_id, name, base_price, available_at_home, is_active')
      .in('id', v.serviceIds);
    if (svcErr) return fail(safeError(svcErr));
    const services = (serviceRows ?? []) as Array<{
      id: string;
      salon_id: string;
      name: string;
      base_price: number;
      available_at_home: boolean | null;
      is_active: boolean | null;
    }>;
    if (services.length !== v.serviceIds.length) {
      return fail('One or more services were not found');
    }
    for (const s of services) {
      if (s.salon_id !== branch.salon_id) return fail('Service does not belong to this salon');
      if (s.is_active === false) return fail(`Service "${s.name}" is not available`);
      if (v.mode === 'home' && s.available_at_home === false) {
        return fail(`Service "${s.name}" is not offered at home`);
      }
    }

    // 7. Overlap gate (best-effort).
    const { data: overlaps, error: overlapErr } = await supabase
      .from('bookings')
      .select('id')
      .eq('consumer_id', session.userId)
      .in('status', ['PENDING', 'CONFIRMED'])
      .lt('requested_slot_start', v.slotEnd)
      .gt('requested_slot_end', v.slotStart)
      .limit(1);
    if (overlapErr) return fail(safeError(overlapErr));
    if (overlaps && overlaps.length > 0) {
      return fail('You already have a booking in this time slot');
    }

    // 8. Compute pricing snapshot.
    const pricing = await computePricing(
      services.map((s) => ({
        service_id: s.id,
        service_name: s.name,
        salon_base_price: Number(s.base_price),
      })),
      v.mode,
    );

    // 9. Insert booking row, then items. Supabase REST doesn't expose
    //    transactions, so if the items insert fails we roll back by deleting
    //    the parent booking. The window between the two calls is tiny — same
    //    service_role process, no network hop between them in practice.
    const bookingInsert: Record<string, unknown> = {
      consumer_id: session.userId,
      branch_id: branch.id,
      salon_id: branch.salon_id,
      status: 'PENDING',
      location_type: v.mode,
      requested_slot_start: v.slotStart,
      requested_slot_end: v.slotEnd,
      salon_base_total: pricing.salon_base_total,
      platform_markup: pricing.platform_markup,
      service_charge: pricing.service_charge,
      consumer_total: pricing.consumer_total,
      consumer_notes: v.notes ?? null,
    };
    if (v.mode === 'home') {
      bookingInsert.address_id = v.addressId ?? null;
      bookingInsert.address_street = v.addressStreet;
      bookingInsert.address_lat = v.addressLat;
      bookingInsert.address_lng = v.addressLng;
    }

    const { data: bookingRow, error: bookingErr } = await supabase
      .from('bookings')
      .insert(bookingInsert)
      .select('id')
      .single();
    if (bookingErr || !bookingRow) return fail(safeError(bookingErr ?? new Error('Booking insert failed')));
    const bookingId = (bookingRow as { id: string }).id;

    const itemRows = pricing.items.map((it) => ({
      booking_id: bookingId,
      service_id: it.service_id,
      service_name: it.service_name,
      salon_base_price: it.salon_base_price,
      display_price: it.display_price,
    }));
    const { error: itemsErr } = await supabase.from('booking_items').insert(itemRows);
    if (itemsErr) {
      // Best-effort rollback.
      await supabase.from('bookings').delete().eq('id', bookingId);
      return fail(safeError(itemsErr));
    }

    // 10. Queue the confirmation email (fire-and-forget).
    const emails = await loadEmails();
    const sendReceived = emails?.sendBookingReceivedEmail;
    if (sendReceived && session.email) {
      const to = session.email;
      await safeSend(() =>
        sendReceived({
          to,
          consumerName: consumer.name || session.name,
          salonName: salon.name,
          services: pricing.items.map((it) => ({
            name: it.service_name,
            displayPrice: it.display_price,
          })),
          requestedSlot: v.slotStart,
          mode: v.mode,
          consumerTotal: pricing.consumer_total,
          bookingId,
        }),
      );
    }

    return ok({ bookingId });
  } catch (err) {
    return fail(safeError(err));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// cancelBookingByConsumer — consumer-side
// ═══════════════════════════════════════════════════════════════════════════

export async function cancelBookingByConsumer(
  bookingId: string,
): Promise<ActionResult<{ bookingId: string }>> {
  const idParsed = UUIDSchema.safeParse(bookingId);
  if (!idParsed.success) return fail('Invalid booking id');

  const session = await getConsumerSession();
  if (!session) return fail('Please sign in');

  const rl = await checkRateLimit('booking-cancel-consumer', session.userId, 10, 60 * 1000);
  if (!rl.ok) return fail(rl.error ?? 'Too many cancellations. Try again in a minute.');

  try {
    const supabase = createServerClient();

    const { data: row, error: readErr } = await supabase
      .from('bookings')
      .select('id, consumer_id, status')
      .eq('id', bookingId)
      .maybeSingle();
    if (readErr) return fail(safeError(readErr));
    if (!row) return fail('Booking not found');
    const booking = row as { id: string; consumer_id: string; status: BookingStatus };
    if (booking.consumer_id !== session.userId) return fail('Not allowed');
    if (booking.status !== 'PENDING' && booking.status !== 'CONFIRMED') {
      return fail(`Cannot cancel booking in status ${booking.status}`);
    }

    const now = new Date().toISOString();
    const { error: updErr } = await supabase
      .from('bookings')
      .update({
        status: 'CANCELLED_BY_CONSUMER',
        cancelled_at: now,
        cancelled_by: 'consumer',
        updated_at: now,
      })
      .eq('id', bookingId)
      .eq('consumer_id', session.userId);
    if (updErr) return fail(safeError(updErr));

    // Email: consumer confirmation of their own cancellation. The marketplace
    // emails module doesn't currently ship a "you cancelled" template — fire
    // nothing and move on; the UI will render the new status.

    return ok({ bookingId });
  } catch (err) {
    return fail(safeError(err));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// getBookingForConsumer — consumer-side read
// ═══════════════════════════════════════════════════════════════════════════

export interface ConsumerBookingView {
  id: string;
  status: BookingStatus;
  location_type: BookingMode;
  requested_slot_start: string;
  requested_slot_end: string;
  salon_base_total: number;
  platform_markup: number;
  service_charge: number;
  consumer_total: number;
  address_street: string | null;
  consumer_notes: string | null;
  confirmed_at: string | null;
  declined_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  completed_at: string | null;
  review_window_closes_at: string | null;
  created_at: string;
  branch: {
    id: string;
    name: string;
    slug: string | null;
    lat: number | null;
    lng: number | null;
    address: string | null;
    phone: string | null;
  };
  items: Array<{
    id: string;
    service_name: string;
    salon_base_price: number;
    display_price: number;
  }>;
}

export async function getBookingForConsumer(
  bookingId: string,
): Promise<ActionResult<ConsumerBookingView>> {
  const idParsed = UUIDSchema.safeParse(bookingId);
  if (!idParsed.success) return fail('Invalid booking id');

  const session = await getConsumerSession();
  if (!session) return fail('Please sign in');

  try {
    const supabase = createServerClient();

    // Separate reads (no join) so this stays easy to mock in tests and so the
    // ownership check runs before we leak ANY branch fields cross-tenant.
    const { data: bookingRow, error: bErr } = await supabase
      .from('bookings')
      .select(
        `id, status, location_type, requested_slot_start, requested_slot_end,
         salon_base_total, platform_markup, service_charge, consumer_total,
         address_street, consumer_notes, confirmed_at, declined_at,
         cancelled_at, cancelled_by, completed_at, review_window_closes_at,
         created_at, consumer_id, branch_id`,
      )
      .eq('id', bookingId)
      .maybeSingle();
    if (bErr) return fail(safeError(bErr));
    if (!bookingRow) return fail('Booking not found');
    const b = bookingRow as ConsumerBookingView & {
      consumer_id: string;
      branch_id: string;
    };
    if (b.consumer_id !== session.userId) return fail('Not allowed');

    const [{ data: branchRow }, { data: itemRows }] = await Promise.all([
      supabase
        .from('branches')
        .select('id, name, slug, lat, lng, address, phone')
        .eq('id', b.branch_id)
        .maybeSingle(),
      supabase
        .from('booking_items')
        .select('id, service_name, salon_base_price, display_price')
        .eq('booking_id', bookingId),
    ]);

    const view: ConsumerBookingView = {
      id: b.id,
      status: b.status,
      location_type: b.location_type,
      requested_slot_start: b.requested_slot_start,
      requested_slot_end: b.requested_slot_end,
      salon_base_total: Number(b.salon_base_total),
      platform_markup: Number(b.platform_markup),
      service_charge: Number(b.service_charge),
      consumer_total: Number(b.consumer_total),
      address_street: b.address_street,
      consumer_notes: b.consumer_notes,
      confirmed_at: b.confirmed_at,
      declined_at: b.declined_at,
      cancelled_at: b.cancelled_at,
      cancelled_by: b.cancelled_by,
      completed_at: b.completed_at,
      review_window_closes_at: b.review_window_closes_at,
      created_at: b.created_at,
      branch: (branchRow as ConsumerBookingView['branch']) ?? {
        id: b.branch_id,
        name: '',
        slug: null,
        lat: null,
        lng: null,
        address: null,
        phone: null,
      },
      items: ((itemRows ?? []) as ConsumerBookingView['items']) ?? [],
    };
    return ok(view);
  } catch (err) {
    return fail(safeError(err));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// listBookingsForConsumer — consumer-side list (Week 5)
// ═══════════════════════════════════════════════════════════════════════════

/** Summary row shape used by the `/account/bookings` list. */
export interface ConsumerBookingListItem {
  id: string;
  status: BookingStatus;
  location_type: BookingMode;
  requested_slot_start: string;
  requested_slot_end: string;
  consumer_total: number;
  created_at: string;
  branch: {
    id: string;
    name: string;
    slug: string | null;
  };
  /** Derived client-side for the "rebook" CTA — null until completion. */
  completed_at: string | null;
}

/** Bucket tag; the list page renders each bucket as its own section. */
export type ConsumerBookingBucket = 'upcoming' | 'past' | 'all';

// Kept file-local (not exported) because Next 16's `'use server'` files may
// only export async functions — exporting these arrays would trip
// "A 'use server' file can only export async functions, found object."
/** Statuses that belong in the "Upcoming" bucket. */
const UPCOMING_BOOKING_STATUSES: BookingStatus[] = [
  'PENDING',
  'CONFIRMED',
  'IN_PROGRESS',
];

/** Statuses that belong in the "Past" bucket. Includes terminal cancellations. */
const PAST_BOOKING_STATUSES: BookingStatus[] = [
  'COMPLETED',
  'DECLINED',
  'CANCELLED_BY_CONSUMER',
  'CANCELLED_BY_SALON',
  'NO_SHOW',
];

/**
 * List the current consumer's bookings, optionally filtered to upcoming or
 * past. The page at `/account/bookings` calls this twice (once per bucket)
 * so each list can be sorted independently (upcoming asc by slot, past desc
 * by slot — most relevant first in both).
 *
 * Pagination is a simple 50-row cap with a client-supplied `limit`; no cursor
 * is needed at the current scale. Branch name/slug is joined in via a
 * second tiny read to keep the in-memory test mocks simple.
 *
 * Note: we filter `consumer_id = session.userId` at the app layer in addition
 * to whatever RLS exists — the same belt-and-suspenders pattern as
 * `getBookingForConsumer`.
 */
export async function listBookingsForConsumer(opts?: {
  bucket?: ConsumerBookingBucket;
  limit?: number;
  status?: BookingStatus;
}): Promise<ActionResult<ConsumerBookingListItem[]>> {
  const session = await getConsumerSession();
  if (!session) return fail('Please sign in');

  const bucket: ConsumerBookingBucket = opts?.bucket ?? 'all';
  // Hard ceiling: 50 rows per call. Callers may ask for less.
  const rawLimit = opts?.limit ?? 50;
  const limit = Math.min(50, Math.max(1, Math.floor(Number(rawLimit) || 50)));

  try {
    const supabase = createServerClient();

    let statuses: BookingStatus[];
    if (opts?.status) {
      statuses = [opts.status];
    } else if (bucket === 'upcoming') {
      statuses = UPCOMING_BOOKING_STATUSES;
    } else if (bucket === 'past') {
      statuses = PAST_BOOKING_STATUSES;
    } else {
      statuses = [
        ...UPCOMING_BOOKING_STATUSES,
        ...PAST_BOOKING_STATUSES,
      ];
    }

    // Upcoming sorts ASC (next up first), past DESC (most recent first).
    const ascending = bucket === 'upcoming';

    const { data: rows, error } = await supabase
      .from('bookings')
      .select(
        `id, status, location_type, requested_slot_start, requested_slot_end,
         consumer_total, created_at, completed_at, consumer_id, branch_id`,
      )
      .eq('consumer_id', session.userId)
      .in('status', statuses)
      .order('requested_slot_start', { ascending })
      .limit(limit);
    if (error) return fail(safeError(error));

    const bookings = (rows ?? []) as Array<{
      id: string;
      status: BookingStatus;
      location_type: BookingMode;
      requested_slot_start: string;
      requested_slot_end: string;
      consumer_total: number | string;
      created_at: string;
      completed_at: string | null;
      consumer_id: string;
      branch_id: string;
    }>;

    // Defensive ownership filter — belt-and-suspenders on top of RLS.
    const owned = bookings.filter((b) => b.consumer_id === session.userId);

    if (owned.length === 0) return ok([]);

    // Batch branch lookups. Single `.in()` fetch.
    const branchIds = Array.from(new Set(owned.map((b) => b.branch_id)));
    const { data: branchRows } = await supabase
      .from('branches')
      .select('id, name, slug')
      .in('id', branchIds);
    const branchMap = new Map<string, { id: string; name: string; slug: string | null }>();
    for (const r of (branchRows ?? []) as Array<{ id: string; name: string; slug: string | null }>) {
      branchMap.set(r.id, { id: r.id, name: r.name, slug: r.slug });
    }

    const items: ConsumerBookingListItem[] = owned.map((b) => ({
      id: b.id,
      status: b.status,
      location_type: b.location_type,
      requested_slot_start: b.requested_slot_start,
      requested_slot_end: b.requested_slot_end,
      consumer_total: Number(b.consumer_total),
      created_at: b.created_at,
      completed_at: b.completed_at,
      branch: branchMap.get(b.branch_id) ?? {
        id: b.branch_id,
        name: '',
        slug: null,
      },
    }));

    return ok(items);
  } catch (err) {
    return fail(safeError(err));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Salon-side helpers
// ═══════════════════════════════════════════════════════════════════════════

interface SalonMutationExtras {
  bookingId: string;
  requireFromStatus: BookingStatus[];
  toStatus: BookingStatus;
  /** Extra columns to write on the UPDATE. */
  extras?: Record<string, unknown>;
  /** Rate-limit bucket (per salon, 60/min default). */
  rateLimitBucket: string;
}

interface MutatedBookingContext {
  bookingId: string;
  salonId: string;
  consumerId: string;
  locationType: BookingMode;
  fromStatus: BookingStatus;
  toStatus: BookingStatus;
}

/**
 * Shared salon-side mutation pipeline: auth → permission → rate limit →
 * ownership → state-machine check → UPDATE. On success, returns the mutation
 * context so the caller can fire zero, one, or several emails. The shared
 * helper intentionally doesn't fire emails itself — completion fires TWO,
 * no-show fires ZERO, decline/cancel fire ONE but with different reasons.
 */
async function mutateSalonBooking(
  opts: SalonMutationExtras,
): Promise<{ ok: true; ctx: MutatedBookingContext } | { ok: false; error: string }> {
  const idParsed = UUIDSchema.safeParse(opts.bookingId);
  if (!idParsed.success) return { ok: false, error: 'Invalid booking id' };

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

  const rl = await checkRateLimit(opts.rateLimitBucket, session.salonId, 60, 60 * 1000);
  if (!rl.ok) return { ok: false, error: rl.error ?? 'Too many requests. Try again in a minute.' };

  try {
    const supabase = createServerClient();

    const { data: row, error: readErr } = await supabase
      .from('bookings')
      .select('id, salon_id, consumer_id, status, location_type')
      .eq('id', opts.bookingId)
      .maybeSingle();
    if (readErr) return { ok: false, error: safeError(readErr) };
    if (!row) return { ok: false, error: 'Booking not found' };
    const booking = row as {
      id: string;
      salon_id: string;
      consumer_id: string;
      status: BookingStatus;
      location_type: BookingMode;
    };
    if (booking.salon_id !== session.salonId) return { ok: false, error: 'Not allowed' };
    if (!opts.requireFromStatus.includes(booking.status)) {
      return {
        ok: false,
        error: `Cannot transition booking from ${booking.status} to ${opts.toStatus}`,
      };
    }

    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      status: opts.toStatus,
      updated_at: now,
      ...(opts.extras ?? {}),
    };

    const { error: updErr } = await supabase
      .from('bookings')
      .update(update)
      .eq('id', opts.bookingId)
      .eq('salon_id', session.salonId);
    if (updErr) return { ok: false, error: safeError(updErr) };

    return {
      ok: true,
      ctx: {
        bookingId: opts.bookingId,
        salonId: booking.salon_id,
        consumerId: booking.consumer_id,
        locationType: booking.location_type,
        fromStatus: booking.status,
        toStatus: opts.toStatus,
      },
    };
  } catch (err) {
    return { ok: false, error: safeError(err) };
  }
}

/**
 * Resolve the consumer + salon names + consumer email for email payloads.
 * Separate from the mutation path so if these reads fail the status change
 * still sticks — emails are best-effort.
 *
 * Consumer email comes from `auth.admin.getUserById` on the service-role
 * client. If Supabase Admin isn't reachable (e.g. under test mocks) we
 * return a `null` email and let the email helper become a no-op.
 */
async function loadEmailContext(consumerId: string, salonId: string): Promise<{
  consumerName: string;
  consumerEmail: string | null;
  salonName: string;
} | null> {
  try {
    const supabase = createServerClient();
    const [{ data: cRow }, { data: sRow }] = await Promise.all([
      supabase.from('consumers').select('id, name').eq('id', consumerId).maybeSingle(),
      supabase.from('salons').select('id, name').eq('id', salonId).maybeSingle(),
    ]);
    let consumerEmail: string | null = null;
    try {
      const adminAuth = (supabase as unknown as {
        auth: { admin?: { getUserById?: (id: string) => Promise<{ data: { user: { email?: string } | null }; error: unknown }> } };
      }).auth.admin;
      if (adminAuth?.getUserById) {
        const { data: au } = await adminAuth.getUserById(consumerId);
        consumerEmail = au?.user?.email ?? null;
      }
    } catch {
      consumerEmail = null;
    }
    return {
      consumerName: (cRow as { name?: string } | null)?.name ?? '',
      consumerEmail,
      salonName: (sRow as { name?: string } | null)?.name ?? '',
    };
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Salon-side actions
// ═══════════════════════════════════════════════════════════════════════════

export async function confirmBooking(bookingId: string): Promise<ActionResult<{ bookingId: string }>> {
  const res = await mutateSalonBooking({
    bookingId,
    requireFromStatus: ['PENDING'],
    toStatus: 'CONFIRMED',
    extras: { confirmed_at: new Date().toISOString() },
    rateLimitBucket: 'booking-confirm',
  });
  if (!res.ok) return fail(res.error);

  // Fire-and-forget email.
  const [emails, ctxData] = await Promise.all([
    loadEmails(),
    loadEmailContext(res.ctx.consumerId, res.ctx.salonId),
  ]);
  const sendConfirmed = emails?.sendBookingConfirmedEmail;
  if (sendConfirmed && ctxData?.consumerEmail) {
    const to = ctxData.consumerEmail;
    const name = ctxData.consumerName;
    const salonName = ctxData.salonName;
    const locationType = res.ctx.locationType;
    const id = res.ctx.bookingId;
    await safeSend(() =>
      sendConfirmed({
        to,
        consumerName: name,
        salonName,
        services: [],
        slotStart: new Date().toISOString(),
        mode: locationType,
        bookingId: id,
      }),
    );
  }
  return ok({ bookingId: res.ctx.bookingId });
}

export async function declineBooking(
  bookingId: string,
  reason?: string,
): Promise<ActionResult<{ bookingId: string }>> {
  const parsed = DeclineSchema.safeParse({ bookingId, reason });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid input');

  const res = await mutateSalonBooking({
    bookingId,
    requireFromStatus: ['PENDING'],
    toStatus: 'DECLINED',
    extras: {
      declined_at: new Date().toISOString(),
      // No dedicated `decline_reason` column in migration 041 — surface via
      // email only. Future migration can add the column without touching
      // callers.
    },
    rateLimitBucket: 'booking-decline',
  });
  if (!res.ok) return fail(res.error);

  const [emails, ctxData] = await Promise.all([
    loadEmails(),
    loadEmailContext(res.ctx.consumerId, res.ctx.salonId),
  ]);
  const sendDeclined = emails?.sendBookingDeclinedEmail;
  if (sendDeclined && ctxData?.consumerEmail) {
    const to = ctxData.consumerEmail;
    const name = ctxData.consumerName;
    const salonName = ctxData.salonName;
    const reason = parsed.data.reason;
    await safeSend(() =>
      sendDeclined({
        to,
        consumerName: name,
        salonName,
        reason,
      }),
    );
  }
  return ok({ bookingId: res.ctx.bookingId });
}

export async function cancelBookingBySalon(
  bookingId: string,
  reason?: string,
): Promise<ActionResult<{ bookingId: string }>> {
  const parsed = CancelBySalonSchema.safeParse({ bookingId, reason });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid input');

  const res = await mutateSalonBooking({
    bookingId,
    requireFromStatus: ['CONFIRMED'],
    toStatus: 'CANCELLED_BY_SALON',
    extras: {
      cancelled_at: new Date().toISOString(),
      cancelled_by: 'salon',
    },
    rateLimitBucket: 'booking-cancel-salon',
  });
  if (!res.ok) return fail(res.error);

  const [emails, ctxData] = await Promise.all([
    loadEmails(),
    loadEmailContext(res.ctx.consumerId, res.ctx.salonId),
  ]);
  const sendCancelled = emails?.sendBookingCancelledBySalonEmail;
  if (sendCancelled && ctxData?.consumerEmail) {
    const to = ctxData.consumerEmail;
    const name = ctxData.consumerName;
    const salonName = ctxData.salonName;
    const reason = parsed.data.reason;
    await safeSend(() =>
      sendCancelled({
        to,
        consumerName: name,
        salonName,
        reason,
      }),
    );
  }
  return ok({ bookingId: res.ctx.bookingId });
}

export async function markBookingInProgress(bookingId: string): Promise<ActionResult<{ bookingId: string }>> {
  const res = await mutateSalonBooking({
    bookingId,
    requireFromStatus: ['CONFIRMED'],
    toStatus: 'IN_PROGRESS',
    rateLimitBucket: 'booking-in-progress',
  });
  if (!res.ok) return fail(res.error);
  return ok({ bookingId: res.ctx.bookingId });
}

export async function markBookingComplete(bookingId: string): Promise<ActionResult<{ bookingId: string }>> {
  const now = new Date();
  const reviewWindowCloses = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const res = await mutateSalonBooking({
    bookingId,
    requireFromStatus: ['IN_PROGRESS', 'CONFIRMED'],
    toStatus: 'COMPLETED',
    extras: {
      completed_at: now.toISOString(),
      review_window_closes_at: reviewWindowCloses.toISOString(),
    },
    rateLimitBucket: 'booking-complete',
  });
  if (!res.ok) return fail(res.error);

  // The DB trigger `apply_payable_on_completion` increments the salon payable
  // on home bookings — we do not duplicate that work here.
  const [emails, ctxData] = await Promise.all([
    loadEmails(),
    loadEmailContext(res.ctx.consumerId, res.ctx.salonId),
  ]);
  const sendReviewConsumer = emails?.sendBookingCompletedReviewPromptEmail;
  if (sendReviewConsumer && ctxData?.consumerEmail) {
    const to = ctxData.consumerEmail;
    const name = ctxData.consumerName;
    const salonName = ctxData.salonName;
    const id = res.ctx.bookingId;
    await safeSend(() =>
      sendReviewConsumer({
        to,
        consumerName: name,
        salonName,
        bookingId: id,
      }),
    );
  }
  // Salon-side review prompt is only relevant for home bookings (salon can
  // only review consumers on home visits — enforced by trigger).
  const sendReviewSalon = emails?.sendSalonHomeBookingReviewPromptEmail;
  if (res.ctx.locationType === 'home' && sendReviewSalon) {
    const consumerFirstName =
      (ctxData?.consumerName ?? '').split(' ')[0] || 'the customer';
    const salonId = res.ctx.salonId;
    const bookingId = res.ctx.bookingId;
    await safeSend(async () => {
      const supabase = createServerClient();
      const { data: owner } = await supabase
        .from('salons')
        .select('owner_id, name')
        .eq('id', salonId)
        .maybeSingle();
      const ownerId = (owner as { owner_id?: string } | null)?.owner_id;
      if (!ownerId) return;
      const { data: ownerRow } = await supabase
        .from('staff')
        .select('email, name')
        .eq('user_id', ownerId)
        .maybeSingle();
      const ownerEmail = (ownerRow as { email?: string } | null)?.email;
      const ownerName = (ownerRow as { name?: string } | null)?.name ?? 'there';
      if (!ownerEmail) return;
      await sendReviewSalon({
        to: ownerEmail,
        salonOwnerName: ownerName,
        consumerFirstName,
        bookingId,
      });
    });
  }

  return ok({ bookingId: res.ctx.bookingId });
}

export async function markBookingNoShow(bookingId: string): Promise<ActionResult<{ bookingId: string }>> {
  // No email — consumer being flagged as a no-show shouldn't be announced
  // to them. The DB trigger increments `consumers.no_show_count`.
  const res = await mutateSalonBooking({
    bookingId,
    requireFromStatus: ['CONFIRMED'],
    toStatus: 'NO_SHOW',
    rateLimitBucket: 'booking-no-show',
  });
  if (!res.ok) return fail(res.error);
  return ok({ bookingId: res.ctx.bookingId });
}

export interface PendingBookingForSalon {
  id: string;
  consumer_id: string;
  branch_id: string;
  status: BookingStatus;
  location_type: BookingMode;
  requested_slot_start: string;
  requested_slot_end: string;
  consumer_total: number;
  address_street: string | null;
  consumer_notes: string | null;
  created_at: string;
}

export async function listPendingBookingsForSalon(
  branchId?: string,
): Promise<ActionResult<PendingBookingForSalon[]>> {
  let session;
  try {
    session = await verifySession();
  } catch {
    return fail('Not authenticated');
  }
  if (!session.salonId || session.salonId === 'super-admin') return fail('No salon context');
  try {
    requirePermission(session, 'manage_salon');
  } catch (e) {
    return fail(tenantErrorMessage(e) ?? 'Not allowed');
  }

  try {
    const supabase = createServerClient();
    let query = supabase
      .from('bookings')
      .select(
        `id, consumer_id, branch_id, status, location_type,
         requested_slot_start, requested_slot_end, consumer_total,
         address_street, consumer_notes, created_at`,
      )
      .eq('salon_id', session.salonId)
      .eq('status', 'PENDING')
      .order('requested_slot_start', { ascending: true });
    if (branchId) {
      const parsed = UUIDSchema.safeParse(branchId);
      if (!parsed.success) return fail('Invalid branch id');
      query = query.eq('branch_id', branchId);
    }
    const { data, error } = await query;
    if (error) return fail(safeError(error));
    return ok((data ?? []) as PendingBookingForSalon[]);
  } catch (err) {
    return fail(safeError(err));
  }
}
