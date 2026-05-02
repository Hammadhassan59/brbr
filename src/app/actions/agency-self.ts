'use server';

import { createServerClient } from '@/lib/supabase';
import { requireAgencyAdmin } from './auth';
import { sendEmail } from '@/lib/email-sender';
import type { Agency, SalesAgent, AgencyCommission, AgencyPayout } from '@/types/sales';
import * as authAdmin from '@/app/actions/auth-admin';

function validatePct(n: number): string | null {
  if (!Number.isFinite(n) || n < 0 || n > 100) return 'Percent must be between 0 and 100';
  return null;
}

/**
 * Self-service reads for agency_admin role. Every query scopes on the
 * session's agencyId so an agency admin can only ever see their own data,
 * even though we run with the service-role client that bypasses RLS.
 */

export async function getMyAgency(): Promise<{
  data: { agency: Agency | null; balance: { commissionEarned: number; commissionPaid: number; unpaidLiability: number; depositBalance: number } };
  error: string | null;
}> {
  const session = await requireAgencyAdmin();
  const supabase = createServerClient();

  const [{ data: agency, error: agencyErr }, { data: comms }, { data: depositLedger }, { data: unremitted }] = await Promise.all([
    supabase.from('agencies').select('*').eq('id', session.agencyId).maybeSingle(),
    supabase.from('agency_commissions').select('amount, status').eq('agency_id', session.agencyId),
    supabase.from('agency_deposit_ledger').select('kind, amount').eq('agency_id', session.agencyId),
    supabase
      .from('payment_requests')
      .select('amount, collected_by_agency_id, remitted_at, status')
      .eq('collected_by_agency_id', session.agencyId)
      .is('remitted_at', null)
      .eq('status', 'approved'),
  ]);
  if (agencyErr) return { data: { agency: null, balance: { commissionEarned: 0, commissionPaid: 0, unpaidLiability: 0, depositBalance: 0 } }, error: agencyErr.message };

  let commissionEarned = 0, commissionPaid = 0;
  for (const c of (comms || []) as { amount: number; status: string }[]) {
    const amt = Number(c.amount || 0);
    if (c.status === 'approved' || c.status === 'paid') commissionEarned += amt;
    if (c.status === 'paid') commissionPaid += amt;
  }

  let depositBalance = 0;
  for (const d of (depositLedger || []) as { kind: string; amount: number }[]) {
    if (d.kind === 'collected') depositBalance += Number(d.amount);
    else depositBalance -= Number(d.amount);
  }

  // Unpaid liability: approximation using the agency's stored rates on the
  // current agency row. Exact per-payment computation lives in the super_admin
  // getAgencyBalance; this read is for the agency's informational dashboard.
  const ag = agency as Agency | null;
  let unpaidLiability = 0;
  if (ag) {
    for (const p of (unremitted || []) as { amount: number }[]) {
      const share = Math.round((Number(p.amount) * Number(ag.first_sale_pct)) / 100 * 100) / 100;
      unpaidLiability += Number(p.amount) - share;
    }
    unpaidLiability = Math.round(unpaidLiability * 100) / 100;
  }

  return {
    data: {
      agency: ag,
      balance: { commissionEarned, commissionPaid, unpaidLiability, depositBalance },
    },
    error: null,
  };
}

export async function listMyAgents(): Promise<{ data: SalesAgent[]; error: string | null }> {
  const session = await requireAgencyAdmin();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('sales_agents')
    .select('*')
    .eq('agency_id', session.agencyId)
    .order('created_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data || []) as SalesAgent[], error: null };
}

export async function listMyCommissions(): Promise<{ data: AgencyCommission[]; error: string | null }> {
  const session = await requireAgencyAdmin();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('agency_commissions')
    .select('*')
    .eq('agency_id', session.agencyId)
    .order('created_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data || []) as AgencyCommission[], error: null };
}

export async function listMyPayouts(): Promise<{ data: AgencyPayout[]; error: string | null }> {
  const session = await requireAgencyAdmin();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('agency_payouts')
    .select('*')
    .eq('agency_id', session.agencyId)
    .order('requested_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data || []) as AgencyPayout[], error: null };
}

// ───────────────────────────────────────
// Agent CRUD for agency_admin
// ───────────────────────────────────────

/**
 * Asserts that the agency is in a state where it can still add/modify agents.
 * Terminated agencies are locked out of all write operations; frozen agencies
 * can still manage their team (the freeze only blocks tenant collections).
 */
async function assertAgencyWritable(agencyId: string): Promise<string | null> {
  const supabase = createServerClient();
  const { data } = await supabase.from('agencies').select('status').eq('id', agencyId).maybeSingle();
  if (!data) return 'Agency not found';
  if ((data as { status: string }).status === 'terminated') return 'Agency is terminated — write access revoked';
  return null;
}

export interface CreateAgencyAgentInput {
  email: string;
  name: string;
  phone: string;
  city: string | null;
  /** Internal rate: what the AGENCY pays this agent out of its own commission. */
  firstSalePct: number;
  /** Internal rate: what the AGENCY pays this agent for renewals. */
  renewalPct: number;
}

/**
 * Creates a sales-agent owned by the calling admin's agency. The agent's
 * auth_user_id is seeded so they can log in at /login and get routed to
 * /agent/leads like a platform-direct agent. Their `agency_id` is stamped
 * from the session so the commission-accrual path automatically routes
 * commissions to the agency (not the agent).
 *
 * Rates stored here are the agency's INTERNAL payroll — platform never
 * reads them. Platform pays the agency per agencies.first_sale_pct /
 * agencies.renewal_pct, and the agency uses these per-agent rates for
 * its own bookkeeping.
 */
export async function createAgencyAgent(
  input: CreateAgencyAgentInput,
): Promise<{ data: SalesAgent | null; error: string | null }> {
  const session = await requireAgencyAdmin();
  const lockErr = await assertAgencyWritable(session.agencyId);
  if (lockErr) return { data: null, error: lockErr };

  const pctErr = validatePct(input.firstSalePct) ?? validatePct(input.renewalPct);
  if (pctErr) return { data: null, error: pctErr };
  if (!input.email?.trim() || !input.name?.trim()) return { data: null, error: 'Email and name required' };
  if (!input.phone?.trim()) return { data: null, error: 'Phone is required' };

  const supabase = createServerClient();
  const email = input.email.trim().toLowerCase();

  // Create Supabase auth user with a random temp password — the welcome
  // email below includes a reset link so the agent sets their own.
  const tmpPassword = crypto.randomUUID() + 'A1!';
  const { data: authData, error: authErr } = await authAdmin.createUser({
    email,
    password: tmpPassword,
    email_confirm: true,
  });
  if (authErr || !authData.user) {
    return { data: null, error: authErr?.message ?? 'Failed to create auth user (email may already be in use)' };
  }

  const { data, error } = await supabase
    .from('sales_agents')
    .insert({
      user_id: authData.user.id,
      agency_id: session.agencyId,
      name: input.name.trim(),
      phone: input.phone.trim(),
      city: input.city?.trim() || null,
      first_sale_pct: input.firstSalePct,
      renewal_pct: input.renewalPct,
      active: true,
    })
    .select()
    .single();

  if (error) {
    // Rollback auth user on sales_agents insert failure.
    await authAdmin.deleteUser(authData.user.id).catch(() => {});
    return { data: null, error: error.message };
  }

  // Send welcome email with password-reset link. Non-fatal on failure —
  // agency admin can retry from the agents list.
  try {
    const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://icut.pk';
    const { data: linkData } = await authAdmin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${origin}/reset-password` },
    });
    const link = linkData?.properties?.action_link;
    if (link) {
      await sendEmail(
        email,
        'iCut — Your sales agent account',
        `<p>Hi ${input.name},</p>
         <p>You've been added as a sales agent on iCut. Set your password here:</p>
         <p><a href="${link}">Set password</a></p>
         <p>Then log in at ${origin}/login.</p>`,
      );
    }
  } catch {
    // swallow
  }

  return { data: data as SalesAgent, error: null };
}

export async function updateAgencyAgentProfile(
  agentId: string,
  fields: { name?: string; phone?: string; city?: string | null },
): Promise<{ error: string | null }> {
  const session = await requireAgencyAdmin();
  const lockErr = await assertAgencyWritable(session.agencyId);
  if (lockErr) return { error: lockErr };
  if (fields.phone !== undefined && !fields.phone.trim()) {
    return { error: 'Phone cannot be empty' };
  }
  const supabase = createServerClient();
  // Scope on agency_id so one agency's admin can't modify another agency's agents.
  const { error } = await supabase
    .from('sales_agents')
    .update(fields)
    .eq('id', agentId)
    .eq('agency_id', session.agencyId);
  return { error: error?.message ?? null };
}

export async function updateAgencyAgentRates(
  agentId: string,
  rates: { firstSalePct: number; renewalPct: number },
): Promise<{ error: string | null }> {
  const session = await requireAgencyAdmin();
  const lockErr = await assertAgencyWritable(session.agencyId);
  if (lockErr) return { error: lockErr };
  const pctErr = validatePct(rates.firstSalePct) ?? validatePct(rates.renewalPct);
  if (pctErr) return { error: pctErr };
  const supabase = createServerClient();
  const { error } = await supabase
    .from('sales_agents')
    .update({ first_sale_pct: rates.firstSalePct, renewal_pct: rates.renewalPct })
    .eq('id', agentId)
    .eq('agency_id', session.agencyId);
  return { error: error?.message ?? null };
}

export async function setAgencyAgentActive(
  agentId: string,
  active: boolean,
): Promise<{ error: string | null }> {
  const session = await requireAgencyAdmin();
  const lockErr = await assertAgencyWritable(session.agencyId);
  if (lockErr) return { error: lockErr };
  const supabase = createServerClient();
  const { error } = await supabase
    .from('sales_agents')
    .update({ active, deactivated_at: active ? null : new Date().toISOString() })
    .eq('id', agentId)
    .eq('agency_id', session.agencyId);
  return { error: error?.message ?? null };
}
