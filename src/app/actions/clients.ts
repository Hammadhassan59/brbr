'use server';

import { checkWriteAccess } from './auth';
import { createServerClient } from '@/lib/supabase';
import { clientUpdateSchema } from '@/lib/schemas';
import { assertClientOwned, tenantErrorMessage } from '@/lib/tenant-guard';

export async function createClient(data: {
  name: string;
  phone?: string | null;
  whatsapp?: string | null;
  gender?: string | null;
  notes?: string | null;
  hairNotes?: string | null;
  allergyNotes?: string | null;
  isVip?: boolean;
  isBlacklisted?: boolean;
  udhaarLimit?: number;
}) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { data: null, error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  const { data: result, error } = await supabase
    .from('clients')
    .insert({
      salon_id: session.salonId,
      name: data.name,
      phone: data.phone || null,
      whatsapp: data.whatsapp || null,
      gender: data.gender || null,
      notes: data.notes || null,
      hair_notes: data.hairNotes || null,
      allergy_notes: data.allergyNotes || null,
      is_vip: data.isVip ?? false,
      is_blacklisted: data.isBlacklisted ?? false,
      udhaar_limit: data.udhaarLimit ?? 5000,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: result, error: null };
}

export async function updateClient(id: string, data: unknown) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  const parsed = clientUpdateSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Invalid input' };
  }

  const { error } = await supabase
    .from('clients')
    .update(parsed.data)
    .eq('id', id)
    .eq('salon_id', session.salonId);

  if (error) return { error: error.message };
  return { error: null };
}

export async function updateClientNotes(clientId: string, field: 'notes' | 'hair_notes' | 'allergy_notes', value: string) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  const { error } = await supabase
    .from('clients')
    .update({ [field]: value })
    .eq('id', clientId)
    .eq('salon_id', session.salonId);

  if (error) return { error: error.message };
  return { error: null };
}

export async function recordUdhaarPayment(clientId: string, amount: number, paymentMethod: string) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  // Verify the client belongs to this salon BEFORE any insert — udhaar_payments
  // has no salon_id column, so this is the only tenant guard on the insert.
  let client: { id: string; salon_id: string; udhaar_balance: number | null };
  try {
    client = await assertClientOwned(clientId, session.salonId);
  } catch (e) {
    return { error: tenantErrorMessage(e) };
  }

  const { error: paymentErr } = await supabase
    .from('udhaar_payments')
    .insert({
      client_id: clientId,
      amount,
      payment_method: paymentMethod,
    });

  if (paymentErr) return { error: paymentErr.message };

  // Compute new balance from the row we already fetched, then update.
  const current = Number(client.udhaar_balance ?? 0);
  const { error: updErr } = await supabase
    .from('clients')
    .update({ udhaar_balance: Math.max(0, current - amount) })
    .eq('id', clientId)
    .eq('salon_id', session.salonId);

  if (updErr) return { error: updErr.message };
  return { error: null };
}

export async function updateClientStats(clientId: string, data: {
  loyaltyPoints: number;
  totalVisits: number;
  totalSpent: number;
  udhaarBalance: number;
}) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  const { error } = await supabase
    .from('clients')
    .update({
      loyalty_points: data.loyaltyPoints,
      total_visits: data.totalVisits,
      total_spent: data.totalSpent,
      udhaar_balance: data.udhaarBalance,
    })
    .eq('id', clientId)
    .eq('salon_id', session.salonId);

  if (error) return { error: error.message };
  return { error: null };
}
