import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SessionPayload } from '../src/app/actions/auth';

describe('SessionPayload', () => {
  it('accepts a sales_agent session with agentId', () => {
    const s: SessionPayload = {
      salonId: '',
      staffId: 'user-1',
      role: 'sales_agent',
      branchId: '',
      name: 'Ali',
      agentId: 'agent-1',
    };
    expect(s.role).toBe('sales_agent');
    expect(s.agentId).toBe('agent-1');
  });

  it('agentId is optional for existing roles', () => {
    const s: SessionPayload = {
      salonId: 'salon-1',
      staffId: 'staff-1',
      role: 'owner',
      branchId: 'branch-1',
      name: 'Owner',
    };
    expect(s.agentId).toBeUndefined();
  });
});

const mockFrom = vi.fn();
vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({ from: mockFrom }),
}));

function buildTableMock(rows: Record<string, unknown[]>) {
  return (table: string) => {
    const data = rows[table] ?? [];
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: data[0] ?? null, error: null }),
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: data[0] ?? null, error: null }),
          }),
          or: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: data[0] ?? null, error: null }) }),
          }),
        }),
        or: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: data[0] ?? null, error: null }) }),
        }),
      }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    };
  };
}

describe('resolveUserRole — sales_agent branch', () => {
  beforeEach(() => mockFrom.mockReset());

  it('returns sales_agent when user_id matches an active sales_agents row', async () => {
    mockFrom.mockImplementation(buildTableMock({
      salons: [],
      salon_partners: [],
      staff: [],
      sales_agents: [{ id: 'agent-1', user_id: 'u-1', name: 'Ali', active: true }],
    }));
    const { resolveUserRole } = await import('../src/app/actions/auth');
    const r = await resolveUserRole('u-1', 'ali@example.com');
    expect(r.type).toBe('sales_agent');
    expect(r.agent?.id).toBe('agent-1');
  });

  it('returns none when no active sales_agents match and no other roles match', async () => {
    mockFrom.mockImplementation(buildTableMock({
      salons: [],
      salon_partners: [],
      staff: [],
      sales_agents: [],
    }));
    const { resolveUserRole } = await import('../src/app/actions/auth');
    const r = await resolveUserRole('u-1', 'ali@example.com');
    expect(r.type).toBe('none');
  });
});
