/**
 * Stable UUIDs for the shared "demo salon" that every sales-agent's paired
 * demo identity lands in. A single salon row (is_demo=true) backs all demo
 * logins; operational data (appointments/bills/etc.) resets every 10 min,
 * catalog (staff/clients/services/products) stays stable.
 *
 * IDs are derived deterministically from `'demo-salon:<tag>'` with sha1 →
 * UUIDv5-shaped — same pattern as src/lib/demo-agent-seed.ts. If you add
 * new seed rows, mint their UUIDs here so the reset cron and the initial
 * migration generate the same values.
 */
import { createHash } from 'crypto';

export function demoSalonId(tag: string): string {
  const h = createHash('sha1').update(`demo-salon:${tag}`).digest('hex');
  // RFC 4122 variant + version bits for v5
  return [
    h.substring(0, 8),
    h.substring(8, 12),
    '5' + h.substring(13, 16),
    ((parseInt(h.substring(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0') + h.substring(18, 20),
    h.substring(20, 32),
  ].join('-');
}

// ───────────────────────────────────────
// Core identity
// ───────────────────────────────────────

/** Single shared demo salon every demo agent logs into. */
export const DEMO_SALON_ID = demoSalonId('salon');

/** Single main branch for the demo salon. */
export const DEMO_BRANCH_ID = demoSalonId('branch');

/**
 * Virtual auth.users id used as salons.owner_id. Not an actual auth user —
 * demo agents authenticate via their own (real) sales_agents row; this UUID
 * just satisfies the salons.owner_id column and gives get_user_salon_id()
 * a deterministic target if ever invoked server-side.
 */
export const DEMO_OWNER_ID = demoSalonId('owner');

// ───────────────────────────────────────
// Staff (5 members — owner + manager + 3 stylists/barbers)
// ───────────────────────────────────────
export const DEMO_STAFF_IDS = {
  owner:       demoSalonId('staff:owner'),
  manager:     demoSalonId('staff:manager'),
  seniorA:     demoSalonId('staff:senior-a'),
  seniorB:     demoSalonId('staff:senior-b'),
  junior:      demoSalonId('staff:junior'),
  receptionist: demoSalonId('staff:receptionist'),
  helper:      demoSalonId('staff:helper'),
} as const;

// ───────────────────────────────────────
// Services (10 realistic salon services)
// ───────────────────────────────────────
export const DEMO_SERVICE_IDS = {
  haircut:      demoSalonId('service:haircut'),
  beardTrim:    demoSalonId('service:beard-trim'),
  hairColor:    demoSalonId('service:hair-color'),
  facial:       demoSalonId('service:facial'),
  manicure:     demoSalonId('service:manicure'),
  pedicure:     demoSalonId('service:pedicure'),
  spa:          demoSalonId('service:spa'),
  kidsCut:      demoSalonId('service:kids-cut'),
  shave:        demoSalonId('service:shave'),
  hairWash:     demoSalonId('service:hair-wash'),
} as const;

// ───────────────────────────────────────
// Products (15 backbar + retail items)
// ───────────────────────────────────────
export const DEMO_PRODUCT_IDS = {
  shampoo:      demoSalonId('product:shampoo'),
  conditioner:  demoSalonId('product:conditioner'),
  wax:          demoSalonId('product:wax'),
  gel:          demoSalonId('product:gel'),
  razors:       demoSalonId('product:razors'),
  hairColor:    demoSalonId('product:hair-color'),
  bleach:       demoSalonId('product:bleach'),
  faceWash:     demoSalonId('product:face-wash'),
  lotion:       demoSalonId('product:lotion'),
  hairOil:      demoSalonId('product:hair-oil'),
  beardOil:     demoSalonId('product:beard-oil'),
  foam:         demoSalonId('product:foam'),
  aftershave:   demoSalonId('product:aftershave'),
  towels:       demoSalonId('product:towels'),
  talc:         demoSalonId('product:talc'),
} as const;

// ───────────────────────────────────────
// Clients (30 — mix of formats, VIP, udhaar)
// ───────────────────────────────────────
export const DEMO_CLIENT_IDS = Array.from({ length: 30 }, (_, i) =>
  demoSalonId(`client:${String(i + 1).padStart(2, '0')}`),
);
