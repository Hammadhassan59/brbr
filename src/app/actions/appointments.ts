'use server';

import { verifySession } from './auth';
import { createServerClient } from '@/lib/supabase';

export async function createAppointment(data: {
  branchId: string;
  clientId?: string | null;
  staffId: string;
  date: string;
  startTime: string;
  endTime: string;
  isWalkin?: boolean;
  notes?: string | null;
}) {
  const session = await verifySession();
  const supabase = createServerClient();

  const { data: result, error } = await supabase
    .from('appointments')
    .insert({
      salon_id: session.salonId,
      branch_id: data.branchId,
      client_id: data.clientId || null,
      staff_id: data.staffId,
      appointment_date: data.date,
      start_time: data.startTime,
      end_time: data.endTime,
      status: 'booked',
      is_walkin: data.isWalkin || false,
      notes: data.notes || null,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: result, error: null };
}

export async function createAppointmentServices(appointmentId: string, services: Array<{
  serviceId: string;
  serviceName: string;
  price: number;
  durationMinutes: number;
}>) {
  await verifySession();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('appointment_services')
    .insert(services.map(s => ({
      appointment_id: appointmentId,
      service_id: s.serviceId,
      service_name: s.serviceName,
      price: s.price,
      duration_minutes: s.durationMinutes,
    })));

  if (error) return { error: error.message };
  return { error: null };
}

export async function updateAppointmentStatus(id: string, status: string) {
  const session = await verifySession();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('appointments')
    .update({ status })
    .eq('id', id)
    .eq('salon_id', session.salonId);

  if (error) return { error: error.message };
  return { error: null };
}
