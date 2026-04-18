/**
 * Marketplace pricing math — the single source of truth for the home-service
 * markup + flat service charge defined in the 2026-04-18 marketplace plan,
 * decisions 18–20:
 *
 *   - Home bookings: service price × 1.30, rounded UP to the nearest Rs 50,
 *     plus a flat Rs 300 service charge on the total.
 *   - At-salon bookings: salon base price is THE price. No markup, no service
 *     charge. Platform earns zero revenue.
 *
 * Pure functions only — no DB, no cookies, no Supabase client. This module is
 * imported by:
 *
 *   - `src/app/(marketplace)/barber/[slug]/page.tsx` (display prices in the
 *     service menu, depending on `icut-mode` cookie).
 *   - The booking-submit server action (snapshot price into
 *     `bookings.platform_markup` / `service_charge` / `consumer_total`) —
 *     owned by a sibling agent; this file only supplies the math.
 *
 * Rounding rule (decision 19): "Markup rounds UP to nearest Rs 50." We apply
 * the ceiling to the *marked-up* total (base × 1.30), NOT to the markup
 * amount in isolation. Worked examples in the unit tests.
 *
 * All values are whole Pakistani rupees. We accept `number` inputs but never
 * return fractional rupees — DB stores `numeric(10,2)` but the marketplace
 * operates in whole rupees throughout.
 */
import type { MarketplaceMode } from './mode';

/** Markup multiplier applied to every home-service line item. */
export const HOME_MARKUP_MULTIPLIER = 1.3;

/** Rounding bucket size (Pakistani rupees). */
export const HOME_ROUND_UP_TO = 50;

/** Flat platform service charge added once per home booking, in PKR. */
export const HOME_SERVICE_CHARGE = 300;

/**
 * Apply the home-service markup to a single base price.
 *
 * Steps:
 *   1. Multiply by {@link HOME_MARKUP_MULTIPLIER} (1.30).
 *   2. Round UP to the nearest multiple of {@link HOME_ROUND_UP_TO} (Rs 50).
 *
 * Returns a whole number. Negative or non-finite inputs return 0 (defensive —
 * the caller should have validated, but we never want to leak `NaN` into a
 * price display).
 *
 * @example
 *   applyHomeMarkup(1500); // 1500 * 1.30 = 1950 → already a multiple of 50 → 1950
 *   applyHomeMarkup(1000); // 1000 * 1.30 = 1300 → already a multiple of 50 → 1300
 *   applyHomeMarkup(1001); // 1001 * 1.30 = 1301.30 → round up 50 → 1350
 *   applyHomeMarkup(500);  // 500  * 1.30 = 650   → already a multiple of 50 → 650
 */
export function applyHomeMarkup(basePrice: number): number {
  if (!Number.isFinite(basePrice) || basePrice <= 0) return 0;
  const marked = basePrice * HOME_MARKUP_MULTIPLIER;
  return Math.ceil(marked / HOME_ROUND_UP_TO) * HOME_ROUND_UP_TO;
}

export interface BookingTotalInput {
  /**
   * List of line items. Only `base` is read; caller is free to extend the
   * object with its own fields (service id, name, duration) without
   * disturbing the math.
   */
  items: Array<{ base: number }>;
  mode: MarketplaceMode;
}

export interface BookingTotals {
  /** Sum of salon base prices, unchanged by mode. */
  salon_base_total: number;
  /** Platform markup = sum(markup(base_i) - base_i) for home; 0 otherwise. */
  platform_markup: number;
  /** Flat service charge per booking: Rs 300 for home, 0 otherwise. */
  service_charge: number;
  /** What the consumer pays (cash-on-service). */
  consumer_total: number;
}

/**
 * Compute the full pricing snapshot for a booking.
 *
 * Contract with `bookings` table (migration 041 §7 pricing snapshot):
 *
 *   salon_base_total  — sum of each line item's salon base price.
 *   platform_markup   — what the platform earns from the markup. Zero
 *                       for at-salon mode.
 *   service_charge    — flat Rs 300 for home mode; zero for at-salon.
 *   consumer_total    — salon_base_total + platform_markup + service_charge.
 *
 * Why compute `platform_markup` as the *difference* rather than the marked-
 * up total? The DB schema stores each quantity separately so finance can
 * reconcile: salon keeps `salon_base_total`, platform keeps
 * `platform_markup + service_charge`. `consumer_total` is the cash that
 * changes hands.
 *
 * @example
 *   computeBookingTotals({
 *     items: [{ base: 1500 }, { base: 1000 }],
 *     mode: 'at_home',
 *   });
 *   // salon_base_total = 2500
 *   // markup items = 1950 + 1300 = 3250
 *   // platform_markup = 3250 - 2500 = 750
 *   // service_charge = 300
 *   // consumer_total = 2500 + 750 + 300 = 3550
 */
export function computeBookingTotals(input: BookingTotalInput): BookingTotals {
  const items = Array.isArray(input.items) ? input.items : [];
  const salonBaseTotal = items.reduce(
    (sum, it) =>
      sum + (Number.isFinite(it?.base) && it.base > 0 ? it.base : 0),
    0,
  );

  if (input.mode === 'at_salon') {
    return {
      salon_base_total: salonBaseTotal,
      platform_markup: 0,
      service_charge: 0,
      consumer_total: salonBaseTotal,
    };
  }

  // Home mode. Sum the per-item markup *differences* so we preserve the
  // rounding-per-line semantic (each line rounds up to 50 independently,
  // mirroring what the consumer sees in the cart).
  const platformMarkup = items.reduce((sum, it) => {
    const base = Number.isFinite(it?.base) && it.base > 0 ? it.base : 0;
    if (base === 0) return sum;
    return sum + (applyHomeMarkup(base) - base);
  }, 0);

  const serviceCharge = salonBaseTotal > 0 ? HOME_SERVICE_CHARGE : 0;

  return {
    salon_base_total: salonBaseTotal,
    platform_markup: platformMarkup,
    service_charge: serviceCharge,
    consumer_total: salonBaseTotal + platformMarkup + serviceCharge,
  };
}

/**
 * Display price for a single line item, given the mode. At-salon returns the
 * base; at-home returns the marked-up-and-rounded price. Thin wrapper around
 * {@link applyHomeMarkup} so pages don't import the mode-switch logic
 * themselves.
 */
export function displayPriceForMode(
  basePrice: number,
  mode: MarketplaceMode,
): number {
  if (mode === 'at_home') return applyHomeMarkup(basePrice);
  if (!Number.isFinite(basePrice) || basePrice <= 0) return 0;
  return basePrice;
}
