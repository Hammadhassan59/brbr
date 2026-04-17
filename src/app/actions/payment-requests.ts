'use server';

import { createServerClient } from '@/lib/supabase';
import { verifySession, requireAdminRole } from './auth';
import { sendEmail } from '@/lib/email-sender';
import { paymentApprovedEmail, paymentDeniedEmail } from '@/lib/email-templates';
import { accrueCommissionForPaymentRequest, reverseCommissionsForPaymentRequest } from './agent-commissions';
import { checkRateLimit } from '@/lib/with-rate-limit';
import { BUCKETS } from '@/lib/rate-limit-buckets';
import { safeError } from '@/lib/action-error';
import { getSignedStorageUrl } from '@/lib/storage-url';

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
  // Legacy: old rows have screenshot_url set (full public URL from pre-
  // migration-030 era). New rows leave it empty and use screenshot_path
  // instead — see migration 029_storage_paths.sql.
  screenshot_url: string | null;
  // Storage object path in the private payment-screenshots bucket. Render
  // via getPaymentScreenshotUrl() which mints a short-lived signed URL.
  screenshot_path: string | null;
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
    sold_by_agent_id: string | null;
    sold_by_agent: { id: string; name: string } | null;
  } | null;
  // Short-lived signed URL minted at list time so the admin list can render
  // inline thumbnails. Null when the row has neither screenshot_path nor
  // legacy screenshot_url, or when signed-URL minting failed. Expires ~15min
  // after mint; the full-size lightbox mints a fresh URL on click.
  screenshot_signed_url: string | null;
}

/**
 * Resolve the price for a plan from platform_settings.plans (fallback to defaults).
 * Used when the owner submits a request so the recorded amount matches what they
 * were shown on the paywall, even if admin updates prices later.
 */
export async function lookupPlanPrice(plan: Plan): Promise<number> {
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
 * Accepts a FormData payload with the screenshot file plus form fields.
 * Uploads the screenshot to the (private) payment-screenshots bucket and
 * records the STORAGE PATH — not a URL. Signed URLs are minted at render
 * time by getPaymentScreenshotUrl() so they never expire before an admin
 * actually opens the payment.
 */
export async function submitPaymentRequest(
  formData: FormData
): Promise<{ data: PaymentRequest | null; error: string | null }> {
  let session;
  try {
    session = await verifySession();
  } catch {
    return { data: null, error: 'Not authenticated' };
  }
  if (!session.salonId || session.salonId === 'super-admin') {
    return { data: null, error: 'No salon associated with this session' };
  }

  // Rate-limit: legitimate payments are infrequent, each submission uploads a
  // screenshot and sits in admin review. 5/hour/salon-user is generous for
  // real use and kills spam.
  const rl = await checkRateLimit(
    'payment-submit',
    `${session.salonId}:${session.staffId}`,
    BUCKETS.PAYMENT_SUBMIT.max,
    BUCKETS.PAYMENT_SUBMIT.windowMs,
  );
  if (!rl.ok) return { data: null, error: rl.error ?? 'Too many payment submissions, please try again later.' };

  const plan = String(formData.get('plan') || '') as Plan;
  const reference = String(formData.get('reference') || '').trim() || null;
  const method = (String(formData.get('method') || '') as Method) || null;
  const screenshot = formData.get('screenshot');

  if (!['basic', 'growth', 'pro'].includes(plan)) {
    return { data: null, error: 'Invalid plan' };
  }
  if (!(screenshot instanceof File) || screenshot.size === 0) {
    return { data: null, error: 'Payment screenshot is required' };
  }
  if (screenshot.size > 10 * 1024 * 1024) {
    return { data: null, error: 'Screenshot too large (10MB max)' };
  }

  const supabase = createServerClient();

  // Upload screenshot first. Path is salon_id/uuid.ext so it's namespaced and
  // not enumerable. Bucket is PRIVATE (migration 030); the object is only
  // fetched via a short-lived signed URL minted at render time.
  const ext = screenshot.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const uuid = crypto.randomUUID();
  const path = `${session.salonId}/${uuid}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from('payment-screenshots')
    .upload(path, screenshot, {
      contentType: screenshot.type || 'image/jpeg',
      upsert: false,
    });
  if (uploadErr) return { data: null, error: `Upload failed: ${safeError(uploadErr)}` };

  const amount = await lookupPlanPrice(plan);

  // Store the storage path in screenshot_path (new column, migration 029).
  // We leave screenshot_url empty for new rows — read sites prefer
  // screenshot_path and only fall back to screenshot_url for legacy rows.
  const { data, error } = await supabase
    .from('payment_requests')
    .insert({
      salon_id: session.salonId,
      plan,
      amount,
      reference,
      method,
      screenshot_path: path,
      screenshot_url: null,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    // Try to clean up the orphaned screenshot
    await supabase.storage.from('payment-screenshots').remove([path]).catch(() => {});
    return { data: null, error: safeError(error) };
  }
  return { data: data as PaymentRequest, error: null };
}

/**
 * Owner-side: bootstrap the /paywall page in one round trip. Returns the
 * salon's name + status, the most recent payment request (so we can show a
 * "submitted, awaiting review" panel), and the plan price table.
 */
export async function getPaywallContext(): Promise<{
  data: {
    salon: { id: string; name: string; subscription_status: string; subscription_plan: string | null };
    pendingRequest: PaymentRequest | null;
    planPrices: Record<Plan, number>;
  } | null;
  error: string | null;
}> {
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
  const [{ data: salon }, { data: latest }] = await Promise.all([
    supabase
      .from('salons')
      .select('id, name, subscription_status, subscription_plan')
      .eq('id', session.salonId)
      .maybeSingle(),
    supabase
      .from('payment_requests')
      .select('*')
      .eq('salon_id', session.salonId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!salon) return { data: null, error: 'Salon not found' };

  const planPrices: Record<Plan, number> = {
    basic: await lookupPlanPrice('basic'),
    growth: await lookupPlanPrice('growth'),
    pro: await lookupPlanPrice('pro'),
  };

  const pendingRequest = latest && latest.status === 'pending' ? (latest as PaymentRequest) : null;

  return {
    data: { salon: salon as { id: string; name: string; subscription_status: string; subscription_plan: string | null }, pendingRequest, planPrices },
    error: null,
  };
}

/**
 * Admin-side: list payment requests, optionally filtered by status.
 */
export async function listPaymentRequests(
  filter?: { status?: Status | 'all' }
): Promise<{ data: PaymentRequestWithSalon[]; error: string | null }> {
  await requireAdminRole(['super_admin', 'customer_support', 'technical_support']);
  const supabase = createServerClient();

  let query = supabase
    .from('payment_requests')
    .select('*, salon:salons(id, name, city, phone, subscription_plan, subscription_status, sold_by_agent_id, sold_by_agent:sales_agents!salons_sold_by_agent_id_fkey(id, name))')
    .order('created_at', { ascending: false });

  if (filter?.status && filter.status !== 'all') {
    query = query.eq('status', filter.status);
  }

  const { data, error } = await query.limit(200);
  if (error) return { data: [], error: safeError(error) };

  // Mint signed URLs server-side so the admin list can render thumbnails
  // without a round-trip per row. Bucket is private (migration 030), so
  // getPublicUrl is no longer an option. Legacy rows (pre-migration-030)
  // still have screenshot_url set — pass that through as-is until backfill.
  const rows = (data || []) as PaymentRequestWithSalon[];
  const withUrls = await Promise.all(
    rows.map(async (r) => {
      let screenshot_signed_url: string | null = null;
      if (r.screenshot_path) {
        screenshot_signed_url = await getSignedStorageUrl('payment-screenshots', r.screenshot_path);
      } else if (r.screenshot_url) {
        screenshot_signed_url = r.screenshot_url;
      }
      return { ...r, screenshot_signed_url };
    }),
  );
  return { data: withUrls, error: null };
}

/**
 * Admin-side: return total counts per status across ALL payment_requests,
 * independent of any filter the admin UI has applied. Drives the tab badges.
 */
export async function getPaymentRequestCounts(): Promise<{
  data: { pending: number; approved: number; rejected: number };
  error: string | null;
}> {
  await requireAdminRole(['super_admin', 'customer_support', 'technical_support']);
  const supabase = createServerClient();

  const [pending, approved, rejected] = await Promise.all([
    supabase.from('payment_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('payment_requests').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
    supabase.from('payment_requests').select('id', { count: 'exact', head: true }).eq('status', 'rejected'),
  ]);

  const firstError = pending.error || approved.error || rejected.error;
  if (firstError) {
    return { data: { pending: 0, approved: 0, rejected: 0 }, error: safeError(firstError) };
  }

  return {
    data: {
      pending: pending.count ?? 0,
      approved: approved.count ?? 0,
      rejected: rejected.count ?? 0,
    },
    error: null,
  };
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
  const session = await requireAdminRole(['super_admin', 'customer_support']);
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
  if (salonErr) return { error: safeError(salonErr) };

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
  if (reqErr) return { error: safeError(reqErr) };

  // Commission accrual — no-ops if salon has no agent.
  await accrueCommissionForPaymentRequest({
    paymentRequestId: id,
    salonId: request.salon_id,
    amount: request.amount,
  });

  // Owner notification — best-effort, doesn't block approval.
  try {
    const { data: salonRow } = await supabase
      .from('salons')
      .select('name, owner_id')
      .eq('id', request.salon_id)
      .single();
    if (salonRow?.owner_id) {
      const { data: authData } = await supabase.auth.admin.getUserById(salonRow.owner_id);
      const ownerEmail = authData?.user?.email;
      if (ownerEmail) {
        const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL
          ? `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`
          : 'https://icut.pk/dashboard';
        const validUntil = new Date(newExpiry).toLocaleDateString('en-PK', { year: 'numeric', month: 'long', day: 'numeric' });
        await sendEmail(
          ownerEmail,
          `iCut — Payment received, ${plan} plan active`,
          paymentApprovedEmail({
            salonName: salonRow.name || 'your salon',
            planName: plan,
            amountRs: request.amount,
            validUntil,
            dashboardUrl,
          }),
        );
      }
    }
  } catch {
    // Non-critical — approval already succeeded.
  }

  return { error: null };
}

/**
 * Admin-side: reject a request with an optional reason.
 */
export async function rejectPaymentRequest(
  id: string,
  options?: { reason?: string }
): Promise<{ error: string | null }> {
  const session = await requireAdminRole(['super_admin', 'customer_support']);
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

  const { error } = await supabase
    .from('payment_requests')
    .update({
      status: 'rejected',
      reviewed_by: session.staffId,
      reviewed_at: new Date().toISOString(),
      reviewer_notes: options?.reason ?? null,
    })
    .eq('id', id);
  if (error) return { error: safeError(error) };

  // Owner notification — best-effort.
  try {
    const { data: salonRow } = await supabase
      .from('salons')
      .select('name, owner_id')
      .eq('id', request.salon_id)
      .single();
    if (salonRow?.owner_id) {
      const { data: authData } = await supabase.auth.admin.getUserById(salonRow.owner_id);
      const ownerEmail = authData?.user?.email;
      if (ownerEmail) {
        const retryUrl = process.env.NEXT_PUBLIC_APP_URL
          ? `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?tab=billing`
          : 'https://icut.pk/dashboard/settings?tab=billing';
        await sendEmail(
          ownerEmail,
          'iCut — Payment request declined',
          paymentDeniedEmail({
            salonName: salonRow.name || 'your salon',
            amountRs: request.amount,
            reason: options?.reason || 'Payment could not be verified.',
            retryUrl,
          }),
        );
      }
    }
  } catch {
    // Non-critical — rejection already succeeded.
  }

  return { error: null };
}

/**
 * Admin-side: pending count for the nav badge.
 */
export async function getPendingPaymentCount(): Promise<number> {
  await requireAdminRole(['super_admin', 'customer_support', 'technical_support']);
  const supabase = createServerClient();
  const { count } = await supabase
    .from('payment_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  return count || 0;
}

/**
 * Admin-side: reverse an approved payment. Demotes the salon subscription if
 * this payment's expiry was the only active period, and flips any linked
 * commission rows to 'reversed'.
 */
export async function reversePaymentRequest(
  id: string,
  options?: { reason?: string },
): Promise<{ error: string | null }> {
  const session = await requireAdminRole(['super_admin', 'customer_support']);
  const supabase = createServerClient();

  const { data: request } = await supabase
    .from('payment_requests')
    .select('*')
    .eq('id', id)
    .single();
  if (!request) return { error: 'Request not found' };
  if (request.status !== 'approved') return { error: `Only approved requests can be reversed (status: ${request.status})` };

  const reversalNote = `REVERSED by admin${options?.reason ? `: ${options.reason}` : ''}`;
  const { error: reqErr } = await supabase
    .from('payment_requests')
    .update({
      status: 'rejected',
      reviewed_by: session.staffId,
      reviewed_at: new Date().toISOString(),
      reviewer_notes: reversalNote,
    })
    .eq('id', id);
  if (reqErr) return { error: safeError(reqErr) };

  await reverseCommissionsForPaymentRequest(id);

  // Best-effort subscription demotion. If this was the only approved payment
  // for the salon, flip the salon back to pending.
  const { count } = await supabase
    .from('payment_requests')
    .select('id', { count: 'exact', head: true })
    .eq('salon_id', request.salon_id)
    .eq('status', 'approved');

  if ((count ?? 0) === 0) {
    await supabase
      .from('salons')
      .update({ subscription_status: 'pending', subscription_plan: 'none' })
      .eq('id', request.salon_id);
  }

  return { error: null };
}
