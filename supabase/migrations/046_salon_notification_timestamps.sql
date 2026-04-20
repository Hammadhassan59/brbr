-- =============================================================================
-- 046_salon_notification_timestamps.sql
--
-- Adds two per-salon "last alert sent" date columns used by the daily
-- low-stock and weekly udhaar email crons to stay idempotent:
--
--   - salons.last_low_stock_alert_at   (date) — prevents the daily
--     /api/cron/low-stock-alerts route from double-firing on the same
--     tenant within a calendar day.
--
--   - salons.last_udhaar_reminder_at   (date) — the weekly udhaar summary
--     cron uses this to avoid re-sending within 6 days when the cron
--     timer slips by a few hours.
--
-- Both are plain DATE columns (no default) so a salon that has never
-- received an alert is NULL and the cron fires on the first opportunity.
--
-- Date:          2026-04-20
-- Dependencies:  none (pure schema additions)
-- =============================================================================

BEGIN;

ALTER TABLE salons ADD COLUMN IF NOT EXISTS last_low_stock_alert_at date;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS last_udhaar_reminder_at date;

COMMIT;
