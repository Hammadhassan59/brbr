'use server';

import { verifySession } from './auth';
import { createServerClient } from '@/lib/supabase';

const VALID_STATUSES = [
  'booked',
  'confirmed',
  'in_progress',
  'done',
  'no_show',
  'cancelled',
] as const;
type AppointmentStatus = (typeof VALID_STATUSES)[number];

function isValidStatus(v: string): v is AppointmentStatus {
  return (VALID_STATUSES as readonly string[]).includes(v);
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

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

  // Verify the branch belongs to this salon
  const { data: branch } = await supabase
    .from('branches')
    .select('id')
    .eq('id', data.branchId)
    .eq('salon_id', session.salonId)
    .maybeSingle();
  if (!branch) return { data: null, error: 'Invalid branch' };

  // Verify the staff belongs to this salon AND this branch
  const { data: staff } = await supabase
    .from('staff')
    .select('id')
    .eq('id', data.staffId)
    .eq('salon_id', session.salonId)
    .eq('branch_id', data.branchId)
    .maybeSingle();
  if (!staff) return { data: null, error: 'Invalid staff for branch' };

  // If a client was provided, verify it belongs to this salon
  if (data.clientId) {
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('id', data.clientId)
      .eq('salon_id', session.salonId)
      .maybeSingle();
    if (!client) return { data: null, error: 'Invalid client' };
  }

  // Conflict detection. Running server-side closes the client-side round-trip
  // gap (ISSUE-018) but two concurrent server-action invocations can still
  // race — the only true fix is a Postgres exclusion constraint on
  // (staff_id, tsrange(start_time, end_time)) which requires a migration.
  // TODO: add that migration and drop this JS check.
  const { data: sameDay, error: conflictErr } = await supabase
    .from('appointments')
    .select('id, start_time, end_time, status')
    .eq('salon_id', session.salonId)
    .eq('staff_id', data.staffId)
    .eq('appointment_date', data.date)
    .not('status', 'in', '("cancelled","no_show")');
  if (conflictErr) return { data: null, error: conflictErr.message };

  const newStart = toMinutes(data.startTime);
  const newEnd = toMinutes(data.endTime);
  const conflict = (sameDay || []).find((apt: { start_time: string; end_time: string | null }) => {
    const aStart = toMinutes(apt.start_time);
    const aEnd = toMinutes(apt.end_time || '23:59');
    return aStart < newEnd && aEnd > newStart;
  });
  if (conflict) {
    return { data: null, error: 'This slot is already booked' };
  }

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
  const session = await verifySession();
  const supabase = createServerClient();

  // Verify the appointment belongs to this salon before attaching services
  const { data: apt } = await supabase
    .from('appointments')
    .select('id')
    .eq('id', appointmentId)
    .eq('salon_id', session.salonId)
    .maybeSingle();
  if (!apt) return { error: 'Invalid appointment' };

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

  if (!isValidStatus(status)) {
    return { error: 'Invalid status' };
  }

  const supabase = createServerClient();

  const { error } = await supabase
    .from('appointments')
    .update({ status })
    .eq('id', id)
    .eq('salon_id', session.salonId);

  if (error) return { error: error.message };
  return { error: null };
}
