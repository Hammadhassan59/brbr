-- 027_demo_agent_pairs.sql
--
-- Each real sales_agents row gains a paired demo identity. The demo lives in
-- the same table with is_demo=true and parent_agent_id pointing at the real
-- agent. Cascade delete on the FK so cleaning up a real agent also cleans up
-- their demo. Cascade DEACTIVATION (active=false) is handled in app code via
-- setAgentActive() — Postgres FK cascades only fire on DELETE, not UPDATE.

ALTER TABLE sales_agents
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_agent_id uuid
    REFERENCES sales_agents(id) ON DELETE CASCADE;

-- A real agent has at most one demo. Partial unique index lets us enforce
-- this without affecting non-demo rows where parent_agent_id is NULL.
CREATE UNIQUE INDEX IF NOT EXISTS sales_agents_one_demo_per_parent_idx
  ON sales_agents(parent_agent_id) WHERE is_demo;

CREATE INDEX IF NOT EXISTS sales_agents_is_demo_idx
  ON sales_agents(is_demo) WHERE active;
