-- =============================================================================
-- 045_drop_demo_infra.sql
--
-- Remove the shared demo salon + demo sales agent infrastructure added by
-- migrations 032 and 033. All demo DB rows are deleted separately BEFORE
-- this migration runs (see notes in project_deploy_log.md for the 2026-04-20
-- demo wipe). This migration just cleans the schema:
--
--   1. Rewrite public.get_user_salon_id() to drop the demo-agent branch
--      (extension added in 033). Must run FIRST so the subsequent DROP
--      COLUMN calls don't fail on a function reference.
--   2. Drop salons.is_demo (added in 032).
--   3. Drop sales_agents.is_demo (added in 032).
--   4. Indexes on those columns are dropped automatically by Postgres when
--      the column goes.
--
-- Date:          2026-04-20
-- Dependencies:  032_demo_salon.sql, 033_demo_salon_rls_and_product_commission.sql
-- =============================================================================

BEGIN;

-- Rewrite function: remove the demo-sales-agent resolution branch. The
-- remaining three UNION ALL clauses are the original pre-033 body: owner,
-- staff, partner.
CREATE OR REPLACE FUNCTION public.get_user_salon_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT id FROM salons WHERE owner_id = auth.uid()
  UNION ALL
  SELECT salon_id FROM staff WHERE auth_user_id = auth.uid() AND is_active = true
  UNION ALL
  SELECT salon_id FROM salon_partners WHERE auth_user_id = auth.uid() AND is_active = true
  LIMIT 1;
$function$;

ALTER TABLE salons        DROP COLUMN IF EXISTS is_demo;
ALTER TABLE sales_agents  DROP COLUMN IF EXISTS is_demo;

COMMIT;
