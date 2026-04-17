-- =============================================================================
-- 040_rollback_039.sql
--
-- Rollback for 039_narrow_branch_products_triggers.sql.
--
-- Date:          2026-04-18
-- Dependencies:  039_narrow_branch_products_triggers.sql
--
-- What this migration does:
--   1. Drops the narrowed product-insert trigger + function added by 039.
--   2. Re-creates the two broad seed functions + triggers from 035 verbatim
--      (seed_branch_products_for_new_product + seed_branch_products_for_new_branch),
--      restoring the fan-out-across-branches behaviour.
--
-- Important — data loss is NOT reversible:
--   Migration 039 deleted orphan branch_products rows (rows whose branch_id
--   did not match the product's branch_id). Applying this rollback does NOT
--   restore those deleted rows. If you need them back, restore branch_products
--   from a backup taken before 039 was applied.
--
-- When to apply:
--   Only roll back if the narrowed trigger is misbehaving AND you have a plan
--   to re-broaden products across branches. Under the 037 data model (products
--   have a single branch_id) the 035 fan-out trigger re-introduces orphan rows
--   on every new product insert, so staying on 040 long-term will pollute
--   branch_products again.
-- =============================================================================

BEGIN;

-- 1. Drop the narrowed 039 trigger + function --------------------------------

DROP TRIGGER IF EXISTS products_seed_branch_product ON products;
DROP FUNCTION IF EXISTS public.seed_branch_product_for_new_product();

-- 2. Restore the 035 broad product-insert trigger ----------------------------

-- When a new product is added, open a branch_products row in every branch
-- of the same salon with zero stock and the product's default threshold.
-- The creating action is expected to set opening stock on the current branch
-- explicitly after insert.
CREATE OR REPLACE FUNCTION public.seed_branch_products_for_new_product()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO branch_products (branch_id, product_id, current_stock, low_stock_threshold)
  SELECT b.id, NEW.id, 0, COALESCE(NEW.low_stock_threshold, 5)
  FROM branches b
  WHERE b.salon_id = NEW.salon_id
  ON CONFLICT (branch_id, product_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_seed_branch_products ON products;
CREATE TRIGGER products_seed_branch_products
  AFTER INSERT ON products
  FOR EACH ROW EXECUTE FUNCTION public.seed_branch_products_for_new_product();

-- 3. Restore the 035 broad branch-insert trigger -----------------------------

-- When a new branch is added, open a branch_products row for every existing
-- product in that salon with zero stock and each product's own threshold.
CREATE OR REPLACE FUNCTION public.seed_branch_products_for_new_branch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO branch_products (branch_id, product_id, current_stock, low_stock_threshold)
  SELECT NEW.id, p.id, 0, COALESCE(p.low_stock_threshold, 5)
  FROM products p
  WHERE p.salon_id = NEW.salon_id
  ON CONFLICT (branch_id, product_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS branches_seed_branch_products ON branches;
CREATE TRIGGER branches_seed_branch_products
  AFTER INSERT ON branches
  FOR EACH ROW EXECUTE FUNCTION public.seed_branch_products_for_new_branch();

COMMIT;
