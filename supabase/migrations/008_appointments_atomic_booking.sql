-- ═══════════════════════════════════════
-- BrBr Migration 008: Atomic appointment booking
--
-- Closes two gaps the application couldn't fix from JS alone:
--
-- 1. ISSUE-018 (concurrent booking race) — until now, conflict detection
--    ran as a SELECT inside createAppointment. Two simultaneous server-action
--    invocations could both see the slot as free and both succeed. This
--    migration adds an EXCLUDE constraint that prevents two non-cancelled,
--    non-no-show appointments from overlapping on the same staff_id at the
--    database level. Postgres serialises the index lookup, so one insert
--    wins and the other fails with exclusion_violation.
--
-- 2. ISSUE-019 (orphan appointments on partial failure) — the hand-rolled
--    rollback in createAppointmentWithServices can itself fail if the delete
--    call fails, leaving an appointment with no services. This migration
--    adds book_appointment_with_services, a plpgsql function that wraps
--    both inserts in a real transaction. If the services insert fails, the
--    appointment insert is rolled back automatically.
--
-- Required extension: btree_gist — lets the GiST exclusion index compare
-- uuid values with the = operator. Safe to enable; used by Supabase's own
-- internal constraints in several places.
-- ═══════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ───────────────────────────────────────
-- 1. Exclusion constraint
-- ───────────────────────────────────────
--
-- The time range is built from (appointment_date, start_time, end_time).
-- Cancelled and no-show rows are excluded from the constraint so an
-- appointment can be rebooked into a cancelled slot. A NULL end_time is
-- coalesced to 23:59 so it still bounds a range — matches the JS check.
--
-- Because staff_id is uuid and timestamp ranges aren't natively gist-indexed,
-- we need btree_gist for the uuid side and the tsrange side comes from the
-- built-in range_ops.

ALTER TABLE appointments
  ADD CONSTRAINT appointments_no_overlap
  EXCLUDE USING gist (
    staff_id WITH =,
    tsrange(
      (appointment_date + start_time)::timestamp,
      (appointment_date + COALESCE(end_time, '23:59'::time))::timestamp,
      '[)'
    ) WITH &&
  )
  WHERE (status NOT IN ('cancelled', 'no_show') AND staff_id IS NOT NULL);

-- ───────────────────────────────────────
-- 2. Atomic book RPC
-- ───────────────────────────────────────
--
-- Inputs mirror the TypeScript createAppointmentWithServices shape so the
-- server action can pass through without transforming field names.
--
-- Security: SECURITY DEFINER runs with the function owner's rights, which
-- is how the Supabase service role invokes it. The calling server action
-- must still perform the ownership checks (branch/staff/client belong to
-- session.salonId) — this function trusts its arguments.

CREATE OR REPLACE FUNCTION public.book_appointment_with_services(
  p_salon_id uuid,
  p_branch_id uuid,
  p_client_id uuid,
  p_staff_id uuid,
  p_date date,
  p_start_time time,
  p_end_time time,
  p_is_walkin boolean,
  p_notes text,
  p_services jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_apt_id uuid;
  v_service jsonb;
BEGIN
  -- Insert the appointment. If it overlaps an existing booking for this
  -- staff, the exclusion constraint raises SQLSTATE 23P01.
  INSERT INTO appointments (
    salon_id, branch_id, client_id, staff_id,
    appointment_date, start_time, end_time,
    status, is_walkin, notes
  ) VALUES (
    p_salon_id, p_branch_id, p_client_id, p_staff_id,
    p_date, p_start_time, p_end_time,
    'booked', COALESCE(p_is_walkin, false), p_notes
  )
  RETURNING id INTO v_apt_id;

  -- Insert services. Any failure here rolls back the appointment insert
  -- because we're inside a single implicit transaction.
  IF p_services IS NOT NULL AND jsonb_typeof(p_services) = 'array' THEN
    FOR v_service IN SELECT * FROM jsonb_array_elements(p_services)
    LOOP
      INSERT INTO appointment_services (
        appointment_id, service_id, service_name, price, duration_minutes
      ) VALUES (
        v_apt_id,
        (v_service->>'serviceId')::uuid,
        v_service->>'serviceName',
        (v_service->>'price')::numeric,
        (v_service->>'durationMinutes')::integer
      );
    END LOOP;
  END IF;

  RETURN v_apt_id;
END;
$$;

COMMENT ON FUNCTION public.book_appointment_with_services IS
  'Atomic appointment + services insert. Raises 23P01 on overlapping slots.';

-- Supabase's default roles: service_role can invoke everything, authenticated
-- is the user-scoped role used by server actions via JWT. Grant to both.
GRANT EXECUTE ON FUNCTION public.book_appointment_with_services TO authenticated;
GRANT EXECUTE ON FUNCTION public.book_appointment_with_services TO service_role;
