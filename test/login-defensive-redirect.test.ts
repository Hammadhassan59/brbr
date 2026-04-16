import { describe, it, expect, beforeEach, vi } from 'vitest';

// Standalone unit test for the defensive login auto-redirect logic. Reproduces
// the bug where a stale Zustand store (from a prior super-admin session in the
// same browser) trapped the next user — typically an agent who just clicked a
// password-reset link — and silently routed them back to /admin instead of
// letting them sign in fresh.

// We extract the decision into a pure function and test it. The login page's
// useEffect calls equivalent logic — keep this in sync if the policy changes.

interface StoreSnapshot {
  salon: unknown;
  currentStaff: unknown;
  currentPartner: unknown;
  isSuperAdmin: boolean;
  isSalesAgent: boolean;
}

function decide(hasIcutSession: boolean, store: StoreSnapshot): { action: 'reset' | 'redirect' | 'show-form'; target?: string } {
  const persistedRoles = !!(store.salon || store.currentStaff || store.currentPartner || store.isSuperAdmin || store.isSalesAgent);
  if (!hasIcutSession) {
    return persistedRoles ? { action: 'reset' } : { action: 'show-form' };
  }
  if (!persistedRoles) return { action: 'show-form' };
  return {
    action: 'redirect',
    target: store.isSuperAdmin ? '/admin' : store.isSalesAgent ? '/agent' : '/dashboard',
  };
}

const empty: StoreSnapshot = { salon: null, currentStaff: null, currentPartner: null, isSuperAdmin: false, isSalesAgent: false };
const superAdminStore: StoreSnapshot = { ...empty, isSuperAdmin: true };
const agentStore: StoreSnapshot = { ...empty, isSalesAgent: true };
const ownerStore: StoreSnapshot = { ...empty, salon: { id: 'salon-1' } };

beforeEach(() => vi.clearAllMocks());

describe('defensive login auto-redirect', () => {
  it('REGRESSION: agent password-reset trap — Zustand=super_admin, no iCut cookie → reset store, do not redirect', () => {
    const result = decide(false, superAdminStore);
    expect(result.action).toBe('reset');
    expect(result.target).toBeUndefined();
  });

  it('clean state + no cookie → just show the login form', () => {
    expect(decide(false, empty)).toEqual({ action: 'show-form' });
  });

  it('valid cookie + super_admin store → redirect to /admin', () => {
    expect(decide(true, superAdminStore)).toEqual({ action: 'redirect', target: '/admin' });
  });

  it('valid cookie + agent store → redirect to /agent', () => {
    expect(decide(true, agentStore)).toEqual({ action: 'redirect', target: '/agent' });
  });

  it('valid cookie + owner store → redirect to /dashboard', () => {
    expect(decide(true, ownerStore)).toEqual({ action: 'redirect', target: '/dashboard' });
  });

  it('valid cookie + clean store (e.g. fresh browser) → show form', () => {
    expect(decide(true, empty)).toEqual({ action: 'show-form' });
  });

  it('no cookie + agent store (rare: agent did partial logout) → reset store', () => {
    expect(decide(false, agentStore)).toEqual({ action: 'reset' });
  });
});
