-- =============================================================================
-- 037_rollback_036.sql
--
-- Full reversal of 036_branch_separation_and_permissions.sql.
--
-- Date:          2026-04-17
-- Reverses:      036_branch_separation_and_permissions.sql
-- Prod anchor:   f23f8d2 (2026-04-17) — pre-036 rollback point
--
-- Acceptable data loss when this runs:
--   - All values in `staff.permissions_override` (column is dropped).
--   - All `role_presets` rows (platform defaults + per-salon copies).
--   - All `staff_branches` rows beyond each staff's primary branch
--     (primary is preserved via the rename-back to staff.branch_id).
--   - All `expenses.salon_id` values (column is dropped; branch_id stays).
--   - All branch_id values on clients/services/packages/promo_codes/
--     suppliers/backbar_actuals (columns are dropped).
--
-- Wrapped in a single transaction. Safe to run on a DB that had 036 applied.
-- =============================================================================

BEGIN;

-- 1. Drop trigger + function on salons ---------------------------------------

DROP TRIGGER IF EXISTS salons_seed_role_presets ON salons;
DROP FUNCTION IF EXISTS public.seed_role_presets_for_new_salon();

-- 2. Drop role_presets (CASCADE cleans its indexes + policies) --------------

DROP TABLE IF EXISTS role_presets CASCADE;

-- 3. Drop staff.permissions_override ----------------------------------------

ALTER TABLE staff DROP COLUMN IF EXISTS permissions_override;

-- 4. Drop staff_branches (CASCADE cleans indexes + policies) ----------------

DROP TABLE IF EXISTS staff_branches CASCADE;

-- 5. Rename staff.primary_branch_id back to staff.branch_id -----------------
-- (Primary branch per staff is preserved; multi-branch assignments are lost.)

ALTER TABLE staff RENAME COLUMN primary_branch_id TO branch_id;

-- 6. Revert backbar_actuals unique constraint ------------------------------

ALTER TABLE backbar_actuals
  DROP CONSTRAINT IF EXISTS backbar_actuals_branch_id_product_id_period_start_period_end_key;

ALTER TABLE backbar_actuals
  ADD CONSTRAINT backbar_actuals_salon_id_product_id_period_start_period_end_key
  UNIQUE (salon_id, product_id, period_start, period_end);

-- 7. Drop composite (salon_id, branch_id) indexes ---------------------------
-- Explicit drops because these live on kept columns (salon_id still exists).

DROP INDEX IF EXISTS idx_clients_salon_branch;
DROP INDEX IF EXISTS idx_services_salon_branch;
DROP INDEX IF EXISTS idx_packages_salon_branch;
DROP INDEX IF EXISTS idx_promo_codes_salon_branch;
DROP INDEX IF EXISTS idx_suppliers_salon_branch;

-- 8. Drop per-table branch_id indexes ---------------------------------------
-- (These would be auto-dropped with the columns below, but be explicit.)

DROP INDEX IF EXISTS idx_clients_branch;
DROP INDEX IF EXISTS idx_services_branch;
DROP INDEX IF EXISTS idx_packages_branch;
DROP INDEX IF EXISTS idx_promo_codes_branch;
DROP INDEX IF EXISTS idx_suppliers_branch;
DROP INDEX IF EXISTS idx_backbar_actuals_branch;

-- 9. Drop expenses.salon_id index + column ----------------------------------

DROP INDEX IF EXISTS idx_expenses_salon;
ALTER TABLE expenses DROP COLUMN IF EXISTS salon_id;

-- 10. Drop branch_id from the 6 tables --------------------------------------

ALTER TABLE clients         DROP COLUMN IF EXISTS branch_id;
ALTER TABLE services        DROP COLUMN IF EXISTS branch_id;
ALTER TABLE packages        DROP COLUMN IF EXISTS branch_id;
ALTER TABLE promo_codes     DROP COLUMN IF EXISTS branch_id;
ALTER TABLE suppliers       DROP COLUMN IF EXISTS branch_id;
ALTER TABLE backbar_actuals DROP COLUMN IF EXISTS branch_id;

COMMIT;
