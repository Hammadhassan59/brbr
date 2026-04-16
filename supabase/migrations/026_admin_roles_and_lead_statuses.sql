-- 026_admin_roles_and_lead_statuses.sql
--
-- Two unrelated additions bundled because they ship together:
-- 1. New lead_status values: 'followup' (between visited and interested) and
--    'onboarded' (alongside 'converted', for the post-onboarding state).
--    Append-only — keeps existing data and RLS policies intact.
-- 2. admin_users table: source of truth for super_admin and the new sub-roles
--    (technical_support, customer_support, leads_team). Replaces the
--    SUPERADMIN_EMAILS env var as the primary path; env var stays as a
--    bootstrap fallback so the very first admin can always log in.

-- ─── Lead status enum additions ───
-- ALTER TYPE ... ADD VALUE IF NOT EXISTS is supported in PG14+. The
-- self-hosted Supabase image is PG15. Each ADD VALUE must be its own statement
-- and cannot run inside a transaction block alongside other DDL — Postgres
-- enforces this at parse time.
ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'followup' AFTER 'visited';
ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'onboarded' AFTER 'interested';

-- ─── admin_users table ───
CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL,           -- auth.users.id, no FK (auth schema)
  email text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN
    ('super_admin','technical_support','customer_support','leads_team')),
  active boolean NOT NULL DEFAULT true,
  invited_by uuid,                        -- auth.users.id of the inviter
  created_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz
);
CREATE INDEX IF NOT EXISTS admin_users_role_idx ON admin_users(role) WHERE active;
CREATE INDEX IF NOT EXISTS admin_users_email_idx ON admin_users(lower(email));

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
-- No client-side policies; service-role only. Sub-admins access this table
-- only via server actions (admin-team.ts) which bypass RLS via createServerClient().
