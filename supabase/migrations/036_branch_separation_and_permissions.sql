-- =============================================================================
-- 036_branch_separation_and_permissions.sql
--
-- Per-branch data separation + role-based permissions system.
--
-- Date:          2026-04-17
-- Dependencies:  035_branch_products.sql
-- Rollback path: 037_rollback_036.sql
--
-- What this migration does:
--   1. Adds `branch_id` to 6 salon-scoped tables (clients, services, packages,
--      promo_codes, suppliers, backbar_actuals), backfills from each salon's
--      main branch, then enforces NOT NULL.
--   2. Fixes the long-standing `expenses.salon_id` bug (reports/daily/page.tsx
--      filters on salon_id but the column never existed). Backfills via
--      branches.salon_id.
--   3. Swaps backbar_actuals uniqueness from salon-scoped to branch-scoped.
--   4. Creates `staff_branches` join table so a single staff row can be
--      assigned to multiple branches. Renames `staff.branch_id` -->
--      `staff.primary_branch_id` to signal its new semantics.
--   5. Creates `role_presets` + trigger to seed platform defaults into every
--      new salon, plus `staff.permissions_override` for per-user custom perms.
--
-- Risk notes:
--   - The preflight DO blocks will abort the whole migration if ANY of the 6
--     tables have NULL salon_id rows or if any salon has zero branches. Fix
--     data first, don't bypass the guards.
--   - This migration is wrapped in a single transaction. A failure rolls
--     everything back cleanly.
--   - Application code MUST be ready for branch_id scoping on reads/writes
--     before this ships. Writing without a branch_id after 036 will raise a
--     NOT NULL violation.
-- =============================================================================

BEGIN;

-- 1. Preflight guards --------------------------------------------------------

DO $$
DECLARE
  v_table text;
  v_null_count bigint;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['clients','services','packages','promo_codes','suppliers','backbar_actuals']
  LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE salon_id IS NULL', v_table) INTO v_null_count;
    IF v_null_count > 0 THEN
      RAISE EXCEPTION 'Abort: found NULL salon_id in %, fix data before running 036', v_table;
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  v_salons_without_branches bigint;
BEGIN
  SELECT count(*) INTO v_salons_without_branches
  FROM salons s
  WHERE NOT EXISTS (SELECT 1 FROM branches b WHERE b.salon_id = s.id);
  IF v_salons_without_branches > 0 THEN
    RAISE EXCEPTION 'Abort: % salon(s) have zero branches, backfill would break. Create a branch per salon before running 036', v_salons_without_branches;
  END IF;
END $$;

DO $$
DECLARE
  v_expenses_without_branch bigint;
BEGIN
  SELECT count(*) INTO v_expenses_without_branch
  FROM expenses WHERE branch_id IS NULL;
  IF v_expenses_without_branch > 0 THEN
    RAISE EXCEPTION 'Abort: % expense row(s) have NULL branch_id; salon_id backfill would leave them NULL and SET NOT NULL would fail. Fix or delete those rows before running 036', v_expenses_without_branch;
  END IF;
END $$;

-- 2. Add branch_id to 6 tables (nullable initially) -------------------------

ALTER TABLE clients          ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id);
ALTER TABLE services         ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id);
ALTER TABLE packages         ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id);
ALTER TABLE promo_codes      ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id);
ALTER TABLE suppliers        ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id);
ALTER TABLE backbar_actuals  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id);

-- 3. Fix expenses salon_id bug ----------------------------------------------
-- expenses currently has branch_id but no salon_id; reports/daily/page.tsx
-- filters .eq('salon_id', …) silently returns empty. Add the column and
-- backfill from branches.

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS salon_id uuid REFERENCES salons(id);

-- 4. Backfill using each salon's main branch --------------------------------

WITH salon_primary_branch AS (
  SELECT DISTINCT ON (salon_id)
    salon_id,
    id AS branch_id
  FROM branches
  ORDER BY salon_id, is_main DESC NULLS LAST, created_at ASC
)
UPDATE clients t
SET branch_id = spb.branch_id
FROM salon_primary_branch spb
WHERE spb.salon_id = t.salon_id
  AND t.branch_id IS NULL;

WITH salon_primary_branch AS (
  SELECT DISTINCT ON (salon_id)
    salon_id,
    id AS branch_id
  FROM branches
  ORDER BY salon_id, is_main DESC NULLS LAST, created_at ASC
)
UPDATE services t
SET branch_id = spb.branch_id
FROM salon_primary_branch spb
WHERE spb.salon_id = t.salon_id
  AND t.branch_id IS NULL;

WITH salon_primary_branch AS (
  SELECT DISTINCT ON (salon_id)
    salon_id,
    id AS branch_id
  FROM branches
  ORDER BY salon_id, is_main DESC NULLS LAST, created_at ASC
)
UPDATE packages t
SET branch_id = spb.branch_id
FROM salon_primary_branch spb
WHERE spb.salon_id = t.salon_id
  AND t.branch_id IS NULL;

WITH salon_primary_branch AS (
  SELECT DISTINCT ON (salon_id)
    salon_id,
    id AS branch_id
  FROM branches
  ORDER BY salon_id, is_main DESC NULLS LAST, created_at ASC
)
UPDATE promo_codes t
SET branch_id = spb.branch_id
FROM salon_primary_branch spb
WHERE spb.salon_id = t.salon_id
  AND t.branch_id IS NULL;

WITH salon_primary_branch AS (
  SELECT DISTINCT ON (salon_id)
    salon_id,
    id AS branch_id
  FROM branches
  ORDER BY salon_id, is_main DESC NULLS LAST, created_at ASC
)
UPDATE suppliers t
SET branch_id = spb.branch_id
FROM salon_primary_branch spb
WHERE spb.salon_id = t.salon_id
  AND t.branch_id IS NULL;

WITH salon_primary_branch AS (
  SELECT DISTINCT ON (salon_id)
    salon_id,
    id AS branch_id
  FROM branches
  ORDER BY salon_id, is_main DESC NULLS LAST, created_at ASC
)
UPDATE backbar_actuals t
SET branch_id = spb.branch_id
FROM salon_primary_branch spb
WHERE spb.salon_id = t.salon_id
  AND t.branch_id IS NULL;

-- Expenses already has branch_id; backfill salon_id from branches.
UPDATE expenses e
SET salon_id = b.salon_id
FROM branches b
WHERE b.id = e.branch_id
  AND e.salon_id IS NULL;

-- 5. Enforce NOT NULL on all 7 columns --------------------------------------

ALTER TABLE clients         ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE services        ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE packages        ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE promo_codes     ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE suppliers       ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE backbar_actuals ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE expenses        ALTER COLUMN salon_id  SET NOT NULL;

-- 6. Update backbar_actuals unique constraint -------------------------------
-- Was: UNIQUE (salon_id, product_id, period_start, period_end)
-- Now: UNIQUE (branch_id, product_id, period_start, period_end)
-- Postgres auto-named the old constraint _salon_id_product_id_period_start_period_end_key.

ALTER TABLE backbar_actuals
  DROP CONSTRAINT IF EXISTS backbar_actuals_salon_id_product_id_period_start_period_end_key;

ALTER TABLE backbar_actuals
  ADD CONSTRAINT backbar_actuals_branch_id_product_id_period_start_period_end_key
  UNIQUE (branch_id, product_id, period_start, period_end);

-- 7. Indexes ----------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_clients_branch          ON clients (branch_id);
CREATE INDEX IF NOT EXISTS idx_services_branch         ON services (branch_id);
CREATE INDEX IF NOT EXISTS idx_packages_branch         ON packages (branch_id);
CREATE INDEX IF NOT EXISTS idx_promo_codes_branch      ON promo_codes (branch_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_branch        ON suppliers (branch_id);
CREATE INDEX IF NOT EXISTS idx_backbar_actuals_branch  ON backbar_actuals (branch_id);

-- Composite (salon_id, branch_id) indexes for "all branches" report queries.
CREATE INDEX IF NOT EXISTS idx_clients_salon_branch     ON clients (salon_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_services_salon_branch    ON services (salon_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_packages_salon_branch    ON packages (salon_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_promo_codes_salon_branch ON promo_codes (salon_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_salon_branch   ON suppliers (salon_id, branch_id);

-- expenses.salon_id index for cross-branch report queries.
CREATE INDEX IF NOT EXISTS idx_expenses_salon ON expenses (salon_id);

-- 8. staff_branches join table ----------------------------------------------

CREATE TABLE IF NOT EXISTS staff_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_branches_staff  ON staff_branches (staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_branches_branch ON staff_branches (branch_id);

-- Backfill from existing staff.branch_id.
INSERT INTO staff_branches (staff_id, branch_id)
SELECT id, branch_id
FROM staff
WHERE branch_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Rename staff.branch_id -> staff.primary_branch_id to signal new semantics.
ALTER TABLE staff RENAME COLUMN branch_id TO primary_branch_id;

-- 9. role_presets table -----------------------------------------------------

CREATE TABLE IF NOT EXISTS role_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid REFERENCES salons(id) ON DELETE CASCADE,  -- NULL = platform default
  role_name text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (salon_id, role_name)
);

CREATE INDEX IF NOT EXISTS idx_role_presets_salon ON role_presets (salon_id);

-- 10. Seed platform defaults (salon_id IS NULL) -----------------------------
-- 27 permission keys across 6 roles. Owner is wildcard; helper starts empty.

INSERT INTO role_presets (salon_id, role_name, permissions) VALUES
  (NULL, 'owner', '{"*": true}'::jsonb),
  (NULL, 'manager', jsonb_build_object(
    'view_reports',             true,
    'view_commissions',         true,
    'manage_staff',             true,
    'manage_clients',           true,
    'delete_client',            true,
    'manage_appointments',      true,
    'manage_services',          true,
    'manage_inventory',         true,
    'manage_suppliers',         true,
    'manage_expenses',          true,
    'manage_promos',            true,
    'manage_packages',          true,
    'open_close_drawer',        true,
    'process_refund',           true,
    'void_bill',                true,
    'use_pos',                  true,
    'apply_discount',           true,
    'override_price',           true,
    'split_payment',            true,
    'view_other_branches',      true,
    'export_data',              true,
    'manage_salon',             true,
    'manage_permissions',       false
  )),
  (NULL, 'receptionist', jsonb_build_object(
    'manage_clients',           true,
    'manage_appointments',      true,
    'open_close_drawer',        true,
    'use_pos',                  true,
    'apply_discount',           false,
    'split_payment',            true,
    'view_reports',             false,
    'view_other_branches',      false
  )),
  (NULL, 'senior_stylist', jsonb_build_object(
    'manage_appointments',        true,
    'view_own_commissions',       true,
    'use_pos',                    true,
    'view_own_appointments_only', false
  )),
  (NULL, 'junior_stylist', jsonb_build_object(
    'manage_appointments',        true,
    'view_own_commissions',       true,
    'view_own_appointments_only', true
  )),
  (NULL, 'helper', '{}'::jsonb)
ON CONFLICT (salon_id, role_name) DO NOTHING;

-- 11. Trigger: seed presets on new salon ------------------------------------

CREATE OR REPLACE FUNCTION public.seed_role_presets_for_new_salon()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO role_presets (salon_id, role_name, permissions)
  SELECT NEW.id, role_name, permissions
  FROM role_presets
  WHERE salon_id IS NULL
  ON CONFLICT (salon_id, role_name) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS salons_seed_role_presets ON salons;
CREATE TRIGGER salons_seed_role_presets
  AFTER INSERT ON salons
  FOR EACH ROW EXECUTE FUNCTION public.seed_role_presets_for_new_salon();

-- 12. Backfill presets for existing salons ----------------------------------

INSERT INTO role_presets (salon_id, role_name, permissions)
SELECT s.id, p.role_name, p.permissions
FROM salons s
CROSS JOIN role_presets p
WHERE p.salon_id IS NULL
ON CONFLICT (salon_id, role_name) DO NOTHING;

-- 13. staff.permissions_override --------------------------------------------

ALTER TABLE staff ADD COLUMN IF NOT EXISTS permissions_override jsonb;

-- 14. RLS baseline (defense-in-depth, mirror 035 style) ---------------------

ALTER TABLE staff_branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Salon members can view staff branches"
  ON staff_branches FOR SELECT
  USING (
    branch_id IN (SELECT id FROM branches WHERE salon_id = get_user_salon_id())
  );

CREATE POLICY "Salon owners can manage staff branches"
  ON staff_branches FOR ALL
  USING (
    branch_id IN (SELECT id FROM branches WHERE salon_id = get_user_salon_id())
  );

ALTER TABLE role_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Salon members can view role presets"
  ON role_presets FOR SELECT
  USING (
    salon_id IS NULL OR salon_id = get_user_salon_id()
  );

CREATE POLICY "Salon owners can manage role presets"
  ON role_presets FOR ALL
  USING (
    salon_id = get_user_salon_id()
  );

COMMIT;
