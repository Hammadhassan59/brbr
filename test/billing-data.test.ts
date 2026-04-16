import { describe, it, expect, vi, beforeEach } from 'vitest';

const session: { salonId: string; staffId: string; role: string; branchId: string; name: string } = {
  salonId: 'salon-1', staffId: 'owner-1', role: 'owner', branchId: 'branch-main', name: 'Owner',
};

const salonRow = {
  id: 'salon-1',
  name: 'Test Salon',
  subscription_plan: 'growth',
  subscription_status: 'active',
  subscription_started_at: '2026-01-01T00:00:00Z',
  // 5 days from now — drives daysRemaining
  subscription_expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
};

let requests: Array<{ id: string; plan: string; amount: number; method: string | null; reference: string | null; screenshot_url: string | null; screenshot_path: string | null; status: string; duration_days: number; created_at: string; reviewed_at: string | null; reviewer_notes: string | null }> = [];
let platformPlans: Record<string, { price?: number }> | null = null;

const fromMock = vi.fn((table: string) => {
  if (table === 'salons') {
    return {
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: salonRow, error: null }) }),
      }),
    };
  }
  if (table === 'payment_requests') {
    return {
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: requests, error: null }),
        }),
      }),
    };
  }
  if (table === 'platform_settings') {
    return {
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: platformPlans ? { value: platformPlans } : null, error: null }) }),
      }),
    };
  }
  return {};
});

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({ from: fromMock }),
}));

vi.mock('@/app/actions/auth', () => ({
  verifySession: () => Promise.resolve(session),
}));

beforeEach(() => {
  vi.clearAllMocks();
  platformPlans = null;
  requests = [
    { id: 'p1', plan: 'growth', amount: 5000, method: 'bank',     reference: 'TXN1', screenshot_url: 'https://s/p1.jpg', screenshot_path: null,                       status: 'approved', duration_days: 30, created_at: '2026-04-15T10:00:00Z', reviewed_at: '2026-04-15T11:00:00Z', reviewer_notes: null },
    { id: 'p2', plan: 'growth', amount: 5000, method: 'jazzcash', reference: null,    screenshot_url: null,                screenshot_path: 'salon-1/uuid-p2.jpg',    status: 'approved', duration_days: 30, created_at: '2026-03-15T10:00:00Z', reviewed_at: '2026-03-15T12:00:00Z', reviewer_notes: null },
    { id: 'p3', plan: 'basic',  amount: 2500, method: 'bank',     reference: null,    screenshot_url: null,                screenshot_path: null,                       status: 'pending',  duration_days: 30, created_at: '2026-04-16T08:00:00Z', reviewed_at: null,                  reviewer_notes: null },
    { id: 'p4', plan: 'basic',  amount: 2500, method: 'bank',     reference: null,    screenshot_url: null,                screenshot_path: null,                       status: 'rejected', duration_days: 30, created_at: '2026-02-01T10:00:00Z', reviewed_at: '2026-02-01T11:00:00Z', reviewer_notes: 'wrong amt' },
  ];
});

describe('getBillingData', () => {
  it('sums approved payments only into totalPaid', async () => {
    const { getBillingData } = await import('../src/app/actions/billing');
    const { data } = await getBillingData();
    // 5000 + 5000 = 10000 (rejected and pending excluded)
    expect(data?.totalPaid).toBe(10000);
    expect(data?.approvedCount).toBe(2);
  });

  it('returns the full history including rejected and pending rows', async () => {
    const { getBillingData } = await import('../src/app/actions/billing');
    const { data } = await getBillingData();
    expect(data?.history).toHaveLength(4);
  });

  it('reports lastPaymentAt from the most recent approved row', async () => {
    const { getBillingData } = await import('../src/app/actions/billing');
    const { data } = await getBillingData();
    expect(data?.lastPaymentAt).toBe('2026-04-15T10:00:00Z');
  });

  it('computes daysRemaining from subscription_expires_at', async () => {
    const { getBillingData } = await import('../src/app/actions/billing');
    const { data } = await getBillingData();
    // We set expires to now + 5 days, so daysRemaining should be 5 (or 4 due to rounding boundary)
    expect(data?.salon.daysRemaining).toBeGreaterThanOrEqual(4);
    expect(data?.salon.daysRemaining).toBeLessThanOrEqual(5);
  });

  it('falls back to default plan prices when platform_settings is empty', async () => {
    const { getBillingData } = await import('../src/app/actions/billing');
    const { data } = await getBillingData();
    expect(data?.planPrices).toEqual({ basic: 2500, growth: 5000, pro: 9000 });
  });

  it('uses platform_settings.plans when present', async () => {
    platformPlans = { basic: { price: 3000 }, growth: { price: 6000 }, pro: { price: 10000 } };
    const { getBillingData } = await import('../src/app/actions/billing');
    const { data } = await getBillingData();
    expect(data?.planPrices).toEqual({ basic: 3000, growth: 6000, pro: 10000 });
  });

  it('refuses unauthenticated callers', async () => {
    vi.resetModules();
    vi.doMock('@/app/actions/auth', () => ({
      verifySession: () => Promise.reject(new Error('Not authenticated')),
    }));
    const { getBillingData } = await import('../src/app/actions/billing');
    const res = await getBillingData();
    expect(res.error).toMatch(/not authenticated/i);
    expect(res.data).toBeNull();
  });
});
