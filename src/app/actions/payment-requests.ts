'use server';

import { createServerClient } from '@/lib/supabase';
import { verifySession } from './auth';

type Plan = 'basic' | 'growth' | 'pro';
type Method = 'bank' | 'jazzcash';
type Status = 'pending' | 'approved' | 'rejected';

export interface PaymentRequest {
  id: string;
  salon_id: string;
  plan: Plan;
  amount: number;
  reference: string | null;
  method: Method | null;
  status: Status;
  duration_days: number;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewer_notes: string | null;
  created_at: string;
}

export interface PaymentRequestWithSalon extends PaymentRequest {
  salon: {
    id: string;
    name: string;
    city: string | null;
    phone: string | null;
    subscription_plan: string | null;
    subscription_status: string | null;
  } | null;
}

async function requireSuperAdmin() {
  const session = await verifySession();
  if (!session || session.role !== 'super_admin') {
    throw new Error('Unauthorized');
  }
  return session;
}

/**
 * Resolve the price for a plan from platform_settings.plans (fallback to defaults).
 * Used when the owner submits a request so the recorded amount matches what they
 * were shown on the paywall, even if admin updates prices later.
 */
async function lookupPlanPrice(plan: Plan): Promise<number> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'plans')
    .maybeSingle();

  const defaults: Record<Plan, number> = { basic: 2500, growth: 5000, pro: 9000 };
  if (!data?.value) return defaults[plan];
  const plans = data.value as Record<string, { price?: number }>;
  return Number(plans[plan]?.price) || defaults[plan];
}

/**
 * Owner-side: create a pending payment request for the current salon.
 * Called when the owner clicks "Send Screenshot on WhatsApp" on the paywall —
 * we record their intent so the admin sees it in the queue alongside the WhatsApp
 * message they'll receive.
 */
export async function submitPaymentRequest(input: {
  plan: Plan;
  reference?: string | null;
  method?: Method | null;
}): Promise<{ data: PaymentRequest | null; error: string | null }> {
  let session;
  try {
    session = await verifySession();
  } catch {
    return { data: null, error: 'Not authenticated' };
  }
  if (!session.salonId || session.salonId === 'super-admin') {
    return { data: null, error: 'No salon associated with this session' };
  }

  if (!['basic', 'growth', 'pro'].includes(input.plan)) {
    return { data: null, error: 'Invalid plan' };
  }

  const supabase = createServerClient();
  const amount = await lookupPlanPrice(input.plan);

  const { data, error } = await supabase
    .from('payment_requests')
    .insert({
      salon_id: session.salonId,
      plan: input.plan,
      amount,
      reference: input.reference?.trim() || null,
      method: input.method || null,
      status: 'pending',
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as PaymentRequest, error: null };
}

/**
 * Admin-side: list payment requests, optionally filtered by status.
 */
export async function listPaymentRequests(
  filter?: { status?: Status | 'all' }
): Promise<{ data: PaymentRequestWithSalon[]; error: string | null }> {
  await requireSuperAdmin();
  const supabase = createServerClient();

  let query = supabase
    .from('payment_requests')
    .select('*, salon:salons(id, name, city, phone, subscription_plan, subscription_status)')
    .order('created_at', { ascending: false });

  if (filter?.status && filter.status !== 'all') {
    query = query.eq('status', filter.status);
  }

  const { data, error } = await query.limit(200);
  if (error) return { data: [], error: error.message };
  return { data: (data || []) as PaymentRequestWithSalon[], error: null };
}

/**
 * Admin-side: approve a pending request. Activates the salon with the requested
 * plan and extends the expiry by `duration_days` (default 30) from now (or from
 * the existing expiry if it's still in the future, so back-to-back renewals stack).
 */
export async function approvePaymentRequest(
  id: string,
  options?: { plan?: Plan; durationDays?: number; notes?: string }
): Promise<{ error: string | null }> {
  const session = await requireSuperAdmin();
  const supabase = createServerClient();

  const { data: request, error: fetchErr } = await supabase
    .from('payment_requests')
    .select('*')
    .eq('id', id)
    .single();
  if (fetchErr || !request) return { error: 'Request not found' };
  if (request.status !== 'pending') {
    return { error: `Request is already ${request.status}` };
  }

  const plan = options?.plan ?? (request.plan as Plan);
  const days = options?.durationDays ?? request.duration_days ?? 30;

  // Stack renewals: if currently active and not expired, extend from existing
  // expiry; otherwise start the clock from now.
  const { data: salon } = await supabase
    .from('salons')
    .select('subscription_expires_at, subscription_status')
    .eq('id', request.salon_id)
    .single();

  const now = Date.now();
  const existingExpiry = salon?.subscription_expires_at
    ? new Date(salon.subscription_expires_at).getTime()
    : 0;
  const startFrom = existingExpiry > now && salon?.subscription_status === 'active'
    ? existingExpiry
    : now;
  const newExpiry = new Date(startFrom + days * 24 * 60 * 60 * 1000).toISOString();

  const { error: salonErr } = await supabase
    .from('salons')
    .update({
      subscription_plan: plan,
      subscription_status: 'active',
      subscription_expires_at: newExpiry,
      subscription_started_at: salon?.subscription_status === 'active'
        ? undefined
        : new Date().toISOString(),
    })
    .eq('id', request.salon_id);
  if (salonErr) return { error: salonErr.message };

  const { error: reqErr } = await supabase
    .from('payment_requests')
    .update({
      status: 'approved',
      reviewed_by: session.staffId,
      reviewed_at: new Date().toISOString(),
      reviewer_notes: options?.notes ?? null,
      plan,
      duration_days: days,
    })
    .eq('id', id);
  if (reqErr) return { error: reqErr.message };

  return { error: null };
}

/**
 * Admin-side: reject a request with an optional reason.
 */
export async function rejectPaymentRequest(
  id: string,
  options?: { reason?: string }
): Promise<{ error: string | null }> {
  const session = await requireSuperAdmin();
  const supabase = createServerClient();

  const { data: request, error: fetchErr } = await supabase
    .from('payment_requests')
    .select('status')
    .eq('id', id)
    .single();
  if (fetchErr || !request) return { error: 'Request not found' };
  if (request.status !== 'pending') {
    return { error: `Request is already ${request.status}` };
  }

  const { error } = await supabase
    .from('payment_requests')
    .update({
      status: 'rejected',
      reviewed_by: session.staffId,
      reviewed_at: new Date().toISOString(),
      reviewer_notes: options?.reason ?? null,
    })
    .eq('id', id);
  if (error) return { error: error.message };
  return { error: null };
}

/**
 * Admin-side: pending count for the nav badge.
 */
export async function getPendingPaymentCount(): Promise<number> {
  await requireSuperAdmin();
  const supabase = createServerClient();
  const { count } = await supabase
    .from('payment_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  return count || 0;
}
