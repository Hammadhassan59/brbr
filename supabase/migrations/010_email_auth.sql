-- Migration: Switch from phone+PIN to email auth via Supabase Auth
-- All users (owners, partners, staff) now authenticate with email + password

-- Add email and auth_user_id to staff
ALTER TABLE staff ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS auth_user_id uuid;

-- Add email and auth_user_id to salon_partners
ALTER TABLE salon_partners ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE salon_partners ADD COLUMN IF NOT EXISTS auth_user_id uuid;

-- Make pin_code optional (keep column for backward compat, but no longer required)
ALTER TABLE staff ALTER COLUMN pin_code DROP NOT NULL;
ALTER TABLE salon_partners ALTER COLUMN pin_code DROP NOT NULL;
