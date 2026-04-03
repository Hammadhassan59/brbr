-- ═══════════════════════════════════════
-- BrBr Migration 002: Partners & Multi-Branch
-- ═══════════════════════════════════════

-- Salon Partners — co-owners who log in via phone+PIN with full access
CREATE TABLE salon_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid REFERENCES salons(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  phone text NOT NULL,
  pin_code text NOT NULL DEFAULT '0000',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(salon_id, phone)
);

CREATE INDEX idx_salon_partners_phone ON salon_partners(phone);
CREATE INDEX idx_salon_partners_salon ON salon_partners(salon_id);

ALTER TABLE salon_partners ENABLE ROW LEVEL SECURITY;

-- RLS: partners can read their own salon's partner list
CREATE POLICY "Partners can view own salon partners"
  ON salon_partners FOR SELECT
  USING (salon_id IN (
    SELECT id FROM salons WHERE owner_id = auth.uid()
    UNION
    SELECT salon_id FROM salon_partners WHERE phone = current_setting('request.jwt.claims', true)::json->>'phone'
  ));

