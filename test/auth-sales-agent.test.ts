import { describe, it, expect } from 'vitest';
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
