-- ═══════════════════════════════════════
-- iCut Migration 012: Fix RLS for staff/partner auth
--
-- After migration 010 switched to email auth, staff and partners now
-- have real Supabase Auth accounts. When they sign in, the Supabase
-- client uses the 'authenticated' role (not 'anon'). But
-- get_user_salon_id() only checked salons.owner_id, so it returned
-- NULL for staff/partners, making all data invisible to them.
--
-- Fix: update get_user_salon_id() to also check staff.auth_user_id
-- and salon_partners.auth_user_id.
-- ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION get_user_salon_id()
RETURNS uuid AS $$
  -- 1. Check if user is a salon owner
  SELECT id FROM salons WHERE owner_id = auth.uid()
  UNION ALL
  -- 2. Check if user is a staff member
  SELECT salon_id FROM staff WHERE auth_user_id = auth.uid() AND is_active = true
  UNION ALL
  -- 3. Check if user is a partner
  SELECT salon_id FROM salon_partners WHERE auth_user_id = auth.uid() AND is_active = true
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;
