import { getPublicPlatformConfig } from './actions/admin-settings';
import LandingClient, { type DisplayPlan } from './landing-client';

// Admin can change plan prices / marketing copy at any time via /admin/settings.
// Force dynamic rendering so every homepage hit reads fresh values instead of
// serving a build-time snapshot. If this becomes a hot path we can swap to
// `export const revalidate = 60` for 1-minute ISR.
export const dynamic = 'force-dynamic';

// Server component: fetches plan + support config from the super admin settings
// table on every request. The client landing page receives this as props, so
// there is zero flicker between fallback and live data. Any admin change is
// reflected on the next page render.
export default async function LandingPage() {
  // During `next build` (phase-production-build), Supabase may be unreachable
  // or the anon key may not yet be valid — and Next collects page data even
  // for force-dynamic routes. Serve fallbacks at build time, fetch live at
  // request time.
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return <LandingClient initialPlans={FALLBACK_PLANS} supportWhatsApp="" />;
  }

  let initialPlans: DisplayPlan[];
  let supportWhatsApp = '';

  try {
    const cfg = await getPublicPlatformConfig();
    const order: Array<'basic' | 'growth' | 'pro'> = ['basic', 'growth', 'pro'];
    initialPlans = order.map((key) => {
      const p = cfg.plans[key];
      return {
        key,
        name: p.displayName,
        price: p.price.toLocaleString(),
        originalPrice: p.originalPrice.toLocaleString(),
        pitch: p.pitch,
        popular: p.popular,
        limits: p.limits,
        features: p.features,
      };
    });
    supportWhatsApp = cfg.supportWhatsApp || '';
  } catch {
    // Homepage must always render — it's the main conversion surface.
    // If the settings table is unreachable at request time, fall back.
    initialPlans = FALLBACK_PLANS;
  }

  return <LandingClient initialPlans={initialPlans} supportWhatsApp={supportWhatsApp} />;
}

// Hardcoded fallback mirrors PLAN_MARKETING_DEFAULTS in admin-settings.ts.
// Only used when the DB is unreachable at request time (rare — mostly during
// local dev without Supabase running). Keeping it here, not in the client
// bundle, since it's server-only.
const FALLBACK_PLANS: DisplayPlan[] = [
  {
    key: 'basic',
    name: 'Starter', price: '2,500', originalPrice: '5,000', pitch: 'For new and small salons', popular: false,
    limits: '1 branch · up to 10 staff',
    features: [
      { text: 'POS + billing', ok: true }, { text: 'Appointment bookings', ok: true },
      { text: 'Cash, mobile, card payments', ok: true }, { text: 'Client database + udhaar ledger', ok: true },
      { text: 'WhatsApp receipts + reminders', ok: true }, { text: 'Inventory + low-stock alerts', ok: true },
      { text: 'Payroll + attendance + advances', ok: true }, { text: 'Commission tracking', ok: true },
      { text: 'Daily + monthly reports', ok: true }, { text: 'Prayer + lunch break blocks', ok: true },
    ],
  },
  {
    key: 'growth',
    name: 'Business', price: '5,000', originalPrice: '12,000', pitch: 'For growing salons and small chains', popular: true,
    limits: '3 branches · 10 staff each',
    features: [
      { text: 'Everything in Starter', ok: true },
      { text: 'Up to 3 branches', ok: true }, { text: 'Cross-branch reports', ok: true },
      { text: 'Staff schedules + shift planning', ok: true }, { text: 'Client retention insights', ok: true },
    ],
  },
  {
    key: 'pro',
    name: 'Enterprise', price: '9,000', originalPrice: '20,000', pitch: 'For salon chains', popular: false,
    limits: '10 branches · 100 staff',
    features: [
      { text: 'Everything in Business', ok: true }, { text: 'WhatsApp blasts + bulk reminders', ok: true },
      { text: 'Up to 10 branches', ok: true }, { text: 'Partner/co-owner logins', ok: true },
      { text: 'Priority support + onboarding', ok: true }, { text: 'Custom reports on request', ok: true },
    ],
  },
];
