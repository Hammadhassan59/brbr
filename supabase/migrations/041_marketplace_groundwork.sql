-- =============================================================================
-- 041_marketplace_groundwork.sql
--
-- Phase 0 schema for the iCut marketplace (Foodpanda-style consumer PWA).
--
-- Date:          2026-04-18
-- Dependencies:  040_rollback_039.sql (latest head)
-- Rollback path: 042_rollback_041.sql
--
-- What this migration does (all additive):
--   1. `cities` table + seed of 5 PK cities (Karachi, Lahore, Islamabad,
--      Rawalpindi, Faisalabad).
--   2. `marketplace_services` taxonomy + seed of 10 canonical services.
--   3. Extends `branches` with marketplace fields (lat/lng, slug, photos, about,
--      listing/home-service toggles, rating aggregates, city_id FK).
--   4. Extends `salons` with settlement + admin-block fields.
--   5. Extends `services` with `available_at_home` flag.
--   6. `consumers`, `consumer_addresses`, `consumer_favorites` tables.
--   7. `bookings` + `booking_items` with PENDING/CONFIRMED/… status machine,
--      price snapshot, home-address snapshot, review window.
--   8. `reviews` + enforce-direction trigger (salon can only rate consumers on
--      home bookings) + aggregate triggers for branch/consumer ratings.
--   9. `salon_settlements` ledger + payable-increment trigger on booking
--      COMPLETED + payable-decrement trigger on settlement insert, both with
--      Rs 5,000 threshold block semantics.
--  10. Consumer behavior counters (no-show, post-confirm cancel) via booking
--      update trigger.
--  11. `branch-photos` public storage bucket.
--
-- Risk notes:
--   - Everything is additive; no columns renamed, no constraints tightened on
--     existing tables. Safe to ship without app changes (the new rows simply
--     aren't written yet).
--   - Branch slug backfill uses a placeholder `branch-<id8>` because existing
--     branches have no `area` column and no dependable city data in schema
--     (salons.city is freeform text, often empty). Real slugs are computed
--     by src/lib/marketplace/slug.ts and written when each branch first opts
--     into the marketplace listing toggle.
--   - The `bookings` table is intentionally SEPARATE from `appointments`. We
--     do NOT merge them — marketplace bookings have their own state machine
--     (PENDING awaiting salon confirm), pricing snapshot, address snapshot,
--     and review window. `appointments` remains the in-salon schedule source
--     of truth.
-- =============================================================================

BEGIN;

-- ===========================================================================
-- 1. Cities
-- ===========================================================================

CREATE TABLE IF NOT EXISTS cities (
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
CREATE INDEX IF NOT EXISTS idx_cities_active ON cities (is_active, display_order);

INSERT INTO cities (slug, name, lat, lng, bbox_north, bbox_south, bbox_east, bbox_west, display_order) VALUES
  ('karachi',    'Karachi',    24.8607, 67.0011, 25.30, 24.70, 67.40, 66.80,  1),
  ('lahore',     'Lahore',     31.5204, 74.3587, 31.70, 31.25, 74.60, 74.15,  2),
  ('islamabad',  'Islamabad',  33.6844, 73.0479, 33.85, 33.50, 73.30, 72.80,  3),
  ('rawalpindi', 'Rawalpindi', 33.5651, 73.0169, 33.72, 33.45, 73.20, 72.85,  4),
  ('faisalabad', 'Faisalabad', 31.4504, 73.1350, 31.60, 31.30, 73.30, 72.95,  5)
ON CONFLICT (slug) DO NOTHING;

-- ===========================================================================
-- 2. Marketplace services taxonomy
-- ===========================================================================
-- `matches_categories` maps to services.category values (from 001_initial_schema
-- enum: 'haircut','color','treatment','facial','waxing','bridal','nails',
-- 'massage','beard','other') so directory pages can resolve a marketplace
-- service slug back to salon-level services.

CREATE TABLE IF NOT EXISTS marketplace_services (
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
  ('haircut',        'Haircut',        'Haircut',              ARRAY['haircut'],    1, true),
  ('beard-trim',     'Beard Trim',     'Beard Trim',           ARRAY['beard'],      2, true),
  ('hair-color',     'Hair Color',     'Hair Color',           ARRAY['color'],      3, true),
  ('facial',         'Facial',         'Facial',               ARRAY['facial'],     4, true),
  ('waxing',         'Waxing',         'Waxing',               ARRAY['waxing'],     5, true),
  ('bridal',         'Bridal',         'Bridal Makeup',        ARRAY['bridal'],     6, true),
  ('nails',          'Nails',          'Nails & Manicure',     ARRAY['nails'],      7, true),
  ('massage',        'Massage',        'Massage',              ARRAY['massage'],    8, true),
  ('keratin',        'Keratin',        'Keratin Treatment',    ARRAY['treatment'],  9, false),
  ('hair-treatment', 'Hair Treatment', 'Hair Treatment',       ARRAY['treatment'], 10, false)
ON CONFLICT (slug) DO NOTHING;

-- ===========================================================================
-- 3. Branches extensions (marketplace listing fields + gender classification)
-- ===========================================================================

-- Gender type drives men-only-launch gating. Superadmin decides when to open
-- the marketplace to women / mixed salons via platform_settings below.
DO $$
BEGIN
  CREATE TYPE salon_gender_type AS ENUM ('men', 'women', 'mixed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS lat numeric(10,7),
  ADD COLUMN IF NOT EXISTS lng numeric(10,7),
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS about text,
  ADD COLUMN IF NOT EXISTS listed_on_marketplace boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS offers_home_service boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS home_service_radius_km numeric(5,2),
  ADD COLUMN IF NOT EXISTS rating_avg numeric(3,2),
  ADD COLUMN IF NOT EXISTS rating_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS city_id uuid REFERENCES cities(id),
  ADD COLUMN IF NOT EXISTS gender_type salon_gender_type;

CREATE INDEX IF NOT EXISTS idx_branches_gender ON branches (gender_type) WHERE listed_on_marketplace;

-- Slug backfill: use placeholder `branch-<id-first-8>` for existing rows.
-- Real slugs are computed by src/lib/marketplace/slug.ts and written when
-- the owner first publishes the branch to the marketplace.
UPDATE branches
SET slug = 'branch-' || substr(id::text, 1, 8)
WHERE slug IS NULL;

-- Enforce uniqueness AFTER backfill so placeholders don't collide (uuid
-- prefixes are unique with overwhelmingly high probability in practice;
-- we use a partial unique index so future real slugs share the space).
CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_slug_unique ON branches (slug);

CREATE INDEX IF NOT EXISTS idx_branches_marketplace ON branches (listed_on_marketplace) WHERE listed_on_marketplace;
CREATE INDEX IF NOT EXISTS idx_branches_home ON branches (offers_home_service) WHERE offers_home_service;
CREATE INDEX IF NOT EXISTS idx_branches_city ON branches (city_id) WHERE listed_on_marketplace;
CREATE INDEX IF NOT EXISTS idx_branches_geo ON branches (lat, lng) WHERE listed_on_marketplace;

-- ===========================================================================
-- 4. Salons extensions (settlement + admin block)
-- ===========================================================================

ALTER TABLE salons
  ADD COLUMN IF NOT EXISTS marketplace_unsettled_payable numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS marketplace_payable_blocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS marketplace_admin_blocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS marketplace_block_threshold numeric(10,2) NOT NULL DEFAULT 5000;

-- ===========================================================================
-- 5. Services extension (per-service at-home flag)
-- ===========================================================================

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS available_at_home boolean NOT NULL DEFAULT true;

-- ===========================================================================
-- 5b. Platform settings (superadmin marketplace toggles)
-- ===========================================================================
-- Generic key/value bag for platform-wide flags. First use: gate women+mixed
-- salons out of the consumer marketplace until superadmin flips the switch
-- (men-only launch). Read path: application checks this before showing a
-- branch on public directory pages. Write path: superadmin-only page.

CREATE TABLE IF NOT EXISTS platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Idempotent column additions for the case where an older platform_settings
-- table already exists on the target DB (prod has a pre-existing trial /
-- general / email / payment / plans key-value store with only key + value +
-- updated_at columns; we need description + updated_by for the marketplace
-- admin toggle page's audit-log metadata).
ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);

INSERT INTO platform_settings (key, value, description) VALUES
  ('marketplace_women_enabled',
   'false'::jsonb,
   'When false, branches with gender_type IN (''women'',''mixed'') are hidden from the consumer marketplace directory and programmatic SEO pages. Men-only launch gate. Superadmin flips to true when ready to onboard women / mixed salons.')
ON CONFLICT (key) DO NOTHING;

-- ===========================================================================
-- 6. Consumers (marketplace-side user profile, keyed to auth.users.id)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS consumers (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,  -- == auth.users.id; RESTRICT matches salons.owner_id pattern and prevents orphaned consumer rows
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
CREATE INDEX IF NOT EXISTS idx_consumers_blocked ON consumers (blocked_by_admin);
CREATE INDEX IF NOT EXISTS idx_consumers_phone ON consumers (phone);

CREATE TABLE IF NOT EXISTS consumer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_id uuid NOT NULL REFERENCES consumers(id) ON DELETE CASCADE,
  label text NOT NULL,
  street text NOT NULL,
  lat numeric(10,7) NOT NULL,
  lng numeric(10,7) NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consumer_addresses_consumer ON consumer_addresses (consumer_id);

CREATE TABLE IF NOT EXISTS consumer_favorites (
  consumer_id uuid NOT NULL REFERENCES consumers(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer_id, branch_id)
);

-- ===========================================================================
-- 7. Bookings (marketplace orders — separate from in-salon appointments)
-- ===========================================================================

DO $$ BEGIN
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
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE booking_location_type AS ENUM ('in_salon', 'home');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_id uuid NOT NULL REFERENCES consumers(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  salon_id uuid NOT NULL REFERENCES salons(id),
  status booking_status NOT NULL DEFAULT 'PENDING',
  location_type booking_location_type NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_slot_start timestamptz NOT NULL,
  requested_slot_end timestamptz NOT NULL,
  -- Pricing snapshot (locked at creation time; never recomputed)
  salon_base_total numeric(10,2) NOT NULL,
  platform_markup numeric(10,2) NOT NULL DEFAULT 0,
  service_charge numeric(10,2) NOT NULL DEFAULT 0,
  consumer_total numeric(10,2) NOT NULL,
  -- Home booking fields (address snapshot at creation; consumer_addresses row may be deleted later)
  address_id uuid REFERENCES consumer_addresses(id) ON DELETE SET NULL,
  address_street text,
  address_lat numeric(10,7),
  address_lng numeric(10,7),
  -- Consumer notes for salon
  consumer_notes text,
  -- Transitions
  confirmed_at timestamptz,
  declined_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by text,  -- 'consumer' | 'salon'
  completed_at timestamptz,
  -- Review window closes 7 days after completion
  review_window_closes_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requested_slot_end > requested_slot_start),
  -- For home bookings, address snapshot must be present; for in-salon bookings it must be absent.
  CHECK (
    (location_type = 'home' AND address_street IS NOT NULL AND address_lat IS NOT NULL AND address_lng IS NOT NULL)
    OR
    (location_type = 'in_salon' AND address_street IS NULL AND address_lat IS NULL AND address_lng IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_bookings_salon ON bookings (salon_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_consumer ON bookings (consumer_id, requested_slot_start DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_branch_slot ON bookings (branch_id, requested_slot_start);
CREATE INDEX IF NOT EXISTS idx_bookings_pending ON bookings (branch_id) WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS booking_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES services(id),
  service_name text NOT NULL,  -- snapshot name so rename/delete of service doesn't mutate old bookings
  salon_base_price numeric(10,2) NOT NULL,
  display_price numeric(10,2) NOT NULL  -- what consumer saw: base for in_salon, rounded-markup for home
);
CREATE INDEX IF NOT EXISTS idx_booking_items_booking ON booking_items (booking_id);

-- ===========================================================================
-- 8. Reviews (two-way, one per booking per direction)
-- ===========================================================================

DO $$ BEGIN
  CREATE TYPE review_direction AS ENUM ('consumer_of_salon', 'salon_of_consumer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  direction review_direction NOT NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, direction)
);
CREATE INDEX IF NOT EXISTS idx_reviews_booking ON reviews (booking_id);

-- Salons can only review consumers on home bookings.
CREATE OR REPLACE FUNCTION enforce_salon_review_home_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
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
$$;

DROP TRIGGER IF EXISTS trg_reviews_direction_check ON reviews;
CREATE TRIGGER trg_reviews_direction_check
  BEFORE INSERT ON reviews
  FOR EACH ROW EXECUTE FUNCTION enforce_salon_review_home_only();

-- Aggregate: update branch rating when a consumer reviews a salon.
CREATE OR REPLACE FUNCTION update_branch_rating_agg()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
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
$$;

DROP TRIGGER IF EXISTS trg_reviews_update_branch_agg ON reviews;
CREATE TRIGGER trg_reviews_update_branch_agg
  AFTER INSERT ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_branch_rating_agg();

-- Aggregate: update consumer rating when a salon reviews a consumer (home bookings only).
CREATE OR REPLACE FUNCTION update_consumer_rating_agg()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
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
$$;

DROP TRIGGER IF EXISTS trg_reviews_update_consumer_agg ON reviews;
CREATE TRIGGER trg_reviews_update_consumer_agg
  AFTER INSERT ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_consumer_rating_agg();

-- ===========================================================================
-- 9. Settlement ledger + payable triggers
-- ===========================================================================

CREATE TABLE IF NOT EXISTS salon_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid NOT NULL REFERENCES salons(id),
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  paid_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid NOT NULL,  -- admin user id
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_salon_settlements_salon ON salon_settlements (salon_id, paid_at DESC);

-- On booking COMPLETED (home only): increment salon.marketplace_unsettled_payable
-- by (platform_markup + service_charge). If we cross the threshold, stamp
-- marketplace_payable_blocked_at (only if not already blocked).
CREATE OR REPLACE FUNCTION apply_payable_on_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
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
$$;

DROP TRIGGER IF EXISTS trg_booking_complete_payable ON bookings;
CREATE TRIGGER trg_booking_complete_payable
  AFTER UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION apply_payable_on_completion();

-- On settlement payment recorded: decrement payable, clear the block if we
-- drop below the threshold. GREATEST(0, …) prevents negative payables if
-- admin records an over-payment.
CREATE OR REPLACE FUNCTION apply_settlement_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
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
$$;

DROP TRIGGER IF EXISTS trg_settlement_apply_payment ON salon_settlements;
CREATE TRIGGER trg_settlement_apply_payment
  AFTER INSERT ON salon_settlements
  FOR EACH ROW EXECUTE FUNCTION apply_settlement_payment();

-- ===========================================================================
-- 10. Consumer behavior counters
-- ===========================================================================
-- no_show_count: incremented on status transition to NO_SHOW.
-- post_confirm_cancel_count: incremented on CANCELLED_BY_CONSUMER when the
--   prior state was CONFIRMED (cancelling after the salon already confirmed).

CREATE OR REPLACE FUNCTION increment_consumer_counters()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'NO_SHOW' AND OLD.status <> 'NO_SHOW' THEN
    UPDATE consumers SET no_show_count = no_show_count + 1 WHERE id = NEW.consumer_id;
  END IF;
  IF NEW.status = 'CANCELLED_BY_CONSUMER' AND OLD.status = 'CONFIRMED' THEN
    UPDATE consumers SET post_confirm_cancel_count = post_confirm_cancel_count + 1 WHERE id = NEW.consumer_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_booking_consumer_counters ON bookings;
CREATE TRIGGER trg_booking_consumer_counters
  AFTER UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION increment_consumer_counters();

-- ===========================================================================
-- 11. Storage bucket for branch photos
-- ===========================================================================
-- Public read (directory pages are SEO pages that need crawlable images).
-- 5 MB size limit, JPEG / PNG / WebP only.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('branch-photos', 'branch-photos', true, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- ===========================================================================
-- 12. RLS baseline (defense-in-depth; server actions use service_role today)
-- ===========================================================================

ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE consumers ENABLE ROW LEVEL SECURITY;
ALTER TABLE consumer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE consumer_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE salon_settlements ENABLE ROW LEVEL SECURITY;

-- Cities + marketplace_services: world-readable reference tables.
CREATE POLICY "Anyone can read cities"
  ON cities FOR SELECT
  USING (is_active);

CREATE POLICY "Anyone can read marketplace services"
  ON marketplace_services FOR SELECT
  USING (is_active);

-- Consumer tables: owner-scoped to auth.uid() = consumer_id.
CREATE POLICY "Consumers can view own row"
  ON consumers FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Consumers can update own row"
  ON consumers FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "Consumers can manage own addresses"
  ON consumer_addresses FOR ALL
  USING (consumer_id = auth.uid());

CREATE POLICY "Consumers can manage own favorites"
  ON consumer_favorites FOR ALL
  USING (consumer_id = auth.uid());

-- Bookings: consumer sees their own; salon owners see their salon's bookings.
CREATE POLICY "Consumers can view own bookings"
  ON bookings FOR SELECT
  USING (consumer_id = auth.uid());

CREATE POLICY "Salon members can view their bookings"
  ON bookings FOR SELECT
  USING (salon_id = get_user_salon_id());

CREATE POLICY "Salon members can update their bookings"
  ON bookings FOR UPDATE
  USING (salon_id = get_user_salon_id());

CREATE POLICY "Consumers can insert bookings for themselves"
  ON bookings FOR INSERT
  WITH CHECK (consumer_id = auth.uid());

CREATE POLICY "Consumers can update own bookings"
  ON bookings FOR UPDATE
  USING (consumer_id = auth.uid());

-- Booking items: mirror parent booking visibility.
CREATE POLICY "Consumers can view own booking items"
  ON booking_items FOR SELECT
  USING (booking_id IN (SELECT id FROM bookings WHERE consumer_id = auth.uid()));

CREATE POLICY "Salon members can view their booking items"
  ON booking_items FOR SELECT
  USING (booking_id IN (SELECT id FROM bookings WHERE salon_id = get_user_salon_id()));

CREATE POLICY "Consumers can insert own booking items"
  ON booking_items FOR INSERT
  WITH CHECK (booking_id IN (SELECT id FROM bookings WHERE consumer_id = auth.uid()));

-- Reviews: consumer-of-salon reviews are publicly readable (build trust on
-- salon profile pages); salon-of-consumer reviews visible only to salon + consumer.
CREATE POLICY "Anyone can read consumer reviews of salons"
  ON reviews FOR SELECT
  USING (direction = 'consumer_of_salon');

CREATE POLICY "Salon members can read private consumer reviews they received"
  ON reviews FOR SELECT
  USING (
    direction = 'salon_of_consumer'
    AND booking_id IN (SELECT id FROM bookings WHERE salon_id = get_user_salon_id())
  );

CREATE POLICY "Consumers can read reviews on their own bookings"
  ON reviews FOR SELECT
  USING (booking_id IN (SELECT id FROM bookings WHERE consumer_id = auth.uid()));

CREATE POLICY "Consumers can write reviews for their own bookings"
  ON reviews FOR INSERT
  WITH CHECK (
    direction = 'consumer_of_salon'
    AND booking_id IN (SELECT id FROM bookings WHERE consumer_id = auth.uid())
  );

CREATE POLICY "Salon members can write reviews on their home bookings"
  ON reviews FOR INSERT
  WITH CHECK (
    direction = 'salon_of_consumer'
    AND booking_id IN (SELECT id FROM bookings WHERE salon_id = get_user_salon_id())
  );

-- Salon settlements: visible to the salon + admin (service_role); only admin
-- inserts (enforced by server action calling with service_role).
CREATE POLICY "Salon members can view own settlements"
  ON salon_settlements FOR SELECT
  USING (salon_id = get_user_salon_id());

COMMIT;
