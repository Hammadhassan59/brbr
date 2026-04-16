import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory agent table the lookup queries.
let agents: Array<{ code: string; name: string; active: boolean; id?: string }> = [];

const fromMock = vi.fn((table: string) => {
  if (table === 'sales_agents') {
    return {
      select: () => ({
        eq: (_col: string, val: string) => ({
          maybeSingle: () => {
            const hit = agents.find((a) => a.code === val);
            return Promise.resolve({ data: hit ?? null, error: null });
          },
        }),
      }),
    };
  }
  return {};
});

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({ from: fromMock }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  agents = [
    { id: 'agent-1', code: 'SA042', name: 'Ahmed Khan', active: true },
    { id: 'agent-2', code: 'SA999', name: 'Inactive Asma', active: false },
  ];
});

describe('lookupAgentByCode', () => {
  it('returns the agent name for a valid active code', async () => {
    const { lookupAgentByCode } = await import('../src/app/actions/setup');
    const res = await lookupAgentByCode('SA042');
    expect(res.error).toBeNull();
    expect(res.data).toEqual({ name: 'Ahmed Khan' });
  });

  it('uppercases input so SA042 and sa042 resolve to the same agent', async () => {
    const { lookupAgentByCode } = await import('../src/app/actions/setup');
    const res = await lookupAgentByCode('sa042');
    expect(res.data).toEqual({ name: 'Ahmed Khan' });
  });

  it('returns null for unknown codes — never errors so signup can continue', async () => {
    const { lookupAgentByCode } = await import('../src/app/actions/setup');
    const res = await lookupAgentByCode('SA000');
    expect(res.error).toBeNull();
    expect(res.data).toBeNull();
  });

  it('returns null for inactive agents (no credit on signup)', async () => {
    const { lookupAgentByCode } = await import('../src/app/actions/setup');
    const res = await lookupAgentByCode('SA999');
    expect(res.data).toBeNull();
  });

  it('rejects empty input with a clear error', async () => {
    const { lookupAgentByCode } = await import('../src/app/actions/setup');
    const res = await lookupAgentByCode('');
    expect(res.error).toMatch(/required/i);
    expect(res.data).toBeNull();
  });

  it('exposes only the agent name — no email, phone, or user_id leaks', async () => {
    const { lookupAgentByCode } = await import('../src/app/actions/setup');
    const res = await lookupAgentByCode('SA042');
    expect(res.data).not.toHaveProperty('email');
    expect(res.data).not.toHaveProperty('phone');
    expect(res.data).not.toHaveProperty('user_id');
    expect(res.data).not.toHaveProperty('id');
  });
});
