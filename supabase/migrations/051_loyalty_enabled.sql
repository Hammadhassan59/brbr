-- 051_loyalty_enabled.sql
-- Lets each branch opt out of the loyalty-points system without having to
-- zero the earn/redeem rates. When `enabled=false`, the POS hides the
-- points UI, bills don't award or redeem points, and no new liability
-- accrues. Existing clients keep any points they already earned — those
-- are frozen until the branch re-enables loyalty.

ALTER TABLE loyalty_rules
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;
