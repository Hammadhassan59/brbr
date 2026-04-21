'use server';

import { createServerClient } from '@/lib/supabase';
import { requireAdminRole } from './auth';
import type { BonusMetric, BonusPeriod, AgencyCommission } from '@/types/sales';

export interface AgencyBonusTier {
  id: string;
  agency_id: string | null;
  metric: BonusMetric;
  period: BonusPeriod;
  threshold: number;
  bonus_amount: number;
  label: string | null;
  active: boolean;
  created_at: string;
  created_by: string | null;
}

// ───────────────────────────────────────
// Tier CRUD
// ───────────────────────────────────────

export async function listAgencyBonusTiers(): Promise<{ data: AgencyBonusTier[]; error: string | null }> {
  await requireAdminRole(['super_admin']);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('agency_bonus_tiers')
    .select('*')
    .order('metric', { ascending: true })
    .order('threshold', { ascending: true });
  if (error) return { data: [], error: error.message };
  return { data: (data || []) as AgencyBonusTier[], error: null };
}

export interface CreateAgencyBonusTierInput {
  agencyId: string | null;
  metric: BonusMetric;
  period: BonusPeriod;
  threshold: number;
  bonusAmount: number;
  label: string | null;
}

export async function createAgencyBonusTier(
  input: CreateAgencyBonusTierInput,
): Promise<{ data: AgencyBonusTier | null; error: string | null }> {
  const session = await requireAdminRole(['super_admin']);
  if (!Number.isFinite(input.threshold) || input.threshold <= 0) {
    return { data: null, error: 'Threshold must be > 0' };
  }
  if (!Number.isFinite(input.bonusAmount) || input.bonusAmount < 0) {
    return { data: null, error: 'Bonus amount must be >= 0' };
  }
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('agency_bonus_tiers')
    .insert({
      agency_id: input.agencyId,
      metric: input.metric,
      period: input.period,
      threshold: input.threshold,
      bonus_amount: input.bonusAmount,
      label: input.label,
      created_by: session.staffId,
    })
    .select()
    .single();
  if (error) return { data: null, error: error.message };
  return { data: data as AgencyBonusTier, error: null };
}

export async function updateAgencyBonusTier(
  id: string,
  fields: Partial<Pick<AgencyBonusTier, 'threshold' | 'bonus_amount' | 'label' | 'active'>>,
): Promise<{ error: string | null }> {
  await requireAdminRole(['super_admin']);
  if (fields.threshold !== undefined && (!Number.isFinite(fields.threshold) || fields.threshold <= 0)) {
    return { error: 'Threshold must be > 0' };
  }
  if (fields.bonus_amount !== undefined && (!Number.isFinite(fields.bonus_amount) || fields.bonus_amount < 0)) {
    return { error: 'Bonus amount must be >= 0' };
  }
  const supabase = createServerClient();
  const { error } = await supabase.from('agency_bonus_tiers').update(fields).eq('id', id);
  return { error: error?.message ?? null };
}

export async function deleteAgencyBonusTier(id: string): Promise<{ error: string | null }> {
  await requireAdminRole(['super_admin']);
  const supabase = createServerClient();
  const { error } = await supabase.from('agency_bonus_tiers').delete().eq('id', id);
  return { error: error?.message ?? null };
}

// ───────────────────────────────────────
// Manual one-off bonus
// ───────────────────────────────────────

export async function awardManualAgencyBonus(input: {
  agencyId: string;
  amount: number;
  notes: string;
}): Promise<{ data: AgencyCommission | null; error: string | null }> {
  await requireAdminRole(['super_admin']);
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { data: null, error: 'Amount must be > 0' };
  }
  if (!input.notes?.trim()) {
    return { data: null, error: 'Notes are required for manual bonuses (audit trail)' };
  }
  const supabase = createServerClient();
  // salon_id + payment_request_id are NOT NULL on agency_commissions
  // by schema. For manual bonuses that don't tie to a specific payment
  // we'd need to loosen those constraints — for now, enforce notes and
  // attach to the most recent approved payment_request for this agency
  // as the anchor. If none exists, reject.
  const { data: anchor } = await supabase
    .from('payment_requests')
    .select('id, salon_id')
    .eq('collected_by_agency_id', input.agencyId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!anchor) {
    return { data: null, error: 'Manual bonus requires at least one approved agency-collected payment as anchor' };
  }
  const anchorRow = anchor as { id: string; salon_id: string };
  const { data, error } = await supabase
    .from('agency_commissions')
    .insert({
      agency_id: input.agencyId,
      salon_id: anchorRow.salon_id,
      payment_request_id: anchorRow.id,
      kind: 'bonus',
      base_amount: 0,
      pct: 0,
      amount: input.amount,
      status: 'approved',
      notes: input.notes.trim(),
    })
    .select()
    .single();
  if (error) return { data: null, error: error.message };
  return { data: data as AgencyCommission, error: null };
}

// ───────────────────────────────────────
// Threshold evaluator
// ───────────────────────────────────────

async function computeAgencyMetrics(agencyId: string, fromIso: string, toIso: string) {
  const supabase = createServerClient();
  const [{ data: agents }, { data: allCommissions }] = await Promise.all([
    supabase.from('sales_agents').select('id').eq('agency_id', agencyId),
    supabase.from('agency_commissions').select('base_amount, created_at, status, kind').eq('agency_id', agencyId),
  ]);
  const agentIds = (agents || []).map((a: { id: string }) => a.id);

  let onboardedCount = 0;
  if (agentIds.length > 0) {
    const { count } = await supabase
      .from('salons')
      .select('id', { count: 'exact', head: true })
      .in('sold_by_agent_id', agentIds)
      .gte('created_at', fromIso)
      .lte('created_at', toIso);
    onboardedCount = count ?? 0;
  }

  let revenueGenerated = 0;
  for (const c of (allCommissions || []) as { base_amount: number; created_at: string; status: string; kind: string }[]) {
    if (c.kind !== 'first_sale' && c.kind !== 'renewal') continue;
    if (c.status !== 'approved' && c.status !== 'paid') continue;
    if (c.created_at < fromIso || c.created_at > toIso) continue;
    revenueGenerated += Number(c.base_amount || 0);
  }

  return { onboardedCount, revenueGenerated };
}

export async function evaluateAgencyBonusThresholds(): Promise<{
  data: { accrued: number; evaluated_agencies: number; skipped_existing: number };
  error: string | null;
}> {
  await requireAdminRole(['super_admin']);
  const supabase = createServerClient();

  const [{ data: tiers }, { data: agencies }] = await Promise.all([
    supabase.from('agency_bonus_tiers').select('*').eq('active', true),
    supabase.from('agencies').select('id').eq('status', 'active'),
  ]);
  if (!tiers || !agencies) {
    return { data: { accrued: 0, evaluated_agencies: 0, skipped_existing: 0 }, error: null };
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthStartDate = monthStart.toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const lifetimePeriodStart = '1970-01-01';
  const lifetimeFrom = '2020-01-01';

  const globalByKey = new Map<string, AgencyBonusTier[]>();
  const perAgencyByKey = new Map<string, AgencyBonusTier[]>();
  for (const t of tiers as AgencyBonusTier[]) {
    const key = `${t.metric}__${t.period}`;
    if (t.agency_id === null) {
      const arr = globalByKey.get(key) ?? [];
      arr.push(t);
      globalByKey.set(key, arr);
    } else {
      const agencyKey = `${t.agency_id}__${key}`;
      const arr = perAgencyByKey.get(agencyKey) ?? [];
      arr.push(t);
      perAgencyByKey.set(agencyKey, arr);
    }
  }

  let accrued = 0;
  let skipped = 0;

  for (const a of agencies as { id: string }[]) {
    const monthlyMetrics = await computeAgencyMetrics(
      a.id,
      `${monthStartDate}T00:00:00+05:00`,
      `${today}T23:59:59+05:00`,
    );
    const lifetimeMetrics = await computeAgencyMetrics(
      a.id,
      `${lifetimeFrom}T00:00:00+05:00`,
      `${today}T23:59:59+05:00`,
    );

    // Anchor payment_request for insertion. agency_commissions has
    // NOT NULL salon_id + payment_request_id — bonus rows attach to
    // the latest approved payment as their anchor. If the agency has
    // no approved payment yet, we skip — threshold can't be met
    // anyway in that case.
    const { data: anchor } = await supabase
      .from('payment_requests')
      .select('id, salon_id')
      .eq('collected_by_agency_id', a.id)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!anchor) continue;
    const anchorRow = anchor as { id: string; salon_id: string };

    for (const metric of ['onboarded_count', 'revenue_generated'] as const) {
      for (const period of ['monthly', 'lifetime'] as const) {
        const key = `${metric}__${period}`;
        const agencyTiers = perAgencyByKey.get(`${a.id}__${key}`);
        const tierSet = (agencyTiers && agencyTiers.length > 0 ? agencyTiers : globalByKey.get(key)) as
          | AgencyBonusTier[]
          | undefined;
        if (!tierSet || tierSet.length === 0) continue;

        const value = period === 'monthly'
          ? metric === 'onboarded_count' ? monthlyMetrics.onboardedCount : monthlyMetrics.revenueGenerated
          : metric === 'onboarded_count' ? lifetimeMetrics.onboardedCount : lifetimeMetrics.revenueGenerated;

        const periodStart = period === 'monthly' ? monthStartDate : lifetimePeriodStart;

        for (const tier of tierSet) {
          if (value >= Number(tier.threshold)) {
            const { error } = await supabase.from('agency_commissions').insert({
              agency_id: a.id,
              salon_id: anchorRow.salon_id,
              payment_request_id: anchorRow.id,
              kind: 'bonus',
              base_amount: 0,
              pct: 0,
              amount: Number(tier.bonus_amount),
              status: 'approved',
              bonus_tier_id: tier.id,
              bonus_period_start: periodStart,
              notes: `Auto: ${tier.label ?? metric} (${period}) @ ${tier.threshold}`,
            });
            if (error) {
              if (error.code === '23505') skipped += 1;
              else return { data: { accrued, evaluated_agencies: 0, skipped_existing: skipped }, error: error.message };
            } else {
              accrued += 1;
            }
          }
        }
      }
    }
  }

  return { data: { accrued, evaluated_agencies: agencies.length, skipped_existing: skipped }, error: null };
}
