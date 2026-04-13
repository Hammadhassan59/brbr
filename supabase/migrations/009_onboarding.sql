-- 009_onboarding.sql
-- Onboarding support: track staff logins, first-login-seen, owner checklist dismissal

-- Track when staff last logged in (for "invite staff" checklist item)
ALTER TABLE staff ADD COLUMN last_login_at timestamptz;

-- Track whether staff has seen the first-login welcome screen
ALTER TABLE staff ADD COLUMN first_login_seen boolean NOT NULL DEFAULT false;

-- Track whether owner has dismissed the onboarding checklist
ALTER TABLE salons ADD COLUMN onboarding_dismissed boolean NOT NULL DEFAULT false;

-- Single RPC to fetch all onboarding checklist state
CREATE OR REPLACE FUNCTION get_onboarding_status(p_salon_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT json_build_object(
    'has_clients', (SELECT count(*) > 0 FROM clients WHERE salon_id = p_salon_id),
    'has_appointments', (SELECT count(*) > 0 FROM appointments WHERE salon_id = p_salon_id),
    'has_sale', (SELECT count(*) > 0 FROM bills WHERE salon_id = p_salon_id AND status = 'paid'),
    'has_payment_methods', (
      SELECT jazzcash_number IS NOT NULL OR easypaisa_number IS NOT NULL OR bank_account IS NOT NULL
      FROM salons WHERE id = p_salon_id
    ),
    'staff_logged_in', (
      SELECT count(*) > 0 FROM staff
      WHERE salon_id = p_salon_id AND role != 'owner' AND last_login_at IS NOT NULL
    ),
    'onboarding_dismissed', (
      SELECT onboarding_dismissed FROM salons WHERE id = p_salon_id
    )
  );
$$;
