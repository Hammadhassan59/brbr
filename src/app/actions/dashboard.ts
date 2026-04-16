'use server';

import { verifySession } from './auth';
import { createServerClient } from '@/lib/supabase';
import type {
  DailySummary,
  StaffMonthlyCommission,
  UdhaarReportItem,
  ClientStats,
} from '@/types/database';

/**
 * Server-action wrappers for the four SECURITY DEFINER dashboard RPCs
 * hardened by migration 029_secure_rpcs.sql.
 *
 * After migration 029, those RPCs:
 *   1. Require p_salon_id and assert it matches the referenced entity.
 *   2. Have EXECUTE revoked from anon + authenticated, granted only to
 *      service_role.
 *
 * That means the Supabase anon client can no longer call them directly from
 * the browser. All four must go through a server action that:
 *   1. Verifies the iCut JWT via verifySession() to get a trusted salonId.
 *   2. Calls the RPC via the service-role client, passing that salonId.
 *
 * The salon ownership checks inside the RPC bodies (see migration 029) are
 * defense-in-depth in case this action is ever misused.
 */

export async function getDailySummaryAction(
  branchId: string,
  date: string,
): Promise<{ data: DailySummary | null; error: string | null }> {
  try {
    const session = await verifySession();
    if (!session.salonId) {
      return { data: null, error: 'No salon context' };
    }

    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('get_daily_summary', {
      p_branch_id: branchId,
      p_date: date,
      p_salon_id: session.salonId,
    });

    if (error) return { data: null, error: error.message };
    return { data: (data as DailySummary) ?? null, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function getStaffMonthlyCommissionAction(
  staffId: string,
  month: number,
  year: number,
): Promise<{ data: StaffMonthlyCommission | null; error: string | null }> {
  try {
    const session = await verifySession();
    if (!session.salonId) {
      return { data: null, error: 'No salon context' };
    }

    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('get_staff_monthly_commission', {
      p_staff_id: staffId,
      p_month: month,
      p_year: year,
      p_salon_id: session.salonId,
    });

    if (error) return { data: null, error: error.message };
    return { data: (data as StaffMonthlyCommission) ?? null, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function getUdhaarReportAction(): Promise<{
  data: UdhaarReportItem[] | null;
  error: string | null;
}> {
  try {
    const session = await verifySession();
    if (!session.salonId) {
      return { data: null, error: 'No salon context' };
    }

    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('get_udhaar_report', {
      p_salon_id: session.salonId,
    });

    if (error) return { data: null, error: error.message };
    return { data: (data as UdhaarReportItem[]) ?? [], error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function getClientStatsAction(
  clientId: string,
): Promise<{ data: ClientStats | null; error: string | null }> {
  try {
    const session = await verifySession();
    if (!session.salonId) {
      return { data: null, error: 'No salon context' };
    }

    const supabase = createServerClient();
    const { data, error } = await supabase.rpc('get_client_stats', {
      p_client_id: clientId,
      p_salon_id: session.salonId,
    });

    if (error) return { data: null, error: error.message };
    return { data: (data as ClientStats) ?? null, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed' };
  }
}
