-- 032_demo_salon.sql
--
-- "Real DB-backed demo salon" feature.
--
-- Adds:
--   1. salons.is_demo column (default false).
--   2. A single shared demo salon + branch + staff + clients + services +
--      products, all marked is_demo=true. Every sales-agent's paired demo
--      identity logs into this one salon as a synthetic owner so they can
--      demo the full product without needing their own tenant.
--   3. Deterministic UUIDs minted by src/lib/demo-salon-constants.ts —
--      the migration and the cron reset share the same IDs so repeated
--      ticks don't generate duplicate rows.
--
-- The cron at /api/cron/reset-demo wipes and reseeds operational data
-- (appointments, bills, cash drawers, attendance, expenses, udhaar
-- payments, stock movements) every 10 minutes. Catalog rows (salon,
-- branch, staff, clients, services, products) are NOT touched by the
-- cron — they stay stable here so demo walkthroughs are reproducible.
--
-- Idempotent: every INSERT uses ON CONFLICT DO NOTHING so re-running the
-- migration (or running it against an already-bootstrapped prod) is a
-- no-op.

-- =========================================================================
-- 1. salons.is_demo column
-- =========================================================================
ALTER TABLE salons ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS salons_is_demo_idx ON salons(is_demo) WHERE is_demo;

-- =========================================================================
-- 2. Shared demo salon row
--
-- owner_id is a synthetic UUID that is NOT a real auth.users row. The demo
-- doesn't rely on Supabase RLS for access — all demo-salon queries go
-- through the service-role server client, and the custom JWT pins the
-- demo user to DEMO_SALON_ID / DEMO_BRANCH_ID directly. The FK to
-- auth.users does not exist (001_initial_schema.sql declares the column
-- as `owner_id uuid REFERENCES auth.users(id)` with no ON DELETE, so we
-- have to skip the ref — Supabase allows NULL and we cannot insert a
-- synthetic auth.users id from a regular migration). Workaround: set
-- owner_id to NULL and rely on the JWT's salonId claim for routing.
-- =========================================================================
INSERT INTO salons (
  id, name, slug, type, language, city, address, phone, whatsapp,
  setup_complete, is_demo, subscription_plan, subscription_status,
  subscription_started_at, subscription_expires_at, sold_by_agent_id,
  owner_id
) VALUES (
  '9907628b-fb4f-561c-b98c-837bcd665a1d',
  'Demo Salon',
  'demo-salon',
  'unisex',
  'en',
  'Lahore',
  'Demo Street, Gulberg III',
  '03001111111',
  '03001111111',
  true,
  true,
  'pro',
  'active',
  now() - interval '180 days',
  now() + interval '3650 days',  -- far future so sub_active stays true forever
  NULL,
  NULL
) ON CONFLICT (id) DO NOTHING;

-- Enforce slug uniqueness via ON CONFLICT on slug too (salons.slug is UNIQUE).
-- If the id already existed we'd skip; if somehow another salon stole the
-- slug, this second insert will also no-op.
-- (Covered by the single INSERT above — slug UNIQUE constraint rejects dup.)

-- =========================================================================
-- 3. Main branch
-- =========================================================================
INSERT INTO branches (id, salon_id, name, address, phone, is_main)
VALUES (
  '6d9fd0cf-50b5-5c1c-a4f5-c6e945c362b6',
  '9907628b-fb4f-561c-b98c-837bcd665a1d',
  'Main Branch',
  'Demo Street, Gulberg III, Lahore',
  '03001111111',
  true
) ON CONFLICT (id) DO NOTHING;

-- =========================================================================
-- 4. Staff (7 — owner, manager, 2 seniors, 1 junior, receptionist, helper)
-- =========================================================================
INSERT INTO staff (id, salon_id, branch_id, name, phone, role, pin_code, base_salary, commission_type, commission_rate, join_date, is_active)
VALUES
  ('a9c6d0ac-b1cb-5933-b870-8f35f87431d5', '9907628b-fb4f-561c-b98c-837bcd665a1d', '6d9fd0cf-50b5-5c1c-a4f5-c6e945c362b6', 'Ahmed Raza',    '0300-1111001', 'owner',          '0000', 0,     'percentage', 0,  CURRENT_DATE - 365, true),
  ('7afa6259-e134-548c-ab84-38e5f175c467', '9907628b-fb4f-561c-b98c-837bcd665a1d', '6d9fd0cf-50b5-5c1c-a4f5-c6e945c362b6', 'Fatima Khan',   '0300-1111002', 'manager',        '1111', 30000, 'percentage', 10, CURRENT_DATE - 300, true),
  ('2745fc72-c2a4-539f-9b01-c0028f56886f', '9907628b-fb4f-561c-b98c-837bcd665a1d', '6d9fd0cf-50b5-5c1c-a4f5-c6e945c362b6', 'Usman Ghani',   '0300-1111003', 'senior_stylist', '2222', 22000, 'percentage', 25, CURRENT_DATE - 280, true),
  ('75be502b-19ab-59db-b1b8-038b657bfa19', '9907628b-fb4f-561c-b98c-837bcd665a1d', '6d9fd0cf-50b5-5c1c-a4f5-c6e945c362b6', 'Sadia Ahmed',   '0300-1111004', 'senior_stylist', '3333', 22000, 'percentage', 25, CURRENT_DATE - 260, true),
  ('3f75bff0-92bf-55fb-ae59-b3f15200bb94', '9907628b-fb4f-561c-b98c-837bcd665a1d', '6d9fd0cf-50b5-5c1c-a4f5-c6e945c362b6', 'Bilal Saeed',   '0300-1111005', 'junior_stylist', '4444', 14000, 'flat',       50, CURRENT_DATE - 150, true),
  ('5270b1bf-8b76-5ce4-bd68-792e4f1fc1d7', '9907628b-fb4f-561c-b98c-837bcd665a1d', '6d9fd0cf-50b5-5c1c-a4f5-c6e945c362b6', 'Zainab Bibi',   '0300-1111006', 'receptionist',   '5555', 15000, 'percentage', 0,  CURRENT_DATE - 200, true),
  ('c7584e4c-f66e-536a-a39b-813e30b53998', '9907628b-fb4f-561c-b98c-837bcd665a1d', '6d9fd0cf-50b5-5c1c-a4f5-c6e945c362b6', 'Hamza Ali',     '0300-1111007', 'helper',         '6666', 9000,  'percentage', 0,  CURRENT_DATE - 120, true)
ON CONFLICT (id) DO NOTHING;

-- =========================================================================
-- 5. Services (10 — realistic Pakistan salon menu)
-- =========================================================================
INSERT INTO services (id, salon_id, name, category, duration_minutes, base_price, is_active, sort_order)
VALUES
  ('5e5edf3b-4db8-5da6-a568-c0e3b767e1f0', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Haircut',      'haircut',   30, 800,  true, 1),
  ('b8207c62-eed4-532c-be5a-eaf8e156ca8b', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Beard Trim',   'beard',     20, 400,  true, 2),
  ('dd601b52-76d0-569f-ab0d-dab17524aa64', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Hair Color',   'color',     90, 3500, true, 3),
  ('0eb4b9ca-6973-5050-afc4-5da51d909182', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Facial',       'facial',    45, 1800, true, 4),
  ('a773a1fb-58bb-5692-881f-8882b2bcabbd', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Manicure',     'nails',     30, 900,  true, 5),
  ('d5475a86-eb4a-5a4a-a038-2ef9db2c213c', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Pedicure',     'nails',     40, 1200, true, 6),
  ('a9486e15-b2db-5a89-9356-879caf48f556', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Hair Spa',     'treatment', 60, 2500, true, 7),
  ('3d4189ba-77d8-59a1-8e70-f11e535ec9cf', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Kids Haircut', 'haircut',   25, 500,  true, 8),
  ('bd74c030-0177-5de5-9332-7d4d2ada42cc', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Shave',        'beard',     20, 350,  true, 9),
  ('98dd045b-13e1-50d0-8197-fe78f62ea04a', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Hair Wash',    'other',     15, 300,  true, 10)
ON CONFLICT (id) DO NOTHING;

-- =========================================================================
-- 6. Products (15 — backbar + retail)
-- =========================================================================
INSERT INTO products (id, salon_id, name, brand, category, unit, inventory_type, purchase_price, retail_price, current_stock, low_stock_threshold, is_active)
VALUES
  ('78e1d1fa-f2a3-5958-95c4-2d097fa1e3a6', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Shampoo',        'L''Oreal',   'Hair Care',   'bottle', 'backbar', 500,  900,  24,  5, true),
  ('e966f093-d217-57bc-ad53-45a1636cb8c9', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Conditioner',    'L''Oreal',   'Hair Care',   'bottle', 'backbar', 520,  950,  18,  5, true),
  ('fb524246-166a-57ee-bcb2-7dcd074f6f81', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Hair Wax',       'Gatsby',     'Styling',     'jar',    'retail',  350,  650,  30,  6, true),
  ('7597712e-b9bc-52db-99e8-9a0d1f40fa69', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Hair Gel',       'Brylcreem',  'Styling',     'bottle', 'retail',  280,  500,  25,  5, true),
  ('10042909-956f-5aae-8eaa-ff460cc34113', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Razor Blades',   'Gillette',   'Consumables', 'pack',   'backbar', 120,  180,  40,  10, true),
  ('2a1a9016-53a9-5001-a637-cd84c7ca96ef', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Hair Color Kit', 'Schwarzkopf','Color',       'box',    'backbar', 900,  1400, 12,  3, true),
  ('6e343b2e-050c-5bcd-b565-b26ca1f766c4', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Bleach Cream',   'Fem',        'Facial',      'tube',   'backbar', 180,  300,  20,  4, true),
  ('4dd6d967-e333-5c4c-9312-fb240a82acae', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Face Wash',      'Garnier',    'Facial',      'tube',   'backbar', 220,  380,  22,  5, true),
  ('32395eab-bd18-57dc-9e26-2b4394e5f0a2', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Body Lotion',    'Nivea',      'Skin Care',   'bottle', 'retail',  450,  750,  14,  4, true),
  ('b7e0faee-6c97-59e3-aebc-20b53f0749d1', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Hair Oil',       'Dabur',      'Hair Care',   'bottle', 'retail',  180,  320,  28,  6, true),
  ('8c2305e0-431c-52ca-9ccd-5390ae7c7d48', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Beard Oil',      'Beardo',     'Beard',       'bottle', 'retail',  380,  650,  16,  4, true),
  ('19d49c5b-6c88-5bd2-bad2-62cfead7563e', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Shaving Foam',   'Gillette',   'Beard',       'can',    'backbar', 280,  480,  15,  4, true),
  ('9840e1b1-6610-52d3-8095-294992efe75a', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Aftershave',     'Old Spice',  'Beard',       'bottle', 'retail',  320,  580,  12,  3, true),
  ('875f0c2f-dd0f-52db-93c1-169963972f1f', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Towels',         'Generic',    'Consumables', 'piece',  'backbar', 180,  0,    50,  10, true),
  ('46ce4113-9d1f-541c-8bc0-9070ab661311', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Talcum Powder',  'Imperial',   'Consumables', 'bottle', 'backbar', 90,   150,  18,  4, true)
ON CONFLICT (id) DO NOTHING;

-- =========================================================================
-- 7. Clients (30 — mix of phone formats, gender, VIP, udhaar)
-- =========================================================================
INSERT INTO clients (id, salon_id, name, phone, whatsapp, gender, is_vip, is_blacklisted, udhaar_balance, udhaar_limit, loyalty_points, total_visits, total_spent) VALUES
  ('d348cb84-bef8-537f-9693-82ab341e685d', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Aisha Malik',        '0301-4567890', '0301-4567890', 'female', true,  false, 0,    5000, 420, 12, 18500),
  ('c1645f74-59a4-581c-b7a2-487b8d52e9be', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Hassan Ali',         '03214567891',  '03214567891',  'male',   false, false, 0,    5000, 180, 6,  8200),
  ('a8ceea95-eb1a-5ea6-a614-673530e49802', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Bilal Khan',         '+923334567892','+923334567892','male',   false, false, 1500, 5000, 90,  4,  4000),
  ('93eb5c70-ec80-50fb-8533-229cf5c3b908', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Sara Ahmed',         '0301 4567893', '0301 4567893', 'female', true,  false, 0,    5000, 600, 18, 32000),
  ('c2dd71cf-8d44-5c24-abef-d7cd68ffab38', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Omar Sheikh',        '03124567894',  '03124567894',  'male',   false, false, 0,    5000, 150, 5,  7500),
  ('f3e0ce8f-473c-5b5d-b1e2-54b4b11d8018', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Fatima Jahangir',    '0321-4567895', '0321-4567895', 'female', false, false, 2500, 5000, 75,  3,  3800),
  ('9b90b058-1a21-59e1-8390-3dfbc1af0f67', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Zainab Shah',        '0333-4567896', '0333-4567896', 'female', true,  false, 0,    5000, 520, 14, 26000),
  ('e862431a-b4aa-5b9b-9c6d-90072420f2fa', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Ali Raza',           '0344-4567897', '0344-4567897', 'male',   false, false, 0,    5000, 220, 7,  10500),
  ('d21bc691-7e5b-50b0-986e-909bd7c12be9', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Hina Mahmood',       '+92301-4567898','+92301-4567898','female',false, false, 0,    5000, 160, 5,  7200),
  ('b90f68e7-0f89-5215-ae69-2bd29a4cb91b', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Usman Tariq',        '0301-4567899', '0301-4567899', 'male',   false, false, 800,  5000, 95,  3,  4600),
  ('ad5c2530-a95d-5e49-9411-0eada2f5d62d', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Mariam Qureshi',     '0321-4567900', '0321-4567900', 'female', true,  false, 0,    8000, 680, 20, 34000),
  ('93ba18bf-b5f0-5909-97eb-473ba185a247', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Tariq Jameel',       '0333-4567901', '0333-4567901', 'male',   false, false, 0,    5000, 140, 4,  6800),
  ('c6fff923-3908-54fb-8039-c63629b42858', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Sana Javed',         '0344-4567902', '0344-4567902', 'female', false, false, 0,    5000, 200, 6,  9200),
  ('1baca585-4319-5ead-81ca-9018a2fda5d2', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Kamran Akmal',       '03014567903',  '03014567903',  'male',   false, false, 1200, 5000, 110, 4,  5300),
  ('932cf0fa-ac2b-5a90-9ca8-6db62aa8626e', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Nida Iqbal',         '03214567904',  '03214567904',  'female', false, false, 0,    5000, 175, 5,  8000),
  ('19769865-9fa1-536e-80ef-98c3b9b3dcf5', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Faisal Qureshi',     '0301-4567905', '0301-4567905', 'male',   true,  false, 0,    10000,450, 12, 22000),
  ('628e1db1-17b9-5a53-a18f-a0b93f1fdb63', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Amna Nadeem',        '0321-4567906', '0321-4567906', 'female', false, false, 0,    5000, 130, 4,  6100),
  ('f2a074f8-7b74-518d-9da8-86d3e5a3d18d', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Imran Hussain',      '0333-4567907', '0333-4567907', 'male',   false, false, 0,    5000, 180, 6,  8400),
  ('62e9363b-73aa-5ae9-bd08-2a2002be1758', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Rabia Khalid',       '0344-4567908', '0344-4567908', 'female', false, false, 0,    5000, 220, 7,  10200),
  ('46b476a5-fceb-574f-a503-a99e5c3573a3', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Farhan Saeed',       '0301-4567909', '0301-4567909', 'male',   false, false, 0,    5000, 155, 5,  7300),
  ('8ab4a9ec-39a2-51d2-b87a-bcd426f2dbe9', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Sadia Imam',         '0321-4567910', '0321-4567910', 'female', true,  false, 0,    5000, 580, 16, 28500),
  ('199c63f6-287e-5ff1-8bd1-0904086ab95f', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Junaid Jamshed',     '0333-4567911', '0333-4567911', 'male',   false, false, 0,    5000, 90,  3,  4200),
  ('843818a3-7aa3-5383-adf1-6e311d256edc', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Maya Ali',           '0344-4567912', '0344-4567912', 'female', false, false, 0,    5000, 240, 8,  11500),
  ('60cc606e-5b1b-5292-9903-a6fbce2f6fc4', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Shahzad Ahmed',      '0301-4567913', '0301-4567913', 'male',   false, false, 0,    5000, 170, 5,  7900),
  ('5ce3c686-63c5-5370-a028-60ebe13b100e', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Ayesha Sana',        '0321-4567914', '0321-4567914', 'female', false, false, 0,    5000, 260, 8,  12500),
  ('444e365b-63c1-53b1-a63c-0877558f20df', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Hamza Tariq',        '0333-4567915', '0333-4567915', 'male',   false, false, 0,    5000, 100, 3,  4700),
  ('3be238a4-56ef-5b79-a359-af5af3e0e973', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Nadia Hussain',      '0344-4567916', '0344-4567916', 'female', false, false, 0,    5000, 310, 10, 14800),
  ('cfc9c653-bb49-5649-91ea-29de553b4832', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Shoaib Akhtar',      '0301-4567917', '0301-4567917', 'male',   false, false, 0,    5000, 130, 4,  6000),
  ('04c450e6-797b-5ecf-903f-ee9f66f09177', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Mehwish Hayat',      '0321-4567918', '0321-4567918', 'female', true,  false, 0,    10000,540, 15, 26800),
  ('757eb7f0-e1db-5096-97ac-474642ab92ef', '9907628b-fb4f-561c-b98c-837bcd665a1d', 'Shaan Shahid',       '0333-4567919', '0333-4567919', 'male',   false, false, 0,    5000, 160, 5,  7600)
ON CONFLICT (id) DO NOTHING;
