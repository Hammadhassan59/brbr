-- 033_demo_salon_rls_and_product_commission.sql
--
-- Two fixes that surfaced after migration 032 (the DB-backed demo salon):
--
-- 1. Demo sales agents couldn't see ANY catalog rows (services, products,
--    packages, clients, appointments, bills) when landing on /dashboard in
--    the shared demo salon. get_user_salon_id() resolves the caller's salon
--    via salons.owner_id / staff.auth_user_id / salon_partners.auth_user_id
--    — none of which match a sales-agent auth user. RLS returned 0 rows,
--    the POS page looked empty, appointments never rendered. Fix: extend
--    get_user_salon_id() to resolve demo sales agents → the demo salon.
--
-- 2. Staff monthly commission in get_staff_monthly_commission was computed
--    from bills.total_amount — which includes BOTH services and retail
--    product sales. Selling products shouldn't earn the stylist a
--    commission. Recalculate commission from bill_items.total_price where
--    item_type='service' only. Flat-rate commission counts service line
--    items (not bills), so a bill with two services earns twice.

-- =========================================================================
-- 1. get_user_salon_id() — recognize demo sales agents
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_user_salon_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT id FROM salons WHERE owner_id = auth.uid()
  UNION ALL
  SELECT salon_id FROM staff WHERE auth_user_id = auth.uid() AND is_active = true
  UNION ALL
  SELECT salon_id FROM salon_partners WHERE auth_user_id = auth.uid() AND is_active = true
  UNION ALL
  -- Demo sales agents resolve to the shared demo salon so RLS lets them
  -- read/write against it while they showcase the product to prospects.
  -- The 10-min cron wipes anything they write, so giving them write
  -- access via the "Salon owners can manage ..." policies is acceptable.
  SELECT s.id FROM salons s
  WHERE s.is_demo = true
    AND EXISTS (
      SELECT 1 FROM sales_agents sa
      WHERE sa.user_id = auth.uid()
        AND sa.is_demo = true
        AND sa.active = true
    )
  LIMIT 1;
$function$;

-- =========================================================================
-- 2. get_staff_monthly_commission — exclude products from commission basis
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_staff_monthly_commission(
  p_staff_id uuid,
  p_month int,
  p_year int,
  p_salon_id uuid
)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
  v_staff staff%ROWTYPE;
  v_service_revenue numeric;
  v_service_count int;
BEGIN
  IF p_salon_id IS NULL THEN
    RAISE EXCEPTION 'salon_id is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_staff FROM staff
  WHERE id = p_staff_id AND salon_id = p_salon_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Service-only revenue for this staff in this month. Product line items
  -- (item_type='product') are excluded from the commission basis — retail
  -- product sales don't earn the stylist a cut.
  SELECT
    COALESCE(SUM(bi.total_price), 0),
    COUNT(bi.id)
  INTO v_service_revenue, v_service_count
  FROM bill_items bi
  JOIN bills b ON b.id = bi.bill_id
  WHERE b.staff_id = p_staff_id
    AND b.status = 'paid'
    AND bi.item_type = 'service'
    AND EXTRACT(MONTH FROM b.created_at) = p_month
    AND EXTRACT(YEAR FROM b.created_at) = p_year;

  SELECT jsonb_build_object(
    'services_count', v_service_count,
    'total_revenue', COALESCE((
      SELECT SUM(b.total_amount) FROM bills b
      WHERE b.staff_id = p_staff_id
        AND b.status = 'paid'
        AND EXTRACT(MONTH FROM b.created_at) = p_month
        AND EXTRACT(YEAR FROM b.created_at) = p_year
    ), 0),
    'commission_earned', CASE
      WHEN v_staff.commission_type = 'percentage'
        THEN COALESCE(v_service_revenue * v_staff.commission_rate / 100, 0)
      ELSE COALESCE(v_service_count * v_staff.commission_rate, 0)
    END,
    'tips_total', COALESCE((
      SELECT SUM(amount) FROM tips
      WHERE staff_id = p_staff_id
        AND EXTRACT(MONTH FROM date) = p_month
        AND EXTRACT(YEAR FROM date) = p_year
    ), 0),
    'advances_total', COALESCE((
      SELECT SUM(amount) FROM advances
      WHERE staff_id = p_staff_id
        AND EXTRACT(MONTH FROM date) = p_month
        AND EXTRACT(YEAR FROM date) = p_year
        AND is_deducted = false
    ), 0),
    'late_deductions', COALESCE((
      SELECT SUM(deduction_amount) FROM attendance
      WHERE staff_id = p_staff_id
        AND EXTRACT(MONTH FROM date) = p_month
        AND EXTRACT(YEAR FROM date) = p_year
    ), 0)
  ) INTO result;

  result := result || jsonb_build_object(
    'net_payable',
    v_staff.base_salary
    + (result->>'commission_earned')::numeric
    + (result->>'tips_total')::numeric
    - (result->>'advances_total')::numeric
    - (result->>'late_deductions')::numeric
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Re-apply the same EXECUTE grants as migration 029.
REVOKE ALL ON FUNCTION public.get_staff_monthly_commission(uuid, int, int, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_staff_monthly_commission(uuid, int, int, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_staff_monthly_commission(uuid, int, int, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_monthly_commission(uuid, int, int, uuid) TO service_role;
