-- =============================================================================
-- 043_branches_admin_block_column.sql
--
-- Adds the missing `branches.marketplace_admin_blocked_at` column that the
-- query layer (`src/lib/marketplace/queries.ts`) and listing select shapes
-- reference. Migration 041 only added the admin-block column to `salons`,
-- but the query layer was written assuming a matching branch-level column
-- existed — so the listing queries error against real prod (`column "marketplace_admin_blocked_at" does not exist`),
-- causing directory pages to show "No salons" despite healthy data.
--
-- Semantics: a non-null value on a branch row hides just that branch. The
-- salon-level column (applied by migration 041) hides every branch of that
-- salon. Both are enforced by the query layer via separate `.is(..., null)`
-- predicates.
--
-- Date:          2026-04-18
-- Dependencies:  041_marketplace_groundwork.sql
-- =============================================================================

BEGIN;

ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS marketplace_admin_blocked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_branches_admin_blocked
  ON branches (marketplace_admin_blocked_at)
  WHERE marketplace_admin_blocked_at IS NOT NULL;

COMMIT;
