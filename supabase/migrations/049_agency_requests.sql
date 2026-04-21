-- 049_agency_requests.sql
-- Adds NIC + address columns on agencies and introduces a public-facing
-- agency-signup request pipeline: interested agencies fill a form at
-- icut.pk/agency-signup → row lands in agency_requests with status='pending'
-- → super_admin reviews at /admin/agencies/requests and either approves
-- (spawns a real agencies row via existing createAgency flow + sends the
-- welcome email) or rejects.

-- ─── 1. Agency profile columns ───
ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS nic_number text,
  ADD COLUMN IF NOT EXISTS address text;

-- ─── 2. Request-status enum ───
DO $$ BEGIN
  CREATE TYPE agency_request_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 3. agency_requests table ───
-- Captures all fields we need to spawn an `agencies` row on approval plus
-- audit columns (who reviewed, when, with what notes). No FK to agencies
-- until approval; `created_agency_id` fills in then.
CREATE TABLE IF NOT EXISTS agency_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_name text NOT NULL,
  phone text NOT NULL,
  email text NOT NULL,
  nic_number text,
  city text,
  address text,
  notes text,                                   -- free-form applicant message
  status agency_request_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid,                             -- auth.users.id of super_admin
  reviewed_at timestamptz,
  review_notes text,                            -- super_admin's notes on approve/reject
  created_agency_id uuid REFERENCES agencies(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agency_requests_status_idx
  ON agency_requests(status, created_at DESC);
ALTER TABLE agency_requests ENABLE ROW LEVEL SECURITY;

-- auto-update updated_at
CREATE OR REPLACE FUNCTION agency_requests_set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;
DROP TRIGGER IF EXISTS agency_requests_updated_at ON agency_requests;
CREATE TRIGGER agency_requests_updated_at
  BEFORE UPDATE ON agency_requests
  FOR EACH ROW EXECUTE FUNCTION agency_requests_set_updated_at();

-- Public form posts via a service-role server action (no session required);
-- authenticated/anon reads denied. Service-role bypasses RLS so nothing else
-- is needed for the happy path.
