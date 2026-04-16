import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockVerifySession = vi.fn().mockResolvedValue({ role: 'super_admin', staffId: 'sa' });
vi.mock('@/app/actions/auth', () => ({
  verifySession: mockVerifySession,
  requireAdminRole: async (allowed: string[]) => {
    const s = await mockVerifySession();
    if (!s || !allowed.includes(s.role)) throw new Error('Unauthorized');
    return s;
  },
}));

type TableState = {
  selectResult?: { data: unknown; error: null | { message: string } };
  countResult?: { count: number };
  insertResult?: { data: unknown; error: null | { message: string } };
  updateResult?: { error: null | { message: string } };
};
const tables: Record<string, TableState> = {};
function resetTables() { for (const k of Object.keys(tables)) delete tables[k]; }

function buildQueryBuilder(table: string) {
  const state = tables[table] ??= {};
  return {
    insert: (_vals: unknown) => ({
      select: () => ({
        single: () => Promise.resolve(state.insertResult ?? { data: { id: 'new' }, error: null }),
      }),
    }),
    update: (_vals: unknown) => ({ eq: () => Promise.resolve(state.updateResult ?? { error: null }) }),
    select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.head && opts.count) {
        return {
          eq: () => ({
            eq: () => Promise.resolve(state.countResult ?? { count: 0 }),
          }),
        };
      }
      return {
        eq: () => ({
          single: () => Promise.resolve(state.selectResult ?? { data: null, error: null }),
          maybeSingle: () => Promise.resolve(state.selectResult ?? { data: null, error: null }),
          order: () => Promise.resolve(state.selectResult ?? { data: [], error: null }),
          in: () => Promise.resolve(state.selectResult ?? { data: [], error: null }),
          eq: () => ({
            single: () => Promise.resolve(state.selectResult ?? { data: null, error: null }),
            maybeSingle: () => Promise.resolve(state.selectResult ?? { data: null, error: null }),
          }),
        }),
        order: () => Promise.resolve(state.selectResult ?? { data: [], error: null }),
      };
    },
  };
}

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: (t: string) => buildQueryBuilder(t),
  }),
}));

describe('accrueCommissionForPaymentRequest', () => {
  beforeEach(() => { resetTables(); vi.clearAllMocks(); });

  it('no-ops when salon has no agent', async () => {
    tables['salons'] = { selectResult: { data: { id: 'sa-1', sold_by_agent_id: null }, error: null } };
    const { accrueCommissionForPaymentRequest } = await import('../src/app/actions/agent-commissions');
    const r = await accrueCommissionForPaymentRequest({ paymentRequestId: 'pr-1', salonId: 'sa-1', amount: 2500 });
    expect(r.error).toBeNull();
    expect(r.data).toBeNull();
  });

  it('inserts first_sale row when count is 1 (this approval included)', async () => {
    tables['salons'] = { selectResult: { data: { id: 'sa-1', sold_by_agent_id: 'ag-1' }, error: null } };
    tables['sales_agents'] = { selectResult: { data: { first_sale_pct: 20, renewal_pct: 5 }, error: null } };
    tables['payment_requests'] = { countResult: { count: 1 } };
    tables['agent_commissions'] = { insertResult: { data: { id: 'c-1', kind: 'first_sale', amount: 500 }, error: null } };
    const { accrueCommissionForPaymentRequest } = await import('../src/app/actions/agent-commissions');
    const r = await accrueCommissionForPaymentRequest({ paymentRequestId: 'pr-1', salonId: 'sa-1', amount: 2500 });
    expect(r.error).toBeNull();
    expect((r.data as { kind: string }).kind).toBe('first_sale');
  });

  it('inserts renewal row when prior approved payments exist', async () => {
    tables['salons'] = { selectResult: { data: { id: 'sa-1', sold_by_agent_id: 'ag-1' }, error: null } };
    tables['sales_agents'] = { selectResult: { data: { first_sale_pct: 20, renewal_pct: 5 }, error: null } };
    tables['payment_requests'] = { countResult: { count: 3 } };
    tables['agent_commissions'] = { insertResult: { data: { id: 'c-2', kind: 'renewal', amount: 125 }, error: null } };
    const { accrueCommissionForPaymentRequest } = await import('../src/app/actions/agent-commissions');
    const r = await accrueCommissionForPaymentRequest({ paymentRequestId: 'pr-2', salonId: 'sa-1', amount: 2500 });
    expect(r.error).toBeNull();
    expect((r.data as { kind: string }).kind).toBe('renewal');
  });
});

describe('listMyCommissions', () => {
  beforeEach(() => { resetTables(); vi.clearAllMocks(); });

  it('requires sales_agent role', async () => {
    mockVerifySession.mockResolvedValue({ role: 'owner' });
    const { listMyCommissions } = await import('../src/app/actions/agent-commissions');
    await expect(listMyCommissions()).rejects.toThrow('Unauthorized');
  });
});

describe('listAllCommissions', () => {
  beforeEach(() => { resetTables(); vi.clearAllMocks(); });

  it('requires super_admin', async () => {
    mockVerifySession.mockResolvedValue({ role: 'sales_agent', agentId: 'ag-1' });
    const { listAllCommissions } = await import('../src/app/actions/agent-commissions');
    await expect(listAllCommissions()).rejects.toThrow('Unauthorized');
  });
});

describe('reverseCommissionsForPaymentRequest', () => {
  beforeEach(() => { resetTables(); vi.clearAllMocks(); });

  it('updates matching rows to reversed', async () => {
    tables['agent_commissions'] = { updateResult: { error: null } };
    const { reverseCommissionsForPaymentRequest } = await import('../src/app/actions/agent-commissions');
    const r = await reverseCommissionsForPaymentRequest('pr-1');
    expect(r.error).toBeNull();
  });
});
