-- Fix get_daily_summary to use Pakistan timezone for date bucketing.
-- Bills.created_at is timestamptz (UTC). Previously we compared created_at::date = p_date
-- which casts to the server timezone (UTC), so bills rung 7pm-midnight PKT were attributed
-- to the wrong day. This caused missing payments in the dashboard for evening/night bills.

CREATE OR REPLACE FUNCTION get_daily_summary(p_branch_id uuid, p_date date)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
BEGIN
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

  result := result || jsonb_build_object('staff_performance', (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT s.name, COUNT(b.id) as services_done, SUM(b.total_amount) as revenue
      FROM bills b
      JOIN staff s ON s.id = b.staff_id
      WHERE b.branch_id = p_branch_id
        AND (b.created_at AT TIME ZONE 'Asia/Karachi')::date = p_date
        AND b.status = 'paid'
      GROUP BY s.id, s.name
      ORDER BY revenue DESC
    ) t
  ));

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
