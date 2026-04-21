-- 054_hot_path_indexes.sql
-- Four partial indexes that cover the hottest read paths I'd otherwise
-- see sequential-scan as the tenant count grows. All are partial on the
-- "open" predicate so the index stays small and only indexes the rows
-- that matter for each query.
--
-- None of these add write-path overhead beyond a few hundred bytes per
-- insert/update on the covered tables. Sizes at 1 salon baseline: all <8kB.

-- 1. No-show sweeper (src/app/actions/appointments.ts sweepNoShowsInternal)
-- Query: WHERE status IN ('booked','confirmed') AND end_time IS NOT NULL
--        AND (appointment_date < today) OR (appointment_date = today AND end_time < cutoff)
CREATE INDEX CONCURRENTLY IF NOT EXISTS appointments_open_status_idx
  ON appointments(appointment_date, end_time)
  WHERE status IN ('booked', 'confirmed') AND end_time IS NOT NULL;

-- 2. Agent performance metrics (src/app/actions/agent-performance.ts)
-- Query: WHERE agent_id = X AND kind IN ('first_sale','renewal') AND status IN ('approved','paid')
CREATE INDEX CONCURRENTLY IF NOT EXISTS agent_commissions_agent_kind_status_idx
  ON agent_commissions(agent_id, kind, status)
  WHERE status IN ('approved', 'paid');

-- 3. Agency analytics + bonus evaluator (src/app/actions/admin.ts getAdminAnalytics)
-- Query: WHERE agency_id = X AND kind IN (...) AND status IN ('approved','paid')
CREATE INDEX CONCURRENTLY IF NOT EXISTS agency_commissions_agency_kind_status_idx
  ON agency_commissions(agency_id, kind, status)
  WHERE status IN ('approved', 'paid');

-- 4. Agency bonus anchor lookup (src/app/actions/agency-bonus-tiers.ts evaluator)
-- Query: WHERE collected_by_agency_id = X AND status = 'approved' ORDER BY created_at DESC LIMIT 1
CREATE INDEX CONCURRENTLY IF NOT EXISTS payment_requests_agency_anchor_idx
  ON payment_requests(collected_by_agency_id, created_at DESC)
  WHERE collected_by_agency_id IS NOT NULL AND status = 'approved';
