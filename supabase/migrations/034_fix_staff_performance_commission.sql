-- 034_fix_staff_performance_commission.sql
--
-- The staff_performance block inside get_daily_summary returned
--   SUM(bills.total_amount) AS revenue
--   COUNT(bills) AS services_done
-- Both numbers included retail product sales because a bill's total_amount
-- is the sum of all line items (service + product). Dashboard home and
-- the stylist view multiply `revenue * commission_rate / 100` to estimate
-- commission, so stylists saw commission accruing on product sales.
-- Migration 033 already fixed this for the monthly RPC; this migration
-- applies the same correction inside get_daily_summary.
--
-- After this migration:
--   revenue       = SUM of service-only bill_items for that staff on the day
--   services_done = COUNT of service-only bill_items for that staff
-- Product sales still count into bills.total_amount and the salon-level
-- revenue totals — only the staff_performance slice is service-only.

CREATE OR REPLACE FUNCTION public.get_daily_summary(
  p_branch_id uuid,
  p_date date,
  p_salon_id uuid
)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
BEGIN
  IF p_salon_id IS NULL THEN
    RAISE EXCEPTION 'salon_id is required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM branches
    WHERE id = p_branch_id AND salon_id = p_salon_id
  ) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'total_revenue', COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid'), 0),
    'total_bills', COUNT(*) FILTER (WHERE status = 'paid'),
    'cash_amount', COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid' AND payment_method = 'cash'), 0),
    'jazzcash_amount', COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid' AND payment_method = 'jazzcash'), 0),
    'easypaisa_amount', COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid' AND payment_method = 'easypaisa'), 0),
    'card_amount', COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid' AND payment_method = 'card'), 0),
    'bank_transfer_amount', COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid' AND payment_method = 'bank_transfer'), 0),
    'udhaar_amount', COALESCE(SUM(udhaar_added) FILTER (WHERE status = 'paid'), 0)
  ) INTO result
  FROM bills
  WHERE branch_id = p_branch_id
    AND (created_at AT TIME ZONE 'Asia/Karachi')::date = p_date;

  result := result || jsonb_build_object('top_services', (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT bi.name, COUNT(*) as count, SUM(bi.total_price) as revenue
      FROM bill_items bi
      JOIN bills b ON b.id = bi.bill_id
      WHERE b.branch_id = p_branch_id
        AND (b.created_at AT TIME ZONE 'Asia/Karachi')::date = p_date
        AND b.status = 'paid'
        AND bi.item_type = 'service'
      GROUP BY bi.name
      ORDER BY revenue DESC
      LIMIT 5
    ) t
  ));

  -- Staff performance — SERVICE-ONLY. Product line items are excluded so
  -- `revenue * commission_rate / 100` (computed client-side) doesn't pay
  -- commission on retail. services_done is the count of service line items
  -- for that staff on the day, so flat-rate commission earns per service
  -- (a bill with two services earns two flat units).
  result := result || jsonb_build_object('staff_performance', (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT s.name,
             COUNT(bi.id) AS services_done,
             COALESCE(SUM(bi.total_price), 0) AS revenue
      FROM bill_items bi
      JOIN bills b ON b.id = bi.bill_id
      JOIN staff s ON s.id = b.staff_id
      WHERE b.branch_id = p_branch_id
        AND (b.created_at AT TIME ZONE 'Asia/Karachi')::date = p_date
        AND b.status = 'paid'
        AND bi.item_type = 'service'
      GROUP BY s.id, s.name
      ORDER BY revenue DESC
    ) t
  ));

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Re-apply the same grants as migration 029.
REVOKE ALL ON FUNCTION public.get_daily_summary(uuid, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_daily_summary(uuid, date, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_daily_summary(uuid, date, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_summary(uuid, date, uuid) TO service_role;
