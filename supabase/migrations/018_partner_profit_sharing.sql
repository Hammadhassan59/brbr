-- Add profit_share_percentage to salon_partners for simple percentage-based
-- profit splits. Owner is implicit: their share = 100 - sum(partners).
ALTER TABLE salon_partners
  ADD COLUMN IF NOT EXISTS profit_share_percentage numeric(5, 2) NOT NULL DEFAULT 0
  CHECK (profit_share_percentage >= 0 AND profit_share_percentage <= 100);

COMMENT ON COLUMN salon_partners.profit_share_percentage IS
  'Percentage of net profit that goes to this partner. Owner receives the remainder (100 - sum of all partner percentages).';
