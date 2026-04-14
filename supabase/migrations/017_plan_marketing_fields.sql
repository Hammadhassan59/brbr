-- 017_plan_marketing_fields.sql
-- Extends platform_settings.plans with the marketing copy rendered on the public
-- homepage (displayName, originalPrice, pitch, limits, popular, features). Prior
-- to this migration only price/branches/staff were stored, so the homepage had
-- to keep these hardcoded. This migration merges in defaults so existing
-- installations get a fully-populated plans row without requiring a manual save
-- in /admin/settings.

-- Existing per-plan admin values win; defaults only fill missing keys. The
-- right-hand operand of jsonb `||` overrides the left, so we put defaults on
-- the left and existing values on the right.
UPDATE platform_settings
SET value = jsonb_build_object(
  'basic', jsonb_build_object(
    'displayName', 'Starter',
    'originalPrice', 5000,
    'pitch', 'For new and small salons',
    'limits', '1 branch · up to 10 staff',
    'popular', false,
    'features', jsonb_build_array(
      jsonb_build_object('text', 'POS + billing', 'ok', true),
      jsonb_build_object('text', 'Bookings + walk-in queue', 'ok', true),
      jsonb_build_object('text', 'Cash, mobile, card payments', 'ok', true),
      jsonb_build_object('text', 'Basic daily report', 'ok', true),
      jsonb_build_object('text', 'Commission tracking', 'ok', true),
      jsonb_build_object('text', 'Inventory', 'ok', false),
      jsonb_build_object('text', 'Payroll', 'ok', false)
    )
  ) || COALESCE(value->'basic', '{}'::jsonb),
  'growth', jsonb_build_object(
    'displayName', 'Business',
    'originalPrice', 12000,
    'pitch', 'For growing salons and small chains',
    'limits', '3 branches · 10 staff each',
    'popular', true,
    'features', jsonb_build_array(
      jsonb_build_object('text', 'POS + billing', 'ok', true),
      jsonb_build_object('text', 'Bookings + walk-in queue', 'ok', true),
      jsonb_build_object('text', 'Cash, mobile, card payments', 'ok', true),
      jsonb_build_object('text', 'Full daily reports', 'ok', true),
      jsonb_build_object('text', 'Commission tracking', 'ok', true),
      jsonb_build_object('text', 'Inventory', 'ok', true),
      jsonb_build_object('text', 'Payroll + attendance', 'ok', true)
    )
  ) || COALESCE(value->'growth', '{}'::jsonb),
  'pro', jsonb_build_object(
    'displayName', 'Enterprise',
    'originalPrice', 20000,
    'pitch', 'For salon chains',
    'limits', '10 branches · 100 staff',
    'popular', false,
    'features', jsonb_build_array(
      jsonb_build_object('text', 'Everything in Business', 'ok', true),
      jsonb_build_object('text', 'Cross-branch reports', 'ok', true),
      jsonb_build_object('text', 'Partner/co-owner logins', 'ok', true),
      jsonb_build_object('text', 'Priority support', 'ok', true)
    )
  ) || COALESCE(value->'pro', '{}'::jsonb)
),
updated_at = now()
WHERE key = 'plans';
