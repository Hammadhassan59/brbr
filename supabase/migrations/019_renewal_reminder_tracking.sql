-- Track which renewal reminder stages we've already sent per salon so the
-- daily cron is idempotent and doesn't spam owners. Stages: 't7', 't3', 't0'.
-- Stored as the ISO date (UTC) of the subscription_expires_at the reminder
-- was sent for — so if the owner renews and a new expiry is set, tracking
-- resets automatically for the next cycle.
ALTER TABLE salons
  ADD COLUMN IF NOT EXISTS renewal_reminder_sent_t7 date,
  ADD COLUMN IF NOT EXISTS renewal_reminder_sent_t3 date,
  ADD COLUMN IF NOT EXISTS renewal_reminder_sent_t0 date;

COMMENT ON COLUMN salons.renewal_reminder_sent_t7 IS 'Date of subscription_expires_at when the T-7 reminder was last sent';
COMMENT ON COLUMN salons.renewal_reminder_sent_t3 IS 'Date of subscription_expires_at when the T-3 reminder was last sent';
COMMENT ON COLUMN salons.renewal_reminder_sent_t0 IS 'Date of subscription_expires_at when the T-0 (expired) reminder was last sent';
