-- ═══════════════════════════════════════
-- BrBr Migration 007: Fix function search_path
-- Resolves Supabase linter warnings about mutable search_path
-- ═══════════════════════════════════════

ALTER FUNCTION public.get_user_salon_id() SET search_path = public;
ALTER FUNCTION public.get_daily_summary(uuid, date) SET search_path = public;
ALTER FUNCTION public.get_staff_monthly_commission(uuid, int, int) SET search_path = public;
ALTER FUNCTION public.get_udhaar_report(uuid) SET search_path = public;
ALTER FUNCTION public.get_client_stats(uuid) SET search_path = public;
