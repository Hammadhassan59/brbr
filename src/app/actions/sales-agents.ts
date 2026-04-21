'use server';

import { createServerClient } from '@/lib/supabase';
import { verifySession, requireAdminRole } from './auth';
import { sendEmail } from '@/lib/email-sender';
import type { SalesAgent } from '@/types/sales';

export interface CreateAgentInput {
  email: string;
  name: string;
  phone: string;
  city: string | null;
  firstSalePct: number;
  renewalPct: number;
}

function validatePct(n: number): string | null {
  if (!Number.isFinite(n) || n < 0 || n > 100) return 'Percent must be between 0 and 100';
  return null;
}

export async function createSalesAgent(
  input: CreateAgentInput,
): Promise<{ data: SalesAgent | null; error: string | null }> {
  await requireAdminRole(['super_admin']);

  const pctErr = validatePct(input.firstSalePct) ?? validatePct(input.renewalPct);
  if (pctErr) return { data: null, error: pctErr };
  if (!input.email || !input.name) return { data: null, error: 'Email and name required' };
  if (!input.phone?.trim()) return { data: null, error: 'Phone is required' };

  const supabase = createServerClient();

  const tmpPassword = crypto.randomUUID() + 'A1!';
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email: input.email,
    password: tmpPassword,
    email_confirm: true,
  });
  if (authErr || !authData.user) {
    return { data: null, error: authErr?.message ?? 'Failed to create auth user' };
  }

  const { data, error } = await supabase
    .from('sales_agents')
    .insert({
      user_id: authData.user.id,
      name: input.name,
      phone: input.phone.trim(),
      city: input.city,
      first_sale_pct: input.firstSalePct,
      renewal_pct: input.renewalPct,
    })
    .select()
    .single();

  if (error) {
    await supabase.auth.admin.deleteUser(authData.user.id).catch(() => {});
    return { data: null, error: error.message };
  }

  try {
    const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://icut.pk';
    const { data: linkData } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: input.email,
      options: { redirectTo: `${origin}/reset-password` },
    });
    const link = linkData?.properties?.action_link;
    if (link) {
      await sendEmail(
        input.email,
        'iCut — Your sales agent account',
        `<p>Hi ${input.name},</p>
         <p>You've been added as a sales agent on iCut. Set your password here:</p>
         <p><a href="${link}">Set password</a></p>
         <p>Then log in at ${origin}/login.</p>`,
      );
    }
  } catch {
    // Non-critical — superadmin can resend via reset flow
  }

  return { data: data as SalesAgent, error: null };
}

export async function listSalesAgents(): Promise<{ data: SalesAgent[]; error: string | null }> {
  await requireAdminRole(['super_admin', 'leads_team']);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('sales_agents')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data || []) as SalesAgent[], error: null };
}

export async function getSalesAgent(id: string): Promise<{ data: SalesAgent | null; error: string | null }> {
  await requireAdminRole(['super_admin']);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('sales_agents')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data: (data as SalesAgent) || null, error: null };
}

export async function updateAgentRates(
  id: string,
  rates: { firstSalePct: number; renewalPct: number },
): Promise<{ error: string | null }> {
  await requireAdminRole(['super_admin']);
  const pctErr = validatePct(rates.firstSalePct) ?? validatePct(rates.renewalPct);
  if (pctErr) return { error: pctErr };
  const supabase = createServerClient();
  const { error } = await supabase
    .from('sales_agents')
    .update({ first_sale_pct: rates.firstSalePct, renewal_pct: rates.renewalPct })
    .eq('id', id);
  return { error: error?.message ?? null };
}

export async function setAgentActive(
  id: string,
  active: boolean,
): Promise<{ error: string | null }> {
  await requireAdminRole(['super_admin']);
  const supabase = createServerClient();
  const ts = active ? null : new Date().toISOString();

  const { error } = await supabase
    .from('sales_agents')
    .update({ active, deactivated_at: ts })
    .eq('id', id);
  return { error: error?.message ?? null };
}

export async function updateAgentProfile(
  id: string,
  fields: { name?: string; phone?: string; city?: string | null },
): Promise<{ error: string | null }> {
  await requireAdminRole(['super_admin']);
  if (fields.phone !== undefined && !fields.phone.trim()) {
    return { error: 'Phone cannot be empty' };
  }
  const supabase = createServerClient();
  const { error } = await supabase.from('sales_agents').update(fields).eq('id', id);
  return { error: error?.message ?? null };
}

export async function updateOwnAgentProfile(
  fields: { name: string; phone: string },
): Promise<{ error: string | null }> {
  const session = await verifySession();
  if (!session || session.role !== 'sales_agent' || !session.agentId) {
    throw new Error('Unauthorized');
  }
  if (!fields.phone?.trim()) return { error: 'Phone is required' };
  const supabase = createServerClient();
  const { error } = await supabase
    .from('sales_agents')
    .update({ name: fields.name, phone: fields.phone.trim() })
    .eq('id', session.agentId);
  return { error: error?.message ?? null };
}

export async function getMyAgentProfile(): Promise<{ data: SalesAgent | null; error: string | null }> {
  const session = await verifySession();
  if (!session || session.role !== 'sales_agent' || !session.agentId) throw new Error('Unauthorized');
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('sales_agents')
    .select('*')
    .eq('id', session.agentId)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data: (data as SalesAgent) || null, error: null };
}

/**
 * Returns true if the given Supabase auth user id belongs to a sales agent
 * OR a salon staff member. Used by the reset-password page to relax the
 * password policy — field agents and floor staff are non-technical, and the
 * strict 8-char+complexity rule is too much friction at the welcome-email
 * reset step. Salon owners, platform admins, and agency admins still hit
 * the strict policy. Service-role query so it works without a session.
 * No role guard: the caller already holds a valid Supabase recovery
 * session for the uid, and the answer is just a boolean that leaks nothing.
 */
export async function isAuthUserSalesAgent(
  authUserId: string,
): Promise<{ isAgent: boolean }> {
  if (!authUserId) return { isAgent: false };
  const supabase = createServerClient();
  const [{ count: agentCount }, { count: staffCount }] = await Promise.all([
    supabase.from('sales_agents').select('id', { count: 'exact', head: true }).eq('user_id', authUserId),
    supabase.from('staff').select('id', { count: 'exact', head: true }).eq('auth_user_id', authUserId),
  ]);
  return { isAgent: (agentCount ?? 0) > 0 || (staffCount ?? 0) > 0 };
}
