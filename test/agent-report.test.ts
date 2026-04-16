import { describe, it, expect, vi, beforeEach } from 'vitest';

// Validates getAgentReport: funnel rolls up correctly per status, commissions
// totals split by status, salons_sold is lifetime + sorted by commission,
// cash_ledger matches the simple math.

const session = { salonId: 'super-admin', staffId: 'admin-1', role: 'super_admin', branchId: '', name: 'Admin' };

let leads: Array<{ status: string }> = [];
let commsAll: Array<{ amount: number; status: string; payout_id: string | null }> = [];
let commsPeriod: Array<{ amount: number; status: string; kind: string; created_at: string }> = [];
let payouts: Array<{ paid_amount: number; method: string; paid_at: string; status: string }> = [];
let salons: Array<{ id: string; name: string; subscription_plan: string | null; subscription_status: string | null; subscription_expires_at: string | null }> = [];
let salonComms: Array<{ salon_id: string; amount: number }> = [];
let payments: Array<{ amount: number }> = [];

function makeAwaitable<T>(data: T) {
  return {
    in: () => makeAwaitable(data),
    eq: () => makeAwaitable(data),
    gte: () => makeAwaitable(data),
    lte: () => makeAwaitable(data),
    order: () => makeAwaitable(data),
    maybeSingle: () => Promise.resolve({ data, error: null }),
    then: <R>(cb: (v: { data: T; error: null }) => R) => Promise.resolve({ data, error: null }).then(cb),
  };
}

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: (table: string) => ({
      select: (cols?: string) => {
        if (table === 'sales_agents') return makeAwaitable({ id: 'agent-1', name: 'Ahmed', code: 'SA042', first_sale_pct: 20, renewal_pct: 5, active: true });
        if (table === 'leads') return makeAwaitable(leads);
        if (table === 'agent_commissions') {
          // Differentiate based on the columns string the action passes:
          // commsPeriod query selects 'amount, status, kind, created_at, settled_at'
          // commsAll query selects 'amount, status, payout_id'
          // salon-commission query selects 'salon_id, amount, status'
          if (cols?.includes('payout_id')) return makeAwaitable(commsAll);
          if (cols?.includes('kind')) return makeAwaitable(commsPeriod);
          if (cols?.includes('salon_id')) return makeAwaitable(salonComms);
          return makeAwaitable([]);
        }
        if (table === 'agent_payouts') return makeAwaitable(payouts);
        if (table === 'salons') return makeAwaitable(salons);
        if (table === 'payment_requests') return makeAwaitable(payments);
        return makeAwaitable([]);
      },
    }),
  }),
}));

vi.mock('@/app/actions/auth', () => ({
  verifySession: () => Promise.resolve(session),
  requireAdminRole: async (allowed: string[]) => {
    if (!session || !allowed.includes(session.role)) throw new Error('Unauthorized');
    return session;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  leads = [
    { status: 'new' }, { status: 'new' }, { status: 'contacted' },
    { status: 'visited' }, { status: 'followup' }, { status: 'interested' },
    { status: 'onboarded' }, { status: 'converted' }, { status: 'lost' },
  ];
  commsAll = [
    { amount: 500, status: 'approved', payout_id: null },
    { amount: 1000, status: 'approved', payout_id: 'po-1' }, // already linked, not "available"
    { amount: 300, status: 'paid', payout_id: 'po-1' },
  ];
  commsPeriod = [
    { amount: 500, status: 'approved', kind: 'first_sale', created_at: '2026-04-01T10:00:00Z' },
    { amount: 1000, status: 'paid', kind: 'first_sale', created_at: '2026-04-15T10:00:00Z' },
    { amount: 200, status: 'pending', kind: 'renewal', created_at: '2026-04-20T10:00:00Z' },
  ];
  payouts = [
    { paid_amount: 1300, method: 'bank', paid_at: '2026-04-18T10:00:00Z', status: 'paid' },
    { paid_amount: 0, method: 'bank', paid_at: '', status: 'requested' },
  ];
  salons = [
    { id: 'salon-1', name: 'Test Salon A', subscription_plan: 'basic', subscription_status: 'active', subscription_expires_at: '2026-05-15T00:00:00Z' },
    { id: 'salon-2', name: 'Test Salon B', subscription_plan: 'growth', subscription_status: 'expired', subscription_expires_at: '2026-03-01T00:00:00Z' },
  ];
  salonComms = [
    { salon_id: 'salon-1', amount: 500 },
    { salon_id: 'salon-1', amount: 1000 },
    { salon_id: 'salon-2', amount: 300 },
  ];
  payments = [{ amount: 5000 }];
});

describe('getAgentReport', () => {
  it('rolls up the funnel by lead status', async () => {
    const { getAgentReport } = await import('../src/app/actions/agent-commissions');
    const { data } = await getAgentReport({ agentId: 'agent-1', from: '2026-04-01', to: '2026-04-30' });
    expect(data?.funnel.leads_total).toBe(9);
    expect(data?.funnel.new).toBe(2);
    expect(data?.funnel.followup).toBe(1);
    expect(data?.funnel.onboarded).toBe(1);
    expect(data?.funnel.converted).toBe(1);
  });

  it('splits commission totals: earned = approved + paid; available excludes paid; pending isolated', async () => {
    const { getAgentReport } = await import('../src/app/actions/agent-commissions');
    const { data } = await getAgentReport({ agentId: 'agent-1', from: '2026-04-01', to: '2026-04-30' });
    // commsPeriod: approved(500) + paid(1000) = 1500 earned, 1000 paid, 200 pending
    expect(data?.commissions.earned_total).toBe(1500);
    expect(data?.commissions.paid_total).toBe(1000);
    expect(data?.commissions.pending_total).toBe(200);
    // commsAll: only one approved row not yet payout-linked → 500 available
    expect(data?.commissions.available_total).toBe(500);
  });

  it('per-salon lifetime commissions are summed and sorted descending', async () => {
    const { getAgentReport } = await import('../src/app/actions/agent-commissions');
    const { data } = await getAgentReport({ agentId: 'agent-1', from: '2026-04-01', to: '2026-04-30' });
    expect(data?.salons_sold.list[0].name).toBe('Test Salon A');
    expect(data?.salons_sold.list[0].lifetime_commission).toBe(1500);
    expect(data?.salons_sold.list[1].lifetime_commission).toBe(300);
    expect(data?.salons_sold.active).toBe(1);
    expect(data?.salons_sold.expired).toBe(1);
  });

  it('cash ledger: balance = collected - earned (period)', async () => {
    const { getAgentReport } = await import('../src/app/actions/agent-commissions');
    const { data } = await getAgentReport({ agentId: 'agent-1', from: '2026-04-01', to: '2026-04-30' });
    // collected = 5000, earned = 1500, balance = 3500 (agent owes admin)
    expect(data?.cash_ledger.collected).toBe(5000);
    expect(data?.cash_ledger.earned).toBe(1500);
    expect(data?.cash_ledger.balance).toBe(3500);
  });

  it('payouts roll-up: total paid + last paid + by-method', async () => {
    const { getAgentReport } = await import('../src/app/actions/agent-commissions');
    const { data } = await getAgentReport({ agentId: 'agent-1', from: '2026-04-01', to: '2026-04-30' });
    expect(data?.payouts.total_paid).toBe(1300);
    expect(data?.payouts.last_payout_at).toBe('2026-04-18T10:00:00Z');
    expect(data?.payouts.by_method).toEqual([{ method: 'bank', amount: 1300 }]);
  });
});
