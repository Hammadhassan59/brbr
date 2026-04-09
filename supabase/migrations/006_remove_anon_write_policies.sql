-- ═══════════════════════════════════════
-- BrBr Migration 006: Remove anon write policies
-- Writes now go through server actions using service role.
-- Keep SELECT policies for client-side reads.
-- ═══════════════════════════════════════

DROP POLICY IF EXISTS "Anon can manage branches by salon" ON branches;
DROP POLICY IF EXISTS "Anon can manage staff by salon" ON staff;
DROP POLICY IF EXISTS "Anon can manage services by salon" ON services;
DROP POLICY IF EXISTS "Anon can manage pricing" ON service_staff_pricing;
DROP POLICY IF EXISTS "Anon can manage clients by salon" ON clients;
DROP POLICY IF EXISTS "Anon can manage appointments by salon" ON appointments;
DROP POLICY IF EXISTS "Anon can manage appointment services" ON appointment_services;
DROP POLICY IF EXISTS "Anon can manage bills by salon" ON bills;
DROP POLICY IF EXISTS "Anon can manage bill items" ON bill_items;
DROP POLICY IF EXISTS "Anon can manage attendance" ON attendance;
DROP POLICY IF EXISTS "Anon can manage advances" ON advances;
DROP POLICY IF EXISTS "Anon can manage tips" ON tips;
DROP POLICY IF EXISTS "Anon can manage products by salon" ON products;
DROP POLICY IF EXISTS "Anon can manage product service links" ON product_service_links;
DROP POLICY IF EXISTS "Anon can manage stock movements" ON stock_movements;
DROP POLICY IF EXISTS "Anon can manage suppliers by salon" ON suppliers;
DROP POLICY IF EXISTS "Anon can manage purchase orders" ON purchase_orders;
DROP POLICY IF EXISTS "Anon can manage packages by salon" ON packages;
DROP POLICY IF EXISTS "Anon can manage client packages" ON client_packages;
DROP POLICY IF EXISTS "Anon can manage promo codes by salon" ON promo_codes;
DROP POLICY IF EXISTS "Anon can manage loyalty rules by salon" ON loyalty_rules;
DROP POLICY IF EXISTS "Anon can manage cash drawers" ON cash_drawers;
DROP POLICY IF EXISTS "Anon can manage expenses" ON expenses;
DROP POLICY IF EXISTS "Anon can manage udhaar payments" ON udhaar_payments;
DROP POLICY IF EXISTS "Anon can view salon partners" ON salon_partners;
