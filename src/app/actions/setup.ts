'use server';

import { createServerClient } from '@/lib/supabase';
import { createServerClient as createSupabaseSSRClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { sendEmail } from '@/lib/email-sender';
import { welcomeEmail } from '@/lib/email-templates';

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
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('sales_agents')
    .select('name, active')
    .eq('code', trimmed)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
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
  // Authenticate via Supabase Auth cookie. We REJECT any client-supplied
  // ownerId that doesn't match — otherwise a motivated caller could take
  // over someone else's salon by passing their user id.
  const authUser = await getAuthUserFromCookies();
  if (!authUser) return { data: null, error: 'Not authenticated' };
  if (data.ownerId && data.ownerId !== authUser.id) {
    return { data: null, error: 'Not allowed' };
  }
  const ownerId = authUser.id;

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

  if (salonErr) return { data: null, error: salonErr.message };

  // Create main branch — prefer user-provided name, fall back to "{city} Branch"
  // or "Main Branch" if neither was supplied.
  const mainBranchName =
    data.branchName?.trim() || (data.city ? `${data.city} Branch` : 'Main Branch');

  const { data: branch, error: branchErr } = await supabase
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

  if (branchErr) return { data: null, error: branchErr.message };

  // Create services
  if (data.services.length > 0) {
    const { error: svcErr } = await supabase.from('services').insert(
      data.services.map((s, i) => ({
        salon_id: newSalon.id,
        name: s.name,
        category: s.category,
        base_price: s.price,
        duration_minutes: s.duration,
        sort_order: i,
      }))
    );
    if (svcErr) return { data: null, error: svcErr.message };
  }

  // Create partners — each gets a Supabase Auth account
  for (const p of data.partners) {
    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email: p.email,
      password: p.password,
      email_confirm: true,
    });

    if (authErr) return { data: null, error: `Failed to create account for ${p.name}: ${authErr.message}` };

    const { error: partnerErr } = await supabase.from('salon_partners').insert({
      salon_id: newSalon.id,
      name: p.name,
      email: p.email,
      phone: p.phone,
      auth_user_id: authUser.user.id,
      pin_code: null,
    });
    if (partnerErr) return { data: null, error: partnerErr.message };
  }

  // Create staff — each gets a Supabase Auth account
  for (const s of data.staff) {
    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email: s.email,
      password: s.password,
      email_confirm: true,
    });

    if (authErr) return { data: null, error: `Failed to create account for ${s.name}: ${authErr.message}` };

    const { error: staffErr } = await supabase.from('staff').insert({
      salon_id: newSalon.id,
      branch_id: branch.id,
      name: s.name,
      email: s.email,
      phone: s.phone,
      auth_user_id: authUser.user.id,
      role: s.role,
      pin_code: null,
      base_salary: s.baseSalary ?? 0,
      commission_type: s.commissionType && s.commissionType !== 'none' ? s.commissionType : null,
      commission_rate: s.commissionRate ?? 0,
    });
    if (staffErr) return { data: null, error: staffErr.message };
  }

  // Send welcome email — best-effort, failures don't block setup.
  try {
    const { data: authData } = await supabase.auth.admin.getUserById(ownerId);
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
