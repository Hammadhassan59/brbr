-- 024_tighten_rls.sql
--
-- Closes the cross-tenant data leak introduced by migration 005, which added
-- 49 wide-open `TO anon USING (true)` policies as a workaround for staff and
-- partners who didn't yet have Supabase Auth accounts. Migrations 010 and 012
-- moved everyone to email auth, so those workaround policies are now dead
-- weight that lets anyone with the public anon key read every salon's data.
--
-- This migration:
--   1. Adds proper authenticated-scope policies on the agent tables
--      (sales_agents, agent_commissions, agent_payouts, leads) — they had RLS
--      enabled but ZERO policies, which currently denies all client-side
--      access. Server actions use service-role and bypass RLS, so the agent
--      dashboard never noticed. These additions are defense-in-depth in case
--      anything ever queries those tables client-side.
--   2. Adds a salon-members SELECT policy on `salons` so authenticated staff
--      and partners can read their own salon row directly (today they could
--      only read it via the now-removed anon path, or via a server action).
--   3. Drops every wide-open `TO anon` policy programmatically.
--
-- Server actions are unaffected — they keep using the service-role key.
-- Authenticated client-side reads continue to work via the existing
-- `salon_id = get_user_salon_id()` policies that have been in place since
-- migration 001.

-- ─── Agent table policies (additive, defense-in-depth) ───

DO $$ BEGIN
  CREATE POLICY "Agents can view own row" ON sales_agents
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Agents can view own commissions" ON agent_commissions
    FOR SELECT TO authenticated
    USING (agent_id IN (SELECT id FROM sales_agents WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Agents can view own payouts" ON agent_payouts
    FOR SELECT TO authenticated
    USING (agent_id IN (SELECT id FROM sales_agents WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Agents can view assigned leads" ON leads
    FOR SELECT TO authenticated
    USING (assigned_agent_id IN (SELECT id FROM sales_agents WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Agents can update assigned leads" ON leads
    FOR UPDATE TO authenticated
    USING (assigned_agent_id IN (SELECT id FROM sales_agents WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Salon row visibility for staff/partners ───
-- The original "Salon owners can view their salon" policy only matches
-- owner_id = uid(). Without an anon fallback, staff/partners couldn't read
-- their own salon row directly. get_user_salon_id() (defined in 001, fixed
-- in 012) already handles all three categories, so this one policy covers
-- all three uniformly.
DO $$ BEGIN
  CREATE POLICY "Salon members can view their salon" ON salons
    FOR SELECT TO authenticated
    USING (id = get_user_salon_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Drop every wide-open anon policy ───
-- Programmatic drop catches any anon policy regardless of which migration
-- introduced it. We keep policies for any other roles intact.
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND roles = '{anon}'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
      pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;
