-- =============================================================================
-- 037_products_loyalty_per_branch.sql
--
-- Per-branch product catalog + per-branch loyalty rules.
--
-- Date:          2026-04-18
-- Dependencies:  036_branch_separation_and_permissions.sql
-- Rollback path: 038_rollback_037.sql
--
-- What this migration does:
--   1. Adds `branch_id` to `products`, backfills from each salon's main branch,
--      then enforces NOT NULL. After this, the product catalog is per-branch:
--      each product row belongs to exactly one branch.
--   2. Adds `branch_id` to `loyalty_rules`, backfills, enforces NOT NULL, and
--      swaps the uniqueness from `(salon_id)` to `(salon_id, branch_id)` so
--      every branch can have its own loyalty configuration.
--
-- Risk notes:
--   - The preflight DO block aborts if any `products` or `loyalty_rules` row
--     has NULL salon_id. Prod is clean (0 rows each), but the guard protects
--     other environments.
--   - This is a UX shift: owners will now see different product lists per
--     branch. The backfill places all existing products on each salon's main
--     branch, so secondary branches will show empty product catalogs until
--     the owner duplicates products to them. A "duplicate to branch" action
--     in the app is a required follow-up.
--   - `branch_products` (added in 035) is intentionally NOT dropped. It still
--     tracks per-branch stock levels and thresholds separately from the
--     catalog row; even with products now per-branch, stock is a distinct
--     concern. The 035 seed triggers continue to fire on product insert and
--     branch insert — harmless since a per-branch product will only have a
--     meaningful branch_products row on its owning branch anyway.
--   - This migration is wrapped in a single transaction. A failure rolls
--     everything back cleanly.
--   - Application code MUST be ready for branch_id scoping on products/loyalty
--     reads and writes before this ships. Writes without branch_id will raise
--     a NOT NULL violation.
-- =============================================================================

BEGIN;

-- 1. Preflight guards --------------------------------------------------------

DO $$
DECLARE
  v_table text;
  v_null_count bigint;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['products','loyalty_rules']
  LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE salon_id IS NULL', v_table) INTO v_null_count;
    IF v_null_count > 0 THEN
      RAISE EXCEPTION 'Abort: found NULL salon_id in %, fix data before running 037', v_table;
    END IF;
  END LOOP;
END $$;

-- 2. products.branch_id -----------------------------------------------------

ALTER TABLE products ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id);

-- Backfill from salon's main branch (same CTE pattern as 035/036).
WITH salon_primary_branch AS (
  SELECT DISTINCT ON (salon_id)
    salon_id,
    id AS branch_id
  FROM branches
  ORDER BY salon_id, is_main DESC NULLS LAST, created_at ASC
)
UPDATE products t
SET branch_id = spb.branch_id
FROM salon_primary_branch spb
WHERE spb.salon_id = t.salon_id
  AND t.branch_id IS NULL;

ALTER TABLE products ALTER COLUMN branch_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_branch       ON products (branch_id);
CREATE INDEX IF NOT EXISTS idx_products_salon_branch ON products (salon_id, branch_id);

-- 3. loyalty_rules.branch_id + unique constraint swap -----------------------
-- The existing unique is `loyalty_rules_salon_id_key` on (salon_id) — it was
-- declared inline in 001_initial_schema.sql as `salon_id uuid REFERENCES
-- salons(id) UNIQUE`. Prod has 0 rows so reshaping is safe.

ALTER TABLE loyalty_rules ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id);

-- Backfill (no-op on prod — 0 rows — but needed for other envs).
WITH salon_primary_branch AS (
  SELECT DISTINCT ON (salon_id)
    salon_id,
    id AS branch_id
  FROM branches
  ORDER BY salon_id, is_main DESC NULLS LAST, created_at ASC
)
UPDATE loyalty_rules t
SET branch_id = spb.branch_id
FROM salon_primary_branch spb
WHERE spb.salon_id = t.salon_id
  AND t.branch_id IS NULL;

ALTER TABLE loyalty_rules ALTER COLUMN branch_id SET NOT NULL;

ALTER TABLE loyalty_rules DROP CONSTRAINT IF EXISTS loyalty_rules_salon_id_key;
ALTER TABLE loyalty_rules
  ADD CONSTRAINT loyalty_rules_salon_branch_key UNIQUE (salon_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_loyalty_rules_branch ON loyalty_rules (branch_id);

COMMIT;
