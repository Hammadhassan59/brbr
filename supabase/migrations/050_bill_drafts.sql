-- 050_bill_drafts.sql
-- Park/retrieve for the POS: operators can save the current cart as a draft,
-- start another bill, and pick the draft back up later. Stored as a JSON
-- blob so the UI can round-trip items / discounts / tip / selected client
-- without a per-field schema. Separate table from `bills` so unpaid drafts
-- never leak into reports, analytics, cash-drawer, or commission accruals.

CREATE TABLE IF NOT EXISTS bill_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  created_by_staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  label text,                                      -- e.g. client name or "Walk-in"
  state jsonb NOT NULL,                            -- serialized POS cart state
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bill_drafts_branch_idx ON bill_drafts(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bill_drafts_salon_idx ON bill_drafts(salon_id);
ALTER TABLE bill_drafts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION bill_drafts_set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;
DROP TRIGGER IF EXISTS bill_drafts_updated_at ON bill_drafts;
CREATE TRIGGER bill_drafts_updated_at
  BEFORE UPDATE ON bill_drafts
  FOR EACH ROW EXECUTE FUNCTION bill_drafts_set_updated_at();

-- RLS — scoped to caller's salon via the standard helper. Writes gate on
-- both the current row (USING) and the incoming row (WITH CHECK).
DO $$ BEGIN
  CREATE POLICY "Salon members view drafts" ON bill_drafts
    FOR SELECT TO authenticated USING (salon_id = get_user_salon_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Salon members insert drafts" ON bill_drafts
    FOR INSERT TO authenticated WITH CHECK (salon_id = get_user_salon_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Salon members update drafts" ON bill_drafts
    FOR UPDATE TO authenticated USING (salon_id = get_user_salon_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Salon members delete drafts" ON bill_drafts
    FOR DELETE TO authenticated USING (salon_id = get_user_salon_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
