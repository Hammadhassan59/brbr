'use server';

import { createServerClient } from '@/lib/supabase';
import { sendEmail } from '@/lib/email-sender';
import { welcomeEmail } from '@/lib/email-templates';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

// Setup does NOT call verifySession — there is no session yet during first-time setup.
// The owner is authenticated via Supabase Auth (owner_id comes from getUser()).

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
  prayerBlockEnabled: boolean;
  workingHours: Record<string, unknown>;
  services: Array<{ name: string; category: string; price: number; duration: number }>;
  partners: Array<{ name: string; email: string; phone: string; password: string }>;
  staff: Array<{ name: string; email: string; phone: string; role: string; password: string; baseSalary?: number; commissionType?: string; commissionRate?: number }>;
}) {
  const supabase = createServerClient();

  if (!data.phone?.trim()) return { data: null, error: 'Salon phone is required' };
  for (const p of data.partners) {
    if (!p.phone?.trim()) return { data: null, error: `Phone is required for partner ${p.name}` };
  }
  for (const s of data.staff) {
    if (!s.phone?.trim()) return { data: null, error: `Phone is required for staff ${s.name}` };
  }

  // Resolve target salon id: prefer explicit existingSalonId, else the owner's
  // existing salon (retry case where the prior setup attempt already created one).
  let targetSalonId = data.existingSalonId;
  if (!targetSalonId && data.ownerId) {
    const { data: ownedSalon } = await supabase
      .from('salons')
      .select('id')
      .eq('owner_id', data.ownerId)
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
      owner_id: data.ownerId,
      setup_complete: true,
      prayer_block_enabled: data.prayerBlockEnabled,
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
    const { data: authData } = await supabase.auth.admin.getUserById(data.ownerId);
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
