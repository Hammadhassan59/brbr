-- 025_agent_leads_capture.sql
--
-- Lets sales agents capture leads in the field — name, address, phone, plus an
-- optional photo of the salon storefront. Adds a separate `created_by_agent`
-- audit column so super admin can tell whether a lead came from the field
-- (agent self-served) versus the office (super admin assigned). Agents create
-- via a service-role server action that stamps assigned_agent_id =
-- session.agentId, so the existing agent-scope RLS policy on leads (added in
-- 024) continues to gate visibility — agents see only their own.
--
-- Photos go in a dedicated public-read bucket (paths are random uuids, not
-- enumerable) modeled on payment-screenshots from 016.

-- 1. New columns on leads
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS created_by_agent uuid REFERENCES sales_agents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS leads_created_by_agent_idx ON leads(created_by_agent);

-- 2. Storage bucket for lead salon photos. Public read so super admin and the
--    agent can preview the image without a signed URL roundtrip; paths are
--    namespaced by salon-uuid to make accidental enumeration noisy.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lead-photos',
  'lead-photos',
  true,
  5 * 1024 * 1024,  -- 5MB cap; client compresses to ~200KB before upload
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
