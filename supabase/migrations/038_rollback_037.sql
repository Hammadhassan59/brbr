-- =============================================================================
-- 038_rollback_037.sql
--
-- Reverse 037_products_loyalty_per_branch.sql.
--
-- Date:          2026-04-18
-- Dependencies:  037_products_loyalty_per_branch.sql
--
-- What this migration does:
--   1. Restores `loyalty_rules` uniqueness to `(salon_id)` and drops branch_id.
--   2. Drops `products.branch_id` and its indexes.
--
-- Risk notes:
--   - The loyalty_rules rollback assumes no rows exist with duplicate salon_id
--     across branches. Prod currently has 0 rows, so this is safe. On other
--     environments: if more than one branch has its own loyalty_rules row for
--     the same salon, restoring `UNIQUE (salon_id)` will fail. Check first:
--         SELECT salon_id, count(*) FROM loyalty_rules
--         GROUP BY salon_id HAVING count(*) > 1;
--     and resolve duplicates before running this rollback.
--   - Wrapped in a single transaction. A failure rolls everything back.
-- =============================================================================

BEGIN;

-- 1. Revert loyalty_rules ---------------------------------------------------

DROP INDEX IF EXISTS idx_loyalty_rules_branch;

ALTER TABLE loyalty_rules DROP CONSTRAINT IF EXISTS loyalty_rules_salon_branch_key;
ALTER TABLE loyalty_rules ADD CONSTRAINT loyalty_rules_salon_id_key UNIQUE (salon_id);

ALTER TABLE loyalty_rules DROP COLUMN IF EXISTS branch_id;

-- 2. Revert products --------------------------------------------------------

DROP INDEX IF EXISTS idx_products_salon_branch;
DROP INDEX IF EXISTS idx_products_branch;

ALTER TABLE products DROP COLUMN IF EXISTS branch_id;

COMMIT;
