-- ═══════════════════════════════════════
-- Migration 022: Mandatory phone for all user roles
-- ═══════════════════════════════════════
-- Backfills a placeholder for any existing rows with NULL/empty phone,
-- then enforces NOT NULL + non-empty check across staff, sales_agents, salons.
-- salon_partners.phone is already NOT NULL (migration 002).

-- Staff: backfill + NOT NULL + non-empty check
UPDATE staff SET phone = '0000000000' WHERE phone IS NULL OR btrim(phone) = '';
ALTER TABLE staff ALTER COLUMN phone SET NOT NULL;
ALTER TABLE staff ADD CONSTRAINT staff_phone_not_empty CHECK (btrim(phone) <> '');

-- Sales agents: backfill + NOT NULL + non-empty check
UPDATE sales_agents SET phone = '0000000000' WHERE phone IS NULL OR btrim(phone) = '';
ALTER TABLE sales_agents ALTER COLUMN phone SET NOT NULL;
ALTER TABLE sales_agents ADD CONSTRAINT sales_agents_phone_not_empty CHECK (btrim(phone) <> '');

-- Salons (owner-level business phone): backfill + NOT NULL + non-empty check
UPDATE salons SET phone = '0000000000' WHERE phone IS NULL OR btrim(phone) = '';
ALTER TABLE salons ALTER COLUMN phone SET NOT NULL;
ALTER TABLE salons ADD CONSTRAINT salons_phone_not_empty CHECK (btrim(phone) <> '');

-- Salon partners: already NOT NULL, just add non-empty check for consistency
ALTER TABLE salon_partners ADD CONSTRAINT salon_partners_phone_not_empty CHECK (btrim(phone) <> '');
