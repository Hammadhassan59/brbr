-- ═══════════════════════════════════════════════════════════════════
-- 029: Storage paths for private buckets
-- ═══════════════════════════════════════════════════════════════════
--
-- Migration 030 flips `payment-screenshots` and `lead-photos` from
-- public-read to private. Public URLs minted under the old regime 404
-- the moment the bucket goes private, and signed URLs only live ~15
-- minutes — so storing a signed URL at write time is useless for rows
-- that are viewed hours/days later.
--
-- Solution: store the *storage path* (e.g. `<salonId>/<uuid>.jpg`) and
-- mint a fresh signed URL at render time via getSignedStorageUrl().
--
-- Strategy:
--   1. Add nullable `screenshot_path` / `photo_path` columns.
--   2. New inserts populate the new column; the legacy `*_url` columns
--      are kept (empty string) so read code can fall back to old rows.
--   3. Backfill for old rows is optional and lives in a separate
--      template file — run manually after verifying the URL format.
--
-- No backfill here: old rows keep their `screenshot_url` / `photo_url`
-- and the server-side getPaymentScreenshotUrl / getLeadPhotoUrl helpers
-- return that value as-is when the _path column is null.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE payment_requests
  ADD COLUMN IF NOT EXISTS screenshot_path TEXT;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS photo_path TEXT;

COMMENT ON COLUMN payment_requests.screenshot_path IS
  'Storage object path in the payment-screenshots bucket (private). '
  'Source of truth for new rows. Legacy rows have screenshot_url set '
  'and screenshot_path null; read code falls back to screenshot_url.';

COMMENT ON COLUMN leads.photo_path IS
  'Storage object path in the lead-photos bucket (private). Source of '
  'truth for new rows. Legacy rows have photo_url set and photo_path '
  'null; read code falls back to photo_url.';
