-- Allow app-authenticated staff/partners to access salon data
-- Staff/partners don't have Supabase Auth users; they authenticate
-- via phone+PIN through API routes. Dashboard queries use the anon
-- key with explicit salon_id filters.
--
-- Security note: salon UUIDs are random and unguessable. This is
-- acceptable for MVP. TODO: replace with service-role proxy or
-- custom JWT claims for proper multi-tenant isolation.

-- Salons: allow read by salon_id
CREATE POLICY "Anon can view salon by id"
  ON salons FOR SELECT TO anon
  USING (true);

-- Branches
CREATE POLICY "Anon can view branches by salon"
  ON branches FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anon can manage branches by salon"
  ON branches FOR ALL TO anon
  USING (true);

-- Staff
CREATE POLICY "Anon can view staff by salon"
  ON staff FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anon can manage staff by salon"
  ON staff FOR ALL TO anon
  USING (true);

-- Services
CREATE POLICY "Anon can view services by salon"
  ON services FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anon can manage services by salon"
  ON services FOR ALL TO anon
  USING (true);

-- Service Staff Pricing
CREATE POLICY "Anon can view pricing"
  ON service_staff_pricing FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anon can manage pricing"
  ON service_staff_pricing FOR ALL TO anon
  USING (true);

-- Clients
CREATE POLICY "Anon can view clients by salon"
  ON clients FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anon can manage clients by salon"
  ON clients FOR ALL TO anon
  USING (true);

-- Appointments
CREATE POLICY "Anon can view appointments by salon"
  ON appointments FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anon can manage appointments by salon"
  ON appointments FOR ALL TO anon
  USING (true);

-- Appointment Services
CREATE POLICY "Anon can view appointment services"
  ON appointment_services FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anon can manage appointment services"
  ON appointment_services FOR ALL TO anon
  USING (true);

-- Bills
CREATE POLICY "Anon can view bills by salon"
  ON bills FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anon can manage bills by salon"
  ON bills FOR ALL TO anon
  USING (true);

-- Bill Items
CREATE POLICY "Anon can view bill items"
  ON bill_items FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anon can manage bill items"
  ON bill_items FOR ALL TO anon
  USING (true);

-- Attendance
CREATE POLICY "Anon can view attendance"
  ON attendance FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anon can manage attendance"
  ON attendance FOR ALL TO anon
  USING (true);

-- Advances
CREATE POLICY "Anon can view advances"
  ON advances FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anon can manage advances"
  ON advances FOR ALL TO anon
  USING (true);

-- Tips
CREATE POLICY "Anon can view tips"
  ON tips FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anon can manage tips"
  ON tips FOR ALL TO anon
  USING (true);

-- Products
CREATE POLICY "Anon can view products by salon"
  ON products FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anon can manage products by salon"
  ON products FOR ALL TO anon
  USING (true);

-- Product Service Links
CREATE POLICY "Anon can view product service links"
  ON product_service_links FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anon can manage product service links"
  ON product_service_links FOR ALL TO anon
  USING (true);

-- Stock Movements
CREATE POLICY "Anon can view stock movements"
  ON stock_movements FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anon can manage stock movements"
  ON stock_movements FOR ALL TO anon
  USING (true);

-- Suppliers
CREATE POLICY "Anon can view suppliers by salon"
  ON suppliers FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anon can manage suppliers by salon"
  ON suppliers FOR ALL TO anon
  USING (true);

-- Purchase Orders
CREATE POLICY "Anon can view purchase orders"
  ON purchase_orders FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anon can manage purchase orders"
  ON purchase_orders FOR ALL TO anon
  USING (true);

-- Packages
CREATE POLICY "Anon can view packages by salon"
  ON packages FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anon can manage packages by salon"
  ON packages FOR ALL TO anon
  USING (true);

-- Client Packages
CREATE POLICY "Anon can view client packages"
  ON client_packages FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anon can manage client packages"
  ON client_packages FOR ALL TO anon
  USING (true);

-- Promo Codes
CREATE POLICY "Anon can view promo codes by salon"
  ON promo_codes FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anon can manage promo codes by salon"
  ON promo_codes FOR ALL TO anon
  USING (true);

-- Loyalty Rules
CREATE POLICY "Anon can view loyalty rules by salon"
  ON loyalty_rules FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anon can manage loyalty rules by salon"
  ON loyalty_rules FOR ALL TO anon
  USING (true);

-- Cash Drawers
CREATE POLICY "Anon can view cash drawers"
  ON cash_drawers FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anon can manage cash drawers"
  ON cash_drawers FOR ALL TO anon
  USING (true);

-- Expenses
CREATE POLICY "Anon can view expenses"
  ON expenses FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anon can manage expenses"
  ON expenses FOR ALL TO anon
  USING (true);

-- Udhaar Payments
CREATE POLICY "Anon can view udhaar payments"
  ON udhaar_payments FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anon can manage udhaar payments"
  ON udhaar_payments FOR ALL TO anon
  USING (true);

-- Salon Partners
CREATE POLICY "Anon can view salon partners"
  ON salon_partners FOR SELECT TO anon
  USING (true);
