-- 015_payment_requests.sql
-- Subscription payment requests. Salon owner submits when paying via bank/JazzCash;
-- superadmin reviews, approves, and that activates the salon's plan.

CREATE TABLE IF NOT EXISTS payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('basic','growth','pro')),
  amount integer NOT NULL CHECK (amount >= 0),
  reference text,                          -- transaction ID / sender name
  method text,                             -- 'bank' | 'jazzcash' | null (unknown)
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  duration_days integer NOT NULL DEFAULT 30,
  reviewed_by uuid,                        -- auth.users id of admin (no FK — auth schema)
  reviewed_at timestamptz,
  reviewer_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_requests_status_idx
  ON payment_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS payment_requests_salon_idx
  ON payment_requests(salon_id, created_at DESC);

-- RLS: enabled, but all reads/writes go through server actions (service_role).
-- Keep authenticated/anon locked out so a malicious client can't tamper with status.
ALTER TABLE payment_requests ENABLE ROW LEVEL SECURITY;
