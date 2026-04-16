-- 028_backbar_actuals.sql
--
-- Owner-entered stocktake snapshots: "I counted my shampoo on Apr 1; we had
-- used 380ml between Mar 1 and Apr 1." The report compares this against the
-- expected (services × link qty) for the same window and shows the variance.
-- Replaces the misleading auto-computed "actual" derived from stock_movements
-- which staff rarely log accurately.

CREATE TABLE IF NOT EXISTS backbar_actuals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  -- Stored in content units (ml/g) to match products.content_per_unit so the
  -- report can compare apples to apples with expected.
  actual_qty numeric(12,3) NOT NULL CHECK (actual_qty >= 0),
  notes text,
  recorded_by uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start),
  UNIQUE (salon_id, product_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS backbar_actuals_lookup_idx
  ON backbar_actuals (salon_id, product_id, period_start, period_end);

ALTER TABLE backbar_actuals ENABLE ROW LEVEL SECURITY;
-- Service-role only; UI hits via server actions.
