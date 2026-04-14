'use server';

import { checkWriteAccess } from './auth';
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
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { data: null, error: writeCheck.error };
  const session = writeCheck.session;
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

export async function updateAppointment(id: string, data: {
  branchId: string;
  clientId?: string | null;
  staffId: string;
  date: string;
  startTime: string;
  endTime: string;
  notes?: string | null;
}) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { data: null, error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  // Ownership: the appointment must already belong to this salon
  const { data: existing } = await supabase
    .from('appointments')
    .select('id, status')
    .eq('id', id)
    .eq('salon_id', session.salonId)
    .maybeSingle();
  if (!existing) return { data: null, error: 'Invalid appointment' };

  // Refuse to edit terminal statuses
  if (existing.status === 'done' || existing.status === 'cancelled') {
    return { data: null, error: 'Cannot edit a ' + existing.status + ' appointment' };
  }

  // Same ownership checks as createAppointment for the new target
  const { data: branch } = await supabase
    .from('branches')
    .select('id')
    .eq('id', data.branchId)
    .eq('salon_id', session.salonId)
    .maybeSingle();
  if (!branch) return { data: null, error: 'Invalid branch' };

  const { data: staff } = await supabase
    .from('staff')
    .select('id')
    .eq('id', data.staffId)
    .eq('salon_id', session.salonId)
    .eq('branch_id', data.branchId)
    .maybeSingle();
  if (!staff) return { data: null, error: 'Invalid staff for branch' };

  if (data.clientId) {
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('id', data.clientId)
      .eq('salon_id', session.salonId)
      .maybeSingle();
    if (!client) return { data: null, error: 'Invalid client' };
  }

  // Conflict detection — exclude the appointment being edited so moving it
  // within its own existing window isn't flagged as conflicting with itself.
  const { data: sameDay, error: conflictErr } = await supabase
    .from('appointments')
    .select('id, start_time, end_time')
    .eq('salon_id', session.salonId)
    .eq('staff_id', data.staffId)
    .eq('appointment_date', data.date)
    .neq('id', id)
    .not('status', 'in', '("cancelled","no_show")');
  if (conflictErr) return { data: null, error: conflictErr.message };

  const newStart = toMinutes(data.startTime);
  const newEnd = toMinutes(data.endTime);
  const conflict = (sameDay || []).find((apt: { start_time: string; end_time: string | null }) => {
    const aStart = toMinutes(apt.start_time);
    const aEnd = toMinutes(apt.end_time || '23:59');
    return aStart < newEnd && aEnd > newStart;
  });
  if (conflict) return { data: null, error: 'This slot is already booked' };

  const { data: result, error } = await supabase
    .from('appointments')
    .update({
      branch_id: data.branchId,
      client_id: data.clientId || null,
      staff_id: data.staffId,
      appointment_date: data.date,
      start_time: data.startTime,
      end_time: data.endTime,
      notes: data.notes || null,
    })
    .eq('id', id)
    .eq('salon_id', session.salonId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: result, error: null };
}

export async function replaceAppointmentServices(appointmentId: string, services: Array<{
  serviceId: string;
  serviceName: string;
  price: number;
  durationMinutes: number;
}>) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  const { data: apt } = await supabase
    .from('appointments')
    .select('id')
    .eq('id', appointmentId)
    .eq('salon_id', session.salonId)
    .maybeSingle();
  if (!apt) return { error: 'Invalid appointment' };

  // Replace service list atomically: delete existing, then insert new.
  // A Postgres transaction via RPC would be cleaner; documenting as a TODO
  // alongside the exclusion-constraint migration.
  const { error: delErr } = await supabase
    .from('appointment_services')
    .delete()
    .eq('appointment_id', appointmentId);
  if (delErr) return { error: delErr.message };

  if (services.length === 0) return { error: null };

  const { error } = await supabase
    .from('appointment_services')
    .insert(services.map((s) => ({
      appointment_id: appointmentId,
      service_id: s.serviceId,
      service_name: s.serviceName,
      price: s.price,
      duration_minutes: s.durationMinutes,
    })));

  if (error) return { error: error.message };
  return { error: null };
}

export interface AppointmentServiceInput {
  serviceId: string;
  serviceName: string;
  price: number;
  durationMinutes: number;
}

export async function deleteAppointment(id: string) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  const { error } = await supabase
    .from('appointments')
    .delete()
    .eq('id', id)
    .eq('salon_id', session.salonId);

  if (error) return { error: error.message };
  return { error: null };
}

export async function createAppointmentServices(appointmentId: string, services: AppointmentServiceInput[]) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
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

/**
 * Atomic appointment + services create.
 *
 * Preferred path: calls the book_appointment_with_services RPC from migration
 * 008, which wraps both inserts in a real Postgres transaction and uses an
 * EXCLUDE constraint to block overlapping slots at the database layer. This
 * closes both ISSUE-018 (server-server conflict race) and ISSUE-019 (orphan
 * appointments on partial failure).
 *
 * Fallback path: if the RPC isn't present (developer hasn't applied the
 * migration yet), we hand-roll the same thing — create appointment, attach
 * services, delete the appointment if the services insert fails. The
 * hand-rolled rollback can itself fail and leave an orphan; that's the risk
 * that motivates migration 008.
 *
 * Ownership checks (branch/staff/client belong to session.salonId) always run
 * up front regardless of which path the write takes.
 */
export async function createAppointmentWithServices(
  data: {
    branchId: string;
    clientId?: string | null;
    staffId: string;
    date: string;
    startTime: string;
    endTime: string;
    isWalkin?: boolean;
    notes?: string | null;
  },
  services: AppointmentServiceInput[]
) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { data: null, error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  // Ownership: branch must belong to this salon
  const { data: branch } = await supabase
    .from('branches')
    .select('id')
    .eq('id', data.branchId)
    .eq('salon_id', session.salonId)
    .maybeSingle();
  if (!branch) return { data: null, error: 'Invalid branch' };

  // Ownership: staff must belong to this salon AND this branch
  const { data: staff } = await supabase
    .from('staff')
    .select('id')
    .eq('id', data.staffId)
    .eq('salon_id', session.salonId)
    .eq('branch_id', data.branchId)
    .maybeSingle();
  if (!staff) return { data: null, error: 'Invalid staff for branch' };

  // Ownership: client (if any) must belong to this salon
  if (data.clientId) {
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('id', data.clientId)
      .eq('salon_id', session.salonId)
      .maybeSingle();
    if (!client) return { data: null, error: 'Invalid client' };
  }

  // Preferred path: atomic RPC from migration 008
  const { data: rpcApptId, error: rpcErr } = await supabase.rpc('book_appointment_with_services', {
    p_salon_id: session.salonId,
    p_branch_id: data.branchId,
    p_client_id: data.clientId || null,
    p_staff_id: data.staffId,
    p_date: data.date,
    p_start_time: data.startTime,
    p_end_time: data.endTime,
    p_is_walkin: data.isWalkin || false,
    p_notes: data.notes || null,
    p_services: services.map((s) => ({
      serviceId: s.serviceId,
      serviceName: s.serviceName,
      price: s.price,
      durationMinutes: s.durationMinutes,
    })),
  });

  if (!rpcErr && rpcApptId) {
    return { data: { id: rpcApptId as string }, error: null };
  }

  // Exclusion constraint fired — someone else booked this slot first
  if (rpcErr?.code === '23P01' || /exclusion constraint|overlap/i.test(rpcErr?.message || '')) {
    return { data: null, error: 'This slot is already booked' };
  }

  // Function missing (42883) or schema cache miss (PGRST202) → migration 008
  // hasn't been applied to this database yet. Fall through to the hand-rolled
  // path so dev environments still work.
  const rpcMissing = rpcErr && (
    rpcErr.code === '42883' ||
    (rpcErr as { code?: string }).code === 'PGRST202' ||
    /could not find the function|function .* does not exist/i.test(rpcErr.message || '')
  );
  if (rpcErr && !rpcMissing) {
    return { data: null, error: rpcErr.message };
  }

  // Fallback: hand-rolled create + rollback. Same flow as before migration 008.
  const { data: apt, error: aptErr } = await createAppointment(data);
  if (aptErr || !apt) return { data: null, error: aptErr || 'Failed to create appointment' };

  if (services.length === 0) return { data: apt, error: null };

  const { error: svcErr } = await createAppointmentServices(apt.id, services);
  if (svcErr) {
    const { error: delErr } = await deleteAppointment(apt.id);
    if (delErr) {
      return { data: null, error: `${svcErr} (rollback failed: ${delErr})` };
    }
    return { data: null, error: svcErr };
  }

  return { data: apt, error: null };
}

export async function updateAppointmentStatus(id: string, status: string) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;

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
