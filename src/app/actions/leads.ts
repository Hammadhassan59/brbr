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
  fields: { status?: LeadStatus; notes?: string | null; phone?: string | null; owner_name?: string | null; city?: string | null; address?: string | null },
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

/**
 * Agent-side: create a lead from the field. Accepts FormData so the optional
 * salon-storefront photo can ride along in the same round trip. The agent's
 * own agentId is stamped as both assigned_agent_id (visibility) and
 * created_by_agent (audit), so super admin can tell the lead came from the
 * field rather than from the office.
 */
export async function createMyLead(
  formData: FormData,
): Promise<{ data: Lead | null; error: string | null }> {
  const session = await requireSalesAgent();

  const salon_name = String(formData.get('salon_name') || '').trim();
  if (!salon_name) return { data: null, error: 'Salon name required' };

  const owner_name = String(formData.get('owner_name') || '').trim() || null;
  const phone = String(formData.get('phone') || '').trim() || null;
  const city = String(formData.get('city') || '').trim() || null;
  const address = String(formData.get('address') || '').trim() || null;
  const notes = String(formData.get('notes') || '').trim() || null;
  const photo = formData.get('photo');

  const supabase = createServerClient();

  // Upload the optional photo first; if it fails we still create the lead so
  // the agent doesn't lose their typed data over a flaky network.
  let photo_url: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    if (photo.size > 5 * 1024 * 1024) return { data: null, error: 'Photo too large (5MB max)' };
    const ext = photo.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${session.agentId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('lead-photos')
      .upload(path, photo, { contentType: photo.type || 'image/jpeg', upsert: false });
    if (!upErr) {
      const { data: urlData } = supabase.storage.from('lead-photos').getPublicUrl(path);
      photo_url = urlData.publicUrl;
    }
  }

  const { data, error } = await supabase
    .from('leads')
    .insert({
      salon_name,
      owner_name,
      phone,
      city,
      address,
      notes,
      photo_url,
      assigned_agent_id: session.agentId!,
      created_by: session.staffId,
      created_by_agent: session.agentId!,
      // Agent created in the field implies they at least visited; gives
      // super admin a more useful default than 'new'.
      status: 'visited',
    })
    .select()
    .single();
  if (error) return { data: null, error: error.message };
  return { data: data as Lead, error: null };
}

/**
 * Agent-side: record a cash collection for an existing salon they sold (a
 * monthly renewal paid in person). Creates a pending payment_request with
 * source='agent_collected' that super admin reviews exactly like a salon-self
 * payment. On approval the salon's subscription extends and the agent's
 * commission accrues automatically via the existing accrual hook.
 */
export async function recordCollection(input: {
  salonId: string;
  plan: 'basic' | 'growth' | 'pro';
  amount: number;
  notes?: string | null;
}): Promise<{ data: { paymentRequestId: string } | null; error: string | null }> {
  const session = await requireSalesAgent();
  if (!input.salonId) return { data: null, error: 'Salon required' };
  if (!['basic', 'growth', 'pro'].includes(input.plan)) return { data: null, error: 'Invalid plan' };
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { data: null, error: 'Invalid amount' };

  const supabase = createServerClient();

  // Defense in depth: agents can only record collections for salons they sold.
  const { data: salon } = await supabase
    .from('salons')
    .select('id, sold_by_agent_id')
    .eq('id', input.salonId)
    .maybeSingle();
  if (!salon || salon.sold_by_agent_id !== session.agentId) {
    return { data: null, error: 'You can only record collections for salons you sold' };
  }

  const { data: pr, error } = await supabase
    .from('payment_requests')
    .insert({
      salon_id: input.salonId,
      plan: input.plan,
      amount: Math.round(input.amount),
      reference: input.notes ?? null,
      method: null,                  // cash — no method on the rail level
      source: 'agent_collected',
      status: 'pending',
    })
    .select('id')
    .single();
  if (error || !pr) return { data: null, error: error?.message ?? 'Failed to record collection' };

  return { data: { paymentRequestId: pr.id }, error: null };
}

/**
 * Agent-side: running ledger between agent and the platform.
 * - collected: total approved payment_requests they cash-collected
 * - earned:    total commissions in approved or paid status
 * - settled:   commissions already paid out via agent_payouts
 * - balance:   collected - earned. Positive = agent owes admin (cash to
 *              hand over); negative = admin owes agent (payable to agent).
 */
export async function getAgentBalance(): Promise<{
  data: {
    code: string | null;
    collected: number;
    earned: number;
    settled: number;
    balance: number;
  };
  error: string | null;
}> {
  const session = await requireSalesAgent();
  const supabase = createServerClient();

  const [{ data: agent }, { data: salons }, { data: commissions }] = await Promise.all([
    supabase.from('sales_agents').select('code').eq('id', session.agentId!).maybeSingle(),
    supabase
      .from('salons')
      .select('id')
      .eq('sold_by_agent_id', session.agentId!),
    supabase
      .from('agent_commissions')
      .select('amount, status')
      .eq('agent_id', session.agentId!),
  ]);

  const salonIds = (salons || []).map((s: { id: string }) => s.id);
  let collected = 0;
  if (salonIds.length > 0) {
    const { data: payments } = await supabase
      .from('payment_requests')
      .select('amount')
      .in('salon_id', salonIds)
      .eq('source', 'agent_collected')
      .eq('status', 'approved');
    collected = (payments || []).reduce(
      (sum: number, p: { amount: number }) => sum + Number(p.amount || 0),
      0,
    );
  }

  let earned = 0;
  let settled = 0;
  for (const c of commissions || []) {
    const row = c as { amount: number; status: string };
    const amt = Number(row.amount || 0);
    if (row.status === 'approved' || row.status === 'paid') earned += amt;
    if (row.status === 'paid') settled += amt;
  }

  return {
    data: {
      code: (agent as { code?: string } | null)?.code ?? null,
      collected,
      earned,
      settled,
      balance: collected - earned,
    },
    error: null,
  };
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
