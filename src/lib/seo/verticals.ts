/**
 * Vertical definitions for programmatic SEO pages. Each vertical produces a
 * distinct angle on the same iCut product (POS, CRM, salon software, ladies
 * salon, barbershop) so Google sees five different intents mapped to five
 * different page bodies, not one template.
 */

export interface VerticalRecord {
  slug: string;
  route: string;            // URL segment (e.g. 'salon-pos')
  label: string;            // short label ("Salon POS")
  keyword: string;          // main SEO keyword ("salon POS system")
  headlineTemplate: (city: string) => string;
  heroIntro: (cityPhrase: string) => string;
  painPoints: string[];     // 4\u20135 pain points this vertical addresses
  features: string[];       // 6\u20138 features framed for this intent
  idealFor: string;         // one line describing target operator
  intent: 'commercial' | 'informational' | 'transactional';
}

export const VERTICALS: VerticalRecord[] = [
  {
    slug: 'salon-pos',
    route: 'salon-pos',
    label: 'Salon POS',
    keyword: 'salon POS system',
    headlineTemplate: (city) => `Salon POS System in ${city}`,
    heroIntro: (cityPhrase) =>
      `Run billing, inventory, staff commissions and appointments from one screen. iCut is a modern point-of-sale built for salons and barbershops in ${cityPhrase} \u2014 no accountant, no spreadsheet, no daily reconciliation headache.`,
    painPoints: [
      'Clients complaining about slow checkout or paper-receipt errors',
      'Walk-in vs appointment mix throwing daily totals off by thousands',
      'Staff commission disputes at month-end because nobody recorded who did what',
      'No real-time view of cash drawer vs digital payments vs udhaar',
      'Switching between JazzCash, EasyPaisa, card and cash slows the queue',
    ],
    features: [
      'One-screen billing: services + products + tip + discount in under 20 seconds',
      'Split-payment checkout: partial cash, partial card, partial digital wallet',
      'Per-stylist commission tracking tied to every service line item',
      'Daily Z-report end-of-day close with cash-drawer reconciliation',
      'Inventory auto-deduction when you sell shampoo, wax, or other retail',
      'Offline-first billing that syncs when your internet returns',
      'Built-in JazzCash / EasyPaisa / Raast + card-terminal integrations',
      'Role-based access so receptionists can\u2019t see owner-level revenue',
    ],
    idealFor: 'Salon and barbershop owners who want to stop tracking revenue on paper.',
    intent: 'commercial',
  },
  {
    slug: 'salon-crm',
    route: 'salon-crm',
    label: 'Salon CRM',
    keyword: 'salon CRM software',
    headlineTemplate: (city) => `Salon CRM & Client Management in ${city}`,
    heroIntro: (cityPhrase) =>
      `Remember every client, their last service, their favourite stylist, and when to win them back. iCut\u2019s built-in CRM turns your booking log into a retention engine tuned for salons in ${cityPhrase}.`,
    painPoints: [
      'Regulars disappear for months and you only notice when they\u2019re already gone',
      'Bridal clients book once, never return, because follow-up never happens',
      'No record of which service each client prefers \u2014 every visit starts over',
      'WhatsApp reminders go out inconsistently, some staff do it, some don\u2019t',
      'Loyalty discounts get forgotten at the counter and clients leave annoyed',
    ],
    features: [
      'Full client profile: name, phone, every past visit, preferred stylist',
      'Automatic win-back campaigns for clients who haven\u2019t visited in 45+ days',
      'One-click WhatsApp from the client card (appointment reminders, offers)',
      'Bridal journey tracking: booking \u2192 trial \u2192 final \u2192 post-wedding follow-up',
      'Tags and notes per client (allergies, preferred colour shade, VIP flag)',
      'Birthday + anniversary campaigns with auto-applied discount codes',
      'Udhaar ledger per client so nothing falls through the cracks',
      'Repeat-visit heatmap so you see your 20% that drives 80% of revenue',
    ],
    idealFor: 'Salon owners who know retention is cheaper than acquisition but have no system for it.',
    intent: 'commercial',
  },
  {
    slug: 'salon-software',
    route: 'salon-software',
    label: 'Salon Software',
    keyword: 'salon management software',
    headlineTemplate: (city) => `Salon Management Software in ${city}`,
    heroIntro: (cityPhrase) =>
      `The complete operating system for a modern salon. Bookings, billing, inventory, staff, commissions, reports, WhatsApp \u2014 all in one product, priced for ${cityPhrase} salon owners, not Silicon Valley.`,
    painPoints: [
      'Juggling three apps + a notebook to run one salon',
      'No single number telling you whether today was profitable',
      'Inventory leakage: products disappear and nobody knows when',
      'Multi-branch owners can\u2019t see all locations on one dashboard',
      'Staff scheduling relies on WhatsApp groups and memory',
    ],
    features: [
      'Online + phone bookings that land directly in the staff calendar',
      'Multi-branch view with per-branch revenue, expenses, and commission',
      'Inventory audit trail \u2014 every product movement logged by staff + time',
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
      `Built for ladies salons and beauty parlors in ${cityPhrase} \u2014 including bridal studios, threading rooms and henna artists. Privacy-aware scheduling, bridal package tracking, and commission for every therapist on your team.`,
    painPoints: [
      'Bridal bookings with multiple sittings (trial, engagement, mehndi, baraat) are impossible to track in a notebook',
      'Each therapist offers slightly different rates and nothing is written down',
      'Walk-in queue for threading + waxing is chaos during peak hours',
      'Home-service jobs have no price standard \u2014 every stylist quotes differently',
      'Packaged deals (facial + hair colour + threading) expire before clients redeem',
    ],
    features: [
      'Bridal package builder with stage-wise sittings and carry-forward balances',
      'Per-therapist rate cards (Junior Stylist vs Senior vs Bridal Specialist)',
      'Walk-in queue + priority tagging for regulars and VIPs',
      'Home-service job sheets with fixed pricing so every stylist charges the same',
      'Package expiry + redemption tracking so nothing gets forgotten',
      'Private client notes (colour formulas, scalp sensitivity, preferred aroma)',
      'Lady-owner and female-staff-first permission model \u2014 male staff see nothing personal',
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
      `Built for the way barbershops in ${cityPhrase} actually run \u2014 walk-in first, cash-dominant, commission-paid barbers, Friday prayer breaks, and a clock that runs late on the last day of the week.`,
    painPoints: [
      'Walk-in queue is chaos after Asar prayer and during the weekend',
      'Barbers claim more services than they actually did \u2014 no proof either way',
      'Cash drawer ends the day short and nobody remembers why',
      'Tip distribution is a daily argument',
      'Peak-hour surge pricing vs regular pricing is all in the owner\u2019s head',
    ],
    features: [
      'Walk-in ticket system with estimated wait time per barber',
      'Service-by-service attribution so commission is undeniable',
      'End-of-day cash reconciliation that catches every discrepancy',
      'Tip split with fair-share + role-based rules',
      'Fast-checkout mode: tap service, tap barber, print, done',
      'Customer loyalty: 10 haircuts \u2192 free beard trim, automatic',
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
