-- 023_agent_codes.sql
-- Add a short, human-friendly code (e.g. SA342) to sales_agents so that
-- self-registering tenants can credit a sales agent during signup without
-- needing to know the agent's UUID. Codes are generated server-side, unique,
-- and never edited by hand.

-- 1. Generator: SA + 3 digits, retry on collision. Fully self-contained so it
--    can be used as a column DEFAULT and as the backfill source in step 3.
CREATE OR REPLACE FUNCTION generate_agent_code() RETURNS text AS $$
DECLARE
  candidate text;
  attempts int := 0;
BEGIN
  LOOP
    candidate := 'SA' || lpad((floor(random() * 1000))::int::text, 3, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM sales_agents WHERE code = candidate);
    attempts := attempts + 1;
    IF attempts > 100 THEN
      RAISE EXCEPTION 'Could not generate unique agent code after 100 attempts (codespace exhausted?)';
    END IF;
  END LOOP;
  RETURN candidate;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 2. Add nullable column so the backfill update can run.
ALTER TABLE sales_agents ADD COLUMN IF NOT EXISTS code text;

-- 3. Backfill: existing agents get a code. Per-row UPDATE so the function
--    sees its own prior writes and avoids generating duplicates.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM sales_agents WHERE code IS NULL LOOP
    UPDATE sales_agents SET code = generate_agent_code() WHERE id = r.id;
  END LOOP;
END $$;

-- 4. Lock down: NOT NULL + UNIQUE + DEFAULT for new inserts.
ALTER TABLE sales_agents ALTER COLUMN code SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE sales_agents ADD CONSTRAINT sales_agents_code_unique UNIQUE (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE sales_agents ALTER COLUMN code SET DEFAULT generate_agent_code();

CREATE INDEX IF NOT EXISTS sales_agents_code_idx ON sales_agents(code);
