import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockVerifySession = vi.fn();
vi.mock('@/app/actions/auth', () => ({ verifySession: mockVerifySession }));

const mockInsert = vi.fn();
const mockUpdate = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: (_t: string) => ({
      insert: mockInsert,
      update: (vals: Record<string, unknown>) => ({
        eq: (_c: string, _v: string) => {
          mockUpdate(vals);
          return {
            eq: (_c2: string, _v2: string) => Promise.resolve({ error: null }),
            then: (cb: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(cb),
          };
        },
      }),
      select: (_cols?: string) => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
          eq: () => ({
            order: () => Promise.resolve({ data: [], error: null }),
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
        order: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  }),
}));

describe('leads server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifySession.mockResolvedValue({ role: 'super_admin', staffId: 'sa-1' });
    mockInsert.mockImplementation(() => ({
      select: () => ({
        single: () => Promise.resolve({ data: { id: 'lead-1', status: 'new' }, error: null }),
      }),
    }));
  });

  it('createLead inserts with assigned_agent_id and created_by', async () => {
    const { createLead } = await import('../src/app/actions/leads');
    const res = await createLead({
      salon_name: 'New Salon', owner_name: 'X', phone: null, city: null, notes: null,
      assigned_agent_id: 'agent-1',
    });
    expect(res.error).toBeNull();
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      salon_name: 'New Salon', assigned_agent_id: 'agent-1', created_by: 'sa-1',
    }));
  });

  it('createLead rejects blank salon_name', async () => {
    const { createLead } = await import('../src/app/actions/leads');
    const res = await createLead({
      salon_name: '', owner_name: null, phone: null, city: null, notes: null,
      assigned_agent_id: 'agent-1',
    });
    expect(res.error).toMatch(/salon name/i);
  });

  it('createLead rejects missing agent', async () => {
    const { createLead } = await import('../src/app/actions/leads');
    const res = await createLead({
      salon_name: 'X', owner_name: null, phone: null, city: null, notes: null,
      assigned_agent_id: '',
    });
    expect(res.error).toMatch(/agent/i);
  });

  it('createLead rejects non-superadmin', async () => {
    mockVerifySession.mockResolvedValue({ role: 'owner' });
    const { createLead } = await import('../src/app/actions/leads');
    await expect(createLead({
      salon_name: 'X', owner_name: null, phone: null, city: null, notes: null,
      assigned_agent_id: 'agent-1',
    })).rejects.toThrow('Unauthorized');
  });

  it('updateLeadStatus updates status', async () => {
    const { updateLeadStatus } = await import('../src/app/actions/leads');
    const res = await updateLeadStatus('lead-1', 'visited');
    expect(res.error).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'visited' });
  });

  it('reassignLead updates assigned_agent_id', async () => {
    const { reassignLead } = await import('../src/app/actions/leads');
    const res = await reassignLead('lead-1', 'agent-2');
    expect(res.error).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith({ assigned_agent_id: 'agent-2' });
  });

  it('listMyLeads requires sales_agent role', async () => {
    mockVerifySession.mockResolvedValue({ role: 'owner', staffId: 's' });
    const { listMyLeads } = await import('../src/app/actions/leads');
    await expect(listMyLeads()).rejects.toThrow('Unauthorized');
  });

  it('listMyLeads succeeds for sales_agent', async () => {
    mockVerifySession.mockResolvedValue({ role: 'sales_agent', agentId: 'agent-1' });
    const { listMyLeads } = await import('../src/app/actions/leads');
    const res = await listMyLeads();
    expect(res.error).toBeNull();
  });

  it('updateMyLead requires sales_agent role', async () => {
    mockVerifySession.mockResolvedValue({ role: 'owner' });
    const { updateMyLead } = await import('../src/app/actions/leads');
    await expect(updateMyLead('lead-1', { status: 'visited' })).rejects.toThrow('Unauthorized');
  });
});
