-- =============================================================================
-- 044_salons_last_active_at.sql
--
-- Adds `salons.last_active_at timestamptz` — the heartbeat-updated timestamp
-- used to gate marketplace visibility. Salons are only shown in the consumer
-- directory when `last_active_at > now() - INTERVAL '3 minutes'`. A dashboard
-- client effect pings a heartbeat server action every 60s while any owner /
-- manager is logged in; 3-minute window gives two missed pings of slack.
--
-- Log-out clears the field. Consumers browsing see the Foodpanda-restaurant
-- model: only salons currently ready to accept real-time requests.
--
-- Date:          2026-04-18
-- Dependencies:  041_marketplace_groundwork.sql
-- =============================================================================

BEGIN;

ALTER TABLE salons
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_salons_last_active
  ON salons (last_active_at DESC NULLS LAST)
  WHERE last_active_at IS NOT NULL;

COMMIT;
