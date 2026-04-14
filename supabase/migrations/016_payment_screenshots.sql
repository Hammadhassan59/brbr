-- 016_payment_screenshots.sql
-- Add screenshot URL to payment_requests + create storage bucket for screenshots.

ALTER TABLE payment_requests
  ADD COLUMN IF NOT EXISTS screenshot_url text;

-- Create a bucket for payment screenshots. Public-read so the admin can view
-- via plain URL; paths are random uuids so they're not enumerable.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-screenshots',
  'payment-screenshots',
  true,
  10 * 1024 * 1024,  -- 10MB cap
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- All uploads go through the service_role from server actions, so we don't need
-- per-user storage RLS policies. RLS is enabled by default on storage.objects;
-- service_role bypasses it.
