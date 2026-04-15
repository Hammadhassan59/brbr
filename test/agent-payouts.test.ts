import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockVerifySession = vi.fn();
vi.mock('@/app/actions/auth', () => ({ verifySession: mockVerifySession }));

const state: Record<string, { selectData?: unknown; error?: { message: string } | null }> = {};

function buildFrom(table: string) {
  const s = state[table] ??= {};
  const result = (data: unknown) => Promise.resolve({ data, error: s.error ?? null });
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          is: () => result(s.selectData ?? []),
        }),
        is: () => result(s.selectData ?? []),
        order: () => result(s.selectData ?? []),
      }),
      order: () => result(s.selectData ?? []),
    }),
    insert: (_vals: unknown) => ({
      select: () => ({ single: () => Promise.resolve({ data: { id: 'po-1' }, error: s.error ?? null }) }),
    }),
    update: (_vals: unknown) => ({
      eq: () => ({
        eq: () => ({
          is: () => Promise.resolve({ error: null }),
        }),
        then: (cb: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(cb),
      }),
    }),
    delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
  };
}

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({ from: (t: string) => buildFrom(t) }),
}));

function reset() { for (const k of Object.keys(state)) delete state[k]; }

describe('agent-payouts actions', () => {
  beforeEach(() => { vi.clearAllMocks(); reset(); });

  it('requestPayout rejects when no available commissions', async () => {
    mockVerifySession.mockResolvedValue({ role: 'sales_agent', agentId: 'ag-1' });
    state['agent_commissions'] = { selectData: [] };
    const { requestPayout } = await import('../src/app/actions/agent-payouts');
    const r = await requestPayout();
    expect(r.error).toBe('No commissions available to request');
  });

  it('requestPayout rejects non-agent', async () => {
    mockVerifySession.mockResolvedValue({ role: 'owner' });
    const { requestPayout } = await import('../src/app/actions/agent-payouts');
    await expect(requestPayout()).rejects.toThrow('Unauthorized');
  });

  it('markPayoutPaid requires super_admin', async () => {
    mockVerifySession.mockResolvedValue({ role: 'sales_agent' });
    const { markPayoutPaid } = await import('../src/app/actions/agent-payouts');
    await expect(markPayoutPaid('po-1', { paidAmount: 100, method: 'bank', reference: null, notes: null }))
      .rejects.toThrow('Unauthorized');
  });

  it('rejectPayout requires super_admin', async () => {
    mockVerifySession.mockResolvedValue({ role: 'sales_agent' });
    const { rejectPayout } = await import('../src/app/actions/agent-payouts');
    await expect(rejectPayout('po-1', 'dup')).rejects.toThrow('Unauthorized');
  });

  it('listMyPayouts requires sales_agent role', async () => {
    mockVerifySession.mockResolvedValue({ role: 'owner' });
    const { listMyPayouts } = await import('../src/app/actions/agent-payouts');
    await expect(listMyPayouts()).rejects.toThrow('Unauthorized');
  });

  it('listAllPayouts requires super_admin', async () => {
    mockVerifySession.mockResolvedValue({ role: 'sales_agent', agentId: 'ag-1' });
    const { listAllPayouts } = await import('../src/app/actions/agent-payouts');
    await expect(listAllPayouts()).rejects.toThrow('Unauthorized');
  });
});
