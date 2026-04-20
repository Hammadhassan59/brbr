import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockVerifySession = vi.fn();
vi.mock('@/app/actions/auth', () => ({
  verifySession: mockVerifySession,
  requireAdminRole: async (allowed: string[]) => {
    const s = await mockVerifySession();
    if (!s || !allowed.includes(s.role)) throw new Error('Unauthorized');
    return s;
  },
}));

const adminCreateUser = vi.fn();
const adminDeleteUser = vi.fn();
const adminGenerateLink = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateEq = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    auth: {
      admin: {
        createUser: adminCreateUser,
        deleteUser: adminDeleteUser,
        generateLink: adminGenerateLink,
      },
    },
    from: (_t: string) => ({
      insert: mockInsert,
      update: (vals: Record<string, unknown>) => {
        mockUpdate(vals);
        return {
          eq: (col: string, val: string) => {
            mockUpdateEq(col, val);
            return Promise.resolve({ error: null });
          },
        };
      },
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
        order: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  }),
}));

vi.mock('@/lib/email-sender', () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));

describe('sales-agents server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifySession.mockResolvedValue({
      role: 'super_admin', staffId: 'sa-1', salonId: 'super-admin', branchId: '', name: 'SA',
    });
    adminCreateUser.mockResolvedValue({ data: { user: { id: 'auth-new-1' } }, error: null });
    adminDeleteUser.mockResolvedValue({ data: null, error: null });
    adminGenerateLink.mockResolvedValue({
      data: { properties: { action_link: 'https://example.com/reset' } },
      error: null,
    });
    mockInsert.mockImplementation(() => ({
      select: () => ({
        single: () => Promise.resolve({
          data: { id: 'agent-1', user_id: 'auth-new-1', name: 'Ali', active: true, code: 'SA042' },
          error: null,
        }),
      }),
    }));
  });

  it('createSalesAgent creates auth user then agent row', async () => {
    const { createSalesAgent } = await import('../src/app/actions/sales-agents');
    const res = await createSalesAgent({
      email: 'ali@example.com',
      name: 'Ali',
      phone: '0300', city: 'LHR',
      firstSalePct: 20, renewalPct: 5,
    });
    expect(res.error).toBeNull();
    expect(adminCreateUser).toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalled();
  });

  it('createSalesAgent rejects non-superadmin', async () => {
    mockVerifySession.mockResolvedValue({ role: 'owner', salonId: 's', staffId: 'x', branchId: '', name: '' });
    const { createSalesAgent } = await import('../src/app/actions/sales-agents');
    await expect(createSalesAgent({
      email: 'a@b.c', name: 'X', phone: '0300', city: null, firstSalePct: 0, renewalPct: 0,
    })).rejects.toThrow('Unauthorized');
  });

  it('createSalesAgent rejects invalid pct', async () => {
    const { createSalesAgent } = await import('../src/app/actions/sales-agents');
    const res = await createSalesAgent({
      email: 'a@b.c', name: 'X', phone: '0300', city: null, firstSalePct: 200, renewalPct: 5,
    });
    expect(res.error).toMatch(/between 0 and 100/i);
  });

  it('setAgentActive flips active flag', async () => {
    const { setAgentActive } = await import('../src/app/actions/sales-agents');
    const res = await setAgentActive('agent-1', false);
    expect(res.error).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ active: false }));
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'agent-1');
  });

  it('updateAgentRates rejects pct > 100', async () => {
    const { updateAgentRates } = await import('../src/app/actions/sales-agents');
    const res = await updateAgentRates('agent-1', { firstSalePct: 120, renewalPct: 5 });
    expect(res.error).not.toBeNull();
  });

  it('updateAgentRates accepts valid pct', async () => {
    const { updateAgentRates } = await import('../src/app/actions/sales-agents');
    const res = await updateAgentRates('agent-1', { firstSalePct: 25, renewalPct: 7.5 });
    expect(res.error).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith({ first_sale_pct: 25, renewal_pct: 7.5 });
  });

  it('updateOwnAgentProfile rejects non-agent', async () => {
    mockVerifySession.mockResolvedValue({ role: 'super_admin', staffId: 'sa-1' });
    const { updateOwnAgentProfile } = await import('../src/app/actions/sales-agents');
    await expect(updateOwnAgentProfile({ name: 'X', phone: '0300' })).rejects.toThrow('Unauthorized');
  });

  it('getMyAgentProfile requires agentId in session', async () => {
    mockVerifySession.mockResolvedValue({ role: 'sales_agent', agentId: undefined });
    const { getMyAgentProfile } = await import('../src/app/actions/sales-agents');
    await expect(getMyAgentProfile()).rejects.toThrow('Unauthorized');
  });
});
