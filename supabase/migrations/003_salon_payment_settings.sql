-- ═══════════════════════════════════════
-- BrBr Migration 003: Salon Payment Settings
-- ═══════════════════════════════════════

-- Payment method fields for digital payment display on receipts/POS
ALTER TABLE salons ADD COLUMN IF NOT EXISTS jazzcash_number text;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS easypaisa_number text;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS bank_account text;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS bank_title text;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS privacy_mode boolean DEFAULT false;
