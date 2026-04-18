'use server';

import { z } from 'zod';
import { createServerClient } from '@/lib/supabase';
import { requireAdminRole } from './auth';
import { safeError } from '@/lib/action-error';
import { checkRateLimit } from '@/lib/with-rate-limit';
import { BUCKETS } from '@/lib/rate-limit-buckets';

// ═══════════════════════════════════════════════════════════════════════════
// Admin settlements — super-admin / technical_support dashboard actions.
//
// Tracks what each salon owes the platform for home-service bookings
// (30% markup + Rs 300 service charge per completed home booking) and lets
// admins record out-of-band payments (bank transfer / JazzCash / EasyPaisa).
//
// Per-booking payable accumulation is done by the DB trigger
// `apply_payable_on_completion` (migration 041). Payment application and
// block clearing is done by the DB trigger `apply_settlement_payment`
// (migration 041). These server actions do NOT recompute any of that — they
// only read the running totals from `salons.marketplace_unsettled_payable`
// and insert rows into `salon_settlements` (which fires the trigger).
//
// "Contributing bookings" on the detail page:
//   The ledger is balance-based (one running counter per salon), not
//   per-booking. The DB does not stamp "settled-at" onto bookings. So the
//   cleanest approximation is "every home booking COMPLETED since the most
//   recent settlement". When no settlement exists yet, "since the epoch".
//   The total of those bookings' (markup + service_charge) will not always
//   exactly match current_unsettled — the trigger uses GREATEST(0, …), so
//   over-payments zero the balance without wiping booking history. The UI
//   shows both numbers and notes the gap.
// ═══════════════════════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────────────────────
// Role allow-list. Settlements are money movement and touch per-salon
// balance state, so we mirror /admin/payments (super_admin +
// technical_support). customer_support / leads_team are intentionally not
// on the list — they can't currently see per-salon finance screens.
// ───────────────────────────────────────────────────────────────────────────
const SETTLEMENT_ROLES = ['super_admin', 'technical_support'] as const;

// ───────────────────────────────────────────────────────────────────────────
// Types — exported so the page components can consume without re-declaring.
// ───────────────────────────────────────────────────────────────────────────

export interface SalonWithUnsettled {
  salon_id: string;
  salon_name: string;
  owner_name: string | null;
  owner_phone: string | null;
  unsettled: number;
  block_threshold: number;
  blocked_at: string | null;
  /** 'OK' | 'WARNING' | 'BLOCKED' — derived from unsettled vs threshold. */
  status: 'OK' | 'WARNING' | 'BLOCKED';
  home_bookings_contributing: number;
  last_payment_at: string | null;
}

export interface ContributingBooking {
  id: string;
  completed_at: string | null;
  requested_slot_start: string;
  platform_markup: number;
  service_charge: number;
  consumer_total: number;
  consumer_name: string | null;
  address_street: string | null;
}

export interface SettlementHistoryRow {
  id: string;
  amount: number;
  paid_at: string;
  recorded_by: string;
  note: string | null;
}

export interface SalonSettlementDetail {
  salon: {
    id: string;
    name: string;
    owner_name: string | null;
    owner_phone: string | null;
    unsettled: number;
    block_threshold: number;
    blocked_at: string | null;
    status: 'OK' | 'WARNING' | 'BLOCKED';
  };
  /** Home bookings COMPLETED since the most recent salon_settlements row (or since inception if none). */
  contributing_bookings: ContributingBooking[];
  /** Sum of (markup+service_charge) for contributing_bookings. */
  contributing_total: number;
  /** Past settlement payments, newest first. */
  history: SettlementHistoryRow[];
}

// ───────────────────────────────────────────────────────────────────────────
// Zod input schemas
// ───────────────────────────────────────────────────────────────────────────

const listInputSchema = z.object({
  minAmount: z.number().nonnegative().max(1e10).optional(),
  sort: z.enum(['amount_desc', 'last_payment_asc']).optional(),
});

// Cap at Rs 10,000,000 (decision brief). Amount must be strictly positive —
// the DB CHECK (amount > 0) also enforces this but failing at zod keeps the
// UX error cleaner.
const recordPaymentInputSchema = z.object({
  salonId: z.string().uuid('Invalid salon ID'),
  amount: z
    .number()
    .finite('Amount must be finite')
    .positive('Amount must be greater than 0')
    .max(10_000_000, 'Amount is unreasonably large'),
  note: z.string().max(1000, 'Note too long').optional(),
  paidAt: z
    .string()
    .refine((s) => !Number.isNaN(new Date(s).getTime()), 'Invalid ISO-8601 date')
    .optional(),
});

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function statusFor(
  unsettled: number,
  threshold: number,
  blockedAt: string | null,
): 'OK' | 'WARNING' | 'BLOCKED' {
  if (blockedAt) return 'BLOCKED';
  // Same 80% rule the sidebar docs mention.
  if (threshold > 0 && unsettled >= 0.8 * threshold) return 'WARNING';
  return 'OK';
}

// ───────────────────────────────────────────────────────────────────────────
// listSalonsWithUnsettled — overview table.
// ───────────────────────────────────────────────────────────────────────────

/**
 * List every salon with a non-zero unsettled payable. Sort defaults to
 * highest-owed first so the most urgent rows sit on top. Demo salons are
 * filtered out so test fixtures don't clutter the dashboard.
 */
export async function listSalonsWithUnsettled(
  input: { minAmount?: number; sort?: 'amount_desc' | 'last_payment_asc' } = {},
): Promise<{ data: SalonWithUnsettled[]; error: string | null }> {
  try {
    await requireAdminRole([...SETTLEMENT_ROLES]);
  } catch (e) {
    return { data: [], error: safeError(e) };
  }

  const parsed = listInputSchema.safeParse(input);
  if (!parsed.success) {
    return { data: [], error: parsed.error.issues[0]?.message || 'Invalid input' };
  }

  const { minAmount = 0.01, sort = 'amount_desc' } = parsed.data;

  const supabase = createServerClient();

  // Pull salons with positive balance. The .gt filter is on a numeric column,
  // so we pass the number as-is. is_demo is optional — not all deployments
  // have the column (added by migration 032); Supabase's select() tolerates
  // the missing filter gracefully if we .eq('is_demo', false) and the row
  // defaults to null, but we guard anyway by only filtering when it exists.
  let q = supabase
    .from('salons')
    .select(
      'id, name, owner_id, marketplace_unsettled_payable, marketplace_block_threshold, marketplace_payable_blocked_at, is_demo',
    )
    .gt('marketplace_unsettled_payable', minAmount);

  // Only order at the DB layer for amount_desc — last_payment_asc needs the
  // joined ledger row so we sort in application space below.
  if (sort === 'amount_desc') {
    q = q.order('marketplace_unsettled_payable', { ascending: false });
  }

  const { data: salons, error: salonErr } = await q;
  if (salonErr) return { data: [], error: safeError(salonErr) };

  const liveSalons = (salons || []).filter((s) => !s.is_demo);
  if (liveSalons.length === 0) return { data: [], error: null };

  const salonIds = liveSalons.map((s) => s.id);

  // Owner profile — join via owner_id (auth user id) to staff rows that
  // carry a name. Owners are usually represented as a `staff` row with
  // role='owner'. Lookup is best-effort; a missing owner shows as null.
  const { data: ownerRows } = await supabase
    .from('staff')
    .select('salon_id, name, phone')
    .in('salon_id', salonIds)
    .eq('role', 'owner');
  const ownerBySalon = new Map<string, { name: string | null; phone: string | null }>();
  for (const row of ownerRows || []) {
    if (!ownerBySalon.has(row.salon_id)) {
      ownerBySalon.set(row.salon_id, { name: row.name ?? null, phone: row.phone ?? null });
    }
  }

  // Last-payment lookup. A single query pulls every settlement row for
  // every listed salon (cheap — settlements are low-volume), ordered by
  // paid_at desc so the first row per salon is the latest.
  const { data: settlementRows } = await supabase
    .from('salon_settlements')
    .select('salon_id, paid_at')
    .in('salon_id', salonIds)
    .order('paid_at', { ascending: false });
  const lastPaymentBySalon = new Map<string, string>();
  for (const row of settlementRows || []) {
    if (!lastPaymentBySalon.has(row.salon_id)) {
      lastPaymentBySalon.set(row.salon_id, row.paid_at);
    }
  }

  // Contributing-booking counts per salon — "since the most recent
  // settlement, or since inception if none". We pull all COMPLETED home
  // bookings for listed salons, then partition in app-space by the latest
  // settlement timestamp. Volume here is bounded by live salons × average
  // monthly home bookings, which is easily paginatable but small enough
  // today to fit in one query.
  const { data: bookingRows } = await supabase
    .from('bookings')
    .select('salon_id, completed_at')
    .in('salon_id', salonIds)
    .eq('status', 'COMPLETED')
    .eq('location_type', 'home');
  const bookingCountBySalon = new Map<string, number>();
  for (const row of bookingRows || []) {
    const last = lastPaymentBySalon.get(row.salon_id);
    // A row completed before the last settlement has already been folded
    // into the ledger — exclude from "contributing" count. completed_at is
    // the trigger's source-of-truth timestamp for payable increments.
    if (last && row.completed_at && row.completed_at <= last) continue;
    bookingCountBySalon.set(
      row.salon_id,
      (bookingCountBySalon.get(row.salon_id) || 0) + 1,
    );
  }

  const shaped: SalonWithUnsettled[] = liveSalons.map((s) => {
    const unsettled = Number(s.marketplace_unsettled_payable) || 0;
    const threshold = Number(s.marketplace_block_threshold) || 5000;
    const blockedAt = s.marketplace_payable_blocked_at ?? null;
    const owner = ownerBySalon.get(s.id);
    return {
      salon_id: s.id,
      salon_name: s.name,
      owner_name: owner?.name ?? null,
      owner_phone: owner?.phone ?? null,
      unsettled,
      block_threshold: threshold,
      blocked_at: blockedAt,
      status: statusFor(unsettled, threshold, blockedAt),
      home_bookings_contributing: bookingCountBySalon.get(s.id) || 0,
      last_payment_at: lastPaymentBySalon.get(s.id) ?? null,
    };
  });

  if (sort === 'last_payment_asc') {
    // Nulls first — salons that have NEVER been settled are the highest
    // priority. Equal timestamps fall back to amount_desc so the admin
    // always sees a deterministic order.
    shaped.sort((a, b) => {
      if (a.last_payment_at === null && b.last_payment_at !== null) return -1;
      if (a.last_payment_at !== null && b.last_payment_at === null) return 1;
      if (a.last_payment_at !== b.last_payment_at) {
        return (a.last_payment_at ?? '').localeCompare(b.last_payment_at ?? '');
      }
      return b.unsettled - a.unsettled;
    });
  }

  return { data: shaped, error: null };
}

// ───────────────────────────────────────────────────────────────────────────
// getSalonSettlementDetail — detail page payload.
// ───────────────────────────────────────────────────────────────────────────

export async function getSalonSettlementDetail(
  salonId: string,
): Promise<{ data: SalonSettlementDetail | null; error: string | null }> {
  try {
    await requireAdminRole([...SETTLEMENT_ROLES]);
  } catch (e) {
    return { data: null, error: safeError(e) };
  }

  const parsed = z.string().uuid('Invalid salon ID').safeParse(salonId);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message || 'Invalid ID' };
  }

  const supabase = createServerClient();

  const { data: salonRow, error: salonErr } = await supabase
    .from('salons')
    .select(
      'id, name, owner_id, marketplace_unsettled_payable, marketplace_block_threshold, marketplace_payable_blocked_at',
    )
    .eq('id', parsed.data)
    .maybeSingle();
  if (salonErr) return { data: null, error: safeError(salonErr) };
  if (!salonRow) return { data: null, error: 'Salon not found' };

  // Owner profile — same staff-role=owner lookup as the list view.
  const { data: ownerRow } = await supabase
    .from('staff')
    .select('name, phone')
    .eq('salon_id', parsed.data)
    .eq('role', 'owner')
    .maybeSingle();

  // Settlement history — newest first.
  const { data: historyRows, error: histErr } = await supabase
    .from('salon_settlements')
    .select('id, amount, paid_at, recorded_by, note')
    .eq('salon_id', parsed.data)
    .order('paid_at', { ascending: false });
  if (histErr) return { data: null, error: safeError(histErr) };

  const lastSettlementAt = historyRows?.[0]?.paid_at ?? null;

  // Contributing bookings — home, COMPLETED, since last settlement.
  // Filters must stack BEFORE .order() (the builder returns a terminal
  // promise-like once order is applied).
  let bookingsQ = supabase
    .from('bookings')
    .select(
      'id, completed_at, requested_slot_start, platform_markup, service_charge, consumer_total, address_street, consumer_id',
    )
    .eq('salon_id', parsed.data)
    .eq('status', 'COMPLETED')
    .eq('location_type', 'home');
  if (lastSettlementAt) {
    bookingsQ = bookingsQ.gt('completed_at', lastSettlementAt);
  }
  const { data: bookingRows, error: bookErr } = await bookingsQ.order(
    'completed_at',
    { ascending: false },
  );
  if (bookErr) return { data: null, error: safeError(bookErr) };

  // Consumer names — best-effort; failing lookup leaves name as null rather
  // than breaking the page.
  const consumerIds = Array.from(
    new Set((bookingRows || []).map((b) => b.consumer_id).filter(Boolean)),
  ) as string[];
  const consumerNameById = new Map<string, string>();
  if (consumerIds.length > 0) {
    const { data: consumerRows } = await supabase
      .from('consumers')
      .select('id, name')
      .in('id', consumerIds);
    for (const row of consumerRows || []) {
      consumerNameById.set(row.id, row.name);
    }
  }

  const contributing: ContributingBooking[] = (bookingRows || []).map((b) => ({
    id: b.id,
    completed_at: b.completed_at,
    requested_slot_start: b.requested_slot_start,
    platform_markup: Number(b.platform_markup) || 0,
    service_charge: Number(b.service_charge) || 0,
    consumer_total: Number(b.consumer_total) || 0,
    consumer_name: b.consumer_id ? consumerNameById.get(b.consumer_id) ?? null : null,
    address_street: b.address_street,
  }));

  const contributingTotal = contributing.reduce(
    (acc, b) => acc + b.platform_markup + b.service_charge,
    0,
  );

  const unsettled = Number(salonRow.marketplace_unsettled_payable) || 0;
  const threshold = Number(salonRow.marketplace_block_threshold) || 5000;
  const blockedAt = salonRow.marketplace_payable_blocked_at ?? null;

  return {
    data: {
      salon: {
        id: salonRow.id,
        name: salonRow.name,
        owner_name: ownerRow?.name ?? null,
        owner_phone: ownerRow?.phone ?? null,
        unsettled,
        block_threshold: threshold,
        blocked_at: blockedAt,
        status: statusFor(unsettled, threshold, blockedAt),
      },
      contributing_bookings: contributing,
      contributing_total: contributingTotal,
      history: (historyRows || []).map((h) => ({
        id: h.id,
        amount: Number(h.amount) || 0,
        paid_at: h.paid_at,
        recorded_by: h.recorded_by,
        note: h.note,
      })),
    },
    error: null,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// recordSettlementPayment — the write path.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Record an out-of-band settlement payment against a salon's unsettled
 * payable. Inserts a `salon_settlements` row; the migration-041 trigger
 * `apply_settlement_payment` decrements the balance and clears the
 * marketplace block if the new balance drops below threshold.
 *
 * Writes an `admin_audit_log` row on success. Rate-limited via the generic
 * write bucket. super_admin + technical_support only.
 */
export async function recordSettlementPayment(input: {
  salonId: string;
  amount: number;
  note?: string;
  paidAt?: string;
}): Promise<{ error: string | null; data?: { settlementId: string } }> {
  let session;
  try {
    session = await requireAdminRole([...SETTLEMENT_ROLES]);
  } catch (e) {
    return { error: safeError(e) };
  }

  const rl = await checkRateLimit(
    'settlement-record-payment',
    session.staffId,
    BUCKETS.GENERIC_WRITE.max,
    BUCKETS.GENERIC_WRITE.windowMs,
  );
  if (!rl.ok) {
    return { error: rl.error ?? 'Too many requests, please try again later.' };
  }

  const parsed = recordPaymentInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Invalid input' };
  }

  const supabase = createServerClient();

  // Grab prior unsettled so the audit log captures both sides of the
  // transition. A missing salon row is a hard error — without it the
  // trigger has no row to decrement anyway.
  const { data: priorRow, error: priorErr } = await supabase
    .from('salons')
    .select('marketplace_unsettled_payable')
    .eq('id', parsed.data.salonId)
    .maybeSingle();
  if (priorErr) return { error: safeError(priorErr) };
  if (!priorRow) return { error: 'Salon not found' };
  const priorUnsettled = Number(priorRow.marketplace_unsettled_payable) || 0;

  const paidAtIso = parsed.data.paidAt ?? new Date().toISOString();

  const { data: insertRow, error: insertErr } = await supabase
    .from('salon_settlements')
    .insert({
      salon_id: parsed.data.salonId,
      amount: parsed.data.amount,
      paid_at: paidAtIso,
      recorded_by: session.staffId,
      note: parsed.data.note ?? null,
    })
    .select('id')
    .single();
  if (insertErr) return { error: safeError(insertErr) };

  // After-insert read — the trigger has run synchronously so this reflects
  // the decremented balance. Used only for audit metadata.
  const { data: afterRow } = await supabase
    .from('salons')
    .select('marketplace_unsettled_payable')
    .eq('id', parsed.data.salonId)
    .maybeSingle();
  const newUnsettled = afterRow ? Number(afterRow.marketplace_unsettled_payable) || 0 : null;

  // Audit log — best-effort. The payment has already applied; we log for
  // traceability but don't fail the user if the audit insert trips.
  const { error: auditErr } = await supabase.from('admin_audit_log').insert({
    admin_auth_user_id: session.staffId,
    action: 'settlement_payment_recorded',
    target_table: 'salon_settlements',
    target_id: insertRow?.id ?? null,
    salon_id: parsed.data.salonId,
    metadata: {
      salon_id: parsed.data.salonId,
      amount: parsed.data.amount,
      note: parsed.data.note ?? null,
      paid_at: paidAtIso,
      prior_unsettled: priorUnsettled,
      new_unsettled: newUnsettled,
    },
  });
  if (auditErr) {
     
    console.error('[admin-settlements] audit log insert failed', auditErr);
  }

  return { error: null, data: { settlementId: insertRow?.id ?? '' } };
}
