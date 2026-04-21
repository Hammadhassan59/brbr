'use server';

import { createServerClient } from '@/lib/supabase';
import { requireAdminRole } from './auth';
import type { BonusTier, BonusMetric, BonusPeriod, AgentCommission } from '@/types/sales';
import { getAgentPerformance } from './agent-performance';

// ───────────────────────────────────────
// Tier CRUD
// ───────────────────────────────────────

export async function listBonusTiers(): Promise<{ data: BonusTier[]; error: string | null }> {
  await requireAdminRole(['super_admin']);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('bonus_tiers')
    .select('*')
    .order('metric', { ascending: true })
    .order('threshold', { ascending: true });
  if (error) return { data: [], error: error.message };
  return { data: (data || []) as BonusTier[], error: null };
}

export interface CreateBonusTierInput {
  agentId: string | null;
  metric: BonusMetric;
  period: BonusPeriod;
  threshold: number;
  bonusAmount: number;
  label: string | null;
}

export async function createBonusTier(
  input: CreateBonusTierInput,
): Promise<{ data: BonusTier | null; error: string | null }> {
  const session = await requireAdminRole(['super_admin']);
  if (!Number.isFinite(input.threshold) || input.threshold <= 0) {
    return { data: null, error: 'Threshold must be > 0' };
  }
  if (!Number.isFinite(input.bonusAmount) || input.bonusAmount < 0) {
    return { data: null, error: 'Bonus amount must be >= 0' };
  }
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('bonus_tiers')
    .insert({
      agent_id: input.agentId,
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
  return { data: data as BonusTier, error: null };
}

export async function updateBonusTier(
  id: string,
  fields: Partial<Pick<BonusTier, 'threshold' | 'bonus_amount' | 'label' | 'active'>>,
): Promise<{ error: string | null }> {
  await requireAdminRole(['super_admin']);
  if (fields.threshold !== undefined && (!Number.isFinite(fields.threshold) || fields.threshold <= 0)) {
    return { error: 'Threshold must be > 0' };
  }
  if (fields.bonus_amount !== undefined && (!Number.isFinite(fields.bonus_amount) || fields.bonus_amount < 0)) {
    return { error: 'Bonus amount must be >= 0' };
  }
  const supabase = createServerClient();
  const { error } = await supabase.from('bonus_tiers').update(fields).eq('id', id);
  return { error: error?.message ?? null };
}

export async function deleteBonusTier(id: string): Promise<{ error: string | null }> {
  await requireAdminRole(['super_admin']);
  const supabase = createServerClient();
  const { error } = await supabase.from('bonus_tiers').delete().eq('id', id);
  return { error: error?.message ?? null };
}

// ───────────────────────────────────────
// Manual bonus award (super_admin one-off)
// ───────────────────────────────────────

export async function awardManualBonus(input: {
  agentId: string;
  amount: number;
  notes: string;
}): Promise<{ data: AgentCommission | null; error: string | null }> {
  await requireAdminRole(['super_admin']);
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { data: null, error: 'Amount must be > 0' };
  }
  if (!input.notes?.trim()) {
    return { data: null, error: 'Notes are required for manual bonuses (audit trail)' };
  }
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('agent_commissions')
    .insert({
      agent_id: input.agentId,
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
  return { data: data as AgentCommission, error: null };
}

// ───────────────────────────────────────
// Threshold evaluator
// ───────────────────────────────────────

/**
 * Evaluates every active bonus tier against every active agent and inserts
 * bonus accruals for newly-crossed thresholds.
 *
 * Idempotency: the partial unique index on
 * agent_commissions(agent_id, bonus_tier_id, bonus_period_start) WHERE kind='bonus'
 * guarantees re-running this function produces no duplicates.
 *
 * Per-agent overrides: if an agent has any tier rows with agent_id = X, those
 * replace the globals for THAT agent on the same (metric, period) combo.
 */
export async function evaluateBonusThresholds(): Promise<{
  data: { accrued: number; evaluated_agents: number; skipped_existing: number };
  error: string | null;
}> {
  await requireAdminRole(['super_admin']);
  const supabase = createServerClient();

  const [{ data: tiers }, { data: agents }] = await Promise.all([
    supabase.from('bonus_tiers').select('*').eq('active', true),
    supabase.from('sales_agents').select('id').eq('active', true),
  ]);
  if (!tiers || !agents) {
    return { data: { accrued: 0, evaluated_agents: 0, skipped_existing: 0 }, error: null };
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthStartDate = monthStart.toISOString().slice(0, 10);
  const lifetimePeriodStart = '1970-01-01';

  // Build per-agent tier-map: for each (metric, period), per-agent override wins
  // over global defaults.
  const globalByKey = new Map<string, typeof tiers>();
  const perAgentByKey = new Map<string, typeof tiers>();
  for (const t of tiers as BonusTier[]) {
    const key = `${t.metric}__${t.period}`;
    if (t.agent_id === null) {
      const arr = globalByKey.get(key) ?? [];
      arr.push(t as never);
      globalByKey.set(key, arr);
    } else {
      const agentKey = `${t.agent_id}__${key}`;
      const arr = perAgentByKey.get(agentKey) ?? [];
      arr.push(t as never);
      perAgentByKey.set(agentKey, arr);
    }
  }

  let accrued = 0;
  let skipped = 0;

  for (const a of agents as { id: string }[]) {
    // Compute metrics for this agent: monthly window and lifetime.
    const monthlyFrom = monthStartDate;
    const today = now.toISOString().slice(0, 10);
    const perfMonthly = (await getAgentPerformance({ agentId: a.id, from: monthlyFrom, to: today })).data;
    const perfLifetime = (await getAgentPerformance({ agentId: a.id, from: '2020-01-01', to: today })).data;
    if (!perfMonthly || !perfLifetime) continue;

    for (const metric of ['onboarded_count', 'revenue_generated'] as const) {
      for (const period of ['monthly', 'lifetime'] as const) {
        const key = `${metric}__${period}`;
        const agentTiers = perAgentByKey.get(`${a.id}__${key}`);
        const tierSet = (agentTiers && agentTiers.length > 0 ? agentTiers : globalByKey.get(key)) as
          | BonusTier[]
          | undefined;
        if (!tierSet || tierSet.length === 0) continue;

        const value = period === 'monthly'
          ? metric === 'onboarded_count' ? perfMonthly.onboarded_count : perfMonthly.revenue_generated
          : metric === 'onboarded_count' ? perfLifetime.onboarded_lifetime : perfLifetime.revenue_generated;

        // Accrue every tier the agent has met. Each tier is a distinct bonus
        // row; idempotency is keyed on (agent, tier, period_start).
        const periodStart = period === 'monthly' ? monthStartDate : lifetimePeriodStart;

        for (const tier of tierSet) {
          if (value >= Number(tier.threshold)) {
            const { error } = await supabase
              .from('agent_commissions')
              .insert({
                agent_id: a.id,
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
              // Unique violation = already accrued for this period. Any other
              // error we surface.
              if (error.code === '23505') {
                skipped += 1;
              } else {
                return { data: { accrued, evaluated_agents: 0, skipped_existing: skipped }, error: error.message };
              }
            } else {
              accrued += 1;
            }
          }
        }
      }
    }
  }

  return { data: { accrued, evaluated_agents: agents.length, skipped_existing: skipped }, error: null };
}
