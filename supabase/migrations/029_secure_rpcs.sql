-- 029_secure_rpcs.sql
--
-- Closes a cross-tenant RPC data leak. Four SECURITY DEFINER RPCs defined in
-- migration 001 (get_daily_summary, get_staff_monthly_commission,
-- get_udhaar_report, get_client_stats) were callable by anon and authenticated
-- roles and accepted unchecked IDs. Any authenticated tenant could pass a
-- branch/staff/client/salon UUID from a different tenant and read their data.
--
-- Fix, layered:
--   1. Harden every RPC body to (a) require p_salon_id and (b) assert
--      ownership of the referenced entity via the parent table. Raises
--      'unauthorized' (SQLSTATE 42501) on mismatch.
--   2. REVOKE EXECUTE on all four from anon + authenticated, GRANT only to
--      service_role. The anon Supabase client is no longer allowed to invoke
--      them directly from the browser. Server actions (which use the
--      service-role key) call them instead, passing session.salonId from the
--      iCut JWT that the server mints and verifies.
--   3. Extend defense-in-depth by adding the missing admin_impersonation_sessions
--      and admin_audit_log tables, both RLS-enabled with no anon/authenticated
--      policies (service-role-only).
--
-- We keep SECURITY DEFINER on the functions because:
--   - The iCut custom JWT is minted by the app (signed with SESSION_SECRET), not
--     by Supabase, so auth.jwt() in Postgres does NOT contain salon_id.
--   - Server actions call these with the service-role key, which bypasses RLS
--     but still needs the function-level ownership check as a second line.
--   - If the service-role call site is ever compromised or misused, the
--     ownership check inside the function blocks cross-tenant reads.

-- ─── 1. Hardened RPC replacements ───

-- 1a. get_daily_summary(branch_id, date, salon_id)
-- Breaking change: now requires p_salon_id. Caller (server action) passes
-- session.salonId. Raises 'unauthorized' if the branch doesn't belong to salon.
CREATE OR REPLACE FUNCTION get_daily_summary(
  p_branch_id uuid,
  p_date date,
  p_salon_id uuid
)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
BEGIN
  IF p_salon_id IS NULL THEN
    RAISE EXCEPTION 'salon_id is required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM branches
    WHERE id = p_branch_id AND salon_id = p_salon_id
  ) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'total_revenue', COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid'), 0),
    'total_bills', COUNT(*) FILTER (WHERE status = 'paid'),
    'cash_amount', COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid' AND payment_method = 'cash'), 0),
    'jazzcash_amount', COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid' AND payment_method = 'jazzcash'), 0),
    'easypaisa_amount', COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid' AND payment_method = 'easypaisa'), 0),
    'card_amount', COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid' AND payment_method = 'card'), 0),
    'bank_transfer_amount', COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid' AND payment_method = 'bank_transfer'), 0),
    'udhaar_amount', COALESCE(SUM(udhaar_added) FILTER (WHERE status = 'paid'), 0)
  ) INTO result
  FROM bills
  WHERE branch_id = p_branch_id
    AND (created_at AT TIME ZONE 'Asia/Karachi')::date = p_date;

  result := result || jsonb_build_object('top_services', (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT bi.name, COUNT(*) as count, SUM(bi.total_price) as revenue
      FROM bill_items bi
      JOIN bills b ON b.id = bi.bill_id
      WHERE b.branch_id = p_branch_id
        AND (b.created_at AT TIME ZONE 'Asia/Karachi')::date = p_date
        AND b.status = 'paid'
        AND bi.item_type = 'service'
      GROUP BY bi.name
      ORDER BY revenue DESC
      LIMIT 5
    ) t
  ));

  result := result || jsonb_build_object('staff_performance', (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT s.name, COUNT(b.id) as services_done, SUM(b.total_amount) as revenue
      FROM bills b
      JOIN staff s ON s.id = b.staff_id
      WHERE b.branch_id = p_branch_id
        AND (b.created_at AT TIME ZONE 'Asia/Karachi')::date = p_date
        AND b.status = 'paid'
      GROUP BY s.id, s.name
      ORDER BY revenue DESC
    ) t
  ));

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1b. get_staff_monthly_commission(staff_id, month, year, salon_id)
-- Breaking change: now requires p_salon_id. Raises 'unauthorized' if the
-- staff record doesn't belong to the caller's salon.
CREATE OR REPLACE FUNCTION get_staff_monthly_commission(
  p_staff_id uuid,
  p_month int,
  p_year int,
  p_salon_id uuid
)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
  v_staff staff%ROWTYPE;
BEGIN
  IF p_salon_id IS NULL THEN
    RAISE EXCEPTION 'salon_id is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_staff FROM staff
  WHERE id = p_staff_id AND salon_id = p_salon_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'services_count', COUNT(b.id),
    'total_revenue', COALESCE(SUM(b.total_amount), 0),
    'commission_earned', CASE
      WHEN v_staff.commission_type = 'percentage'
        THEN COALESCE(SUM(b.total_amount) * v_staff.commission_rate / 100, 0)
      ELSE COALESCE(COUNT(b.id) * v_staff.commission_rate, 0)
    END,
    'tips_total', COALESCE((
      SELECT SUM(amount) FROM tips
      WHERE staff_id = p_staff_id
        AND EXTRACT(MONTH FROM date) = p_month
        AND EXTRACT(YEAR FROM date) = p_year
    ), 0),
    'advances_total', COALESCE((
      SELECT SUM(amount) FROM advances
      WHERE staff_id = p_staff_id
        AND EXTRACT(MONTH FROM date) = p_month
        AND EXTRACT(YEAR FROM date) = p_year
        AND is_deducted = false
    ), 0),
    'late_deductions', COALESCE((
      SELECT SUM(deduction_amount) FROM attendance
      WHERE staff_id = p_staff_id
        AND EXTRACT(MONTH FROM date) = p_month
        AND EXTRACT(YEAR FROM date) = p_year
    ), 0)
  ) INTO result
  FROM bills b
  WHERE b.staff_id = p_staff_id
    AND b.status = 'paid'
    AND EXTRACT(MONTH FROM b.created_at) = p_month
    AND EXTRACT(YEAR FROM b.created_at) = p_year;

  result := result || jsonb_build_object(
    'net_payable',
    v_staff.base_salary
    + (result->>'commission_earned')::numeric
    + (result->>'tips_total')::numeric
    - (result->>'advances_total')::numeric
    - (result->>'late_deductions')::numeric
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1c. get_udhaar_report(salon_id) — body unchanged (already scopes by salon_id),
-- but we re-declare to set search_path and ensure a consistent definition under
-- the revoke-then-grant step below. No ownership check needed because the salon
-- id IS the ownership check.
CREATE OR REPLACE FUNCTION get_udhaar_report(p_salon_id uuid)
RETURNS jsonb AS $$
BEGIN
  IF p_salon_id IS NULL THEN
    RAISE EXCEPTION 'salon_id is required' USING ERRCODE = '22023';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT
        c.id,
        c.name as client_name,
        c.phone,
        c.udhaar_balance,
        (SELECT MAX(a.appointment_date) FROM appointments a WHERE a.client_id = c.id) as last_visit,
        CURRENT_DATE - (SELECT MAX(a.appointment_date) FROM appointments a WHERE a.client_id = c.id) as days_since_visit
      FROM clients c
      WHERE c.salon_id = p_salon_id
        AND c.udhaar_balance > 0
      ORDER BY c.udhaar_balance DESC
    ) t
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1d. get_client_stats(client_id, salon_id)
-- Breaking change: now requires p_salon_id. Raises 'unauthorized' if the
-- client record doesn't belong to the caller's salon.
CREATE OR REPLACE FUNCTION get_client_stats(
  p_client_id uuid,
  p_salon_id uuid
)
RETURNS jsonb AS $$
BEGIN
  IF p_salon_id IS NULL THEN
    RAISE EXCEPTION 'salon_id is required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM clients
    WHERE id = p_client_id AND salon_id = p_salon_id
  ) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'total_visits', c.total_visits,
      'total_spent', c.total_spent,
      'loyalty_points', c.loyalty_points,
      'favourite_service', (
        SELECT bi.name
        FROM bill_items bi
        JOIN bills b ON b.id = bi.bill_id
        WHERE b.client_id = p_client_id AND bi.item_type = 'service'
        GROUP BY bi.name
        ORDER BY COUNT(*) DESC
        LIMIT 1
      ),
      'favourite_stylist', (
        SELECT s.name
        FROM bills b
        JOIN staff s ON s.id = b.staff_id
        WHERE b.client_id = p_client_id AND b.status = 'paid'
        GROUP BY s.id, s.name
        ORDER BY COUNT(*) DESC
        LIMIT 1
      ),
      'last_visit_date', (
        SELECT MAX(appointment_date)
        FROM appointments
        WHERE client_id = p_client_id
      )
    )
    FROM clients c
    WHERE c.id = p_client_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─── 2. Drop old signatures and lock down execute privileges ───
-- CREATE OR REPLACE above only replaces same-signature overloads. The original
-- get_daily_summary(uuid, date) / get_staff_monthly_commission(uuid, int, int)
-- / get_client_stats(uuid) still exist. Drop them so the only callable
-- signatures are the hardened four-arg / two-arg variants.
DROP FUNCTION IF EXISTS get_daily_summary(uuid, date);
DROP FUNCTION IF EXISTS get_staff_monthly_commission(uuid, int, int);
DROP FUNCTION IF EXISTS get_client_stats(uuid);

-- Revoke the default PUBLIC execute grant and the anon/authenticated grants
-- that Supabase auto-applies to SECURITY DEFINER functions in the public schema.
REVOKE ALL ON FUNCTION get_daily_summary(uuid, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_daily_summary(uuid, date, uuid) FROM anon;
REVOKE ALL ON FUNCTION get_daily_summary(uuid, date, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION get_daily_summary(uuid, date, uuid) TO service_role;

REVOKE ALL ON FUNCTION get_staff_monthly_commission(uuid, int, int, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_staff_monthly_commission(uuid, int, int, uuid) FROM anon;
REVOKE ALL ON FUNCTION get_staff_monthly_commission(uuid, int, int, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION get_staff_monthly_commission(uuid, int, int, uuid) TO service_role;

REVOKE ALL ON FUNCTION get_udhaar_report(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_udhaar_report(uuid) FROM anon;
REVOKE ALL ON FUNCTION get_udhaar_report(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION get_udhaar_report(uuid) TO service_role;

REVOKE ALL ON FUNCTION get_client_stats(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_client_stats(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION get_client_stats(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION get_client_stats(uuid, uuid) TO service_role;

-- ─── 3. admin_impersonation_sessions table ───
-- Tracks every super-admin → tenant impersonation window so audits can prove
-- exactly which admin accessed which salon and when. Append-only from the app
-- perspective (we close a row by setting ended_at).
CREATE TABLE IF NOT EXISTS admin_impersonation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_auth_user_id UUID NOT NULL,
  target_owner_auth_user_id UUID NOT NULL,
  target_salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  CONSTRAINT impersonation_distinct CHECK (admin_auth_user_id <> target_owner_auth_user_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_impersonation_admin
  ON admin_impersonation_sessions(admin_auth_user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_impersonation_target
  ON admin_impersonation_sessions(target_salon_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_impersonation_active
  ON admin_impersonation_sessions(admin_auth_user_id)
  WHERE ended_at IS NULL;

ALTER TABLE admin_impersonation_sessions ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies. service_role bypasses RLS and is the only
-- intended reader/writer. Leaving RLS on with zero policies fails closed.

-- ─── 4. admin_audit_log table ───
-- Captures every privileged admin action (impersonation start/end, user status
-- change, plan change, manual payment approval, etc.) with enough context to
-- reconstruct what happened and to which tenant.
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_auth_user_id UUID NOT NULL,
  action TEXT NOT NULL,
  target_table TEXT,
  target_id UUID,
  metadata JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  salon_id UUID REFERENCES salons(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_admin_time
  ON admin_audit_log(admin_auth_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_salon_time
  ON admin_audit_log(salon_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action_time
  ON admin_audit_log(action, occurred_at DESC);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
-- service_role-only, same as admin_impersonation_sessions.

-- ─── 5. Defense-in-depth RLS check ───
-- Migration 001 already enables RLS on every user-data table, and 024 dropped
-- every wide-open TO anon policy. The per-table salon-scoped policies keyed
-- off get_user_salon_id() stay in place. This block is a safety net: for any
-- public.* table that has a salon-facing role but somehow had RLS turned off
-- (e.g. future migrations landing without ENABLE), turn it back on. Server
-- actions bypass RLS via service_role so this never breaks legitimate flows.
DO $$
DECLARE
  tbl RECORD;
BEGIN
  FOR tbl IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = false
      AND c.relname NOT LIKE 'pg_%'
      AND c.relname NOT LIKE 'sql_%'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      tbl.schema_name, tbl.table_name);
  END LOOP;
END $$;
