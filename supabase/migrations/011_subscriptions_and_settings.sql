-- 011_subscriptions_and_settings.sql
-- Adds subscription management to salons and platform-level settings table

-- Subscription fields on salons
ALTER TABLE salons ADD COLUMN IF NOT EXISTS subscription_plan text CHECK (subscription_plan IN ('trial','basic','growth','pro')) DEFAULT 'trial';
ALTER TABLE salons ADD COLUMN IF NOT EXISTS subscription_status text CHECK (subscription_status IN ('trial','active','expired','suspended')) DEFAULT 'trial';
ALTER TABLE salons ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS subscription_started_at timestamptz DEFAULT now();
ALTER TABLE salons ADD COLUMN IF NOT EXISTS admin_notes text;

-- Platform settings (key-value, superadmin only)
CREATE TABLE IF NOT EXISTS platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- RLS: only service_role can access platform_settings (no anon/authenticated access)
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- Seed default settings
INSERT INTO platform_settings (key, value) VALUES
  ('general', '{"platformName":"iCut","platformDomain":"icut.pk","supportWhatsApp":"","supportEmail":"support@icut.pk"}'::jsonb),
  ('email', '{"enabled":false,"fromEmail":"notifications@icut.pk","fromName":"iCut","sendgridKey":"","enabledTemplates":{"winback":true,"udhaar_reminder":true,"low_stock_alert":true,"daily_summary":true}}'::jsonb),
  ('plans', '{"basic":{"price":2500,"branches":1,"staff":3},"growth":{"price":5000,"branches":1,"staff":0},"pro":{"price":9000,"branches":3,"staff":0}}'::jsonb),
  ('trial', '{"durationDays":14,"graceDays":3,"requirePayment":false}'::jsonb),
  ('payment', '{"jazzcashAccount":"","bankAccount":""}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Set existing salons that completed setup to 'active' subscription
UPDATE salons SET subscription_status = 'active', subscription_plan = 'growth' WHERE setup_complete = true;
UPDATE salons SET subscription_status = 'trial' WHERE setup_complete = false;
