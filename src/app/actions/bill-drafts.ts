'use server';

import { createServerClient } from '@/lib/supabase';
import { verifySession } from './auth';

/**
 * Serialized POS cart state that can round-trip through a bill_drafts row.
 * Stored as JSONB so we don't have to schema-migrate every time the POS
 * grows a new local field. Keep this shape in sync with loadDraft()
 * consumers on the client.
 */
export interface DraftState {
  items: unknown[];           // BillLineItem[] — typed on the client
  selectedClientId: string | null;
  selectedStaffId: string | null;
  appointmentId: string | null;
  isWalkIn: boolean;
  discountType: 'flat' | 'percentage' | null;
  discountValue: number;
  promoCode: string;
  promoDiscount: number;
  loyaltyPointsUsed: number;
  tipAmount: number;
}

export interface BillDraft {
  id: string;
  salon_id: string;
  branch_id: string;
  created_by_staff_id: string | null;
  label: string | null;
  state: DraftState;
  created_at: string;
  updated_at: string;
}

async function requireBranchSession(branchId: string) {
  const session = await verifySession();
  if (!session.salonId || !session.branchIds?.includes(branchId)) {
    throw new Error('Unauthorized');
  }
  return session;
}

export async function saveDraft(input: {
  branchId: string;
  label: string | null;
  state: DraftState;
}): Promise<{ data: BillDraft | null; error: string | null }> {
  const session = await requireBranchSession(input.branchId);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('bill_drafts')
    .insert({
      salon_id: session.salonId,
      branch_id: input.branchId,
      created_by_staff_id: session.staffId || null,
      label: input.label,
      state: input.state as unknown as Record<string, unknown>,
    })
    .select()
    .single();
  if (error) return { data: null, error: error.message };
  return { data: data as unknown as BillDraft, error: null };
}

export async function listDrafts(
  branchId: string,
): Promise<{ data: BillDraft[]; error: string | null }> {
  await requireBranchSession(branchId);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('bill_drafts')
    .select('*')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data || []) as unknown as BillDraft[], error: null };
}

export async function loadDraft(
  draftId: string,
): Promise<{ data: BillDraft | null; error: string | null }> {
  const session = await verifySession();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('bill_drafts')
    .select('*')
    .eq('id', draftId)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: 'Draft not found' };
  // Enforce tenant scope defense-in-depth (RLS already does this, but the
  // service-role server client bypasses RLS).
  if ((data as { salon_id: string }).salon_id !== session.salonId) {
    return { data: null, error: 'Unauthorized' };
  }
  return { data: data as unknown as BillDraft, error: null };
}

export async function deleteDraft(draftId: string): Promise<{ error: string | null }> {
  const session = await verifySession();
  const supabase = createServerClient();
  // Gate on salon_id matching current session to prevent cross-tenant deletion.
  const { data: existing } = await supabase
    .from('bill_drafts')
    .select('salon_id')
    .eq('id', draftId)
    .maybeSingle();
  if (!existing) return { error: 'Draft not found' };
  if ((existing as { salon_id: string }).salon_id !== session.salonId) {
    return { error: 'Unauthorized' };
  }
  const { error } = await supabase.from('bill_drafts').delete().eq('id', draftId);
  return { error: error?.message ?? null };
}
