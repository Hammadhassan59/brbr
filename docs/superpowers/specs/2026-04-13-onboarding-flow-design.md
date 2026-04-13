# Onboarding Flow Design

**Date:** 2026-04-13
**Status:** Approved

## Overview

A three-part onboarding system for BrBr (icut.pk): owner post-setup checklist, staff first-login welcome, and empty states across all data sections. Goal is to guide new users from setup completion to daily usage with minimal friction.

## 1. Owner Post-Setup Checklist

### Placement
Gold top banner on the dashboard, rendered immediately below the header and above KPI cards. Shown after the setup wizard sets `setup_complete = true`.

### Checklist Items (5 total)
1. **Add your first client** — auto-checks when `clients` table has ≥1 row for this salon
2. **Book your first appointment** — auto-checks when `appointments` table has ≥1 row for this salon
3. **Complete a sale** — auto-checks when `bills` table has ≥1 row with `status = 'paid'` for this salon
4. **Set up payment methods** — auto-checks when salon has at least one of: `jazzcash_number`, `easypaisa_number`, or `bank_account` populated
5. **Invite staff to log in** — auto-checks when any staff member (not the owner) for this salon has `last_login_at IS NOT NULL`

### Behavior
- Items displayed as horizontal pills in the gold banner
- Progress shown as "X/5 complete"
- Each pill links to the relevant page (e.g. "Add first client" → `/dashboard/clients`)
- Items auto-check based on derived DB state (no manual check-off)
- "Dismiss" link in the banner to hide permanently
- When all 5 complete: brief celebration moment ("You're all set!"), then banner disappears permanently
- Banner does not show for staff or partner logins — owner only (detected via `currentStaff.role === 'owner'` in Zustand store)

### Data Source
Single RPC `get_onboarding_status(salon_id)` returns:

```sql
SELECT
  (SELECT count(*) > 0 FROM clients WHERE salon_id = $1) AS has_clients,
  (SELECT count(*) > 0 FROM appointments WHERE salon_id = $1) AS has_appointments,
  (SELECT count(*) > 0 FROM bills WHERE salon_id = $1 AND status = 'paid') AS has_sale,
  (s.jazzcash_number IS NOT NULL OR s.easypaisa_number IS NOT NULL OR s.bank_account IS NOT NULL) AS has_payment_methods,
  (SELECT count(*) > 0 FROM staff WHERE salon_id = $1 AND role != 'owner' AND last_login_at IS NOT NULL) AS staff_logged_in,
  s.onboarding_dismissed
FROM salons s WHERE s.id = $1;
```

## 2. Staff First-Login Welcome

### Trigger
Shown when a staff member or partner logs in and `first_login_seen = false`. Full-screen overlay before the dashboard content loads.

### Content
- Greeting: "Welcome, {name}!"
- Role and salon: "You're logged in as {role} at {salon_name}"
- Numbered list of 3 capabilities, **adapted per role**:

| Role | Capability 1 | Capability 2 | Capability 3 |
|------|-------------|-------------|-------------|
| Manager | Full dashboard & reports | Staff & client management | POS & appointments |
| Receptionist | Appointments & walk-ins | Client management | POS & checkout |
| Senior/Junior Stylist | Your appointments | Your earnings & commissions | Your daily schedule |
| Helper | Your dashboard overview | Your daily schedule | Your attendance |

### Behavior
- "Got it, let's go" gold CTA button to dismiss and enter dashboard
- Sets `first_login_seen = true` via server action
- Only shown once per staff member, ever
- Partners see the Manager variant

## 3. Empty States

### Pattern
Consistent across all data sections. Minimal design:
- Square-bordered icon (48px, 2px solid border)
- Bold text: "No {items} yet"
- Gold CTA button linking to the create/add action
- No descriptions or explanations
- Centered vertically and horizontally in the content area

### Applied To

| Section | Icon | Text | CTA | Link |
|---------|------|------|-----|------|
| Clients | 👤 | No clients yet | Add Client | `/dashboard/clients?action=new` |
| Appointments | 📅 | No appointments yet | Book Appointment | `/dashboard/appointments?action=new` |
| Inventory / Products | 📦 | No products yet | Add Product | `/dashboard/inventory/products?action=new` |
| Expenses | 💰 | No expenses yet | Add Expense | `/dashboard/expenses?action=new` |
| Staff | 👥 | No staff yet | Add Staff | `/dashboard/staff?action=new` |
| Packages | 🎁 | No packages yet | Add Package | `/dashboard/packages?action=new` |
| Reports | 📊 | No data yet | — (no CTA) | — |

Reports empty state has no CTA since data comes from other sections.

## 4. Schema Changes

### Migration 009: Onboarding Support

```sql
-- Track staff login history for onboarding checklist
ALTER TABLE staff ADD COLUMN last_login_at timestamptz;

-- Track whether staff has seen the first-login welcome
ALTER TABLE staff ADD COLUMN first_login_seen boolean NOT NULL DEFAULT false;

-- Track whether owner has dismissed the onboarding checklist
ALTER TABLE salons ADD COLUMN onboarding_dismissed boolean NOT NULL DEFAULT false;

-- RPC for fetching onboarding status in a single call
CREATE OR REPLACE FUNCTION get_onboarding_status(p_salon_id uuid)
RETURNS json AS $$
  SELECT json_build_object(
    'has_clients', (SELECT count(*) > 0 FROM clients WHERE salon_id = p_salon_id),
    'has_appointments', (SELECT count(*) > 0 FROM appointments WHERE salon_id = p_salon_id),
    'has_sale', (SELECT count(*) > 0 FROM bills WHERE salon_id = p_salon_id AND status = 'paid'),
    'has_payment_methods', (
      SELECT jazzcash_number IS NOT NULL OR easypaisa_number IS NOT NULL OR bank_account IS NOT NULL
      FROM salons WHERE id = p_salon_id
    ),
    'staff_logged_in', (
      SELECT count(*) > 0 FROM staff
      WHERE salon_id = p_salon_id AND role != 'owner' AND last_login_at IS NOT NULL
    ),
    'onboarding_dismissed', (
      SELECT onboarding_dismissed FROM salons WHERE id = p_salon_id
    )
  );
$$ LANGUAGE sql STABLE;
```

### Auth Changes
- `staff-login` API route: set `last_login_at = now()` on successful PIN auth
- New server action: `dismissOnboarding(salonId)` — sets `salons.onboarding_dismissed = true`
- New server action: `markFirstLoginSeen(staffId)` — sets `staff.first_login_seen = true`

## 5. Components

### `<OnboardingBanner />`
- Location: `src/app/dashboard/components/onboarding-banner.tsx`
- Rendered in dashboard layout, above KPI cards
- Props: none (reads from salon context + RPC)
- Shows only for owner role, when `onboarding_dismissed = false`
- Calls `get_onboarding_status` RPC on mount
- Renders gold banner with pill items, progress count, dismiss link
- Celebration animation when all 5 complete (confetti or checkmark + "You're all set!")

### `<StaffWelcome />`
- Location: `src/app/dashboard/components/staff-welcome.tsx`
- Rendered in dashboard layout as a full-screen overlay
- Props: none (reads from staff context in Zustand store)
- Shows only when `first_login_seen = false`
- Adapts capability list based on role from `role-access.ts`
- "Got it, let's go" button calls `markFirstLoginSeen` server action

### `<EmptyState />`
- Location: `src/components/empty-state.tsx`
- Reusable across all sections
- Props: `icon: string`, `text: string`, `ctaLabel?: string`, `ctaHref?: string`
- If no CTA provided, renders without button (for Reports)

## 6. Design System Compliance

- Gold: `#C8A028` for banner background, CTA buttons, accents
- Black: `#000` for text on gold backgrounds
- White: `#fff` for text on dark backgrounds
- Square corners everywhere (border-radius: 0)
- 44px minimum touch targets on all interactive elements
- Solid borders, no shadows
- Font: system font stack (already used throughout)

## 7. i18n

All user-facing strings must have English and Urdu translations in `src/lib/i18n/translations.ts`. Key additions:

- `onboarding.title` — "Getting Started" / "شروع کریں"
- `onboarding.complete` — "complete" / "مکمل"
- `onboarding.dismiss` — "Dismiss" / "ہٹائیں"
- `onboarding.allSet` — "You're all set!" / "سب تیار ہے!"
- `onboarding.addFirstClient` — "Add first client" / "پہلا کلائنٹ شامل کریں"
- `onboarding.bookAppointment` — "Book appointment" / "اپائنٹمنٹ بک کریں"
- `onboarding.completeSale` — "Complete a sale" / "سیل مکمل کریں"
- `onboarding.paymentMethods` — "Payment methods" / "ادائیگی کے طریقے"
- `onboarding.inviteStaff` — "Invite staff" / "سٹاف کو مدعو کریں"
- `staffWelcome.greeting` — "Welcome, {name}!" / "!خوش آمدید، {name}"
- `staffWelcome.roleAt` — "You're logged in as {role} at {salon}" / "{salon} میں {role} کے طور پر لاگ ان ہیں"
- `staffWelcome.letsGo` — "Got it, let's go" / "چلیں شروع کرتے ہیں"
- `empty.noClients` — "No clients yet" / "ابھی کوئی کلائنٹ نہیں"
- `empty.noAppointments` — "No appointments yet" / "ابھی کوئی اپائنٹمنٹ نہیں"
- `empty.noProducts` — "No products yet" / "ابھی کوئی پروڈکٹ نہیں"
- `empty.noExpenses` — "No expenses yet" / "ابھی کوئی اخراجات نہیں"
- `empty.noStaff` — "No staff yet" / "ابھی کوئی سٹاف نہیں"
- `empty.noPackages` — "No packages yet" / "ابھی کوئی پیکیج نہیں"
- `empty.noData` — "No data yet" / "ابھی کوئی ڈیٹا نہیں"
