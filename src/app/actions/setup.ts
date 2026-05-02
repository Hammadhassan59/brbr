'use server';

import { headers } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { createServerClient as createSupabaseSSRClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { sendEmail } from '@/lib/email-sender';
import { welcomeEmail } from '@/lib/email-templates';
import { checkRateLimit } from '@/lib/with-rate-limit';
import { BUCKETS } from '@/lib/rate-limit-buckets';
import { getClientIp } from '@/lib/rate-limit';
import { safeError } from '@/lib/action-error';
import * as authAdmin from '@/app/actions/auth-admin';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Resolve the Supabase Auth user for the current request from cookies.
 * Returns null when there's no valid session. Used by setupSalon() — setup
 * is a pre-session flow (no iCut JWT yet) so we authenticate against the
 * Supabase Auth cookie the signup page wrote after createUser.
 */
async function getAuthUserFromCookies(): Promise<{ id: string; email?: string } | null> {
  try {
    const cookieStore = await cookies();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return null;
    const ssr = createSupabaseSSRClient(url, anonKey, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {
          // Server Actions during setup should never rewrite auth cookies —
          // login already issued them. Silently no-op so we don't throw
          // trying to mutate cookies outside a proper response context.
        },
      },
    });
    const { data, error } = await ssr.auth.getUser();
    if (error || !data?.user) return null;
    return { id: data.user.id, email: data.user.email };
  } catch {
    return null;
  }
}

/**
 * Shared helper: read the client IP from the request headers. Wrapped in
 * try/catch because `headers()` is only available in a request scope — during
 * unit tests it may throw, and in that case we want to skip rate limiting
 * rather than crash.
 */
async function getIpOrUnknown(): Promise<string> {
  try {
    const h = await headers();
    return getClientIp(new Request('http://x', { headers: h }));
  } catch {
    return 'unknown';
  }
}

/**
 * Check whether an email is already registered with Supabase Auth.
 * Used by the setup wizard to warn partner/staff email fields onBlur
 * so the user finds out early — not at the final "Go to dashboard" click.
 */
export async function checkEmailAvailable(
  email: string
): Promise<{ available: boolean; reason?: 'invalid' | 'taken' | 'error' }> {
  const normalized = email?.trim().toLowerCase();
  if (!normalized || !EMAIL_RE.test(normalized)) {
    return { available: false, reason: 'invalid' };
  }

  // Rate-limit: legitimate users retype emails a handful of times during
  // signup, scrapers want thousands of lookups. 30/hour/IP separates the two.
  const ip = await getIpOrUnknown();
  const rl = await checkRateLimit(
    'email-availability',
    ip,
    BUCKETS.EMAIL_AVAILABILITY.max,
    BUCKETS.EMAIL_AVAILABILITY.windowMs,
  );
  if (!rl.ok) return { available: true, reason: 'error' };

  const supabase = createServerClient();

  // Primary path: PostgREST query against the auth.users table (service role).
  try {
    const { data, error } = await (supabase as unknown as { schema: (s: string) => { from: (t: string) => { select: (c: string) => { eq: (c: string, v: string) => { limit: (n: number) => { maybeSingle: () => Promise<{ data: { id: string } | null; error: unknown }> } } } } } })
      .schema('auth')
      .from('users')
      .select('id')
      .eq('email', normalized)
      .limit(1)
      .maybeSingle();
    if (!error) {
      return data ? { available: false, reason: 'taken' } : { available: true };
    }
  } catch {
    // fall through to REST fallback below
  }

  // Fallback: GoTrue admin REST. Self-hosted Supabase exposes /auth/v1/admin/users
  // — use the service-role key as the bearer.
  try {
    const url = new URL('/auth/v1/admin/users', process.env.NEXT_PUBLIC_SUPABASE_URL!);
    url.searchParams.set('email', normalized);
    url.searchParams.set('per_page', '1');
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`,
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      },
      cache: 'no-store',
    });
    if (!res.ok) return { available: true, reason: 'error' };
    const body = (await res.json()) as { users?: Array<{ email?: string }> };
    const users = body.users || [];
    const taken = users.some((u) => u.email?.toLowerCase() === normalized);
    return taken ? { available: false, reason: 'taken' } : { available: true };
  } catch {
    return { available: true, reason: 'error' };
  }
}

// Setup does NOT call verifySession — there is no iCut JWT yet during
// first-time setup. Instead we authenticate against the Supabase Auth cookie
// the signup page wrote (getAuthUserFromCookies above). Owner identity must
// come from that verified auth user — NEVER trust a client-supplied ownerId.

/**
 * Public lookup so the setup wizard can validate a sales agent code before
 * the user finishes signup. Returns only the agent's display name — never
 * email, phone, or user_id. The codespace is small (1000) but the response
 * exposes nothing more than would be visible on a marketing flyer.
 */
export async function lookupAgentByCode(
  code: string
): Promise<{ data: { name: string } | null; error: string | null }> {
  const trimmed = code?.trim().toUpperCase();
  if (!trimmed) return { data: null, error: 'Code is required' };

  // Brute-force surface: the code space is small (1000) and the endpoint
  // reveals agent names. Throttle per-IP with the GENERIC_READ shape so real
  // users typing their code don't trip but scrapers get stalled.
  const ip = await getIpOrUnknown();
  const rl = await checkRateLimit(
    'agent-lookup',
    ip,
    BUCKETS.GENERIC_READ.max,
    BUCKETS.GENERIC_READ.windowMs,
  );
  if (!rl.ok) return { data: null, error: rl.error ?? 'Too many lookups, please slow down.' };

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('sales_agents')
    .select('name, active')
    .eq('code', trimmed)
    .maybeSingle();
  if (error) return { data: null, error: safeError(error) };
  if (!data || !data.active) return { data: null, error: null };
  return { data: { name: data.name }, error: null };
}

export async function setupSalon(data: {
  existingSalonId?: string;
  name: string;
  slug: string;
  type: string;
  city: string;
  address: string;
  phone: string;
  whatsapp: string;
  branchName?: string;
  ownerId: string;
  agentCode?: string;
  prayerBlockEnabled: boolean;
  workingHours: Record<string, unknown>;
  services: Array<{ name: string; category: string; price: number; duration: number }>;
  partners: Array<{ name: string; email: string; phone: string; password: string }>;
  staff: Array<{ name: string; email: string; phone: string; role: string; password: string; baseSalary?: number; commissionType?: string; commissionRate?: number }>;
}) {
  // Defense-in-depth: setupSalon already requires a Supabase auth session
  // (ownerId), but an attacker who has a valid auth cookie could still script
  // repeated setup calls. A SIGNUP-shape per-IP cap matches the spirit of the
  // bucket (new-account farming).
  const ip = await getIpOrUnknown();
  const rl = await checkRateLimit(
    'setup-salon',
    ip,
    BUCKETS.SIGNUP.max,
    BUCKETS.SIGNUP.windowMs,
  );
  if (!rl.ok) return { data: null, error: rl.error ?? 'Too many setup attempts, please try again later.' };

  // Authenticate via the server-minted icut-token JWT. signSession() at
  // signup wrote this cookie with staffId=<Supabase auth user id>; the JWT
  // is HttpOnly, Secure, SameSite=Strict, and signed with SESSION_SECRET,
  // so trusting its staffId as the authenticated user is safe. A motivated
  // caller cannot forge it.
  //
  // We deliberately don't gate on Supabase auth cookies here because the
  // browser client stores its session in localStorage (the default for
  // createClient from @supabase/supabase-js), so there are no sb-*-auth-token
  // cookies for the server to read. The JWT check is equivalent authentication
  // with a different transport.
  let session;
  try {
    const { verifySession } = await import('./auth');
    session = await verifySession();
  } catch {
    // Fall back to the old Supabase-SSR cookie path so any session created
    // by a non-default (cookie-backed) Supabase client still works.
    const authUser = await getAuthUserFromCookies();
    if (!authUser) return { data: null, error: 'Not authenticated' };
    session = { staffId: authUser.id };
  }
  if (!session.staffId) return { data: null, error: 'Invalid session' };
  if (data.ownerId && data.ownerId !== session.staffId) {
    return { data: null, error: 'Not allowed' };
  }
  const ownerId = session.staffId;

  const supabase = createServerClient();

  if (!data.phone?.trim()) return { data: null, error: 'Salon phone is required' };
  for (const p of data.partners) {
    if (!p.phone?.trim()) return { data: null, error: `Phone is required for partner ${p.name}` };
  }
  for (const s of data.staff) {
    if (!s.phone?.trim()) return { data: null, error: `Phone is required for staff ${s.name}` };
  }

  // Resolve target salon id: prefer explicit existingSalonId, else the owner's
  // existing salon (retry case where the prior setup attempt already created
  // one). For existingSalonId, verify the caller owns it — otherwise they
  // could overwrite another salon's profile.
  let targetSalonId = data.existingSalonId;
  if (targetSalonId) {
    const { data: existing } = await supabase
      .from('salons')
      .select('id, owner_id')
      .eq('id', targetSalonId)
      .maybeSingle();
    if (!existing) return { data: null, error: 'Salon not found' };
    if (existing.owner_id !== ownerId) return { data: null, error: 'Not allowed' };
  }
  if (!targetSalonId) {
    const { data: ownedSalon } = await supabase
      .from('salons')
      .select('id')
      .eq('owner_id', ownerId)
      .maybeSingle();
    if (ownedSalon) targetSalonId = ownedSalon.id;
  }

  // Resolve a unique slug: if another salon already owns this slug, append -2, -3, …
  let uniqueSlug = data.slug;
  for (let attempt = 2; attempt <= 50; attempt++) {
    const { data: slugOwner } = await supabase
      .from('salons')
      .select('id')
      .eq('slug', uniqueSlug)
      .maybeSingle();
    if (!slugOwner || slugOwner.id === targetSalonId) break;
    uniqueSlug = `${data.slug}-${attempt}`;
  }

  // Resolve sales agent code → agent_id. Soft-fail: if code is missing or
  // unknown we proceed without attribution rather than blocking signup. The
  // commission accrual in payment-requests.approvePaymentRequest() reads
  // salons.sold_by_agent_id when the first payment lands, so as long as we
  // set it here the agent gets credited automatically on approval.
  let soldByAgentId: string | null = null;
  if (data.agentCode?.trim()) {
    const { data: agent } = await supabase
      .from('sales_agents')
      .select('id, active')
      .eq('code', data.agentCode.trim().toUpperCase())
      .maybeSingle();
    if (agent && agent.active) soldByAgentId = agent.id;
  }

  // Create or update salon
  const { data: newSalon, error: salonErr } = await supabase
    .from('salons')
    .upsert({
      ...(targetSalonId ? { id: targetSalonId } : {}),
      name: data.name,
      slug: uniqueSlug,
      type: data.type,
      city: data.city,
      address: data.address,
      phone: data.phone,
      whatsapp: data.whatsapp,
      owner_id: ownerId,
      setup_complete: true,
      prayer_block_enabled: data.prayerBlockEnabled,
      ...(soldByAgentId ? { sold_by_agent_id: soldByAgentId } : {}),
    })
    .select()
    .single();

  if (salonErr) return { data: null, error: safeError(salonErr) };

  // Create main branch — prefer user-provided name, fall back to "{city} Branch"
  // or "Main Branch" if neither was supplied.
  const mainBranchName =
    data.branchName?.trim() || (data.city ? `${data.city} Branch` : 'Main Branch');

  // Idempotent on retry: if this salon already has a main branch from a
  // prior (failed) setup attempt, update it in place rather than inserting
  // a duplicate. Without this, each retry stacks another "Main Branch" row.
  const { data: existingMain } = await supabase
    .from('branches')
    .select('*')
    .eq('salon_id', newSalon.id)
    .eq('is_main', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  let branch;
  if (existingMain) {
    const { data: updated, error: updErr } = await supabase
      .from('branches')
      .update({
        name: mainBranchName,
        address: data.address,
        phone: data.phone,
        working_hours: data.workingHours,
      })
      .eq('id', existingMain.id)
      .select()
      .single();
    if (updErr) return { data: null, error: safeError(updErr) };
    branch = updated;
  } else {
    const { data: inserted, error: branchErr } = await supabase
      .from('branches')
      .insert({
        salon_id: newSalon.id,
        name: mainBranchName,
        address: data.address,
        phone: data.phone,
        is_main: true,
        working_hours: data.workingHours,
      })
      .select()
      .single();
    if (branchErr) return { data: null, error: safeError(branchErr) };
    branch = inserted;
  }

  // Create services — per-branch since migration 036.
  if (data.services.length > 0) {
    const { error: svcErr } = await supabase.from('services').insert(
      data.services.map((s, i) => ({
        salon_id: newSalon.id,
        branch_id: branch.id,
        name: s.name,
        category: s.category,
        base_price: s.price,
        duration_minutes: s.duration,
        sort_order: i,
      }))
    );
    if (svcErr) return { data: null, error: safeError(svcErr) };
  }

  // Create partners — each gets a Supabase Auth account
  for (const p of data.partners) {
    const { data: authUser, error: authErr } = await authAdmin.createUser({
      email: p.email,
      password: p.password,
      email_confirm: true,
    });

    if (authErr) return { data: null, error: `Failed to create account for ${p.name}: ${safeError(authErr)}` };

    const { error: partnerErr } = await supabase.from('salon_partners').insert({
      salon_id: newSalon.id,
      name: p.name,
      email: p.email,
      phone: p.phone,
      auth_user_id: authUser.user.id,
      pin_code: null,
    });
    if (partnerErr) return { data: null, error: safeError(partnerErr) };
  }

  // Create staff — each gets a Supabase Auth account
  for (const s of data.staff) {
    const { data: authUser, error: authErr } = await authAdmin.createUser({
      email: s.email,
      password: s.password,
      email_confirm: true,
    });

    if (authErr) return { data: null, error: `Failed to create account for ${s.name}: ${safeError(authErr)}` };

    // Migration 036 renamed staff.branch_id → primary_branch_id and added a
    // staff_branches join table for multi-branch stylists. New staff start
    // with membership in the main branch only; owners can extend later.
    const { data: newStaff, error: staffErr } = await supabase.from('staff').insert({
      salon_id: newSalon.id,
      primary_branch_id: branch.id,
      name: s.name,
      email: s.email,
      phone: s.phone,
      auth_user_id: authUser.user.id,
      role: s.role,
      pin_code: null,
      base_salary: s.baseSalary ?? 0,
      commission_type: s.commissionType && s.commissionType !== 'none' ? s.commissionType : null,
      commission_rate: s.commissionRate ?? 0,
    }).select('id').single();
    if (staffErr) return { data: null, error: safeError(staffErr) };

    const { error: linkErr } = await supabase.from('staff_branches').insert({
      staff_id: newStaff.id,
      branch_id: branch.id,
    });
    if (linkErr) return { data: null, error: safeError(linkErr) };
  }

  // Send welcome email — best-effort, failures don't block setup.
  try {
    const { data: authData } = await authAdmin.getUserById(ownerId);
    const ownerEmail = authData?.user?.email;
    if (ownerEmail) {
      const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`
        : '/dashboard';
      await sendEmail(
        ownerEmail,
        `Welcome to iCut — ${data.name} is live`,
        welcomeEmail(data.name, dashboardUrl),
      );
    }
  } catch {
    // Welcome email is non-critical
  }

  return { data: { salon: newSalon, branch }, error: null };
}
