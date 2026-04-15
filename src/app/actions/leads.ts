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
