# iCut Marketplace — Phase 0 + Phase 1 Plan (v2)

**Date:** 2026-04-18 (rewritten after interactive decision session)
**Supersedes:** v1 of this file — v1 proposed a public-SEO-only Phase 1 with WhatsApp CTAs. User rejected that model; v2 is the real scope.
**Scope:** Full two-sided Foodpanda-style marketplace — public SEO + consumer PWA + registration + booking request flow + home-service mode + two-way Uber-style ratings + settlement ledger + admin flag/block dashboard.
**Target ship:** 6–8 weeks from Phase 0 kickoff (up from v1's 10-day estimate).
**Rollback posture:** Everything additive. New tables, new routes, opt-in per salon per mode. Zero impact on existing dashboard flow. Rollback migration included.

---

## Executive summary

v2 expands scope because the user wants a real marketplace, not just an SEO landing. The consumer can browse salons without logging in, registers at the "Book" step, picks services, submits a booking that lands as `pending`, the salon gets a real-time in-app notification and calls/WhatsApps the consumer from their own phone to confirm, then confirms or declines in-app. Cash changes hands at the service. The platform earns money only on home-service bookings (30% markup + Rs 300 service charge), tracked as a per-salon payable that auto-blocks new home-service requests at Rs 5,000 unsettled. Both sides rate each other after completion; public consumer reviews build trust; private-to-salon consumer ratings inform confirm decisions; low-rated salons and bad-behavior consumers are auto-flagged for silent superadmin block.

### Why this scope

- **Foodpanda-style UX** drives consumer retention in PK: users expect to browse, save addresses, see past orders, reorder.
- **Two-way ratings** are what makes two-sided marketplaces work — Uber, Careem, Foodpanda all use them. Consumer rating private-to-salon avoids the hostility of Uber's public passenger rating while still informing salon decisions.
- **Cash-on-service + threshold block** avoids building a payment gateway in Phase 1. Salons self-collect; platform collects from salons periodically; threshold block enforces settlement discipline without hard coupling to a payment rail.
- **No WhatsApp API, no SMS OTP** — zero per-message cost in Phase 1. Salons use personal WhatsApp; consumer OTP is via free email verification.

---

## Locked decisions (reference)

All 31 decisions from the 2026-04-18 session, grouped.

### Scope + URL
1. `icut.pk/` pivots to consumer marketplace; current business landing moves to `/business` (copy, unchanged).
2. Seed 5 cities only: Karachi, Lahore, Islamabad, Rawalpindi, Faisalabad. Expand later.
3. Seed 10 services: haircut, beard-trim, hair-color, facial, waxing, bridal, nails, massage, keratin, hair-treatment.
4. Delivery: PWA first (mobile-first responsive + Add-to-Home-Screen + Web Push). Capacitor native wrapper later for stores + proper iOS push.

### Consumer flow
5. Browse public, no login. Register on the first "Book" tap, before service selection finalizes.
6. Registration: name + email + password + phone (no gender, DOB, city).
7. Email verification via Supabase Auth.
8. Full Foodpanda-style consumer dashboard: Home, My Bookings, My Addresses, Favorites, Profile, Help, Notification settings, Logout. **No** "My Rating" (consumers don't see own rating).

### Notifications
9. Consumer: **email only** (Resend). No WhatsApp, no SMS, no PWA push in Phase 1.
10. Salon: in-app realtime via Supabase Realtime + new "Incoming Bookings" panel in existing dashboard with sound/toast alert.
11. Salon calls/WhatsApps consumer from their own device to verify. **No WhatsApp Business API** — zero per-message cost.

### Booking model
12. Request → salon confirms. Booking `PENDING` until salon taps Confirm or Decline. Consumer UI: "Waiting for salon to confirm."
13. Home-service = home-first toggle on the landing page. Whole browsing session filters to that mode (`At salon` / `At home`).
14. Coverage: radius km from branch location. Salon sets; we enforce via lat/lng distance.
15. Address: Mapbox autocomplete + drag-pin adjustment.
16. Cancellation: both sides free-cancel anytime. No refund flow needed (cash-on-service). Platform tracks cancel/decline/no-show counts per salon and per consumer.

### Pricing (home-service only)
17. At-salon iCut bookings use salon's base price — no markup, no platform revenue there.
18. Home bookings: service price × 1.30 + flat Rs 300 service charge.
19. Markup rounds UP to nearest Rs 50.
20. Consumer sees marked-up price as THE price — no "base + markup" breakdown. Rs 300 service charge shows as a **separate line** in cart (Foodpanda-style).
21. Money flow: cash-on-service. Consumer hands total to salon professional.
22. Salon owes platform = markup + Rs 300 per home booking. Tracked as payable.

### Settlement
23. Threshold block at **Rs 5,000 unsettled**. Yellow warning at Rs 4,000 (80%), red block at Rs 5,000.
24. Block affects **new home-booking requests only**. In-flight already-confirmed bookings continue. At-salon iCut bookings continue (they don't create payables). POS / staff / main dashboard continues (subscription-gated).
25. Counter increments on booking **completion** (not request, not confirm).
26. Salon sees running total + threshold progress in their dashboard.

### Opt-in
27. Two separate toggles in Settings → iCut Marketplace: (a) "List on iCut (at-salon bookings)"; (b) "Offer home service" (with sub-settings: radius, staff allocation).

### Ratings + flagging
28. Both sides rate 1–5 stars + optional text within 7 days of `completed`.
29. Consumer rates salon: at-salon AND home bookings. Salon rates consumer: **home bookings only**.
30. **Consumer text reviews public** on salon profile (Foodpanda/Yelp model). Salon can reply publicly. **Consumer ratings private** — only visible to salons receiving their pending request and to superadmin. Consumer does not see their own rating.
31. **Auto-flag + silent admin block**: salons flagged when avg < 2★ with ≥5 reviews. Consumers flagged when avg < 2★ with ≥3 home bookings, OR ≥3 no-shows, OR ≥5 post-confirmation cancels. Superadmin dashboard shows flagged list; "Block" sets `marketplace_admin_blocked_at` **without notifying the blocked party**. Blocked salon loses marketplace visibility; keeps POS/subscription access. Blocked consumer can't book; keeps account access.

---

## Architecture overview

```
                 ┌─────────────────────────────────────┐
                 │          icut.pk/ (public)           │
                 │  Home · /barbers · /barber/[slug]    │
                 │  /services/[svc]-in-[city]           │
                 │  Session toggle: At salon | At home  │
                 └──────────────┬──────────────────────┘
                                │
        ┌───────────────────────┴───────────────────────┐
        │                                               │
  (Consumer                                          (Owner
   browses)                                           logged in)
        │                                               │
        ↓                                               ↓
  Tap "Book"                                     /dashboard/*
        │                                        (existing)
   Register / sign in                              │
   (Supabase Auth,                                 ├── Settings
    email verify)                                  │     └── iCut Marketplace
        │                                          │        [x] At-salon bookings
        ↓                                          │        [x] Home service (radius, etc.)
  Pick services → Cart → Checkout                  │
  (home mode? address picker + surcharge)          ├── Incoming Bookings (NEW)
        │                                          │   (Realtime feed, Confirm/Decline)
        ↓                                          │
  Submit → booking row (status=PENDING)  ────────→ │ Realtime notification
        │                                          │
        ↓                                          ↓
  Email: "Waiting for salon"              Salon calls/WA from own phone
        │                                          │
        ↓                                          ↓
  Waits for status change           Salon taps Confirm → status=CONFIRMED
        │                                          │
        ←──────── email: "Confirmed" ──────────────┘
        ↓
  On appointment day → status progresses: IN_PROGRESS → COMPLETED
        │
        ↓
  Both sides get 7-day review window (email + in-app prompt)
        │
        ↓
  Reviews → aggregates updated via trigger
        │
        ↓
  If salon rating < 2★ (5+ reviews) → admin Flagged list
  If consumer rating < 2★ (3+ home bookings) or no-shows ≥3 → admin Flagged list
  Admin silently blocks → no new requests to/from that party
```

---

## Phase 0 — Schema + infra (Week 1)

### Migration 041 — marketplace groundwork

Additive only. Reversible via migration 042.

```sql
-- 041_marketplace_groundwork.sql

-- ========== Cities ==========
CREATE TABLE cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  country_code text NOT NULL DEFAULT 'PK',
  lat numeric(10,7) NOT NULL,
  lng numeric(10,7) NOT NULL,
  bbox_north numeric(10,7) NOT NULL,
  bbox_south numeric(10,7) NOT NULL,
  bbox_east numeric(10,7) NOT NULL,
  bbox_west numeric(10,7) NOT NULL,
  display_order integer NOT NULL DEFAULT 999,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cities_active ON cities (is_active, display_order);

INSERT INTO cities (slug, name, lat, lng, bbox_north, bbox_south, bbox_east, bbox_west, display_order) VALUES
  ('karachi',    'Karachi',    24.8607, 67.0011, 25.30, 24.70, 67.40, 66.80,  1),
  ('lahore',     'Lahore',     31.5204, 74.3587, 31.70, 31.25, 74.60, 74.15,  2),
  ('islamabad',  'Islamabad',  33.6844, 73.0479, 33.85, 33.50, 73.30, 72.80,  3),
  ('rawalpindi', 'Rawalpindi', 33.5651, 73.0169, 33.72, 33.45, 73.20, 72.85,  4),
  ('faisalabad', 'Faisalabad', 31.4504, 73.1350, 31.60, 31.30, 73.30, 72.95,  5);

-- ========== Marketplace services taxonomy ==========
CREATE TABLE marketplace_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  display_name text NOT NULL,
  matches_categories text[] NOT NULL,
  display_order integer NOT NULL DEFAULT 999,
  is_active boolean NOT NULL DEFAULT true,
  available_at_home boolean NOT NULL DEFAULT true
);

INSERT INTO marketplace_services (slug, name, display_name, matches_categories, display_order, available_at_home) VALUES
  ('haircut',        'Haircut',        'Haircut',              ARRAY['haircut'],       1, true),
  ('beard-trim',     'Beard Trim',     'Beard Trim',           ARRAY['beard'],         2, true),
  ('hair-color',     'Hair Color',     'Hair Color',           ARRAY['color'],         3, true),
  ('facial',         'Facial',         'Facial',               ARRAY['facial'],        4, true),
  ('waxing',         'Waxing',         'Waxing',               ARRAY['waxing'],        5, true),
  ('bridal',         'Bridal',         'Bridal Makeup',        ARRAY['bridal'],        6, true),
  ('nails',          'Nails',          'Nails & Manicure',     ARRAY['nails'],         7, true),
  ('massage',        'Massage',        'Massage',              ARRAY['massage'],       8, true),
  ('keratin',        'Keratin',        'Keratin Treatment',    ARRAY['treatment'],     9, false),
  ('hair-treatment', 'Hair Treatment', 'Hair Treatment',       ARRAY['treatment'],    10, false);

-- ========== Branches extensions ==========
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS lat numeric(10,7),
  ADD COLUMN IF NOT EXISTS lng numeric(10,7),
  ADD COLUMN IF NOT EXISTS slug text UNIQUE,
  ADD COLUMN IF NOT EXISTS photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS about text,
  ADD COLUMN IF NOT EXISTS listed_on_marketplace boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS offers_home_service boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS home_service_radius_km numeric(5,2),
  ADD COLUMN IF NOT EXISTS rating_avg numeric(3,2),
  ADD COLUMN IF NOT EXISTS rating_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS city_id uuid REFERENCES cities(id);

CREATE INDEX IF NOT EXISTS idx_branches_marketplace ON branches (listed_on_marketplace) WHERE listed_on_marketplace;
CREATE INDEX IF NOT EXISTS idx_branches_home ON branches (offers_home_service) WHERE offers_home_service;
CREATE INDEX IF NOT EXISTS idx_branches_city ON branches (city_id) WHERE listed_on_marketplace;
CREATE INDEX IF NOT EXISTS idx_branches_geo ON branches (lat, lng) WHERE listed_on_marketplace;

-- ========== Salons extensions (settlement + admin block) ==========
ALTER TABLE salons
  ADD COLUMN IF NOT EXISTS marketplace_unsettled_payable numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS marketplace_payable_blocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS marketplace_admin_blocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS marketplace_block_threshold numeric(10,2) NOT NULL DEFAULT 5000;

-- ========== Services extension (per-service at-home flag) ==========
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS available_at_home boolean NOT NULL DEFAULT true;

-- ========== Consumers ==========
-- Consumers live as regular Supabase auth.users with a companion profile row
CREATE TABLE consumers (
  id uuid PRIMARY KEY,  -- == auth.users.id
  name text NOT NULL,
  phone text NOT NULL,
  rating_avg numeric(3,2),
  rating_count integer NOT NULL DEFAULT 0,
  no_show_count integer NOT NULL DEFAULT 0,
  post_confirm_cancel_count integer NOT NULL DEFAULT 0,
  blocked_by_admin boolean NOT NULL DEFAULT false,
  blocked_at timestamptz,
  notification_prefs jsonb NOT NULL DEFAULT '{"booking_updates":true,"promos":false}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_consumers_blocked ON consumers (blocked_by_admin);

CREATE TABLE consumer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_id uuid NOT NULL REFERENCES consumers(id) ON DELETE CASCADE,
  label text NOT NULL,
  street text NOT NULL,
  lat numeric(10,7) NOT NULL,
  lng numeric(10,7) NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_consumer_addresses_consumer ON consumer_addresses (consumer_id);

CREATE TABLE consumer_favorites (
  consumer_id uuid NOT NULL REFERENCES consumers(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer_id, branch_id)
);

-- ========== Bookings (separate from existing appointments) ==========
CREATE TYPE booking_status AS ENUM (
  'PENDING',
  'CONFIRMED',
  'DECLINED',
  'CANCELLED_BY_CONSUMER',
  'CANCELLED_BY_SALON',
  'IN_PROGRESS',
  'COMPLETED',
  'NO_SHOW'
);
CREATE TYPE booking_location_type AS ENUM ('in_salon', 'home');

CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_id uuid NOT NULL REFERENCES consumers(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  salon_id uuid NOT NULL REFERENCES salons(id),
  status booking_status NOT NULL DEFAULT 'PENDING',
  location_type booking_location_type NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_slot_start timestamptz NOT NULL,
  requested_slot_end timestamptz NOT NULL,
  -- Pricing snapshot (locked at creation time)
  salon_base_total numeric(10,2) NOT NULL,  -- sum of salon base prices for all services
  platform_markup numeric(10,2) NOT NULL DEFAULT 0,  -- 30% markup rounded up to 50, only for home
  service_charge numeric(10,2) NOT NULL DEFAULT 0,   -- flat 300 only for home
  consumer_total numeric(10,2) NOT NULL,    -- what consumer pays cash
  -- Home booking fields
  address_id uuid REFERENCES consumer_addresses(id),
  address_street text,
  address_lat numeric(10,7),
  address_lng numeric(10,7),
  -- Transitions
  confirmed_at timestamptz,
  declined_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by text,  -- 'consumer' | 'salon'
  completed_at timestamptz,
  -- Review window
  review_window_closes_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requested_slot_end > requested_slot_start),
  CHECK (location_type = 'home' OR address_id IS NULL),
  CHECK (location_type = 'in_salon' OR address_id IS NOT NULL)
);
CREATE INDEX idx_bookings_salon ON bookings (salon_id, status);
CREATE INDEX idx_bookings_consumer ON bookings (consumer_id, requested_slot_start DESC);
CREATE INDEX idx_bookings_branch_slot ON bookings (branch_id, requested_slot_start);
CREATE INDEX idx_bookings_pending ON bookings (branch_id) WHERE status = 'PENDING';

CREATE TABLE booking_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES services(id),
  salon_base_price numeric(10,2) NOT NULL,
  display_price numeric(10,2) NOT NULL  -- what consumer saw (base for in_salon, rounded-markup for home)
);
CREATE INDEX idx_booking_items_booking ON booking_items (booking_id);

-- ========== Reviews ==========
CREATE TYPE review_direction AS ENUM ('consumer_of_salon', 'salon_of_consumer');

CREATE TABLE reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  direction review_direction NOT NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, direction)
);
CREATE INDEX idx_reviews_booking ON reviews (booking_id);

-- Salons can only review consumers on home bookings
CREATE OR REPLACE FUNCTION enforce_salon_review_home_only()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.direction = 'salon_of_consumer' THEN
    IF NOT EXISTS (
      SELECT 1 FROM bookings b WHERE b.id = NEW.booking_id AND b.location_type = 'home'
    ) THEN
      RAISE EXCEPTION 'Salon can only review consumers on home bookings';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_reviews_direction_check
  BEFORE INSERT ON reviews
  FOR EACH ROW EXECUTE FUNCTION enforce_salon_review_home_only();

-- Aggregate updates via triggers
CREATE OR REPLACE FUNCTION update_branch_rating_agg()
RETURNS TRIGGER AS $$
DECLARE
  v_branch uuid;
BEGIN
  IF NEW.direction = 'consumer_of_salon' THEN
    SELECT branch_id INTO v_branch FROM bookings WHERE id = NEW.booking_id;
    UPDATE branches SET
      rating_avg = (SELECT AVG(r.rating)::numeric(3,2)
                    FROM reviews r JOIN bookings b ON b.id = r.booking_id
                    WHERE b.branch_id = v_branch AND r.direction = 'consumer_of_salon'),
      rating_count = (SELECT COUNT(*)
                      FROM reviews r JOIN bookings b ON b.id = r.booking_id
                      WHERE b.branch_id = v_branch AND r.direction = 'consumer_of_salon')
    WHERE id = v_branch;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_reviews_update_branch_agg
  AFTER INSERT ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_branch_rating_agg();

CREATE OR REPLACE FUNCTION update_consumer_rating_agg()
RETURNS TRIGGER AS $$
DECLARE
  v_consumer uuid;
BEGIN
  IF NEW.direction = 'salon_of_consumer' THEN
    SELECT consumer_id INTO v_consumer FROM bookings WHERE id = NEW.booking_id;
    UPDATE consumers SET
      rating_avg = (SELECT AVG(r.rating)::numeric(3,2)
                    FROM reviews r JOIN bookings b ON b.id = r.booking_id
                    WHERE b.consumer_id = v_consumer AND r.direction = 'salon_of_consumer'),
      rating_count = (SELECT COUNT(*)
                      FROM reviews r JOIN bookings b ON b.id = r.booking_id
                      WHERE b.consumer_id = v_consumer AND r.direction = 'salon_of_consumer')
    WHERE id = v_consumer;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_reviews_update_consumer_agg
  AFTER INSERT ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_consumer_rating_agg();

-- ========== Settlement ledger ==========
CREATE TABLE salon_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid NOT NULL REFERENCES salons(id),
  amount numeric(10,2) NOT NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid NOT NULL,  -- admin user id
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_salon_settlements_salon ON salon_settlements (salon_id, paid_at DESC);

-- On booking completion, increment salon.marketplace_unsettled_payable and apply block if ≥ threshold
CREATE OR REPLACE FUNCTION apply_payable_on_completion()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'COMPLETED' AND OLD.status <> 'COMPLETED' AND NEW.location_type = 'home' THEN
    UPDATE salons SET
      marketplace_unsettled_payable = marketplace_unsettled_payable + NEW.platform_markup + NEW.service_charge,
      marketplace_payable_blocked_at = CASE
        WHEN (marketplace_unsettled_payable + NEW.platform_markup + NEW.service_charge) >= marketplace_block_threshold
             AND marketplace_payable_blocked_at IS NULL
        THEN now()
        ELSE marketplace_payable_blocked_at
      END
    WHERE id = NEW.salon_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_booking_complete_payable
  AFTER UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION apply_payable_on_completion();

-- On settlement payment recorded, decrement payable and clear block if below threshold
CREATE OR REPLACE FUNCTION apply_settlement_payment()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE salons SET
    marketplace_unsettled_payable = GREATEST(0, marketplace_unsettled_payable - NEW.amount),
    marketplace_payable_blocked_at = CASE
      WHEN (marketplace_unsettled_payable - NEW.amount) < marketplace_block_threshold
      THEN NULL
      ELSE marketplace_payable_blocked_at
    END
  WHERE id = NEW.salon_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_settlement_apply_payment
  AFTER INSERT ON salon_settlements
  FOR EACH ROW EXECUTE FUNCTION apply_settlement_payment();

-- ========== No-show / post-confirm cancel counters on consumers ==========
CREATE OR REPLACE FUNCTION increment_consumer_counters()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'NO_SHOW' AND OLD.status <> 'NO_SHOW' THEN
    UPDATE consumers SET no_show_count = no_show_count + 1 WHERE id = NEW.consumer_id;
  END IF;
  IF NEW.status = 'CANCELLED_BY_CONSUMER' AND OLD.status = 'CONFIRMED' THEN
    UPDATE consumers SET post_confirm_cancel_count = post_confirm_cancel_count + 1 WHERE id = NEW.consumer_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_booking_consumer_counters
  AFTER UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION increment_consumer_counters();

-- ========== Storage buckets ==========
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('branch-photos', 'branch-photos', true, 5242880, ARRAY['image/jpeg','image/png','image/webp']);
```

### Migration 042 — rollback

Mirror of 041 that drops in reverse dependency order. Kept even though we don't expect to need it.

### Slug generation

`src/lib/marketplace/slug.ts` — generates `<name>-<area>-<city>` kebab-case, dedups with `-2`, `-3` suffixes. Run once as part of migration 041 for existing branches; called on branch creation going forward.

### Mapbox setup (Week 1, Day 1)

1. User creates mapbox.com account (free tier — 50K map loads + 100K geocoding per month).
2. Two tokens:
   - `NEXT_PUBLIC_MAPBOX_TOKEN` — public, URL-restricted to `icut.pk` domains only.
   - `MAPBOX_GEOCODING_TOKEN` — server-side, geocoding scope only.
3. `src/lib/mapbox.ts` — thin wrapper: `geocode(query)`, `reverseGeocode(lat, lng)`, map component loader.
4. Store tokens in prod `.env.local` on VPS, add to CI.

### PWA shell (Week 1, Day 3–5)

- `src/app/(marketplace)/manifest.ts` — app name "iCut", short_name "iCut", 192/512 icons, theme color, display standalone, start_url `/`.
- `src/app/(marketplace)/sw.ts` — service worker for offline shell + cache-first for static assets. Web Push registration deferred (Phase 1 uses email, not push — SW is prep for Phase 2 wrapper).
- Icon set: 192px, 512px, maskable. Designed per /design-consultation.

### Salon-side opt-in UI (Week 1, Day 5–7)

New settings page: `src/app/dashboard/settings/marketplace/page.tsx`. Two sections:

**Section A — At-salon iCut bookings**
- Toggle: "List this branch on iCut (at-salon bookings)"
- Requirements gate (toggle disabled until):
  - ≥ 3 photos uploaded to `branch-photos` bucket
  - "About" text ≥ 100 chars
  - Map pin set (lat/lng non-null)
  - City selected from dropdown (cities table)
  - ≥ 1 active service
- On publish: server-side validation repeats all of above, sets `listed_on_marketplace = true`.

**Section B — Home service**
- Toggle: "Offer home service from this branch"
- Sub-fields (visible when toggle on):
  - Radius (km) — numeric input, default 8
  - Per-service "available at home" overrides — defaults from service catalog, editable
- On publish: sets `offers_home_service = true`, `home_service_radius_km`.

---

## Phase 1 — Consumer flow (Weeks 2–6)

### Routes

| Path | Purpose | Caching | Auth |
|---|---|---|---|
| `/` | Consumer home: mode toggle, featured salons, city picker, search | static shell + dynamic featured list | public |
| `/barbers` | All-PK directory index | static + ISR 6h | public |
| `/barbers/[city]` | City directory | static + ISR 6h | public |
| `/barber/[slug]` | Salon profile | static + ISR 6h, dynamic rating | public |
| `/services/[service]-in-[city]` | Programmatic SEO | static + ISR 6h | public |
| `/services/home-[service]-in-[city]` | Programmatic SEO for home mode | static + ISR 6h | public |
| `/book/[slug]` | Cart + checkout | dynamic | login required (redirects to /register) |
| `/register` | Signup | dynamic | public, session-to-be |
| `/login` (consumer) | Sign in | dynamic | public |
| `/verify-email` | Email verification landing | dynamic | token-bound |
| `/account` | Dashboard shell | dynamic | consumer required |
| `/account/bookings` | My Bookings list | dynamic | consumer required |
| `/account/bookings/[id]` | Booking detail + status | dynamic | consumer required |
| `/account/addresses` | Saved addresses | dynamic | consumer required |
| `/account/favorites` | Saved salons | dynamic | consumer required |
| `/account/profile` | Edit name/phone/email/password | dynamic | consumer required |
| `/account/notifications` | Email pref toggles | dynamic | consumer required |
| `/sitemap.xml` | Auto-generated | cached hourly | public |
| `/robots.txt` | Static | — | public |
| `/business` | Copy of current business landing | static | public |

Existing owner/admin routes untouched.

### Component tree

```
src/app/(marketplace)/
├── layout.tsx                    # Consumer shell: top bar + session mode toggle persistence
├── page.tsx                      # Home with mode toggle
├── barbers/
│   ├── page.tsx                  # All-PK list
│   └── [city]/page.tsx           # City list
├── barber/[slug]/
│   ├── page.tsx                  # Profile (mode-aware)
│   ├── opengraph-image.tsx       # Dynamic OG
│   └── reviews/page.tsx          # Dedicated reviews page
├── services/[slug]/page.tsx      # Programmatic SEO handler
├── book/[slug]/
│   └── page.tsx                  # Cart + checkout flow
├── register/page.tsx
├── login/page.tsx
├── verify-email/page.tsx
├── account/
│   ├── layout.tsx                # Account shell + side nav
│   ├── bookings/
│   │   ├── page.tsx
│   │   └── [id]/page.tsx
│   ├── addresses/page.tsx
│   ├── favorites/page.tsx
│   ├── profile/page.tsx
│   └── notifications/page.tsx
├── sitemap.ts
├── robots.ts
└── components/
    ├── mode-toggle.tsx           # At salon / At home (persists in cookie)
    ├── salon-card.tsx
    ├── city-picker.tsx
    ├── service-menu.tsx
    ├── mapbox-map.tsx
    ├── mapbox-address-picker.tsx
    ├── rating-display.tsx
    ├── review-list.tsx
    ├── review-form.tsx           # Post-completion prompt
    ├── booking-status-tracker.tsx
    ├── jsonld-beautysalon.tsx
    ├── jsonld-collectionpage.tsx
    └── breadcrumbs.tsx
```

### Consumer registration flow (Week 2)

1. Consumer taps "Book" on salon profile.
2. If not logged in → modal: "Sign in / Register". Modal routes to `/register?next=/book/[slug]`.
3. Register form: name, email, password (min 10 chars), phone (PK validator, +92 prefix).
4. Submit → Supabase Auth `signUp` (email verification enabled), `consumers` row inserted, email verification link sent via Resend.
5. Consumer clicks verification link → `/verify-email?token=...` → session finalized → redirected to `next` param.
6. First login after verification → booking flow resumes at the salon they were on.

### Home-first toggle (Week 2)

- Top of homepage: big toggle `🏡 At salon` / `🚗 At home`.
- Selection persists in a cookie `icut-mode`.
- All directory + programmatic SEO routes respect the cookie and filter accordingly (`offers_home_service = true` when home mode).
- Salon profile page `/barber/[slug]` renders based on mode:
  - **In-salon mode:** shows all services with salon base prices, "Book at salon" CTA.
  - **Home mode:** shows only `available_at_home` services with marked-up prices, "Book at home" CTA, shows radius warning if address is out of range.

### Cart + checkout (Week 3)

`/book/[slug]` — step wizard:

**Step 1 (home mode only):** Address
- Mapbox autocomplete input + map with draggable pin.
- If consumer has saved addresses, list them as radio options first; "Add new" opens picker.
- On continue: validate pin within salon's radius. If not, hard-stop "This salon doesn't cover your area — pick another."

**Step 2:** Service selection
- List of salon's services with checkboxes.
- Prices shown as marked-up (home mode) or base (in-salon mode).
- Running total in sticky footer.

**Step 3:** Time slot
- Salon's working hours + existing appointment conflicts (from `appointments` table) define available slots.
- Consumer picks a slot.

**Step 4:** Review + submit
- Cart summary: each service + price, home service charge (Rs 300) as separate line, total.
- "Notes for salon" optional text box.
- "Confirm booking request" CTA.

**On submit:**
- Insert `bookings` row with status `PENDING`, pricing snapshot, address snapshot.
- Insert `booking_items` rows.
- Trigger realtime event to salon's `incoming-bookings` channel.
- Send consumer "We got your request" email via Resend.
- Redirect to `/account/bookings/[id]` — booking status tracker shows "Waiting for salon to confirm."

### Salon-side realtime panel (Week 4)

New dashboard component: `src/app/dashboard/marketplace-bookings/panel.tsx`.
- Supabase Realtime subscription to `bookings` inserts filtered by `salon_id`.
- Sound + toast on new pending booking.
- Each row: consumer name, rating (private), services, time, address (if home), phone.
- Actions: Confirm / Decline / Call consumer (phone link) / WhatsApp consumer (wa.me link, opens their own WhatsApp).
- After confirmation → consumer gets "Confirmed" email.
- Sliding window of last 50 bookings across all statuses.

### Two-way rating prompts (Week 5)

- Cron job (or DB trigger) marks bookings `COMPLETED` when appointment time + service duration has passed. Salon dashboard also has a "Mark complete" button for the salon to advance it.
- On completion: `review_window_closes_at = completed_at + 7 days`.
- Email to consumer: "How was your service at Fatima Beauty Lounge? Tap to leave a review." → `/account/bookings/[id]/review`.
- Email to salon (home bookings only): "How was your home visit to Asad K.? Tap to rate." → dashboard review form.
- In-app nudge on both dashboards when there's a pending review.
- After window closes, the booking shows "Review window closed" and UI blocks new review submission.

### Admin flag/block dashboard (Week 5)

New admin page: `/admin/marketplace/flagged`.
- Two tabs: **Flagged salons** and **Flagged consumers**.
- Salon flag SQL: `rating_avg < 2 AND rating_count >= 5 AND marketplace_admin_blocked_at IS NULL`.
- Consumer flag SQL: `(rating_avg < 2 AND rating_count >= 3) OR no_show_count >= 3 OR post_confirm_cancel_count >= 5) AND blocked_by_admin = false`.
- Each row shows: name, rating, counts, last-5 review snippets (for salons) or last-5 booking-status snippets (for consumers).
- Actions: [Block] (sets `marketplace_admin_blocked_at` or `blocked_by_admin`), [Dismiss] (adds to a `flag_dismissals` table to stop re-flagging until thresholds re-cross).
- **No notification sent to the blocked party.** Salon: removed from all public directory pages + service-in-city pages + sitemap (already filtered by `listed_on_marketplace AND marketplace_admin_blocked_at IS NULL`). Consumer: booking submission endpoint checks `blocked_by_admin` and silently fails.

### Admin settlement dashboard (Week 5)

New admin page: `/admin/marketplace/settlements`.
- List of salons with `marketplace_unsettled_payable > 0`, sorted by amount desc.
- Each row: salon name, current unsettled, last payment, # home bookings contributing, status (OK / Warning / Blocked).
- Click row → detail: breakdown of unsettled bookings with amounts.
- `[Record Payment]` button — modal asks amount + note → inserts `salon_settlements` row → trigger decrements payable + clears block if applicable.

### SEO implementation (Week 6)

Per-page SEO meta:
- `/` — title "Book Haircuts & Beauty Services in Pakistan — iCut", description + CTA.
- `/barbers/[city]` — "Best Barbers & Salons in {City} — iCut" + `CollectionPage` JSON-LD.
- `/barber/[slug]` — "{Salon} — {City} · Book on iCut" + full `BeautySalon` JSON-LD with geo, hours, priceRange, aggregateRating.
- `/services/[slug]-in-[city]` — "{Service} in {City} — {N} Salons · Book on iCut" + `CollectionPage` + `ItemList` JSON-LD.
- `/services/home-[slug]-in-[city]` — same as above but targeting "home {service} in {city}".

OG images: `opengraph-image.tsx` in each salon profile — composite of first photo + name + address + rating stars.

Sitemap: auto-generated from DB on each request (cached 1h).
Robots: allow all public routes, disallow `/dashboard/`, `/admin/`, `/agent/`, `/api/`.

### Mobile-first rules (reminder)

- Max content width 480px mobile / 960px desktop.
- Tap targets ≥ 44px.
- No sidebar on mobile; bottom-sheet nav for account.
- Fixed bottom CTA on salon profile: "Book at salon" / "Book at home".
- Images lazy-loaded below fold; first salon photo above-fold with `fetchpriority="high"`.

---

## Rollout plan — 6-8 weeks

| Week | Deliverable |
|---|---|
| 1 | Migration 041 on staging + prod, Mapbox setup, branch-photos bucket, slug backfill, salon opt-in UI. PWA manifest + service worker shell. |
| 2 | Consumer registration (Supabase Auth + email verify), `/register`, `/login`, `/verify-email`. Home page + mode toggle. Public `/barbers`, `/barbers/[city]`. |
| 3 | Salon profile `/barber/[slug]` (both modes). Cart + checkout wizard. Booking submission → `bookings` PENDING. Consumer email "we got your request". |
| 4 | Salon Incoming Bookings realtime panel. Confirm/decline flow. Consumer status tracker. Email "Confirmed"/"Declined". Call/WhatsApp links. |
| 5 | Review prompts (7-day window) for both sides. Review display on salon profile. Aggregate triggers. Admin Flagged dashboard. Admin Settlement dashboard. |
| 6 | Programmatic SEO pages, sitemap, robots, OG images, JSON-LD. Core Web Vitals pass. Manual pilot: onboard 3-5 salons (user's first). |
| 7 | Buffer week for polish, accessibility pass, mobile QA, PWA install banner flow, /design-review pass. |
| 8 | Submit sitemap to Google Search Console. Launch email to existing salon owners about marketplace opt-in. Monitor metrics. |

---

## Monitoring

- Google Search Console — impressions, clicks, CTR per page.
- Supabase logs — slow queries on `/barber/[slug]`, `/barbers/[city]` (these are hot).
- Mapbox dashboard — weekly map loads (alert at 40K/mo, 80% of free tier).
- Resend dashboard — email bounce rate; delivery failures surface in admin alert.
- App health metrics (browse daemon) — booking submission success rate, realtime delivery latency.
- Admin dashboard metrics card: bookings this week, conversion (profile view → booking submit), flagged counts.

---

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Google doesn't index programmatic SEO pages (seen as thin content) | Each `/services/[svc]-in-[city]` page must have ≥ 3 listed salons before indexing; otherwise emit `noindex`. Unique intro paragraphs per city. |
| Mapbox free tier exceeded | Static map images above the fold; interactive map lazy-loaded on scroll. Weekly check via admin dashboard. |
| Salons don't opt in (empty marketplace) | User personally onboards 5 pilot salons including their own. Walkthrough email + in-app banner. |
| Consumers don't verify email | Show resend button prominently. If unverified > 24h → admin sees list, can nudge. |
| Salon over Rs 5K payable ghosts (doesn't pay, abandons account) | They're still on monthly subscription — admin has leverage via subscription tier. If they ghost, admin suspends subscription. |
| Fake reviews / review bombing | Only one review per booking per direction (unique constraint). Abusive text reviews removable by admin on complaint. Eventually add a rate-limit on review submissions per consumer per month. |
| Consumer signs up with burner email, no-shows repeatedly | No-show counter + flag threshold catches this. Admin can block. Phone is unique-indexed so re-registration with same phone is detected. |
| PWA install friction (iOS Safari has no install prompt) | Add iOS-specific "Add to Home Screen" banner with screenshots of how. Capacitor wrapper later removes this pain. |
| Cross-tenant leak (consumer data to wrong salon, salon data to wrong admin) | Same tenant-guard pattern as existing code: `requireSession()` + `.eq('salon_id', session.salonId)` on every query. Booking reads also checked against `consumer_id = session.consumerId` for consumer-side endpoints. |

---

## Out of scope for Phase 0+1

- Payment gateway / card payments / wallet integration.
- Native iOS/Android apps (Capacitor wrapper is Phase 2).
- Push notifications (email only in Phase 1).
- Phone OTP auth (email verification only).
- Loyalty points / referral rewards.
- Multi-stylist preference (consumer picks specific staff member).
- Home-service team management (salon assigns specific staff to home visits automatically).
- Review replies with threading (salon can reply once, not thread).
- Admin-adjustable markup % or service charge per salon — both are global in Phase 1.

---

## Phase 2 preview

- Capacitor native wrapper → App Store + Play Store + real push notifications.
- Payment gateway — card / JazzCash / EasyPaisa at booking time.
- Promo codes + discounts.
- Multi-city expansion (add 15 more cities).
- Waitlist feature — consumer gets notified when a slot opens at a favorite salon.
- Salon-to-salon referral network.
- Home-service team management UI.

Everything in Phase 0+1 plugs into Phase 2 directly.

---

## Decisions log (for future readers)

All 31 decisions captured in `~/.claude/projects/-Users-alkhatalrafie-icut/memory/project_pending_marketplace.md`. That memory should be deleted once Phase 0 work begins and this doc becomes the source of truth.
