-- 035_branch_products.sql
--
-- Per-branch inventory.
--
-- Before this migration, `products.current_stock` and `products.low_stock_threshold`
-- were single salon-level numbers. Every branch shared one stock pool. This
-- migration introduces `branch_products` so each branch maintains its own
-- stock level and threshold while the product catalog stays salon-scoped.
--
-- Also adds `stock_transfers` for branch-to-branch inventory transfers.
--
-- The old columns on `products` are intentionally NOT dropped here — they are
-- left as tombstones so a rollback of the application code doesn't immediately
-- corrupt state. They can be dropped in a follow-up migration once this ships
-- and is stable.

-- 1. branch_products --------------------------------------------------------

CREATE TABLE IF NOT EXISTS branch_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  current_stock numeric NOT NULL DEFAULT 0,
  low_stock_threshold numeric NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, product_id)
);

CREATE INDEX IF NOT EXISTS branch_products_branch_idx
  ON branch_products (branch_id);
CREATE INDEX IF NOT EXISTS branch_products_product_idx
  ON branch_products (product_id);

ALTER TABLE branch_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Salon members can view branch products"
  ON branch_products FOR SELECT
  USING (
    branch_id IN (SELECT id FROM branches WHERE salon_id = get_user_salon_id())
  );

CREATE POLICY "Salon owners can manage branch products"
  ON branch_products FOR ALL
  USING (
    branch_id IN (SELECT id FROM branches WHERE salon_id = get_user_salon_id())
  );

-- Backfill: for every (branch, product) in the same salon, create a row.
-- Exactly one branch per salon ("primary") inherits the existing salon-level
-- stock; all other branches start at 0. Primary selection is deterministic:
-- is_main=true first, then oldest by created_at. All branches inherit the
-- product's threshold so low-stock UI still works on day one.
WITH salon_primary_branch AS (
  SELECT DISTINCT ON (salon_id)
    salon_id,
    id AS branch_id
  FROM branches
  ORDER BY salon_id, is_main DESC, created_at ASC
)
INSERT INTO branch_products (branch_id, product_id, current_stock, low_stock_threshold)
SELECT
  b.id,
  p.id,
  CASE WHEN b.id = spb.branch_id THEN COALESCE(p.current_stock, 0) ELSE 0 END,
  COALESCE(p.low_stock_threshold, 5)
FROM products p
JOIN branches b ON b.salon_id = p.salon_id
JOIN salon_primary_branch spb ON spb.salon_id = p.salon_id
ON CONFLICT (branch_id, product_id) DO NOTHING;

-- Trigger to keep updated_at fresh.
CREATE OR REPLACE FUNCTION public.touch_branch_products_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS branch_products_touch_updated_at ON branch_products;
CREATE TRIGGER branch_products_touch_updated_at
  BEFORE UPDATE ON branch_products
  FOR EACH ROW EXECUTE FUNCTION public.touch_branch_products_updated_at();

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

-- 2. stock_transfers --------------------------------------------------------

CREATE TABLE IF NOT EXISTS stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  from_branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  to_branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL CHECK (quantity > 0),
  notes text,
  transferred_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_branch_id <> to_branch_id)
);

CREATE INDEX IF NOT EXISTS stock_transfers_salon_created_idx
  ON stock_transfers (salon_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_transfers_from_branch_idx
  ON stock_transfers (from_branch_id);
CREATE INDEX IF NOT EXISTS stock_transfers_to_branch_idx
  ON stock_transfers (to_branch_id);

ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Salon members can view stock transfers"
  ON stock_transfers FOR SELECT
  USING (salon_id = get_user_salon_id());

CREATE POLICY "Salon owners can manage stock transfers"
  ON stock_transfers FOR ALL
  USING (salon_id = get_user_salon_id());
