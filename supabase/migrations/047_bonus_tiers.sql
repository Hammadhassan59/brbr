-- 047_bonus_tiers.sql
-- Sales-agent bonuses on top of first_sale/renewal commissions. Bonuses accrue
-- when an agent crosses a configured threshold on a chosen metric
-- (onboarded_count, revenue_generated) for a period (monthly, lifetime).
-- Bonuses ride the existing agent_commissions + agent_payouts rails so settled
-- bonuses land in the same payout the agent already requests.
--
-- Design:
--   * Extend commission_kind enum with 'bonus'.
--   * New bonus_tiers table stores thresholds. agent_id NULL = global default
--     applied to every active agent; agent_id non-null = override for that
--     specific agent (a per-agent tier-set replaces the globals for that agent
--     on the same (metric, period) pair).
--   * Idempotent accrual: the nightly evaluator inserts one row per
--     (agent_id, tier_id, period_start). The partial unique index below
--     enforces this so re-running the evaluator is safe.

-- ─── 1. Extend commission_kind with 'bonus' ───
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'bonus'
      AND enumtypid = 'commission_kind'::regtype
  ) THEN
    ALTER TYPE commission_kind ADD VALUE 'bonus';
  END IF;
END $$;

-- ─── 2. New enum types for the tier config ───
DO $$ BEGIN
  CREATE TYPE bonus_metric AS ENUM ('onboarded_count', 'revenue_generated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE bonus_period AS ENUM ('monthly', 'lifetime');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 3. bonus_tiers config table ───
CREATE TABLE IF NOT EXISTS bonus_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES sales_agents(id) ON DELETE CASCADE,   -- NULL = global default
  metric bonus_metric NOT NULL,
  period bonus_period NOT NULL,
  threshold numeric(12,2) NOT NULL CHECK (threshold > 0),
  bonus_amount numeric(12,2) NOT NULL CHECK (bonus_amount >= 0),
  label text,                                                    -- human name e.g. "Silver tier"
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid                                                -- auth.users.id of superadmin
);
CREATE INDEX IF NOT EXISTS bonus_tiers_agent_active_idx ON bonus_tiers(agent_id, active);
CREATE INDEX IF NOT EXISTS bonus_tiers_metric_period_idx ON bonus_tiers(metric, period) WHERE active;
ALTER TABLE bonus_tiers ENABLE ROW LEVEL SECURITY;

-- No RLS policies: access is exclusively through server actions using
-- service-role. Defense in depth — enable but grant nothing to anon/authenticated.

-- ─── 4. Idempotency link from accrued bonus back to the source tier + period ───
ALTER TABLE agent_commissions
  ADD COLUMN IF NOT EXISTS bonus_tier_id uuid REFERENCES bonus_tiers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bonus_period_start date,
  ADD COLUMN IF NOT EXISTS notes text;

-- At most one bonus accrual per (agent, tier, period_start). Partial unique
-- index lets the evaluator re-run without producing duplicate bonus rows.
CREATE UNIQUE INDEX IF NOT EXISTS agent_commissions_bonus_idempotency_idx
  ON agent_commissions(agent_id, bonus_tier_id, bonus_period_start)
  WHERE kind = 'bonus' AND bonus_tier_id IS NOT NULL AND bonus_period_start IS NOT NULL;
