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

-- Seed: demo partner for Royal Barbers
INSERT INTO salon_partners (id, salon_id, name, phone, pin_code)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-pppppppppp01',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Imran Malik',
  '0333-9998877',
  '9999'
);

-- Seed: second branch for Royal Barbers
INSERT INTO branches (id, salon_id, name, address, phone, is_main)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaac',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Blue Area',
  'Shop 7, Blue Area, Islamabad',
  '0333-4445566',
  false
);

-- Seed: staff for second branch
INSERT INTO staff (id, salon_id, branch_id, name, phone, role, pin_code, base_salary, commission_type, commission_rate) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaac', 'Nadeem Khan', '0345-7771234', 'senior_stylist', '4444', 18000, 'percentage', 25),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa006', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaac', 'Waqar Ahmed', '0300-7775678', 'junior_stylist', '5555', 10000, 'flat', 50);
