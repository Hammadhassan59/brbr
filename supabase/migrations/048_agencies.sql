-- 048_agencies.sql
-- Agency entity — a wholesale-style partner that owns a roster of sales agents
-- and is paid commission by the platform at agency-level rates. The agency is
-- responsible for paying its own sales agents internally; platform only sees
-- the agency as a counterparty.
--
-- Collateral model: each agency posts a refundable security deposit at
-- onboarding. When the agency's agents collect money FROM tenants, the agency
-- owes the platform (collected amount − agency commission). Unpaid liability
-- is capped by liability_threshold; exceeding it auto-freezes the agency's
-- ability to collect more. Termination deducts unpaid liability from deposit
-- and refunds the remainder.

-- ─── 1. Enum types ───
DO $$ BEGIN
  CREATE TYPE agency_status AS ENUM ('active', 'frozen', 'terminated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE deposit_event_kind AS ENUM ('collected', 'refunded', 'clawed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE remittance_method AS ENUM ('bank', 'jazzcash', 'cash');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Extend payment_source with 'agency_collected'. Separate from
-- agent_collected so super_admin can tell which funnel a payment came
-- through without a join.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'agency_collected'
      AND enumtypid = 'payment_source'::regtype
  ) THEN
    ALTER TYPE payment_source ADD VALUE 'agency_collected';
  END IF;
END $$;

-- ─── 2. generate_agency_code() — mirrors generate_agent_code() from 023 ───
CREATE OR REPLACE FUNCTION generate_agency_code() RETURNS text AS $$
DECLARE
  candidate text;
  attempts int := 0;
BEGIN
  LOOP
    candidate := 'AG' || lpad((floor(random() * 1000))::int::text, 3, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM agencies WHERE code = candidate);
    attempts := attempts + 1;
    IF attempts > 100 THEN
      RAISE EXCEPTION 'Could not generate unique agency code after 100 attempts';
    END IF;
  END LOOP;
  RETURN candidate;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ─── 3. agencies table ───
CREATE TABLE IF NOT EXISTS agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE,                                  -- AG000-AG999, generated
  name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  city text,
  first_sale_pct numeric(5,2) NOT NULL DEFAULT 15.00,
  renewal_pct numeric(5,2) NOT NULL DEFAULT 7.00,
  deposit_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (deposit_amount >= 0),
  liability_threshold numeric(12,2) NOT NULL DEFAULT 0 CHECK (liability_threshold >= 0),
  terms text,                                        -- super_admin-authored T&C
  status agency_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  CHECK (first_sale_pct >= 0 AND first_sale_pct <= 100),
  CHECK (renewal_pct >= 0 AND renewal_pct <= 100)
);
CREATE INDEX IF NOT EXISTS agencies_status_idx ON agencies(status);
CREATE INDEX IF NOT EXISTS agencies_code_idx ON agencies(code);
ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;

-- Backfill the generator as default after the table exists (can't self-ref before).
ALTER TABLE agencies ALTER COLUMN code SET DEFAULT generate_agency_code();

-- ─── 4. agency_admins — login accounts for agency personnel ───
CREATE TABLE IF NOT EXISTS agency_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL UNIQUE,                      -- auth.users.id
  name text NOT NULL,
  phone text,
  email text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz
);
CREATE INDEX IF NOT EXISTS agency_admins_agency_idx ON agency_admins(agency_id, active);
ALTER TABLE agency_admins ENABLE ROW LEVEL SECURITY;

-- ─── 5. sales_agents.agency_id ───
ALTER TABLE sales_agents
  ADD COLUMN IF NOT EXISTS agency_id uuid REFERENCES agencies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sales_agents_agency_idx ON sales_agents(agency_id);

-- ─── 6. payment_requests additions ───
ALTER TABLE payment_requests
  ADD COLUMN IF NOT EXISTS collected_by_agency_id uuid REFERENCES agencies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS remitted_at timestamptz;
CREATE INDEX IF NOT EXISTS payment_requests_agency_idx ON payment_requests(collected_by_agency_id);
CREATE INDEX IF NOT EXISTS payment_requests_unremitted_idx
  ON payment_requests(collected_by_agency_id)
  WHERE collected_by_agency_id IS NOT NULL AND remitted_at IS NULL AND status = 'approved';

-- ─── 7. agency_commissions — platform → agency accruals ───
-- Mirrors agent_commissions. Kept separate so agency financials stay
-- distinct from per-agent payouts, and so super_admin can pay agency
-- commission independently of any per-agent bookkeeping the agency itself
-- does internally.
CREATE TABLE IF NOT EXISTS agency_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
  salon_id uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  payment_request_id uuid NOT NULL REFERENCES payment_requests(id) ON DELETE CASCADE,
  kind commission_kind NOT NULL,                     -- first_sale | renewal | bonus
  base_amount numeric(12,2) NOT NULL CHECK (base_amount >= 0),
  pct numeric(5,2) NOT NULL CHECK (pct >= 0 AND pct <= 100),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  status commission_status NOT NULL DEFAULT 'approved',
  payout_id uuid,                                    -- FK added below
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);
CREATE INDEX IF NOT EXISTS agency_commissions_agency_status_idx
  ON agency_commissions(agency_id, status);
CREATE INDEX IF NOT EXISTS agency_commissions_payout_idx
  ON agency_commissions(payout_id);
CREATE INDEX IF NOT EXISTS agency_commissions_salon_idx
  ON agency_commissions(salon_id);
CREATE INDEX IF NOT EXISTS agency_commissions_payment_request_idx
  ON agency_commissions(payment_request_id);
ALTER TABLE agency_commissions ENABLE ROW LEVEL SECURITY;

-- ─── 8. agency_payouts — platform pays the agency ───
CREATE TABLE IF NOT EXISTS agency_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
  requested_amount numeric(12,2) NOT NULL CHECK (requested_amount >= 0),
  paid_amount numeric(12,2) CHECK (paid_amount IS NULL OR paid_amount >= 0),
  method remittance_method,
  reference text,
  notes text,
  status payout_status NOT NULL DEFAULT 'requested',
  requested_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  paid_by uuid
);
CREATE INDEX IF NOT EXISTS agency_payouts_agency_status_idx
  ON agency_payouts(agency_id, status);
ALTER TABLE agency_payouts ENABLE ROW LEVEL SECURITY;

ALTER TABLE agency_commissions
  DROP CONSTRAINT IF EXISTS agency_commissions_payout_id_fkey;
ALTER TABLE agency_commissions
  ADD CONSTRAINT agency_commissions_payout_id_fkey
  FOREIGN KEY (payout_id) REFERENCES agency_payouts(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS agency_payouts_one_open_per_agency_idx
  ON agency_payouts(agency_id)
  WHERE status = 'requested';

-- ─── 9. agency_deposit_ledger ───
-- Audit trail for the security deposit. Each row is an event:
--   collected: agency paid platform at onboarding (or top-up)
--   refunded:  platform returned cash to agency (voluntary or on termination)
--   clawed:    platform deducted unpaid liability from the deposit
-- Current deposit balance = SUM(collected) - SUM(refunded) - SUM(clawed).
CREATE TABLE IF NOT EXISTS agency_deposit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  kind deposit_event_kind NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  method remittance_method,
  reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid                                    -- auth.users.id of superadmin
);
CREATE INDEX IF NOT EXISTS agency_deposit_ledger_agency_idx
  ON agency_deposit_ledger(agency_id, created_at DESC);
ALTER TABLE agency_deposit_ledger ENABLE ROW LEVEL SECURITY;

-- ─── 10. agency_remittances — agency pays platform for money collected from tenants ───
CREATE TABLE IF NOT EXISTS agency_remittances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  method remittance_method NOT NULL,
  reference text,
  notes text,
  received_at timestamptz NOT NULL DEFAULT now(),
  received_by uuid                                   -- auth.users.id of superadmin
);
CREATE INDEX IF NOT EXISTS agency_remittances_agency_idx
  ON agency_remittances(agency_id, received_at DESC);
ALTER TABLE agency_remittances ENABLE ROW LEVEL SECURITY;

-- M2M: a remittance clears N payment_requests. Inserting into this table is
-- what flips payment_requests.remitted_at (handled by trigger below).
CREATE TABLE IF NOT EXISTS agency_remittance_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  remittance_id uuid NOT NULL REFERENCES agency_remittances(id) ON DELETE CASCADE,
  payment_request_id uuid NOT NULL REFERENCES payment_requests(id) ON DELETE RESTRICT,
  UNIQUE (payment_request_id)                        -- a payment can only be remitted once
);
CREATE INDEX IF NOT EXISTS agency_remittance_items_remittance_idx
  ON agency_remittance_items(remittance_id);
ALTER TABLE agency_remittance_items ENABLE ROW LEVEL SECURITY;

-- Trigger: stamp payment_requests.remitted_at when a remittance item is
-- inserted, and clear it on delete (reversal).
CREATE OR REPLACE FUNCTION agency_remittance_item_sync() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE payment_requests
      SET remitted_at = (SELECT received_at FROM agency_remittances WHERE id = NEW.remittance_id)
      WHERE id = NEW.payment_request_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE payment_requests
      SET remitted_at = NULL
      WHERE id = OLD.payment_request_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS agency_remittance_item_sync ON agency_remittance_items;
CREATE TRIGGER agency_remittance_item_sync
  AFTER INSERT OR DELETE ON agency_remittance_items
  FOR EACH ROW EXECUTE FUNCTION agency_remittance_item_sync();

-- ─── 11. RLS policies: agency admins see only their own agency's data ───
-- Agency admin session is identified by auth.uid() matching a row in
-- agency_admins. Policies scope agency-owned tables to that agency.

DO $$ BEGIN
  CREATE POLICY "Agency admins view own agency" ON agencies
    FOR SELECT TO authenticated
    USING (id IN (SELECT agency_id FROM agency_admins WHERE user_id = auth.uid() AND active));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Agency admins view own admin row" ON agency_admins
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Agency admins view own agents" ON sales_agents
    FOR SELECT TO authenticated
    USING (agency_id IN (SELECT agency_id FROM agency_admins WHERE user_id = auth.uid() AND active));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Agency admins view own commissions" ON agency_commissions
    FOR SELECT TO authenticated
    USING (agency_id IN (SELECT agency_id FROM agency_admins WHERE user_id = auth.uid() AND active));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Agency admins view own payouts" ON agency_payouts
    FOR SELECT TO authenticated
    USING (agency_id IN (SELECT agency_id FROM agency_admins WHERE user_id = auth.uid() AND active));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Agency admins view own deposit ledger" ON agency_deposit_ledger
    FOR SELECT TO authenticated
    USING (agency_id IN (SELECT agency_id FROM agency_admins WHERE user_id = auth.uid() AND active));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Agency admins view own remittances" ON agency_remittances
    FOR SELECT TO authenticated
    USING (agency_id IN (SELECT agency_id FROM agency_admins WHERE user_id = auth.uid() AND active));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Agency admins view own remittance items" ON agency_remittance_items
    FOR SELECT TO authenticated
    USING (
      remittance_id IN (
        SELECT id FROM agency_remittances
        WHERE agency_id IN (SELECT agency_id FROM agency_admins WHERE user_id = auth.uid() AND active)
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Agency admins also read leads assigned to their agency's agents
DO $$ BEGIN
  CREATE POLICY "Agency admins view agency leads" ON leads
    FOR SELECT TO authenticated
    USING (
      assigned_agent_id IN (
        SELECT id FROM sales_agents
        WHERE agency_id IN (SELECT agency_id FROM agency_admins WHERE user_id = auth.uid() AND active)
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
