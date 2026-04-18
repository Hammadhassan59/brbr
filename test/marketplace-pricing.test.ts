/**
 * Tests for `src/lib/marketplace/pricing.ts` — the home-service markup + flat
 * service charge math from the 2026-04-18 marketplace plan.
 *
 * The cases here are the worked examples from the plan's pricing section
 * (decisions 18–20) plus the extra boundary cases the Week-3 spec calls out:
 *
 *   - 1500 → 1950        (at-home exactly lands on a 50 boundary)
 *   - 1000 → 1300        (at-home exactly lands on a 50 boundary)
 *   - 1001 → 1350        (at-home rounds 1301.30 up to nearest 50)
 *   - at-salon returns base unchanged
 *   - service charge applied only in home mode
 *   - multi-item sums
 */
import { describe, expect, it } from 'vitest';

import {
  HOME_MARKUP_MULTIPLIER,
  HOME_ROUND_UP_TO,
  HOME_SERVICE_CHARGE,
  applyHomeMarkup,
  computeBookingTotals,
  displayPriceForMode,
} from '@/lib/marketplace/pricing';

describe('constants', () => {
  it('matches the locked decisions in the plan', () => {
    expect(HOME_MARKUP_MULTIPLIER).toBe(1.3);
    expect(HOME_ROUND_UP_TO).toBe(50);
    expect(HOME_SERVICE_CHARGE).toBe(300);
  });
});

describe('applyHomeMarkup', () => {
  it('1500 → 1950 (1500 × 1.30 = 1950, already on a 50 boundary)', () => {
    expect(applyHomeMarkup(1500)).toBe(1950);
  });

  it('1000 → 1300 (1000 × 1.30 = 1300, already on a 50 boundary)', () => {
    expect(applyHomeMarkup(1000)).toBe(1300);
  });

  it('1001 → 1350 (1001 × 1.30 = 1301.30 → round up to 1350)', () => {
    expect(applyHomeMarkup(1001)).toBe(1350);
  });

  it('500 → 650 (already a multiple of 50)', () => {
    expect(applyHomeMarkup(500)).toBe(650);
  });

  it('2000 → 2600', () => {
    expect(applyHomeMarkup(2000)).toBe(2600);
  });

  it('1299 → 1700 (1299 × 1.30 = 1688.7 → ceil to 1700)', () => {
    expect(applyHomeMarkup(1299)).toBe(1700);
  });

  it('returns 0 for zero / negative / NaN / Infinity', () => {
    expect(applyHomeMarkup(0)).toBe(0);
    expect(applyHomeMarkup(-100)).toBe(0);
    expect(applyHomeMarkup(Number.NaN)).toBe(0);
    expect(applyHomeMarkup(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('always returns a multiple of 50', () => {
    for (const base of [137, 499, 750, 811, 1234, 3333]) {
      const marked = applyHomeMarkup(base);
      expect(marked % HOME_ROUND_UP_TO).toBe(0);
      expect(marked).toBeGreaterThanOrEqual(base * HOME_MARKUP_MULTIPLIER);
    }
  });
});

describe('displayPriceForMode', () => {
  it('at_salon returns the base unchanged', () => {
    expect(displayPriceForMode(1500, 'at_salon')).toBe(1500);
    expect(displayPriceForMode(1001, 'at_salon')).toBe(1001);
  });

  it('at_home applies the markup', () => {
    expect(displayPriceForMode(1500, 'at_home')).toBe(1950);
    expect(displayPriceForMode(1001, 'at_home')).toBe(1350);
  });

  it('handles 0 / invalid inputs without leaking NaN', () => {
    expect(displayPriceForMode(0, 'at_salon')).toBe(0);
    expect(displayPriceForMode(0, 'at_home')).toBe(0);
    expect(displayPriceForMode(Number.NaN, 'at_salon')).toBe(0);
  });
});

describe('computeBookingTotals — at_salon mode', () => {
  it('single item: markup and service charge both 0, totals match base', () => {
    const r = computeBookingTotals({
      items: [{ base: 1500 }],
      mode: 'at_salon',
    });
    expect(r.salon_base_total).toBe(1500);
    expect(r.platform_markup).toBe(0);
    expect(r.service_charge).toBe(0);
    expect(r.consumer_total).toBe(1500);
  });

  it('multi-item sums the base unchanged', () => {
    const r = computeBookingTotals({
      items: [{ base: 1500 }, { base: 1000 }, { base: 500 }],
      mode: 'at_salon',
    });
    expect(r.salon_base_total).toBe(3000);
    expect(r.platform_markup).toBe(0);
    expect(r.service_charge).toBe(0);
    expect(r.consumer_total).toBe(3000);
  });

  it('empty items → all zero, no service charge', () => {
    const r = computeBookingTotals({ items: [], mode: 'at_salon' });
    expect(r.salon_base_total).toBe(0);
    expect(r.platform_markup).toBe(0);
    expect(r.service_charge).toBe(0);
    expect(r.consumer_total).toBe(0);
  });
});

describe('computeBookingTotals — at_home mode', () => {
  it('1500 base → markup 450, charge 300, consumer pays 2250', () => {
    const r = computeBookingTotals({
      items: [{ base: 1500 }],
      mode: 'at_home',
    });
    expect(r.salon_base_total).toBe(1500);
    // markup difference: 1950 - 1500 = 450
    expect(r.platform_markup).toBe(450);
    expect(r.service_charge).toBe(300);
    expect(r.consumer_total).toBe(2250);
  });

  it('1000 base → markup 300, charge 300, consumer pays 1600', () => {
    const r = computeBookingTotals({
      items: [{ base: 1000 }],
      mode: 'at_home',
    });
    expect(r.salon_base_total).toBe(1000);
    expect(r.platform_markup).toBe(300);
    expect(r.service_charge).toBe(300);
    expect(r.consumer_total).toBe(1600);
  });

  it('1001 base → marked display 1350, markup 349, charge 300, consumer pays 1650', () => {
    const r = computeBookingTotals({
      items: [{ base: 1001 }],
      mode: 'at_home',
    });
    expect(r.salon_base_total).toBe(1001);
    // applyHomeMarkup(1001) = 1350 → difference = 349
    expect(r.platform_markup).toBe(349);
    expect(r.service_charge).toBe(300);
    expect(r.consumer_total).toBe(1650);
  });

  it('multi-item sums markup per-line, single flat service charge', () => {
    const r = computeBookingTotals({
      items: [{ base: 1500 }, { base: 1000 }, { base: 500 }],
      mode: 'at_home',
    });
    expect(r.salon_base_total).toBe(3000);
    // Per-line markup: (1950-1500) + (1300-1000) + (650-500) = 450+300+150 = 900
    expect(r.platform_markup).toBe(900);
    expect(r.service_charge).toBe(300);
    expect(r.consumer_total).toBe(4200);
  });

  it('empty cart → no service charge applied', () => {
    const r = computeBookingTotals({ items: [], mode: 'at_home' });
    expect(r.salon_base_total).toBe(0);
    expect(r.platform_markup).toBe(0);
    // Service charge only applies when there's an actual booking.
    expect(r.service_charge).toBe(0);
    expect(r.consumer_total).toBe(0);
  });

  it('consumer_total always equals salon_base_total + platform_markup + service_charge', () => {
    for (const items of [
      [{ base: 500 }],
      [{ base: 1001 }, { base: 777 }],
      [{ base: 2500 }, { base: 1250 }, { base: 3333 }],
    ]) {
      const r = computeBookingTotals({ items, mode: 'at_home' });
      expect(r.consumer_total).toBe(
        r.salon_base_total + r.platform_markup + r.service_charge,
      );
    }
  });
});
