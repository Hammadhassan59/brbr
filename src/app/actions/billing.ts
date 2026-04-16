'use server';

import { createServerClient } from '@/lib/supabase';
import { verifySession } from './auth';

type Plan = 'basic' | 'growth' | 'pro';
type Status = 'active' | 'pending' | 'expired' | 'suspended';

export interface BillingPaymentRow {
  id: string;
  plan: Plan;
  amount: number;
  method: 'bank' | 'jazzcash' | null;
  reference: string | null;
  screenshot_url: string | null;
  status: 'pending' | 'approved' | 'rejected';
  duration_days: number;
  created_at: string;
  reviewed_at: string | null;
  reviewer_notes: string | null;
}

export interface BillingData {
  salon: {
    id: string;
    name: string;
    plan: string | null;
    status: Status | string;
    subscription_started_at: string | null;
    subscription_expires_at: string | null;
    daysRemaining: number | null;
  };
  history: BillingPaymentRow[];
  totalPaid: number;
  approvedCount: number;
  lastPaymentAt: string | null;
  planPrices: Record<Plan, number>;
}

const DEFAULT_PRICES: Record<Plan, number> = { basic: 2500, growth: 5000, pro: 9000 };

/**
 * One-shot bootstrap for /dashboard/billing. Wraps verifySession (not
 * verifyWriteAccess) so even expired tenants can see what they owe and what
 * they've paid — they can't write, but they can read their own bill.
 */
export async function getBillingData(): Promise<{ data: BillingData | null; error: string | null }> {
  let session;
  try {
    session = await verifySession();
  } catch {
    return { data: null, error: 'Not authenticated' };
  }
  if (!session.salonId || session.salonId === 'super-admin') {
    return { data: null, error: 'No salon associated with this session' };
  }

  const supabase = createServerClient();

  const [{ data: salon, error: salonErr }, { data: requests, error: reqErr }, { data: priceRow }] = await Promise.all([
    supabase
      .from('salons')
      .select('id, name, subscription_plan, subscription_status, subscription_started_at, subscription_expires_at')
      .eq('id', session.salonId)
      .maybeSingle(),
    supabase
      .from('payment_requests')
      .select('id, plan, amount, method, reference, screenshot_url, status, duration_days, created_at, reviewed_at, reviewer_notes')
      .eq('salon_id', session.salonId)
      .order('created_at', { ascending: false }),
    supabase.from('platform_settings').select('value').eq('key', 'plans').maybeSingle(),
  ]);

  if (salonErr) return { data: null, error: salonErr.message };
  if (!salon) return { data: null, error: 'Salon not found' };
  if (reqErr) return { data: null, error: reqErr.message };

  const history = (requests || []) as BillingPaymentRow[];
  const approved = history.filter((r) => r.status === 'approved');
  const totalPaid = approved.reduce((sum, r) => sum + (r.amount || 0), 0);
  const lastPaymentAt = approved[0]?.created_at ?? null;

  const expires = salon.subscription_expires_at;
  const daysRemaining = expires
    ? Math.max(0, Math.ceil((new Date(expires).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : null;

  const planPrices: Record<Plan, number> = { ...DEFAULT_PRICES };
  if (priceRow?.value) {
    const conf = priceRow.value as Record<string, { price?: number }>;
    (Object.keys(planPrices) as Plan[]).forEach((p) => {
      const v = Number(conf[p]?.price);
      if (Number.isFinite(v) && v > 0) planPrices[p] = v;
    });
  }

  return {
    data: {
      salon: {
        id: salon.id,
        name: salon.name,
        plan: salon.subscription_plan,
        status: salon.subscription_status,
        subscription_started_at: salon.subscription_started_at,
        subscription_expires_at: salon.subscription_expires_at,
        daysRemaining,
      },
      history,
      totalPaid,
      approvedCount: approved.length,
      lastPaymentAt,
      planPrices,
    },
    error: null,
  };
}
