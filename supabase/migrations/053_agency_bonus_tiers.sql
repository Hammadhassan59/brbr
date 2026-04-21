-- 053_agency_bonus_tiers.sql
-- Bonus system for top-performing agencies. Parallel to bonus_tiers for
-- agents (migration 047) — same metric + period enums, same idempotency
-- pattern. Accrues bonus rows into agency_commissions with kind='bonus'.

CREATE TABLE IF NOT EXISTS agency_bonus_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = global default (applies to every active agency)
  agency_id uuid REFERENCES agencies(id) ON DELETE CASCADE,
  metric bonus_metric NOT NULL,
  period bonus_period NOT NULL,
  threshold numeric(12,2) NOT NULL CHECK (threshold > 0),
  bonus_amount numeric(12,2) NOT NULL CHECK (bonus_amount >= 0),
  label text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX IF NOT EXISTS agency_bonus_tiers_agency_active_idx
  ON agency_bonus_tiers(agency_id, active);
CREATE INDEX IF NOT EXISTS agency_bonus_tiers_metric_period_idx
  ON agency_bonus_tiers(metric, period) WHERE active;
ALTER TABLE agency_bonus_tiers ENABLE ROW LEVEL SECURITY;

-- Idempotency columns on agency_commissions. A bonus accrual is keyed on
-- (agency_id, tier_id, period_start) so re-running the evaluator doesn't
-- double-pay.
ALTER TABLE agency_commissions
  ADD COLUMN IF NOT EXISTS bonus_tier_id uuid REFERENCES agency_bonus_tiers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bonus_period_start date;

CREATE UNIQUE INDEX IF NOT EXISTS agency_commissions_bonus_idempotency_idx
  ON agency_commissions(agency_id, bonus_tier_id, bonus_period_start)
  WHERE kind = 'bonus' AND bonus_tier_id IS NOT NULL AND bonus_period_start IS NOT NULL;
