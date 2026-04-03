-- Fix infinite recursion in salon_partners RLS policy
-- Partners use custom phone+PIN auth (not Supabase Auth), so RLS
-- should only gate on the salon owner's auth.uid()

DROP POLICY IF EXISTS "Partners can view own salon partners" ON salon_partners;

-- Salon owners can view and manage their partners
CREATE POLICY "Owners can view salon partners"
  ON salon_partners FOR SELECT
  USING (salon_id IN (
    SELECT id FROM salons WHERE owner_id = auth.uid()
  ));

CREATE POLICY "Owners can manage salon partners"
  ON salon_partners FOR ALL
  USING (salon_id IN (
    SELECT id FROM salons WHERE owner_id = auth.uid()
  ));
