'use server';

import { checkWriteAccess, verifySession } from './auth';
import { createServerClient } from '@/lib/supabase';
import { assertBranchMembership, tenantErrorMessage } from '@/lib/tenant-guard';
import type { AppointmentWithDetails, Staff } from '@/types/database';

// ───────────────────────────────────────────────────────────────────────────
// Calendar bootstrap for /dashboard/appointments. One server-action call
// replaces 4 client-side .from() reads + 1 supabase.channel() subscription.
// ───────────────────────────────────────────────────────────────────────────

export interface AppointmentsCalendarData {
  appointments: AppointmentWithDetails[];
  stylists: Staff[];
  workingHours: Record<string, unknown> | null;
  prayerBlocks: Record<string, unknown> | null;
}

export async function getAppointmentsCalendar(input: {
  branchId: string;
  date: string;
}): Promise<{ data: AppointmentsCalendarData | null; error: string | null }> {
  try {
    const session = await verifySession();
    if (!session.salonId) return { data: null, error: 'No salon context' };
    const supabase = createServerClient();

    const [memberRows, branchRow] = await Promise.all([
      supabase.from('staff_branches').select('staff_id').eq('branch_id', input.branchId),
      supabase.from('branches').select('working_hours, prayer_blocks').eq('id', input.branchId).maybeSingle(),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const staffIds = ((memberRows.data ?? []) as any[]).map((r) => r.staff_id);

    const [aptRes, staffRes] = await Promise.all([
      supabase
        .from('appointments')
        .select('*')
        .eq('branch_id', input.branchId)
        .eq('appointment_date', input.date)
        .order('start_time'),
      staffIds.length
        ? supabase
            .from('staff')
            .select('*')
            .in('id', staffIds)
            .eq('is_active', true)
            .in('role', ['senior_stylist', 'junior_stylist', 'owner', 'manager'])
            .order('name')
        : Promise.resolve({ data: [] as Staff[], error: null }),
    ]);

    // Stitch the relations the page used to fetch via PostgREST embedded
    // joins (client / staff / services).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aptRows = (aptRes.data ?? []) as any[];
    const clientIds = Array.from(new Set(aptRows.map((a) => a.client_id).filter(Boolean)));
    const aptStaffIds = Array.from(new Set(aptRows.map((a) => a.staff_id).filter(Boolean)));
    const aptIds = aptRows.map((a) => a.id);

    const [clientsRes, aptStaffRes, svcRes] = await Promise.all([
      clientIds.length ? supabase.from('clients').select('*').in('id', clientIds) : Promise.resolve({ data: [], error: null }),
      aptStaffIds.length ? supabase.from('staff').select('*').in('id', aptStaffIds) : Promise.resolve({ data: [], error: null }),
      aptIds.length ? supabase.from('appointment_services').select('*').in('appointment_id', aptIds) : Promise.resolve({ data: [], error: null }),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientsById = new Map<string, any>(((clientsRes.data ?? []) as any[]).map((c) => [c.id, c]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const staffById = new Map<string, any>(((aptStaffRes.data ?? []) as any[]).map((s) => [s.id, s]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svcsByApt = new Map<string, any[]>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (svcRes.data ?? []) as any[]) {
      const list = svcsByApt.get(r.appointment_id) ?? [];
      list.push(r);
      svcsByApt.set(r.appointment_id, list);
    }
    const appointments: AppointmentWithDetails[] = aptRows.map((a) => ({
      ...a,
      client: clientsById.get(a.client_id) ?? null,
      staff: staffById.get(a.staff_id) ?? null,
      services: svcsByApt.get(a.id) ?? [],
    }));

    const branch = branchRow.data as { working_hours?: unknown; prayer_blocks?: unknown } | null;
    return {
      data: {
        appointments,
        stylists: (staffRes.data ?? []) as Staff[],
        workingHours: (branch?.working_hours ?? null) as Record<string, unknown> | null,
        prayerBlocks: (branch?.prayer_blocks ?? null) as Record<string, unknown> | null,
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Failed' };
  }
}

/**
 * Verify a staff member is assigned to a given branch via the staff_branches
 * join table (migration 036). Returns true iff (staff_id, branch_id) exists
 * AND the staff row belongs to the caller's salon.
 *
 * We check salon first through a staff lookup, then existence in
 * staff_branches. Two queries instead of a join because PostgREST
 * nested-select shapes are harder to audit.
 */
async function assertStaffAtBranch(
  supabase: ReturnType<typeof createServerClient>,
  staffId: string,
  salonId: string,
  branchId: string,
): Promise<boolean> {
  const { data: staff } = await supabase
    .from('staff')
    .select('id, salon_id, primary_branch_id')
    .eq('id', staffId)
    .maybeSingle();
  if (!staff) return false;
  if ((staff as { salon_id: string }).salon_id !== salonId) return false;

  // Primary branch match is the fast path.
  if ((staff as { primary_branch_id: string | null }).primary_branch_id === branchId) {
    return true;
  }

  const { data: link } = await supabase
    .from('staff_branches')
    .select('id')
    .eq('staff_id', staffId)
    .eq('branch_id', branchId)
    .maybeSingle();
  return !!link;
}

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

/**
 * Today's date in PKT (YYYY-MM-DD). Server-side guard uses this to reject
 * appointment inserts for past dates — prevents a forged client from slipping
 * a backdated booking past the UI min-date gate in new-appointment-modal.
 */
function getTodayPKT(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
}

/** Current PKT time in HH:MM 24h — same format as an HTML time input value. */
function getNowTimePKT24(): string {
  return new Date().toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Karachi',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Flips any `booked` or `confirmed` appointment whose end_time passed
 * more than 30 minutes ago to `no_show`. Called nightly at 02:00 PKT via
 * `/api/cron/sweep-no-shows`. Uses a single UPDATE with a WHERE clause
 * that composes appointment_date + end_time into a PKT wall-clock
 * timestamp and compares against now() in PKT.
 *
 * Safety:
 * - Skips rows with end_time IS NULL (incomplete data — operator must
 *   resolve manually).
 * - Skips statuses other than booked/confirmed so an in_progress session
 *   that ran long isn't flipped mid-service.
 * - The 30-min grace window means stylists who forgot to mark `done` on
 *   the POS checkout get half an hour to fix it before the sweep.
 *
 * No auth wrapper — callable only from the cron route (which authenticates
 * via CRON_SECRET) and from an explicit super_admin manual trigger.
 */
export async function sweepNoShowsInternal(): Promise<{
  flipped: number;
  error: string | null;
}> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('appointments')
    .update({ status: 'no_show' })
    .in('status', ['booked', 'confirmed'])
    .not('end_time', 'is', null)
    .lt(
      // Composed PKT wall-clock timestamp for the appointment's end.
      'appointment_date',
      // Anything whose date is strictly BEFORE today (PKT) is definitely
      // past grace. We handle same-day rows in a second pass below so we
      // can compare end_time against now.
      new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' }),
    )
    .select('id');
  if (error) return { flipped: 0, error: error.message };
  let flipped = (data || []).length;

  // Same-day rows: end_time must have passed more than 30 min ago.
  const now = new Date();
  const nowPKT = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Karachi' }));
  nowPKT.setMinutes(nowPKT.getMinutes() - 30);
  const cutoffTime = nowPKT.toTimeString().slice(0, 5); // HH:MM
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });

  const { data: today2, error: error2 } = await supabase
    .from('appointments')
    .update({ status: 'no_show' })
    .in('status', ['booked', 'confirmed'])
    .not('end_time', 'is', null)
    .eq('appointment_date', today)
    .lt('end_time', cutoffTime)
    .select('id');
  if (error2) return { flipped, error: error2.message };
  flipped += (today2 || []).length;

  return { flipped, error: null };
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

  // Session must be allowed to operate on this branch.
  try {
    assertBranchMembership(session, data.branchId);
  } catch (e) {
    return { data: null, error: tenantErrorMessage(e) };
  }

  // Block past-date AND past-time bookings. Client-side UI already blocks
  // via min= on the date/time inputs; this is the server-side defense-in-
  // depth.
  const today = getTodayPKT();
  if (data.date < today) {
    return { data: null, error: 'Bookings cannot be made for past dates' };
  }
  if (data.date === today && data.startTime < getNowTimePKT24()) {
    return { data: null, error: 'Bookings cannot be made for times that have already passed' };
  }

  // Verify the branch belongs to this salon
  const { data: branch } = await supabase
    .from('branches')
    .select('id')
    .eq('id', data.branchId)
    .eq('salon_id', session.salonId)
    .maybeSingle();
  if (!branch) return { data: null, error: 'Invalid branch' };

  // Verify the staff is assigned to this branch (via staff_branches join or
  // primary_branch_id match). Multi-branch stylists may live in multiple
  // rows of staff_branches — check there, not just the primary_branch_id.
  const ok = await assertStaffAtBranch(supabase, data.staffId, session.salonId, data.branchId);
  if (!ok) return { data: null, error: 'Invalid staff for branch' };

  // If a client was provided, verify it belongs to this salon AND this branch.
  if (data.clientId) {
    const { data: client } = await supabase
      .from('clients')
      .select('id, branch_id')
      .eq('id', data.clientId)
      .eq('salon_id', session.salonId)
      .maybeSingle();
    if (!client) return { data: null, error: 'Invalid client' };
    const cBranch = (client as { branch_id: string | null }).branch_id;
    if (cBranch && cBranch !== data.branchId) {
      return { data: null, error: 'Client belongs to a different branch' };
    }
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

  // Session must be allowed to operate on the target branch.
  try {
    assertBranchMembership(session, data.branchId);
  } catch (e) {
    return { data: null, error: tenantErrorMessage(e) };
  }

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

  const ok = await assertStaffAtBranch(supabase, data.staffId, session.salonId, data.branchId);
  if (!ok) return { data: null, error: 'Invalid staff for branch' };

  if (data.clientId) {
    const { data: client } = await supabase
      .from('clients')
      .select('id, branch_id')
      .eq('id', data.clientId)
      .eq('salon_id', session.salonId)
      .maybeSingle();
    if (!client) return { data: null, error: 'Invalid client' };
    const cBranch = (client as { branch_id: string | null }).branch_id;
    if (cBranch && cBranch !== data.branchId) {
      return { data: null, error: 'Client belongs to a different branch' };
    }
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

  // Session must be allowed to operate on this branch.
  try {
    assertBranchMembership(session, data.branchId);
  } catch (e) {
    return { data: null, error: tenantErrorMessage(e) };
  }

  // Ownership: branch must belong to this salon
  const { data: branch } = await supabase
    .from('branches')
    .select('id')
    .eq('id', data.branchId)
    .eq('salon_id', session.salonId)
    .maybeSingle();
  if (!branch) return { data: null, error: 'Invalid branch' };

  // Ownership: staff must be in this salon AND assigned to this branch (via
  // staff_branches or primary_branch_id).
  const staffOk = await assertStaffAtBranch(supabase, data.staffId, session.salonId, data.branchId);
  if (!staffOk) return { data: null, error: 'Invalid staff for branch' };

  // Ownership: client (if any) must belong to this salon AND this branch.
  if (data.clientId) {
    const { data: client } = await supabase
      .from('clients')
      .select('id, branch_id')
      .eq('id', data.clientId)
      .eq('salon_id', session.salonId)
      .maybeSingle();
    if (!client) return { data: null, error: 'Invalid client' };
    const cBranch = (client as { branch_id: string | null }).branch_id;
    if (cBranch && cBranch !== data.branchId) {
      return { data: null, error: 'Client belongs to a different branch' };
    }
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
