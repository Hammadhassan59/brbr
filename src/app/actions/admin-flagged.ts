'use server';

import { z } from 'zod';
import { createServerClient } from '@/lib/supabase';
import { requireAdminRole } from './auth';
import { safeError } from '@/lib/action-error';
import { UUIDSchema } from '@/lib/schemas/common';

// ═══════════════════════════════════════════════════════════════════════════
// Super-admin "Flagged" dashboard actions.
//
// Mirrors the platform-settings.ts pattern (super_admin-only + admin_audit_log
// write on every mutation, see platform-settings.ts:163-175). Two flagged
// surfaces:
//
//   Salons    — branches.rating_avg < 2 AND rating_count >= 5
//               AND salons.marketplace_admin_blocked_at IS NULL
//
//   Consumers — blocked_by_admin = false AND (
//                 (rating_avg < 2 AND rating_count >= 3)
//               OR no_show_count >= 3
//               OR post_confirm_cancel_count >= 5)
//
// The only admin action is Block / Unblock — per decision 29 the blocked
// party is never notified. We intentionally do NOT implement "Dismiss" or a
// flag_dismissals table: if a salon / consumer drops below threshold, they
// leave the list on their own.
// ═══════════════════════════════════════════════════════════════════════════

const BlockSalonSchema = z.object({
  salonId: UUIDSchema,
  reason: z.string().trim().min(1, 'Reason is required').max(500),
});
const UnblockSalonSchema = z.object({ salonId: UUIDSchema });
const BlockConsumerSchema = z.object({
  consumerId: UUIDSchema,
  reason: z.string().trim().min(1, 'Reason is required').max(500),
});
const UnblockConsumerSchema = z.object({ consumerId: UUIDSchema });
const GetReviewsSchema = z.object({
  salonId: UUIDSchema,
  limit: z.number().int().min(1).max(20).optional(),
});

export interface FlaggedSalonBranch {
  id: string;
  name: string;
  rating_avg: number | null;
  rating_count: number;
  listed_on_marketplace: boolean;
}

export interface FlaggedSalonRow {
  salon_id: string;
  salon_name: string;
  marketplace_admin_blocked_at: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  worst_rating_avg: number | null;
  total_review_count: number;
  branches: FlaggedSalonBranch[];
}

export interface FlaggedConsumerRow {
  id: string;
  name: string;
  phone: string;
  rating_avg: number | null;
  rating_count: number;
  no_show_count: number;
  post_confirm_cancel_count: number;
  blocked_by_admin: boolean;
  blocked_at: string | null;
  flag_reasons: string[];
}

export interface RecentReview {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  branch_id: string;
  branch_name: string | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Listing actions
// ─────────────────────────────────────────────────────────────────────────

/**
 * Shared branch-loader used by both the flagged + already-blocked salon
 * lists. Picks up EVERY branch under each salon id so the UI can show the
 * full branch list (not just the one below threshold).
 */
async function loadSalonBundle(
  salonIds: string[],
): Promise<Record<string, FlaggedSalonBranch[]>> {
  if (salonIds.length === 0) return {};
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('branches')
    .select('id, salon_id, name, rating_avg, rating_count, listed_on_marketplace')
    .in('salon_id', salonIds);
  if (error || !data) return {};
  const out: Record<string, FlaggedSalonBranch[]> = {};
  for (const b of data as Array<{ salon_id: string } & FlaggedSalonBranch>) {
    if (!out[b.salon_id]) out[b.salon_id] = [];
    out[b.salon_id].push({
      id: b.id,
      name: b.name,
      rating_avg: b.rating_avg,
      rating_count: b.rating_count,
      listed_on_marketplace: b.listed_on_marketplace,
    });
  }
  return out;
}

/**
 * Salons whose at least one branch has rating_avg < 2 with 5+ reviews AND
 * which are NOT already admin-blocked. Returns the salon + its branches +
 * the owning user's name/phone for admin contact.
 */
export async function listFlaggedSalons(): Promise<{
  data: FlaggedSalonRow[];
  error: string | null;
}> {
  try {
    await requireAdminRole(['super_admin']);
  } catch (e) {
    return { data: [], error: safeError(e) };
  }
  const supabase = createServerClient();

  // Step 1: branches crossing the threshold. We filter here (server-side) so
  // a salon with 50 branches doesn't drag down the payload.
  const { data: badBranches, error: bErr } = await supabase
    .from('branches')
    .select('id, salon_id, name, rating_avg, rating_count, listed_on_marketplace')
    .lt('rating_avg', 2)
    .gte('rating_count', 5);
  if (bErr) return { data: [], error: safeError(bErr) };

  const salonIds = Array.from(
    new Set((badBranches || []).map((b) => b.salon_id as string)),
  );
  if (salonIds.length === 0) return { data: [], error: null };

  // Step 2: salons (filter out already-blocked).
  const { data: salons, error: sErr } = await supabase
    .from('salons')
    .select('id, name, marketplace_admin_blocked_at, owner_id')
    .in('id', salonIds)
    .is('marketplace_admin_blocked_at', null);
  if (sErr) return { data: [], error: safeError(sErr) };

  const remainingIds = (salons || []).map((s) => s.id as string);
  if (remainingIds.length === 0) return { data: [], error: null };

  // Step 3: load ALL branches for those salons (not just the bad ones — the
  // UI renders the full branch list so the admin can see context).
  const branchesBySalon = await loadSalonBundle(remainingIds);

  // Step 4: owner name/phone. owner_id is an auth.users row. Look up via
  // salon_partners or fall back to staff. Simpler: query salons with nested
  // join — but owner_id isn't joinable from this client; we'll pull from
  // auth.admin.getUserById lazily. For now return nulls; the UI doesn't
  // hard-depend on owner contact. (Super admin can always click through to
  // the /admin/salons/[id] page.)
  const rows: FlaggedSalonRow[] = (salons || []).map((s) => {
    const branches = branchesBySalon[s.id] || [];
    const ratings = branches
      .filter((b) => b.rating_avg !== null)
      .map((b) => b.rating_avg as number);
    const worst = ratings.length > 0 ? Math.min(...ratings) : null;
    const totalReviews = branches.reduce((acc, b) => acc + (b.rating_count || 0), 0);
    return {
      salon_id: s.id,
      salon_name: s.name,
      marketplace_admin_blocked_at: s.marketplace_admin_blocked_at,
      owner_name: null,
      owner_phone: null,
      worst_rating_avg: worst,
      total_review_count: totalReviews,
      branches,
    };
  });

  return { data: rows, error: null };
}

/**
 * Salons the admin has already blocked. Rendered as a separate section of
 * the dashboard so an admin can unblock with the same UI.
 */
export async function listBlockedSalons(): Promise<{
  data: FlaggedSalonRow[];
  error: string | null;
}> {
  try {
    await requireAdminRole(['super_admin']);
  } catch (e) {
    return { data: [], error: safeError(e) };
  }
  const supabase = createServerClient();

  const { data: salons, error } = await supabase
    .from('salons')
    .select('id, name, marketplace_admin_blocked_at')
    .not('marketplace_admin_blocked_at', 'is', null)
    .order('marketplace_admin_blocked_at', { ascending: false });
  if (error) return { data: [], error: safeError(error) };

  const salonIds = (salons || []).map((s) => s.id as string);
  const branchesBySalon = await loadSalonBundle(salonIds);

  const rows: FlaggedSalonRow[] = (salons || []).map((s) => {
    const branches = branchesBySalon[s.id] || [];
    const ratings = branches
      .filter((b) => b.rating_avg !== null)
      .map((b) => b.rating_avg as number);
    const worst = ratings.length > 0 ? Math.min(...ratings) : null;
    const totalReviews = branches.reduce((acc, b) => acc + (b.rating_count || 0), 0);
    return {
      salon_id: s.id,
      salon_name: s.name,
      marketplace_admin_blocked_at: s.marketplace_admin_blocked_at,
      owner_name: null,
      owner_phone: null,
      worst_rating_avg: worst,
      total_review_count: totalReviews,
      branches,
    };
  });

  return { data: rows, error: null };
}

function inferConsumerFlagReasons(c: {
  rating_avg: number | null;
  rating_count: number;
  no_show_count: number;
  post_confirm_cancel_count: number;
}): string[] {
  const out: string[] = [];
  if (c.rating_avg !== null && c.rating_avg < 2 && c.rating_count >= 3) {
    out.push(`Low rating (${c.rating_avg.toFixed(1)}★ over ${c.rating_count} reviews)`);
  }
  if (c.no_show_count >= 3) {
    out.push(`${c.no_show_count} no-shows`);
  }
  if (c.post_confirm_cancel_count >= 5) {
    out.push(`${c.post_confirm_cancel_count} post-confirm cancellations`);
  }
  return out;
}

/**
 * Consumers tripping any of the three flag thresholds. Returns the row +
 * inferred flag-reason strings so the UI doesn't have to re-derive them.
 */
export async function listFlaggedConsumers(): Promise<{
  data: FlaggedConsumerRow[];
  error: string | null;
}> {
  try {
    await requireAdminRole(['super_admin']);
  } catch (e) {
    return { data: [], error: safeError(e) };
  }
  const supabase = createServerClient();

  // PostgREST doesn't compose (A AND B) OR C OR D cleanly in a single
  // .or() — we pull the not-blocked superset and filter client-side. The
  // consumer table is small (one row per registered user) so this is fine
  // for Phase 1.
  const { data, error } = await supabase
    .from('consumers')
    .select(
      'id, name, phone, rating_avg, rating_count, no_show_count, post_confirm_cancel_count, blocked_by_admin, blocked_at',
    )
    .eq('blocked_by_admin', false);
  if (error) return { data: [], error: safeError(error) };

  const rows: FlaggedConsumerRow[] = [];
  for (const c of data || []) {
    const reasons = inferConsumerFlagReasons(c);
    if (reasons.length === 0) continue;
    rows.push({
      id: c.id,
      name: c.name,
      phone: c.phone,
      rating_avg: c.rating_avg,
      rating_count: c.rating_count,
      no_show_count: c.no_show_count,
      post_confirm_cancel_count: c.post_confirm_cancel_count,
      blocked_by_admin: c.blocked_by_admin,
      blocked_at: c.blocked_at,
      flag_reasons: reasons,
    });
  }

  return { data: rows, error: null };
}

/**
 * Already-blocked consumers. Separate list so the admin can unblock.
 */
export async function listBlockedConsumers(): Promise<{
  data: FlaggedConsumerRow[];
  error: string | null;
}> {
  try {
    await requireAdminRole(['super_admin']);
  } catch (e) {
    return { data: [], error: safeError(e) };
  }
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('consumers')
    .select(
      'id, name, phone, rating_avg, rating_count, no_show_count, post_confirm_cancel_count, blocked_by_admin, blocked_at',
    )
    .eq('blocked_by_admin', true)
    .order('blocked_at', { ascending: false });
  if (error) return { data: [], error: safeError(error) };

  const rows: FlaggedConsumerRow[] = (data || []).map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    rating_avg: c.rating_avg,
    rating_count: c.rating_count,
    no_show_count: c.no_show_count,
    post_confirm_cancel_count: c.post_confirm_cancel_count,
    blocked_by_admin: c.blocked_by_admin,
    blocked_at: c.blocked_at,
    flag_reasons: inferConsumerFlagReasons(c),
  }));

  return { data: rows, error: null };
}

/**
 * 5 most recent consumer-of-salon reviews for the salon's branches.
 * Powers the snippet preview in the flagged-salons UI.
 */
export async function getRecentReviewsForSalon(
  salonId: string,
  limit = 5,
): Promise<{ data: RecentReview[]; error: string | null }> {
  try {
    await requireAdminRole(['super_admin']);
  } catch (e) {
    return { data: [], error: safeError(e) };
  }
  const parsed = GetReviewsSchema.safeParse({ salonId, limit });
  if (!parsed.success) {
    return { data: [], error: parsed.error.issues[0]?.message || 'Invalid input' };
  }

  const supabase = createServerClient();

  const { data: branches, error: bErr } = await supabase
    .from('branches')
    .select('id, name')
    .eq('salon_id', parsed.data.salonId);
  if (bErr) return { data: [], error: safeError(bErr) };

  const branchIds = (branches || []).map((b) => b.id as string);
  if (branchIds.length === 0) return { data: [], error: null };
  const branchNameById = new Map<string, string>(
    (branches || []).map((b) => [b.id as string, b.name as string]),
  );

  // We need reviews where direction='consumer_of_salon' and booking.branch_id
  // is in our set. Reviews joined to bookings: select via embed.
  const { data, error } = await supabase
    .from('reviews')
    .select('id, rating, comment, created_at, direction, booking_id, bookings!inner(branch_id)')
    .eq('direction', 'consumer_of_salon')
    .in('bookings.branch_id', branchIds)
    .order('created_at', { ascending: false })
    .limit(parsed.data.limit ?? 5);
  if (error) return { data: [], error: safeError(error) };

  type Row = {
    id: string;
    rating: number;
    comment: string | null;
    created_at: string;
    bookings: { branch_id: string } | { branch_id: string }[] | null;
  };
  const rows: RecentReview[] = (data as Row[] | null || []).map((r) => {
    const bj = Array.isArray(r.bookings) ? r.bookings[0] : r.bookings;
    const bid = bj?.branch_id ?? '';
    return {
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      created_at: r.created_at,
      branch_id: bid,
      branch_name: branchNameById.get(bid) ?? null,
    };
  });

  return { data: rows, error: null };
}

// ─────────────────────────────────────────────────────────────────────────
// Mutating actions — every success writes admin_audit_log.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Stamp salons.marketplace_admin_blocked_at = now(). No notification.
 * Audit-logged with reason + prior/new state so a second super admin can
 * reconstruct WHY a particular salon was pulled from the marketplace.
 */
export async function blockSalonMarketplace(input: {
  salonId: string;
  reason: string;
}): Promise<{ error: string | null }> {
  const session = await requireAdminRole(['super_admin']);

  const parsed = BlockSalonSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Invalid input' };
  }

  const supabase = createServerClient();

  const { data: existing, error: fetchErr } = await supabase
    .from('salons')
    .select('marketplace_admin_blocked_at')
    .eq('id', parsed.data.salonId)
    .maybeSingle();
  if (fetchErr) return { error: safeError(fetchErr) };
  if (!existing) return { error: 'Salon not found' };

  const now = new Date().toISOString();
  const { error: updErr } = await supabase
    .from('salons')
    .update({ marketplace_admin_blocked_at: now })
    .eq('id', parsed.data.salonId);
  if (updErr) return { error: safeError(updErr) };

  const { error: auditErr } = await supabase.from('admin_audit_log').insert({
    admin_auth_user_id: session.staffId,
    action: 'marketplace_block_salon',
    target_table: 'salons',
    target_id: parsed.data.salonId,
    salon_id: parsed.data.salonId,
    metadata: {
      reason: parsed.data.reason,
      prior_state: {
        marketplace_admin_blocked_at: existing.marketplace_admin_blocked_at,
      },
      new_state: { marketplace_admin_blocked_at: now },
    },
  });
  if (auditErr) {
     
    console.error('[admin-flagged] audit insert failed (block salon)', auditErr);
  }

  return { error: null };
}

export async function unblockSalonMarketplace(input: {
  salonId: string;
}): Promise<{ error: string | null }> {
  const session = await requireAdminRole(['super_admin']);

  const parsed = UnblockSalonSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Invalid input' };
  }

  const supabase = createServerClient();

  const { data: existing, error: fetchErr } = await supabase
    .from('salons')
    .select('marketplace_admin_blocked_at')
    .eq('id', parsed.data.salonId)
    .maybeSingle();
  if (fetchErr) return { error: safeError(fetchErr) };
  if (!existing) return { error: 'Salon not found' };

  const { error: updErr } = await supabase
    .from('salons')
    .update({ marketplace_admin_blocked_at: null })
    .eq('id', parsed.data.salonId);
  if (updErr) return { error: safeError(updErr) };

  const { error: auditErr } = await supabase.from('admin_audit_log').insert({
    admin_auth_user_id: session.staffId,
    action: 'marketplace_unblock_salon',
    target_table: 'salons',
    target_id: parsed.data.salonId,
    salon_id: parsed.data.salonId,
    metadata: {
      prior_state: {
        marketplace_admin_blocked_at: existing.marketplace_admin_blocked_at,
      },
      new_state: { marketplace_admin_blocked_at: null },
    },
  });
  if (auditErr) {
     
    console.error('[admin-flagged] audit insert failed (unblock salon)', auditErr);
  }

  return { error: null };
}

/**
 * Set consumers.blocked_by_admin = true + blocked_at = now(). Blocked
 * consumers keep account access but the booking endpoints will refuse new
 * requests. No notification to the consumer.
 */
export async function blockConsumer(input: {
  consumerId: string;
  reason: string;
}): Promise<{ error: string | null }> {
  const session = await requireAdminRole(['super_admin']);

  const parsed = BlockConsumerSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Invalid input' };
  }

  const supabase = createServerClient();

  const { data: existing, error: fetchErr } = await supabase
    .from('consumers')
    .select('blocked_by_admin, blocked_at')
    .eq('id', parsed.data.consumerId)
    .maybeSingle();
  if (fetchErr) return { error: safeError(fetchErr) };
  if (!existing) return { error: 'Consumer not found' };

  const now = new Date().toISOString();
  const { error: updErr } = await supabase
    .from('consumers')
    .update({ blocked_by_admin: true, blocked_at: now })
    .eq('id', parsed.data.consumerId);
  if (updErr) return { error: safeError(updErr) };

  const { error: auditErr } = await supabase.from('admin_audit_log').insert({
    admin_auth_user_id: session.staffId,
    action: 'marketplace_block_consumer',
    target_table: 'consumers',
    target_id: parsed.data.consumerId,
    metadata: {
      reason: parsed.data.reason,
      prior_state: {
        blocked_by_admin: existing.blocked_by_admin,
        blocked_at: existing.blocked_at,
      },
      new_state: { blocked_by_admin: true, blocked_at: now },
    },
  });
  if (auditErr) {
     
    console.error('[admin-flagged] audit insert failed (block consumer)', auditErr);
  }

  return { error: null };
}

export async function unblockConsumer(input: {
  consumerId: string;
}): Promise<{ error: string | null }> {
  const session = await requireAdminRole(['super_admin']);

  const parsed = UnblockConsumerSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Invalid input' };
  }

  const supabase = createServerClient();

  const { data: existing, error: fetchErr } = await supabase
    .from('consumers')
    .select('blocked_by_admin, blocked_at')
    .eq('id', parsed.data.consumerId)
    .maybeSingle();
  if (fetchErr) return { error: safeError(fetchErr) };
  if (!existing) return { error: 'Consumer not found' };

  const { error: updErr } = await supabase
    .from('consumers')
    .update({ blocked_by_admin: false, blocked_at: null })
    .eq('id', parsed.data.consumerId);
  if (updErr) return { error: safeError(updErr) };

  const { error: auditErr } = await supabase.from('admin_audit_log').insert({
    admin_auth_user_id: session.staffId,
    action: 'marketplace_unblock_consumer',
    target_table: 'consumers',
    target_id: parsed.data.consumerId,
    metadata: {
      prior_state: {
        blocked_by_admin: existing.blocked_by_admin,
        blocked_at: existing.blocked_at,
      },
      new_state: { blocked_by_admin: false, blocked_at: null },
    },
  });
  if (auditErr) {
     
    console.error('[admin-flagged] audit insert failed (unblock consumer)', auditErr);
  }

  return { error: null };
}
