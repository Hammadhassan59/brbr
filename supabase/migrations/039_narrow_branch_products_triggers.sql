-- =============================================================================
-- 039_narrow_branch_products_triggers.sql
--
-- Narrow the branch_products seed triggers to match per-branch products.
--
-- Date:          2026-04-18
-- Dependencies:  037_products_loyalty_per_branch.sql (products.branch_id NOT NULL)
-- Rollback path: 040_rollback_039.sql
--
-- Background:
--   Migration 035 created `branch_products` as a per-branch stock ledger for a
--   salon-scoped product catalog. It installed two AFTER INSERT triggers that
--   fanned a single product across every branch of the salon, and fanned every
--   salon product into every new branch:
--     - products_seed_branch_products  → seed_branch_products_for_new_product()
--     - branches_seed_branch_products  → seed_branch_products_for_new_branch()
--
--   Migration 037 made the product catalog per-branch: `products.branch_id` is
--   now NOT NULL and each product belongs to exactly one branch. The fan-out
--   behaviour from 035 is no longer correct — inserting ProductA into BranchA
--   creates orphan branch_products rows pointing at BranchB, BranchC, etc.
--   where the product does not actually exist. Those orphan rows have no
--   matching catalog row in their branch and pollute stock queries.
--
-- What this migration does:
--   1. Drops the two broad seed triggers + their functions from 035.
--   2. Adds a narrowed product-insert trigger that only seeds a single
--      branch_products row for the product's own branch_id.
--   3. Does NOT replace the branch-insert trigger. New branches start empty;
--      duplicating products into a new branch is a deliberate user action.
--   4. Deletes the orphan branch_products rows produced by the old 035
--      trigger (rows whose branch_id does not match their product's branch_id).
--
-- Note:
--   Migration 035 remains authoritative for the `branch_products` table,
--   indexes, RLS policies, and the `touch_branch_products_updated_at` trigger.
--   039 only narrows the seed triggers that 035 installed.
--
-- Risk notes:
--   - The cleanup DELETE removes data. Rows being removed are orphans with no
--     matching product-in-branch row, so they are never used by the app, but
--     they still hold stock numbers that would be lost. Take a backup of
--     branch_products before applying if the environment has real stock data
--     in orphan rows.
-- =============================================================================

BEGIN;

-- 1. Drop the broad 035 triggers + functions ---------------------------------

DROP TRIGGER IF EXISTS products_seed_branch_products ON products;
DROP FUNCTION IF EXISTS public.seed_branch_products_for_new_product();

DROP TRIGGER IF EXISTS branches_seed_branch_products ON branches;
DROP FUNCTION IF EXISTS public.seed_branch_products_for_new_branch();

-- 2. Narrowed product-insert trigger -----------------------------------------

-- After migration 037, a product lives in exactly one branch. When a product
-- is inserted, seed a single branch_products row for that branch at zero
-- stock with the product's default threshold. Branch-insert does NOT fan out:
-- new branches start with an empty catalog and the owner duplicates products
-- in as a deliberate action.
CREATE OR REPLACE FUNCTION public.seed_branch_product_for_new_product()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO branch_products (branch_id, product_id, current_stock, low_stock_threshold)
  VALUES (NEW.branch_id, NEW.id, 0, COALESCE(NEW.low_stock_threshold, 5))
  ON CONFLICT (branch_id, product_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_seed_branch_product ON products;
CREATE TRIGGER products_seed_branch_product
  AFTER INSERT ON products
  FOR EACH ROW EXECUTE FUNCTION public.seed_branch_product_for_new_product();

-- 3. Clean up orphan branch_products rows ------------------------------------

-- An orphan = a branch_products row for (branch X, product P) where P's
-- actual branch_id <> X. These were created by the now-removed broad trigger
-- in 035 and are harmless-but-polluting.
DELETE FROM branch_products bp
USING products p
WHERE bp.product_id = p.id
  AND bp.branch_id <> p.branch_id;

COMMIT;
