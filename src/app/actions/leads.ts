'use server';

import { createServerClient } from '@/lib/supabase';
import { verifySession } from './auth';
import type { Lead, LeadStatus } from '@/types/sales';

async function requireSuperAdmin() {
  const s = await verifySession();
  if (!s || s.role !== 'super_admin') throw new Error('Unauthorized');
  return s;
}

async function requireSalesAgent() {
  const s = await verifySession();
  if (!s || s.role !== 'sales_agent' || !s.agentId) throw new Error('Unauthorized');
  return s;
}

export interface CreateLeadInput {
  salon_name: string;
  owner_name: string | null;
  phone: string | null;
  city: string | null;
  notes: string | null;
  assigned_agent_id: string;
}

export interface LeadWithAgent extends Lead {
  agent: { id: string; name: string } | null;
}

export async function createLead(input: CreateLeadInput): Promise<{ data: Lead | null; error: string | null }> {
  const session = await requireSuperAdmin();
  if (!input.salon_name?.trim()) return { data: null, error: 'Salon name required' };
  if (!input.assigned_agent_id) return { data: null, error: 'Agent required' };

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('leads')
    .insert({ ...input, created_by: session.staffId })
    .select()
    .single();
  if (error) return { data: null, error: error.message };
  return { data: data as Lead, error: null };
}

export async function listLeads(
  filter?: { agentId?: string; status?: LeadStatus | 'all' },
): Promise<{ data: LeadWithAgent[]; error: string | null }> {
  await requireSuperAdmin();
  const supabase = createServerClient();
  let q = supabase
    .from('leads')
    .select('*, agent:sales_agents(id, name)')
    .order('created_at', { ascending: false });
  if (filter?.agentId) q = q.eq('assigned_agent_id', filter.agentId);
  if (filter?.status && filter.status !== 'all') q = q.eq('status', filter.status);
  const { data, error } = await q;
  if (error) return { data: [], error: error.message };
  return { data: (data || []) as LeadWithAgent[], error: null };
}

export async function reassignLead(leadId: string, agentId: string): Promise<{ error: string | null }> {
  await requireSuperAdmin();
  const supabase = createServerClient();
  const { error } = await supabase.from('leads').update({ assigned_agent_id: agentId }).eq('id', leadId);
  return { error: error?.message ?? null };
}

/** Agent-side: list my assigned leads. */
export async function listMyLeads(
  filter?: { status?: LeadStatus | 'all' },
): Promise<{ data: Lead[]; error: string | null }> {
  const session = await requireSalesAgent();
  const supabase = createServerClient();
  let q = supabase
    .from('leads')
    .select('*')
    .eq('assigned_agent_id', session.agentId!)
    .order('updated_at', { ascending: false });
  if (filter?.status && filter.status !== 'all') q = q.eq('status', filter.status);
  const { data, error } = await q;
  if (error) return { data: [], error: error.message };
  return { data: (data || []) as Lead[], error: null };
}

export async function getMyLead(leadId: string): Promise<{ data: Lead | null; error: string | null }> {
  const session = await requireSalesAgent();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .eq('assigned_agent_id', session.agentId!)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data: (data as Lead) || null, error: null };
}

/** Agent-side: update own lead's editable fields. */
export async function updateMyLead(
  leadId: string,
  fields: { status?: LeadStatus; notes?: string | null; phone?: string | null; owner_name?: string | null; city?: string | null },
): Promise<{ error: string | null }> {
  const session = await requireSalesAgent();
  const supabase = createServerClient();
  const { error } = await supabase
    .from('leads')
    .update(fields)
    .eq('id', leadId)
    .eq('assigned_agent_id', session.agentId!);
  return { error: error?.message ?? null };
}

/** Superadmin-side: update status on any lead. */
export async function updateLeadStatus(leadId: string, status: LeadStatus): Promise<{ error: string | null }> {
  await requireSuperAdmin();
  const supabase = createServerClient();
  const { error } = await supabase.from('leads').update({ status }).eq('id', leadId);
  return { error: error?.message ?? null };
}

export interface ConvertInput {
  leadId: string;
  ownerEmail: string;
  plan: 'basic' | 'growth' | 'pro';
  amount: number;
  method: 'bank' | 'jazzcash' | 'cash';
  reference: string | null;
}

export async function convertLeadToSalon(
  input: ConvertInput,
): Promise<{ data: { salonId: string; paymentRequestId: string } | null; error: string | null }> {
  const session = await requireSalesAgent();
  if (!input.ownerEmail?.trim()) return { data: null, error: 'Owner email required' };
  if (!['basic','growth','pro'].includes(input.plan)) return { data: null, error: 'Invalid plan' };
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { data: null, error: 'Invalid amount' };

  const supabase = createServerClient();

  // 1. Verify the lead belongs to this agent and is not already converted
  const { data: lead } = await supabase
    .from('leads')
    .select('*')
    .eq('id', input.leadId)
    .eq('assigned_agent_id', session.agentId!)
    .maybeSingle();
  if (!lead) return { data: null, error: 'Lead not found' };
  if (lead.status === 'converted') return { data: null, error: 'Lead already converted' };

  // 2. Create auth user
  const tmpPassword = crypto.randomUUID() + 'A1!';
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email: input.ownerEmail.trim().toLowerCase(),
    password: tmpPassword,
    email_confirm: true,
  });
  if (authErr || !authData.user) return { data: null, error: authErr?.message ?? 'Failed to create owner account' };

  const ownerId = authData.user.id;
  const rollback = async () => {
    await supabase.auth.admin.deleteUser(ownerId).catch(() => {});
  };

  // 3. Create salon
  const { data: salon, error: salonErr } = await supabase
    .from('salons')
    .insert({
      name: lead.salon_name,
      owner_id: ownerId,
      city: lead.city,
      phone: lead.phone,
      sold_by_agent_id: session.agentId,
      subscription_status: 'pending',
      subscription_plan: 'none',
    })
    .select()
    .single();
  if (salonErr || !salon) {
    await rollback();
    return { data: null, error: salonErr?.message ?? 'Failed to create salon' };
  }

  // 4. Create payment_request (pending)
  const { data: pr, error: prErr } = await supabase
    .from('payment_requests')
    .insert({
      salon_id: salon.id,
      plan: input.plan,
      amount: Math.round(input.amount),
      reference: input.reference,
      method: input.method === 'cash' ? null : input.method,
      source: 'agent_collected',
      status: 'pending',
    })
    .select()
    .single();
  if (prErr || !pr) {
    try { await supabase.from('salons').delete().eq('id', salon.id); } catch { /* best-effort */ }
    await rollback();
    return { data: null, error: prErr?.message ?? 'Failed to create payment request' };
  }

  // 5. Mark lead converted
  const { error: leadErr } = await supabase
    .from('leads')
    .update({ status: 'converted', converted_salon_id: salon.id })
    .eq('id', input.leadId);
  if (leadErr) {
    // Payment request + salon stay; lead status flip is the least critical step.
    console.error('convertLeadToSalon: lead status update failed', leadErr);
  }

  // 6. Send password-reset link to new owner (best-effort)
  try {
    const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://icut.pk';
    const { data: linkData } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: input.ownerEmail.trim().toLowerCase(),
      options: { redirectTo: `${origin}/reset-password` },
    });
    const link = linkData?.properties?.action_link;
    if (link) {
      const { sendEmail } = await import('@/lib/email-sender');
      await sendEmail(
        input.ownerEmail,
        `iCut — Welcome to ${lead.salon_name}`,
        `<p>Your iCut account has been created by your sales agent.</p>
         <p><a href="${link}">Set your password</a> to get started. Once payment is approved, your subscription will activate.</p>`,
      );
    }
  } catch {
    // Non-critical
  }

  return { data: { salonId: salon.id, paymentRequestId: pr.id }, error: null };
}
