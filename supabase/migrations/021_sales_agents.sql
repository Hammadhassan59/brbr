-- 021_sales_agents.sql
-- Sales agent role: field-sales reps who convert assigned leads into paying salons
-- and earn first-sale + recurring-renewal commissions.

-- =========================================================================
-- ENUMS
-- =========================================================================
DO $$ BEGIN
  CREATE TYPE lead_status AS ENUM
    ('new','contacted','visited','interested','not_interested','converted','lost');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE commission_kind AS ENUM ('first_sale','renewal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE commission_status AS ENUM ('pending','approved','paid','reversed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payout_status AS ENUM ('requested','paid','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payout_method AS ENUM ('bank','jazzcash','cash');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_source AS ENUM ('salon_self','agent_collected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================================
-- SALES_AGENTS
-- =========================================================================
CREATE TABLE IF NOT EXISTS sales_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,           -- auth.users.id, no FK (auth schema)
  name text NOT NULL,
  phone text,
  city text,
  active boolean NOT NULL DEFAULT true,
  first_sale_pct numeric(5,2) NOT NULL DEFAULT 10.00,
  renewal_pct numeric(5,2) NOT NULL DEFAULT 5.00,
  created_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  CHECK (first_sale_pct >= 0 AND first_sale_pct <= 100),
  CHECK (renewal_pct >= 0 AND renewal_pct <= 100)
);
CREATE INDEX IF NOT EXISTS sales_agents_active_idx ON sales_agents(active);
ALTER TABLE sales_agents ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- LEADS
-- =========================================================================
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_name text NOT NULL,
  owner_name text,
  phone text,
  city text,
  notes text,
  status lead_status NOT NULL DEFAULT 'new',
  assigned_agent_id uuid NOT NULL REFERENCES sales_agents(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL,               -- auth.users.id of superadmin
  converted_salon_id uuid REFERENCES salons(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leads_agent_status_idx ON leads(assigned_agent_id, status);
CREATE INDEX IF NOT EXISTS leads_status_idx ON leads(status);
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- auto-update updated_at
CREATE OR REPLACE FUNCTION leads_set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS leads_updated_at ON leads;
CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION leads_set_updated_at();

-- =========================================================================
-- SALONS additions
-- =========================================================================
ALTER TABLE salons
  ADD COLUMN IF NOT EXISTS sold_by_agent_id uuid REFERENCES sales_agents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS salons_sold_by_agent_idx ON salons(sold_by_agent_id);

-- =========================================================================
-- PAYMENT_REQUESTS additions
-- =========================================================================
ALTER TABLE payment_requests
  ADD COLUMN IF NOT EXISTS source payment_source NOT NULL DEFAULT 'salon_self';

-- =========================================================================
-- AGENT_COMMISSIONS  (one row per accrual event)
-- =========================================================================
CREATE TABLE IF NOT EXISTS agent_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES sales_agents(id) ON DELETE RESTRICT,
  salon_id uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  payment_request_id uuid NOT NULL REFERENCES payment_requests(id) ON DELETE CASCADE,
  kind commission_kind NOT NULL,
  base_amount numeric(12,2) NOT NULL CHECK (base_amount >= 0),
  pct numeric(5,2) NOT NULL CHECK (pct >= 0 AND pct <= 100),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  status commission_status NOT NULL DEFAULT 'approved',
  payout_id uuid,                         -- FK added below after agent_payouts exists
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);
CREATE INDEX IF NOT EXISTS agent_commissions_agent_status_idx
  ON agent_commissions(agent_id, status);
CREATE INDEX IF NOT EXISTS agent_commissions_payout_idx
  ON agent_commissions(payout_id);
CREATE INDEX IF NOT EXISTS agent_commissions_salon_idx
  ON agent_commissions(salon_id);
CREATE INDEX IF NOT EXISTS agent_commissions_payment_request_idx
  ON agent_commissions(payment_request_id);
ALTER TABLE agent_commissions ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- AGENT_PAYOUTS
-- =========================================================================
CREATE TABLE IF NOT EXISTS agent_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES sales_agents(id) ON DELETE RESTRICT,
  requested_amount numeric(12,2) NOT NULL CHECK (requested_amount >= 0),
  paid_amount numeric(12,2) CHECK (paid_amount IS NULL OR paid_amount >= 0),
  method payout_method,
  reference text,
  notes text,
  status payout_status NOT NULL DEFAULT 'requested',
  requested_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  paid_by uuid                            -- auth.users.id of superadmin
);
CREATE INDEX IF NOT EXISTS agent_payouts_agent_status_idx
  ON agent_payouts(agent_id, status);
ALTER TABLE agent_payouts ENABLE ROW LEVEL SECURITY;

-- Now add the deferred FK from agent_commissions.payout_id → agent_payouts(id)
ALTER TABLE agent_commissions
  DROP CONSTRAINT IF EXISTS agent_commissions_payout_id_fkey;
ALTER TABLE agent_commissions
  ADD CONSTRAINT agent_commissions_payout_id_fkey
  FOREIGN KEY (payout_id) REFERENCES agent_payouts(id) ON DELETE SET NULL;

-- =========================================================================
-- Enforce at most ONE open (requested, unpaid) payout per agent.
-- =========================================================================
CREATE UNIQUE INDEX IF NOT EXISTS agent_payouts_one_open_per_agent_idx
  ON agent_payouts(agent_id)
  WHERE status = 'requested';
