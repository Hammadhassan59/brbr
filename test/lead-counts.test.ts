import { describe, it, expect, vi, beforeEach } from 'vitest';

let leads: Array<{ status: string }> = [];
let session: { role: string; agentId?: string; staffId: string; salonId: string; branchId: string; name: string };

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: leads, error: null }),
        then: <R>(cb: (v: { data: typeof leads; error: null }) => R) => Promise.resolve({ data: leads, error: null }).then(cb),
      }),
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
  session = { role: 'super_admin', staffId: 'admin-1', salonId: 'super-admin', branchId: '', name: 'Admin' };
  leads = [
    { status: 'new' }, { status: 'new' }, { status: 'new' },
    { status: 'visited' }, { status: 'visited' },
    { status: 'followup' },
    { status: 'onboarded' }, { status: 'onboarded' },
    { status: 'converted' },
    { status: 'lost' },
  ];
});

describe('getLeadCounts', () => {
  it('returns one entry per status with correct count', async () => {
    const { getLeadCounts } = await import('../src/app/actions/leads');
    const { data } = await getLeadCounts();
    expect(data).toEqual({
      new: 3,
      visited: 2,
      followup: 1,
      onboarded: 2,
      converted: 1,
      lost: 1,
    });
  });

  it('rejects unauthorized roles', async () => {
    session = { role: 'staff', staffId: 's-1', salonId: 'salon-1', branchId: 'b-1', name: 'Staff' };
    const { getLeadCounts } = await import('../src/app/actions/leads');
    await expect(getLeadCounts()).rejects.toThrow('Unauthorized');
  });

  it('allows sales agents to call without filter (auto-scopes to their agentId)', async () => {
    session = { role: 'sales_agent', agentId: 'agent-1', staffId: 'auth-1', salonId: '', branchId: '', name: 'Agent' };
    const { getLeadCounts } = await import('../src/app/actions/leads');
    const { data, error } = await getLeadCounts();
    expect(error).toBeNull();
    expect(Object.keys(data).length).toBeGreaterThan(0);
  });
});
