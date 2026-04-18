-- =============================================================================
-- 042_rollback_041.sql
--
-- Reverse of 041_marketplace_groundwork.sql. Drops every object 041 created,
-- in reverse dependency order. Idempotent (IF EXISTS everywhere) so it's
-- safe to re-run or run against a partially-applied 041.
--
-- Date:          2026-04-18
-- Dependencies:  041_marketplace_groundwork.sql
--
-- What this migration does NOT undo:
--   - Rows inserted by the application between 041 and 042 (bookings, reviews,
--     settlements) are wiped with the tables. That's intended.
--   - The branch-photos storage bucket is dropped, but any uploaded objects
--     inside it are first removed via storage.objects. If you want to keep
--     photos, back up the bucket BEFORE running this rollback.
--   - cities / marketplace_services reference rows are removed, but there
--     are no FK-dependent rows if you haven't listed any branches yet.
-- =============================================================================

BEGIN;

-- ===========================================================================
-- 1. RLS policies (dropped before tables to avoid cascade noise)
-- ===========================================================================

DROP POLICY IF EXISTS "Anyone can read cities" ON cities;
DROP POLICY IF EXISTS "Anyone can read marketplace services" ON marketplace_services;

DROP POLICY IF EXISTS "Consumers can view own row" ON consumers;
DROP POLICY IF EXISTS "Consumers can update own row" ON consumers;
DROP POLICY IF EXISTS "Consumers can manage own addresses" ON consumer_addresses;
DROP POLICY IF EXISTS "Consumers can manage own favorites" ON consumer_favorites;

DROP POLICY IF EXISTS "Consumers can view own bookings" ON bookings;
DROP POLICY IF EXISTS "Salon members can view their bookings" ON bookings;
DROP POLICY IF EXISTS "Salon members can update their bookings" ON bookings;
DROP POLICY IF EXISTS "Consumers can insert bookings for themselves" ON bookings;
DROP POLICY IF EXISTS "Consumers can update own bookings" ON bookings;

DROP POLICY IF EXISTS "Consumers can view own booking items" ON booking_items;
DROP POLICY IF EXISTS "Salon members can view their booking items" ON booking_items;
DROP POLICY IF EXISTS "Consumers can insert own booking items" ON booking_items;

DROP POLICY IF EXISTS "Anyone can read consumer reviews of salons" ON reviews;
DROP POLICY IF EXISTS "Salon members can read private consumer reviews they received" ON reviews;
DROP POLICY IF EXISTS "Consumers can read reviews on their own bookings" ON reviews;
DROP POLICY IF EXISTS "Consumers can write reviews for their own bookings" ON reviews;
DROP POLICY IF EXISTS "Salon members can write reviews on their home bookings" ON reviews;

DROP POLICY IF EXISTS "Salon members can view own settlements" ON salon_settlements;

-- ===========================================================================
-- 2. Triggers + trigger functions
-- ===========================================================================

DROP TRIGGER IF EXISTS trg_booking_consumer_counters ON bookings;
DROP FUNCTION IF EXISTS increment_consumer_counters();

DROP TRIGGER IF EXISTS trg_settlement_apply_payment ON salon_settlements;
DROP FUNCTION IF EXISTS apply_settlement_payment();

DROP TRIGGER IF EXISTS trg_booking_complete_payable ON bookings;
DROP FUNCTION IF EXISTS apply_payable_on_completion();

DROP TRIGGER IF EXISTS trg_reviews_update_consumer_agg ON reviews;
DROP FUNCTION IF EXISTS update_consumer_rating_agg();

DROP TRIGGER IF EXISTS trg_reviews_update_branch_agg ON reviews;
DROP FUNCTION IF EXISTS update_branch_rating_agg();

DROP TRIGGER IF EXISTS trg_reviews_direction_check ON reviews;
DROP FUNCTION IF EXISTS enforce_salon_review_home_only();

-- ===========================================================================
-- 3. Storage bucket (first clear objects, then drop bucket row)
-- ===========================================================================

DELETE FROM storage.objects WHERE bucket_id = 'branch-photos';
DELETE FROM storage.buckets WHERE id = 'branch-photos';

-- ===========================================================================
-- 4. Tables (reverse dependency order)
-- ===========================================================================

DROP TABLE IF EXISTS salon_settlements CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS booking_items CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS consumer_favorites CASCADE;
DROP TABLE IF EXISTS consumer_addresses CASCADE;
DROP TABLE IF EXISTS consumers CASCADE;
DROP TABLE IF EXISTS marketplace_services CASCADE;

-- platform_settings may pre-date 041 on some targets (prod has an existing
-- key-value store for trial / general / email / payment / plans). Instead of
-- dropping the table (which would destroy unrelated data), we only roll back
-- what 041 added: the marketplace_women_enabled row and the two extra columns.
DELETE FROM platform_settings WHERE key = 'marketplace_women_enabled';
ALTER TABLE platform_settings DROP COLUMN IF EXISTS updated_by;
ALTER TABLE platform_settings DROP COLUMN IF EXISTS description;

-- ===========================================================================
-- 5. Enum types (after tables that reference them are gone)
-- Note: salon_gender_type is dropped in section 6, AFTER the branches.gender_type
-- column that depends on it.
-- ===========================================================================

DROP TYPE IF EXISTS review_direction;
DROP TYPE IF EXISTS booking_location_type;
DROP TYPE IF EXISTS booking_status;

-- ===========================================================================
-- 6. Revert ALTER TABLE extensions on existing tables
-- ===========================================================================
-- services
ALTER TABLE services DROP COLUMN IF EXISTS available_at_home;

-- salons
ALTER TABLE salons DROP COLUMN IF EXISTS marketplace_block_threshold;
ALTER TABLE salons DROP COLUMN IF EXISTS marketplace_admin_blocked_at;
ALTER TABLE salons DROP COLUMN IF EXISTS marketplace_payable_blocked_at;
ALTER TABLE salons DROP COLUMN IF EXISTS marketplace_unsettled_payable;

-- branches — indexes first (column-dependent), then columns
DROP INDEX IF EXISTS idx_branches_gender;
DROP INDEX IF EXISTS idx_branches_geo;
DROP INDEX IF EXISTS idx_branches_city;
DROP INDEX IF EXISTS idx_branches_home;
DROP INDEX IF EXISTS idx_branches_marketplace;
DROP INDEX IF EXISTS idx_branches_slug_unique;

ALTER TABLE branches DROP COLUMN IF EXISTS gender_type;
ALTER TABLE branches DROP COLUMN IF EXISTS city_id;
ALTER TABLE branches DROP COLUMN IF EXISTS rating_count;
ALTER TABLE branches DROP COLUMN IF EXISTS rating_avg;
ALTER TABLE branches DROP COLUMN IF EXISTS home_service_radius_km;
ALTER TABLE branches DROP COLUMN IF EXISTS offers_home_service;
ALTER TABLE branches DROP COLUMN IF EXISTS listed_on_marketplace;
ALTER TABLE branches DROP COLUMN IF EXISTS about;
ALTER TABLE branches DROP COLUMN IF EXISTS photos;
ALTER TABLE branches DROP COLUMN IF EXISTS slug;
ALTER TABLE branches DROP COLUMN IF EXISTS lng;
ALTER TABLE branches DROP COLUMN IF EXISTS lat;

-- salon_gender_type is safe to drop now that branches.gender_type is gone.
DROP TYPE IF EXISTS salon_gender_type;

-- ===========================================================================
-- 7. Cities reference table
-- ===========================================================================

DROP INDEX IF EXISTS idx_cities_active;
DROP TABLE IF EXISTS cities CASCADE;

COMMIT;
