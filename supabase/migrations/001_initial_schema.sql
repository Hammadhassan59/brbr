-- ═══════════════════════════════════════
-- BrBr — Pakistan ka Smart Salon System
-- Initial Database Schema
-- ═══════════════════════════════════════

-- 1. SALONS
CREATE TABLE salons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  logo_url text,
  address text,
  city text,
  phone text,
  whatsapp text,
  type text CHECK (type IN ('gents', 'ladies', 'unisex')) DEFAULT 'unisex',
  language text CHECK (language IN ('en', 'ur')) DEFAULT 'en',
  gst_enabled boolean DEFAULT false,
  gst_number text,
  gst_rate numeric DEFAULT 0,
  prayer_block_enabled boolean DEFAULT false,
  setup_complete boolean DEFAULT false,
  owner_id uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- 2. BRANCHES
CREATE TABLE branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid REFERENCES salons(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  phone text,
  is_main boolean DEFAULT false,
  working_hours jsonb DEFAULT '{
    "mon":{"open":"09:00","close":"21:00","off":false},
    "tue":{"open":"09:00","close":"21:00","off":false},
    "wed":{"open":"09:00","close":"21:00","off":false},
    "thu":{"open":"09:00","close":"21:00","off":false},
    "fri":{"open":"09:00","close":"21:00","off":false,"jummah_break":true},
    "sat":{"open":"09:00","close":"21:00","off":false},
    "sun":{"open":"09:00","close":"21:00","off":true}
  }',
  prayer_blocks jsonb DEFAULT '{"fajr":false,"zuhr":true,"asr":false,"maghrib":true,"isha":false}',
  created_at timestamptz DEFAULT now()
);

-- 3. STAFF
CREATE TABLE staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid REFERENCES salons(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id),
  name text NOT NULL,
  phone text,
  role text CHECK (role IN ('owner','manager','receptionist','senior_stylist','junior_stylist','helper')) DEFAULT 'junior_stylist',
  photo_url text,
  pin_code text NOT NULL,
  base_salary numeric DEFAULT 0,
  commission_type text CHECK (commission_type IN ('percentage','flat')) DEFAULT 'percentage',
  commission_rate numeric DEFAULT 0,
  join_date date DEFAULT CURRENT_DATE,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 4. SERVICES
CREATE TABLE services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid REFERENCES salons(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text CHECK (category IN ('haircut','color','treatment','facial','waxing','bridal','nails','massage','beard','other')) DEFAULT 'other',
  duration_minutes integer DEFAULT 30,
  base_price numeric NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 5. SERVICE STAFF PRICING (per-stylist price overrides)
CREATE TABLE service_staff_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid REFERENCES services(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES staff(id) ON DELETE CASCADE,
  price numeric NOT NULL,
  UNIQUE(service_id, staff_id)
);

-- 6. CLIENTS
CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid REFERENCES salons(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  whatsapp text,
  gender text CHECK (gender IN ('male','female','other')),
  is_vip boolean DEFAULT false,
  is_blacklisted boolean DEFAULT false,
  notes text,
  hair_notes text,
  allergy_notes text,
  loyalty_points integer DEFAULT 0,
  total_visits integer DEFAULT 0,
  total_spent numeric DEFAULT 0,
  udhaar_balance numeric DEFAULT 0,
  udhaar_limit numeric DEFAULT 5000,
  created_at timestamptz DEFAULT now()
);

-- 7. APPOINTMENTS
CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id),
  salon_id uuid REFERENCES salons(id),
  client_id uuid REFERENCES clients(id),
  staff_id uuid REFERENCES staff(id),
  status text CHECK (status IN ('booked','confirmed','in_progress','done','no_show','cancelled')) DEFAULT 'booked',
  appointment_date date NOT NULL,
  start_time time NOT NULL,
  end_time time,
  token_number integer,
  is_walkin boolean DEFAULT false,
  notes text,
  reminder_sent boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 8. APPOINTMENT SERVICES
CREATE TABLE appointment_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid REFERENCES appointments(id) ON DELETE CASCADE,
  service_id uuid REFERENCES services(id),
  service_name text NOT NULL,
  price numeric NOT NULL,
  duration_minutes integer
);

-- 14. PRODUCTS (created before bills since bill_items references it)
CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid REFERENCES salons(id) ON DELETE CASCADE,
  name text NOT NULL,
  brand text,
  category text,
  unit text DEFAULT 'piece',
  content_per_unit numeric DEFAULT 1,
  content_unit text DEFAULT 'piece',
  inventory_type text CHECK (inventory_type IN ('backbar','retail')) DEFAULT 'backbar',
  purchase_price numeric DEFAULT 0,
  retail_price numeric DEFAULT 0,
  current_stock numeric DEFAULT 0,
  low_stock_threshold numeric DEFAULT 5,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 9. BILLS
CREATE TABLE bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_number text UNIQUE NOT NULL,
  branch_id uuid REFERENCES branches(id),
  salon_id uuid REFERENCES salons(id),
  appointment_id uuid REFERENCES appointments(id),
  client_id uuid REFERENCES clients(id),
  staff_id uuid REFERENCES staff(id),
  subtotal numeric NOT NULL DEFAULT 0,
  discount_amount numeric DEFAULT 0,
  discount_type text CHECK (discount_type IN ('flat','percentage')),
  tax_amount numeric DEFAULT 0,
  tip_amount numeric DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  paid_amount numeric DEFAULT 0,
  payment_method text CHECK (payment_method IN ('cash','jazzcash','easypaisa','bank_transfer','card','udhaar','split')),
  payment_details jsonb,
  udhaar_added numeric DEFAULT 0,
  loyalty_points_used integer DEFAULT 0,
  loyalty_points_earned integer DEFAULT 0,
  promo_code text,
  status text CHECK (status IN ('draft','paid','void','refunded')) DEFAULT 'draft',
  notes text,
  receipt_sent boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 10. BILL ITEMS
CREATE TABLE bill_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id uuid REFERENCES bills(id) ON DELETE CASCADE,
  item_type text CHECK (item_type IN ('service','product')),
  service_id uuid REFERENCES services(id),
  product_id uuid REFERENCES products(id),
  name text NOT NULL,
  quantity integer DEFAULT 1,
  unit_price numeric NOT NULL,
  total_price numeric NOT NULL
);

-- 11. ATTENDANCE
CREATE TABLE attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid REFERENCES staff(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id),
  date date NOT NULL,
  status text CHECK (status IN ('present','absent','late','half_day','leave')) DEFAULT 'present',
  check_in time,
  check_out time,
  late_minutes integer DEFAULT 0,
  deduction_amount numeric DEFAULT 0,
  notes text,
  UNIQUE(staff_id, date)
);

-- 12. ADVANCES
CREATE TABLE advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid REFERENCES staff(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  date date DEFAULT CURRENT_DATE,
  reason text,
  is_deducted boolean DEFAULT false,
  approved_by uuid REFERENCES staff(id),
  created_at timestamptz DEFAULT now()
);

-- 13. TIPS
CREATE TABLE tips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid REFERENCES staff(id) ON DELETE CASCADE,
  bill_id uuid REFERENCES bills(id),
  amount numeric NOT NULL,
  date date DEFAULT CURRENT_DATE
);

-- 15. PRODUCT SERVICE LINKS (backbar auto-deduction)
CREATE TABLE product_service_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  service_id uuid REFERENCES services(id) ON DELETE CASCADE,
  quantity_per_use numeric NOT NULL DEFAULT 1,
  UNIQUE(product_id, service_id)
);

-- 16. STOCK MOVEMENTS
CREATE TABLE stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id),
  movement_type text CHECK (movement_type IN ('purchase','sale','backbar_use','adjustment','transfer_in','transfer_out')),
  quantity numeric NOT NULL,
  reference_id uuid,
  notes text,
  created_by uuid REFERENCES staff(id),
  created_at timestamptz DEFAULT now()
);

-- 17. SUPPLIERS
CREATE TABLE suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid REFERENCES salons(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  udhaar_balance numeric DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- 18. PURCHASE ORDERS
CREATE TABLE purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES suppliers(id),
  branch_id uuid REFERENCES branches(id),
  items jsonb NOT NULL,
  total_amount numeric NOT NULL,
  paid_amount numeric DEFAULT 0,
  status text CHECK (status IN ('pending','received','paid','partial')) DEFAULT 'pending',
  notes text,
  created_at timestamptz DEFAULT now()
);

-- 19. PACKAGES
CREATE TABLE packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid REFERENCES salons(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price numeric NOT NULL,
  validity_days integer DEFAULT 30,
  services jsonb NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 20. CLIENT PACKAGES
CREATE TABLE client_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  package_id uuid REFERENCES packages(id),
  purchase_date date DEFAULT CURRENT_DATE,
  expiry_date date,
  services_remaining jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 21. PROMO CODES
CREATE TABLE promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid REFERENCES salons(id) ON DELETE CASCADE,
  code text NOT NULL,
  discount_type text CHECK (discount_type IN ('flat','percentage')),
  discount_value numeric NOT NULL,
  min_bill_amount numeric DEFAULT 0,
  max_uses integer,
  used_count integer DEFAULT 0,
  expiry_date date,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 22. LOYALTY RULES
CREATE TABLE loyalty_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid REFERENCES salons(id) UNIQUE,
  points_per_100_pkr integer DEFAULT 10,
  pkr_per_point_redemption numeric DEFAULT 0.5,
  birthday_bonus_multiplier integer DEFAULT 2
);

-- 23. CASH DRAWERS
CREATE TABLE cash_drawers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id),
  date date NOT NULL,
  opening_balance numeric DEFAULT 0,
  closing_balance numeric,
  total_cash_sales numeric DEFAULT 0,
  total_expenses numeric DEFAULT 0,
  opened_by uuid REFERENCES staff(id),
  closed_by uuid REFERENCES staff(id),
  status text CHECK (status IN ('open','closed')) DEFAULT 'open',
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(branch_id, date)
);

-- 24. EXPENSES
CREATE TABLE expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id),
  category text,
  amount numeric NOT NULL,
  description text,
  date date DEFAULT CURRENT_DATE,
  created_by uuid REFERENCES staff(id),
  created_at timestamptz DEFAULT now()
);

-- 25. UDHAAR PAYMENTS
CREATE TABLE udhaar_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id),
  amount numeric NOT NULL,
  payment_method text,
  notes text,
  recorded_by uuid REFERENCES staff(id),
  created_at timestamptz DEFAULT now()
);


-- ═══════════════════════════════════════
-- INDEXES (for performance)
-- ═══════════════════════════════════════
CREATE INDEX idx_appointments_branch_date ON appointments(branch_id, appointment_date);
CREATE INDEX idx_appointments_client ON appointments(client_id);
CREATE INDEX idx_bills_branch_created ON bills(branch_id, created_at);
CREATE INDEX idx_clients_salon_phone ON clients(salon_id, phone);
CREATE INDEX idx_staff_salon_pin ON staff(salon_id, pin_code);
CREATE INDEX idx_attendance_staff_date ON attendance(staff_id, date);
CREATE INDEX idx_bills_salon_status ON bills(salon_id, status);
CREATE INDEX idx_appointments_staff_date ON appointments(staff_id, appointment_date);
CREATE INDEX idx_stock_movements_product ON stock_movements(product_id, created_at);
CREATE INDEX idx_bill_items_bill ON bill_items(bill_id);


-- ═══════════════════════════════════════
-- ENABLE RLS ON ALL TABLES
-- ═══════════════════════════════════════
ALTER TABLE salons ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_staff_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_service_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_drawers ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE udhaar_payments ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════
-- RLS POLICIES
-- Salon owners can access all rows in their salon
-- ═══════════════════════════════════════

-- Salons: owner can manage their own salon
CREATE POLICY "Salon owners can view their salon"
  ON salons FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Salon owners can update their salon"
  ON salons FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "Users can create salons"
  ON salons FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- Helper function to get salon_id for current user
CREATE OR REPLACE FUNCTION get_user_salon_id()
RETURNS uuid AS $$
  SELECT id FROM salons WHERE owner_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Macro for salon-scoped tables
-- Branches
CREATE POLICY "Salon members can view branches"
  ON branches FOR SELECT
  USING (salon_id = get_user_salon_id());

CREATE POLICY "Salon owners can manage branches"
  ON branches FOR ALL
  USING (salon_id = get_user_salon_id());

-- Staff
CREATE POLICY "Salon members can view staff"
  ON staff FOR SELECT
  USING (salon_id = get_user_salon_id());

CREATE POLICY "Salon owners can manage staff"
  ON staff FOR ALL
  USING (salon_id = get_user_salon_id());

-- Services
CREATE POLICY "Salon members can view services"
  ON services FOR SELECT
  USING (salon_id = get_user_salon_id());

CREATE POLICY "Salon owners can manage services"
  ON services FOR ALL
  USING (salon_id = get_user_salon_id());

-- Service Staff Pricing
CREATE POLICY "Salon members can view pricing"
  ON service_staff_pricing FOR SELECT
  USING (
    service_id IN (SELECT id FROM services WHERE salon_id = get_user_salon_id())
  );

CREATE POLICY "Salon owners can manage pricing"
  ON service_staff_pricing FOR ALL
  USING (
    service_id IN (SELECT id FROM services WHERE salon_id = get_user_salon_id())
  );

-- Clients
CREATE POLICY "Salon members can view clients"
  ON clients FOR SELECT
  USING (salon_id = get_user_salon_id());

CREATE POLICY "Salon owners can manage clients"
  ON clients FOR ALL
  USING (salon_id = get_user_salon_id());

-- Appointments
CREATE POLICY "Salon members can view appointments"
  ON appointments FOR SELECT
  USING (salon_id = get_user_salon_id());

CREATE POLICY "Salon owners can manage appointments"
  ON appointments FOR ALL
  USING (salon_id = get_user_salon_id());

-- Appointment Services
CREATE POLICY "Salon members can view appointment services"
  ON appointment_services FOR SELECT
  USING (
    appointment_id IN (SELECT id FROM appointments WHERE salon_id = get_user_salon_id())
  );

CREATE POLICY "Salon owners can manage appointment services"
  ON appointment_services FOR ALL
  USING (
    appointment_id IN (SELECT id FROM appointments WHERE salon_id = get_user_salon_id())
  );

-- Bills
CREATE POLICY "Salon members can view bills"
  ON bills FOR SELECT
  USING (salon_id = get_user_salon_id());

CREATE POLICY "Salon owners can manage bills"
  ON bills FOR ALL
  USING (salon_id = get_user_salon_id());

-- Bill Items
CREATE POLICY "Salon members can view bill items"
  ON bill_items FOR SELECT
  USING (
    bill_id IN (SELECT id FROM bills WHERE salon_id = get_user_salon_id())
  );

CREATE POLICY "Salon owners can manage bill items"
  ON bill_items FOR ALL
  USING (
    bill_id IN (SELECT id FROM bills WHERE salon_id = get_user_salon_id())
  );

-- Attendance
CREATE POLICY "Salon members can view attendance"
  ON attendance FOR SELECT
  USING (
    staff_id IN (SELECT id FROM staff WHERE salon_id = get_user_salon_id())
  );

CREATE POLICY "Salon owners can manage attendance"
  ON attendance FOR ALL
  USING (
    staff_id IN (SELECT id FROM staff WHERE salon_id = get_user_salon_id())
  );

-- Advances
CREATE POLICY "Salon members can view advances"
  ON advances FOR SELECT
  USING (
    staff_id IN (SELECT id FROM staff WHERE salon_id = get_user_salon_id())
  );

CREATE POLICY "Salon owners can manage advances"
  ON advances FOR ALL
  USING (
    staff_id IN (SELECT id FROM staff WHERE salon_id = get_user_salon_id())
  );

-- Tips
CREATE POLICY "Salon members can view tips"
  ON tips FOR SELECT
  USING (
    staff_id IN (SELECT id FROM staff WHERE salon_id = get_user_salon_id())
  );

CREATE POLICY "Salon owners can manage tips"
  ON tips FOR ALL
  USING (
    staff_id IN (SELECT id FROM staff WHERE salon_id = get_user_salon_id())
  );

-- Products
CREATE POLICY "Salon members can view products"
  ON products FOR SELECT
  USING (salon_id = get_user_salon_id());

CREATE POLICY "Salon owners can manage products"
  ON products FOR ALL
  USING (salon_id = get_user_salon_id());

-- Product Service Links
CREATE POLICY "Salon members can view product service links"
  ON product_service_links FOR SELECT
  USING (
    product_id IN (SELECT id FROM products WHERE salon_id = get_user_salon_id())
  );

CREATE POLICY "Salon owners can manage product service links"
  ON product_service_links FOR ALL
  USING (
    product_id IN (SELECT id FROM products WHERE salon_id = get_user_salon_id())
  );

-- Stock Movements
CREATE POLICY "Salon members can view stock movements"
  ON stock_movements FOR SELECT
  USING (
    product_id IN (SELECT id FROM products WHERE salon_id = get_user_salon_id())
  );

CREATE POLICY "Salon owners can manage stock movements"
  ON stock_movements FOR ALL
  USING (
    product_id IN (SELECT id FROM products WHERE salon_id = get_user_salon_id())
  );

-- Suppliers
CREATE POLICY "Salon members can view suppliers"
  ON suppliers FOR SELECT
  USING (salon_id = get_user_salon_id());

CREATE POLICY "Salon owners can manage suppliers"
  ON suppliers FOR ALL
  USING (salon_id = get_user_salon_id());

-- Purchase Orders
CREATE POLICY "Salon members can view purchase orders"
  ON purchase_orders FOR SELECT
  USING (
    branch_id IN (SELECT id FROM branches WHERE salon_id = get_user_salon_id())
  );

CREATE POLICY "Salon owners can manage purchase orders"
  ON purchase_orders FOR ALL
  USING (
    branch_id IN (SELECT id FROM branches WHERE salon_id = get_user_salon_id())
  );

-- Packages
CREATE POLICY "Salon members can view packages"
  ON packages FOR SELECT
  USING (salon_id = get_user_salon_id());

CREATE POLICY "Salon owners can manage packages"
  ON packages FOR ALL
  USING (salon_id = get_user_salon_id());

-- Client Packages
CREATE POLICY "Salon members can view client packages"
  ON client_packages FOR SELECT
  USING (
    client_id IN (SELECT id FROM clients WHERE salon_id = get_user_salon_id())
  );

CREATE POLICY "Salon owners can manage client packages"
  ON client_packages FOR ALL
  USING (
    client_id IN (SELECT id FROM clients WHERE salon_id = get_user_salon_id())
  );

-- Promo Codes
CREATE POLICY "Salon members can view promo codes"
  ON promo_codes FOR SELECT
  USING (salon_id = get_user_salon_id());

CREATE POLICY "Salon owners can manage promo codes"
  ON promo_codes FOR ALL
  USING (salon_id = get_user_salon_id());

-- Loyalty Rules
CREATE POLICY "Salon members can view loyalty rules"
  ON loyalty_rules FOR SELECT
  USING (salon_id = get_user_salon_id());

CREATE POLICY "Salon owners can manage loyalty rules"
  ON loyalty_rules FOR ALL
  USING (salon_id = get_user_salon_id());

-- Cash Drawers
CREATE POLICY "Salon members can view cash drawers"
  ON cash_drawers FOR SELECT
  USING (
    branch_id IN (SELECT id FROM branches WHERE salon_id = get_user_salon_id())
  );

CREATE POLICY "Salon owners can manage cash drawers"
  ON cash_drawers FOR ALL
  USING (
    branch_id IN (SELECT id FROM branches WHERE salon_id = get_user_salon_id())
  );

-- Expenses
CREATE POLICY "Salon members can view expenses"
  ON expenses FOR SELECT
  USING (
    branch_id IN (SELECT id FROM branches WHERE salon_id = get_user_salon_id())
  );

CREATE POLICY "Salon owners can manage expenses"
  ON expenses FOR ALL
  USING (
    branch_id IN (SELECT id FROM branches WHERE salon_id = get_user_salon_id())
  );

-- Udhaar Payments
CREATE POLICY "Salon members can view udhaar payments"
  ON udhaar_payments FOR SELECT
  USING (
    client_id IN (SELECT id FROM clients WHERE salon_id = get_user_salon_id())
  );

CREATE POLICY "Salon owners can manage udhaar payments"
  ON udhaar_payments FOR ALL
  USING (
    client_id IN (SELECT id FROM clients WHERE salon_id = get_user_salon_id())
  );


-- ═══════════════════════════════════════
-- RPC FUNCTIONS
-- ═══════════════════════════════════════

-- 1. get_daily_summary
CREATE OR REPLACE FUNCTION get_daily_summary(p_branch_id uuid, p_date date)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_revenue', COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid'), 0),
    'total_bills', COUNT(*) FILTER (WHERE status = 'paid'),
    'cash_amount', COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid' AND payment_method = 'cash'), 0),
    'jazzcash_amount', COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid' AND payment_method = 'jazzcash'), 0),
    'easypaisa_amount', COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid' AND payment_method = 'easypaisa'), 0),
    'card_amount', COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid' AND payment_method = 'card'), 0),
    'bank_transfer_amount', COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid' AND payment_method = 'bank_transfer'), 0),
    'udhaar_amount', COALESCE(SUM(udhaar_added) FILTER (WHERE status = 'paid'), 0)
  ) INTO result
  FROM bills
  WHERE branch_id = p_branch_id
    AND created_at::date = p_date;

  -- Add top services
  result := result || jsonb_build_object('top_services', (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT bi.name, COUNT(*) as count, SUM(bi.total_price) as revenue
      FROM bill_items bi
      JOIN bills b ON b.id = bi.bill_id
      WHERE b.branch_id = p_branch_id
        AND b.created_at::date = p_date
        AND b.status = 'paid'
        AND bi.item_type = 'service'
      GROUP BY bi.name
      ORDER BY revenue DESC
      LIMIT 5
    ) t
  ));

  -- Add staff performance
  result := result || jsonb_build_object('staff_performance', (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT s.name, COUNT(b.id) as services_done, SUM(b.total_amount) as revenue
      FROM bills b
      JOIN staff s ON s.id = b.staff_id
      WHERE b.branch_id = p_branch_id
        AND b.created_at::date = p_date
        AND b.status = 'paid'
      GROUP BY s.id, s.name
      ORDER BY revenue DESC
    ) t
  ));

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. get_staff_monthly_commission
CREATE OR REPLACE FUNCTION get_staff_monthly_commission(p_staff_id uuid, p_month int, p_year int)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
  v_staff staff%ROWTYPE;
BEGIN
  SELECT * INTO v_staff FROM staff WHERE id = p_staff_id;

  SELECT jsonb_build_object(
    'services_count', COUNT(b.id),
    'total_revenue', COALESCE(SUM(b.total_amount), 0),
    'commission_earned', CASE
      WHEN v_staff.commission_type = 'percentage'
        THEN COALESCE(SUM(b.total_amount) * v_staff.commission_rate / 100, 0)
      ELSE COALESCE(COUNT(b.id) * v_staff.commission_rate, 0)
    END,
    'tips_total', COALESCE((
      SELECT SUM(amount) FROM tips
      WHERE staff_id = p_staff_id
        AND EXTRACT(MONTH FROM date) = p_month
        AND EXTRACT(YEAR FROM date) = p_year
    ), 0),
    'advances_total', COALESCE((
      SELECT SUM(amount) FROM advances
      WHERE staff_id = p_staff_id
        AND EXTRACT(MONTH FROM date) = p_month
        AND EXTRACT(YEAR FROM date) = p_year
        AND is_deducted = false
    ), 0),
    'late_deductions', COALESCE((
      SELECT SUM(deduction_amount) FROM attendance
      WHERE staff_id = p_staff_id
        AND EXTRACT(MONTH FROM date) = p_month
        AND EXTRACT(YEAR FROM date) = p_year
    ), 0)
  ) INTO result
  FROM bills b
  WHERE b.staff_id = p_staff_id
    AND b.status = 'paid'
    AND EXTRACT(MONTH FROM b.created_at) = p_month
    AND EXTRACT(YEAR FROM b.created_at) = p_year;

  -- Calculate net payable
  result := result || jsonb_build_object(
    'net_payable',
    v_staff.base_salary
    + (result->>'commission_earned')::numeric
    + (result->>'tips_total')::numeric
    - (result->>'advances_total')::numeric
    - (result->>'late_deductions')::numeric
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. get_udhaar_report
CREATE OR REPLACE FUNCTION get_udhaar_report(p_salon_id uuid)
RETURNS jsonb AS $$
BEGIN
  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT
        c.id,
        c.name as client_name,
        c.phone,
        c.udhaar_balance,
        (SELECT MAX(a.appointment_date) FROM appointments a WHERE a.client_id = c.id) as last_visit,
        CURRENT_DATE - (SELECT MAX(a.appointment_date) FROM appointments a WHERE a.client_id = c.id) as days_since_visit
      FROM clients c
      WHERE c.salon_id = p_salon_id
        AND c.udhaar_balance > 0
      ORDER BY c.udhaar_balance DESC
    ) t
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. get_client_stats
CREATE OR REPLACE FUNCTION get_client_stats(p_client_id uuid)
RETURNS jsonb AS $$
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'total_visits', c.total_visits,
      'total_spent', c.total_spent,
      'loyalty_points', c.loyalty_points,
      'favourite_service', (
        SELECT bi.name
        FROM bill_items bi
        JOIN bills b ON b.id = bi.bill_id
        WHERE b.client_id = p_client_id AND bi.item_type = 'service'
        GROUP BY bi.name
        ORDER BY COUNT(*) DESC
        LIMIT 1
      ),
      'favourite_stylist', (
        SELECT s.name
        FROM bills b
        JOIN staff s ON s.id = b.staff_id
        WHERE b.client_id = p_client_id AND b.status = 'paid'
        GROUP BY s.id, s.name
        ORDER BY COUNT(*) DESC
        LIMIT 1
      ),
      'last_visit_date', (
        SELECT MAX(appointment_date)
        FROM appointments
        WHERE client_id = p_client_id
      )
    )
    FROM clients c
    WHERE c.id = p_client_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
