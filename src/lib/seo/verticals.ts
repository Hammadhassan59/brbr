/**
 * Vertical definitions for programmatic SEO pages. Each vertical produces a
 * distinct angle on the same iCut product so Google sees different intents
 * mapped to different page bodies, not one template.
 *
 * Three verticals live here:
 *   - salon-software (broadest keyword, general salon management)
 *   - ladies-salon-software (distinct audience: ladies salons + bridal studios)
 *   - barbershop-software (distinct audience: walk-in barbershops)
 *
 * `salon-pos` and `salon-crm` were dropped on 2026-04-21 — they had 48–53%
 * token overlap with `salon-software` for the same city (near-duplicates).
 * Definitions live in git history if ever needed again.
 */

export interface VerticalRecord {
  slug: string;
  route: string;            // URL segment (e.g. 'salon-software')
  label: string;            // short label ("Salon Software")
  keyword: string;          // main SEO keyword ("salon management software")
  headlineTemplate: (city: string) => string;
  heroIntro: (cityPhrase: string) => string;
  painPoints: string[];     // 4–5 pain points this vertical addresses
  features: string[];       // 6–8 features framed for this intent
  idealFor: string;         // one line describing target operator
  intent: 'commercial' | 'informational' | 'transactional';
}

export const VERTICALS: VerticalRecord[] = [
  {
    slug: 'salon-software',
    route: 'salon-software',
    label: 'Salon Software',
    keyword: 'salon management software',
    headlineTemplate: (city) => `Salon Management Software in ${city}`,
    heroIntro: (cityPhrase) =>
      `The complete operating system for a modern salon. Bookings, billing, inventory, staff, commissions, reports, WhatsApp — all in one product, priced for ${cityPhrase} salon owners, not Silicon Valley.`,
    painPoints: [
      'Juggling three apps + a notebook to run one salon',
      'No single number telling you whether today was profitable',
      'Inventory leakage: products disappear and nobody knows when',
      'Multi-branch owners can’t see all locations on one dashboard',
      'Staff scheduling relies on WhatsApp groups and memory',
    ],
    features: [
      'Online + phone bookings that land directly in the staff calendar',
      'Multi-branch view with per-branch revenue, expenses, and commission',
      'Inventory audit trail — every product movement logged by staff + time',
      'Staff attendance + leave tracking wired into monthly payroll',
      'P&L, daily summary, staff performance and inventory reports',
      'Role-based permissions (owner, manager, stylist, receptionist, helper)',
      'WhatsApp composer for campaigns, reminders, and one-off messages',
      'Built-in paywall + subscription tooling so your billing never lapses',
    ],
    idealFor: 'Salon chains and single-branch owners who want one product instead of five.',
    intent: 'commercial',
  },
  {
    slug: 'ladies-salon-software',
    route: 'ladies-salon-software',
    label: 'Ladies Salon Software',
    keyword: 'ladies salon software',
    headlineTemplate: (city) => `Ladies Salon & Beauty Parlor Software in ${city}`,
    heroIntro: (cityPhrase) =>
      `Built for ladies salons and beauty parlors in ${cityPhrase} — including bridal studios, threading rooms and henna artists. Privacy-aware scheduling, bridal package tracking, and commission for every therapist on your team.`,
    painPoints: [
      'Bridal bookings with multiple sittings (trial, engagement, mehndi, baraat) are impossible to track in a notebook',
      'Each therapist offers slightly different rates and nothing is written down',
      'Walk-in queue for threading + waxing is chaos during peak hours',
      'Home-service jobs have no price standard — every stylist quotes differently',
      'Packaged deals (facial + hair colour + threading) expire before clients redeem',
    ],
    features: [
      'Bridal package builder with stage-wise sittings and carry-forward balances',
      'Per-therapist rate cards (Junior Stylist vs Senior vs Bridal Specialist)',
      'Walk-in queue + priority tagging for regulars and VIPs',
      'Home-service job sheets with fixed pricing so every stylist charges the same',
      'Package expiry + redemption tracking so nothing gets forgotten',
      'Private client notes (colour formulas, scalp sensitivity, preferred aroma)',
      'Lady-owner and female-staff-first permission model — male staff see nothing personal',
      'WhatsApp bridal follow-ups: trial done, pending mehndi, post-wedding care',
    ],
    idealFor: 'Ladies-only salons, beauty parlors, bridal studios and home-service beauticians.',
    intent: 'commercial',
  },
  {
    slug: 'barbershop-software',
    route: 'barbershop-software',
    label: 'Barbershop Software',
    keyword: 'barbershop software',
    headlineTemplate: (city) => `Barbershop Software & POS in ${city}`,
    heroIntro: (cityPhrase) =>
      `Built for the way barbershops in ${cityPhrase} actually run — walk-in first, cash-dominant, commission-paid barbers, Friday prayer breaks, and a clock that runs late on the last day of the week.`,
    painPoints: [
      'Walk-in queue is chaos after Asar prayer and during the weekend',
      'Barbers claim more services than they actually did — no proof either way',
      'Cash drawer ends the day short and nobody remembers why',
      'Tip distribution is a daily argument',
      'Peak-hour surge pricing vs regular pricing is all in the owner’s head',
    ],
    features: [
      'Walk-in ticket system with estimated wait time per barber',
      'Service-by-service attribution so commission is undeniable',
      'End-of-day cash reconciliation that catches every discrepancy',
      'Tip split with fair-share + role-based rules',
      'Fast-checkout mode: tap service, tap barber, print, done',
      'Customer loyalty: 10 haircuts → free beard trim, automatic',
      'Friday prayer block and Jummah-aware appointment grid',
      'Daily barber-level performance report (services done, revenue, tips, commission)',
    ],
    idealFor: 'Single-chair barbershops up to 10-chair chains that run on walk-ins and tips.',
    intent: 'commercial',
  },
];

export function getVertical(slug: string): VerticalRecord | null {
  return VERTICALS.find((v) => v.slug === slug) ?? null;
}
