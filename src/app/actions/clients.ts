'use server';

import { verifyWriteAccess } from './auth';
import { createServerClient } from '@/lib/supabase';

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
  const session = await verifyWriteAccess();
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

export async function updateClient(id: string, data: Record<string, unknown>) {
  const session = await verifyWriteAccess();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('clients')
    .update(data)
    .eq('id', id)
    .eq('salon_id', session.salonId);

  if (error) return { error: error.message };
  return { error: null };
}

export async function updateClientNotes(clientId: string, field: 'notes' | 'hair_notes' | 'allergy_notes', value: string) {
  const session = await verifyWriteAccess();
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
  const session = await verifyWriteAccess();
  const supabase = createServerClient();

  const { error: paymentErr } = await supabase
    .from('udhaar_payments')
    .insert({
      client_id: clientId,
      amount,
      payment_method: paymentMethod,
    });

  if (paymentErr) return { error: paymentErr.message };

  // Get current balance to compute new balance
  const { data: client } = await supabase
    .from('clients')
    .select('udhaar_balance')
    .eq('id', clientId)
    .eq('salon_id', session.salonId)
    .single();

  if (client) {
    await supabase
      .from('clients')
      .update({ udhaar_balance: Math.max(0, client.udhaar_balance - amount) })
      .eq('id', clientId)
      .eq('salon_id', session.salonId);
  }

  return { error: null };
}

export async function updateClientStats(clientId: string, data: {
  loyaltyPoints: number;
  totalVisits: number;
  totalSpent: number;
  udhaarBalance: number;
}) {
  const session = await verifyWriteAccess();
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
