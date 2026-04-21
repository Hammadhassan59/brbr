'use server';

import { createServerClient } from '@/lib/supabase';
import { requireAdminRole } from './auth';

export interface AgentPerformanceMetrics {
  agent_id: string;
  period: { from: string; to: string };
  // Period-scoped
  onboarded_count: number;            // salons first-sold in window
  revenue_generated: number;          // approved payment_requests in window for this agent's salons
  conversion_rate: number;            // 0..1: converted/assigned, lifetime (not period-scoped)
  avg_days_to_close: number | null;   // mean days from lead.created_at to onboarded for converted leads in window
  churned_count: number;              // salons whose status went to expired|suspended during window
  // Tenure snapshot (lifetime — computed at query time)
  retention_30d: number | null;       // fraction of salons onboarded >=30d ago still active
  retention_60d: number | null;
  retention_90d: number | null;
  // Raw counts used in the rate/retention calculations
  leads_total: number;
  leads_converted: number;
  onboarded_lifetime: number;
  active_lifetime: number;
}

/**
 * Computes the bonus-eligible performance metrics for a single sales agent.
 * Used by the admin detail page Performance tab and by the bonus evaluator.
 */
export async function getAgentPerformance(input: {
  agentId: string;
  from: string;
  to: string;
}): Promise<{ data: AgentPerformanceMetrics | null; error: string | null }> {
  await requireAdminRole(['super_admin', 'leads_team']);
  const supabase = createServerClient();

  const fromIso = `${input.from}T00:00:00+05:00`;
  const toIso = `${input.to}T23:59:59+05:00`;
  const now = new Date();
  const days30Ago = new Date(now.getTime() - 30 * 86400000).toISOString();
  const days60Ago = new Date(now.getTime() - 60 * 86400000).toISOString();
  const days90Ago = new Date(now.getTime() - 90 * 86400000).toISOString();

  const [
    { data: salons },
    { data: leads },
    { data: firstSaleComms },
  ] = await Promise.all([
    supabase
      .from('salons')
      .select('id, created_at, subscription_status')
      .eq('sold_by_agent_id', input.agentId),
    supabase
      .from('leads')
      .select('id, status, created_at, updated_at')
      .eq('assigned_agent_id', input.agentId),
    supabase
      .from('agent_commissions')
      .select('salon_id, base_amount, created_at')
      .eq('agent_id', input.agentId)
      .eq('kind', 'first_sale')
      .in('status', ['approved', 'paid']),
  ]);

  // Onboarded in window: first_sale commission rows created in window.
  const onboardedInWindow = (firstSaleComms || []).filter(
    (c: { created_at: string }) => c.created_at >= fromIso && c.created_at <= toIso,
  );
  const onboardedCount = onboardedInWindow.length;

  // Revenue generated: sum of all approved payment_requests in window for
  // salons this agent onboarded. (We use the commission base_amount sum
  // instead of re-querying payment_requests — base_amount IS the payment
  // amount that produced the commission.)
  const { data: commsInWindow } = await supabase
    .from('agent_commissions')
    .select('base_amount')
    .eq('agent_id', input.agentId)
    .in('status', ['approved', 'paid'])
    .in('kind', ['first_sale', 'renewal'])
    .gte('created_at', fromIso)
    .lte('created_at', toIso);
  const revenueGenerated = (commsInWindow || []).reduce(
    (s: number, c: { base_amount: number }) => s + Number(c.base_amount || 0),
    0,
  );

  // Conversion rate — lifetime: converted / total assigned.
  const leadsTotal = leads?.length ?? 0;
  const leadsConverted = (leads || []).filter(
    (l: { status: string }) => l.status === 'converted' || l.status === 'onboarded',
  ).length;
  const conversionRate = leadsTotal === 0 ? 0 : leadsConverted / leadsTotal;

  // Avg days-to-close: mean (updated_at - created_at) for leads that converted
  // in the window. Proxy for "time to close" — updated_at stamps the
  // transition to converted status.
  const convertedInWindow = (leads || []).filter(
    (l: { status: string; updated_at: string }) =>
      (l.status === 'converted' || l.status === 'onboarded') &&
      l.updated_at >= fromIso &&
      l.updated_at <= toIso,
  );
  const avgDaysToClose = convertedInWindow.length === 0
    ? null
    : convertedInWindow.reduce((sum: number, l: { created_at: string; updated_at: string }) => {
        const days = (new Date(l.updated_at).getTime() - new Date(l.created_at).getTime()) / 86400000;
        return sum + days;
      }, 0) / convertedInWindow.length;

  // Churned: salons first-sold by this agent whose status flipped to
  // expired|suspended during the window. We infer the flip via the salon's
  // own created_at being before the window and its current status being
  // non-active; we don't have a status-change timestamp today, so this is a
  // best-effort "currently not active, onboarded before the window ended"
  // proxy. (TODO once salons.subscription_status_changed_at exists.)
  const churnedCount = (salons || []).filter(
    (s: { created_at: string; subscription_status: string | null }) =>
      s.created_at <= toIso &&
      (s.subscription_status === 'expired' || s.subscription_status === 'suspended'),
  ).length;

  // Retention at 30/60/90d: of salons onboarded >= Nd ago, what fraction are
  // still subscription_status='active' today.
  const retention = (cutoff: string): number | null => {
    const eligible = (salons || []).filter(
      (s: { created_at: string }) => s.created_at <= cutoff,
    );
    if (eligible.length === 0) return null;
    const stillActive = eligible.filter(
      (s: { subscription_status: string | null }) => s.subscription_status === 'active',
    ).length;
    return stillActive / eligible.length;
  };

  return {
    data: {
      agent_id: input.agentId,
      period: { from: input.from, to: input.to },
      onboarded_count: onboardedCount,
      revenue_generated: revenueGenerated,
      conversion_rate: conversionRate,
      avg_days_to_close: avgDaysToClose === null ? null : Math.round(avgDaysToClose * 10) / 10,
      churned_count: churnedCount,
      retention_30d: retention(days30Ago),
      retention_60d: retention(days60Ago),
      retention_90d: retention(days90Ago),
      leads_total: leadsTotal,
      leads_converted: leadsConverted,
      onboarded_lifetime: (firstSaleComms || []).length,
      active_lifetime: (salons || []).filter(
        (s: { subscription_status: string | null }) => s.subscription_status === 'active',
      ).length,
    },
    error: null,
  };
}
