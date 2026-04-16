import { describe, it, expect, vi, beforeEach } from 'vitest';

// Test the agent cash ledger: collected (from agent_collected payments) minus
// commission earned = balance owed in either direction. Mocks the supabase
// fluent API just enough to stand up getAgentBalance.

interface SalonRow { id: string; sold_by_agent_id?: string }
interface PaymentRow { amount: number; status: string; source: string; salon_id: string }
interface CommissionRow { amount: number; status: string }

let agentRow: { code: string } | null = { code: 'SA042' };
let salons: SalonRow[] = [];
let payments: PaymentRow[] = [];
let commissions: CommissionRow[] = [];

function fromMock(table: string) {
  if (table === 'sales_agents') {
    return {
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: agentRow, error: null }) }) }),
    };
  }
  if (table === 'salons') {
    return {
      select: () => ({ eq: () => Promise.resolve({ data: salons, error: null }) }),
    };
  }
  if (table === 'agent_commissions') {
    return {
      select: () => ({ eq: () => Promise.resolve({ data: commissions, error: null }) }),
    };
  }
  if (table === 'payment_requests') {
    return {
      select: () => ({
        in: () => ({
          eq: () => ({
            eq: () => Promise.resolve({
              data: payments.filter((p) => p.source === 'agent_collected' && p.status === 'approved'),
              error: null,
            }),
          }),
        }),
      }),
    };
  }
  return {};
}

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({ from: fromMock }),
}));

vi.mock('@/app/actions/auth', () => ({
  verifySession: () => Promise.resolve({
    salonId: '', staffId: 'auth-1', role: 'sales_agent', branchId: '', name: 'Agent', agentId: 'agent-1',
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  agentRow = { code: 'SA042' };
  salons = [{ id: 'salon-1' }, { id: 'salon-2' }];
  payments = [];
  commissions = [];
});

describe('getAgentBalance', () => {
  it('returns the agent code so the dashboard can display it prominently', async () => {
    const { getAgentBalance } = await import('../src/app/actions/leads');
    const { data } = await getAgentBalance();
    expect(data.code).toBe('SA042');
  });

  it('balance is zero when agent has no collections and no commissions', async () => {
    const { getAgentBalance } = await import('../src/app/actions/leads');
    const { data } = await getAgentBalance();
    expect(data).toMatchObject({ collected: 0, earned: 0, settled: 0, balance: 0 });
  });

  it('positive balance: agent owes admin (collected > earned)', async () => {
    payments = [
      { amount: 5000, status: 'approved', source: 'agent_collected', salon_id: 'salon-1' },
      { amount: 5000, status: 'approved', source: 'agent_collected', salon_id: 'salon-2' },
    ];
    commissions = [{ amount: 500, status: 'approved' }];
    const { getAgentBalance } = await import('../src/app/actions/leads');
    const { data } = await getAgentBalance();
    expect(data.collected).toBe(10000);
    expect(data.earned).toBe(500);
    expect(data.balance).toBe(9500); // owed to admin
  });

  it('negative balance: admin owes agent (earned > collected)', async () => {
    // Agent earned commission on online-paid salons (salon paid iCut directly)
    commissions = [
      { amount: 500, status: 'approved' },
      { amount: 500, status: 'paid' },
    ];
    const { getAgentBalance } = await import('../src/app/actions/leads');
    const { data } = await getAgentBalance();
    expect(data.collected).toBe(0);
    expect(data.earned).toBe(1000);
    expect(data.settled).toBe(500);
    expect(data.balance).toBe(-1000); // admin owes agent
  });

  it('only counts approved payments (pending and rejected do not move the ledger)', async () => {
    payments = [
      { amount: 5000, status: 'approved', source: 'agent_collected', salon_id: 'salon-1' },
      { amount: 5000, status: 'pending', source: 'agent_collected', salon_id: 'salon-1' },
      { amount: 5000, status: 'rejected', source: 'agent_collected', salon_id: 'salon-1' },
    ];
    const { getAgentBalance } = await import('../src/app/actions/leads');
    const { data } = await getAgentBalance();
    expect(data.collected).toBe(5000);
  });

  it('only counts agent_collected payments (salon_self payments do not appear in collected)', async () => {
    // If a salon paid iCut directly online, that's NOT agent-collected — even
    // though the salon was attributed to this agent for commission purposes.
    payments = [
      { amount: 5000, status: 'approved', source: 'agent_collected', salon_id: 'salon-1' },
      { amount: 99999, status: 'approved', source: 'salon_self', salon_id: 'salon-1' },
    ];
    const { getAgentBalance } = await import('../src/app/actions/leads');
    const { data } = await getAgentBalance();
    expect(data.collected).toBe(5000);
  });
});
