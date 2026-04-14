-- 013_remove_trial_add_paywall.sql
-- Remove free trial, add strict paywall. Plans: none/basic/growth/pro. Statuses: pending/active/expired/suspended.

-- Drop existing CHECK constraints and re-add with new values
ALTER TABLE salons DROP CONSTRAINT IF EXISTS salons_subscription_plan_check;
ALTER TABLE salons DROP CONSTRAINT IF EXISTS salons_subscription_status_check;

ALTER TABLE salons ADD CONSTRAINT salons_subscription_plan_check
  CHECK (subscription_plan IN ('none','basic','growth','pro'));

ALTER TABLE salons ADD CONSTRAINT salons_subscription_status_check
  CHECK (subscription_status IN ('pending','active','expired','suspended'));

-- Convert existing 'trial' plan → 'none', 'trial' status → 'pending'
UPDATE salons SET subscription_plan = 'none' WHERE subscription_plan = 'trial';
UPDATE salons SET subscription_status = 'pending' WHERE subscription_status = 'trial';

-- New salons default to no plan, pending status
ALTER TABLE salons ALTER COLUMN subscription_plan SET DEFAULT 'none';
ALTER TABLE salons ALTER COLUMN subscription_status SET DEFAULT 'pending';
