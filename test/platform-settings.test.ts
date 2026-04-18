import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────
// We drive the supabase client from a per-test scratchpad. Each `from(table)`
// returns a chainable that resolves to whatever we staged. We capture the
// update/insert payloads so tests can assert on them.

type Row = Record<string, unknown>;
const staged: {
  selectData: Row | null;
  selectError: { message: string } | null;
  updateError: { message: string } | null;
  insertError: { message: string } | null;
  updates: Array<{ table: string; payload: Row; matched?: Row }>;
  inserts: Array<{ table: string; payload: Row }>;
} = {
  selectData: null,
  selectError: null,
  updateError: null,
  insertError: null,
  updates: [],
  inserts: [],
};

function buildFrom(table: string) {
  return {
    select: () => {
      const thenable = {
        eq: (_col: string, _val: string) => ({
          maybeSingle: () =>
            Promise.resolve({
              data: staged.selectData,
              error: staged.selectError,
            }),
          // Used by getPlatformSettings's .order() chain.
          order: () =>
            Promise.resolve({
              data: staged.selectData ? [staged.selectData] : [],
              error: staged.selectError,
            }),
        }),
        order: () =>
          Promise.resolve({
            data: staged.selectData ? [staged.selectData] : [],
            error: staged.selectError,
          }),
      };
      return thenable;
    },
    update: (payload: Row) => ({
      eq: (col: string, val: string) => {
        staged.updates.push({ table, payload, matched: { [col]: val } });
        return Promise.resolve({ error: staged.updateError });
      },
    }),
    insert: (payload: Row) => {
      staged.inserts.push({ table, payload });
      return Promise.resolve({ error: staged.insertError });
    },
  };
}

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: (t: string) => buildFrom(t),
  }),
}));

const mockVerifySession = vi.fn();

vi.mock('@/app/actions/auth', () => ({
  verifySession: mockVerifySession,
  requireAdminRole: async (allowed: string[]) => {
    const s = await mockVerifySession();
    if (!s || !allowed.includes(s.role)) throw new Error('Unauthorized');
    return s;
  },
}));

// Rate limiter uses an in-memory Map by default, but we stub it to deterministic
// "always allow" so per-test call counts don't accumulate across the suite.
vi.mock('@/lib/with-rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ ok: true }),
}));

describe('platform-settings server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    staged.selectData = null;
    staged.selectError = null;
    staged.updateError = null;
    staged.insertError = null;
    staged.updates = [];
    staged.inserts = [];
    mockVerifySession.mockResolvedValue({
      salonId: 'super-admin',
      staffId: 'admin-user-1',
      role: 'super_admin',
    });
  });

  it('updatePlatformSetting rejects non-super_admin roles', async () => {
    mockVerifySession.mockResolvedValue({
      salonId: 's',
      staffId: 'u',
      role: 'technical_support',
    });
    const { updatePlatformSetting } = await import(
      '../src/app/actions/platform-settings'
    );
    await expect(
      updatePlatformSetting('marketplace_women_enabled', true),
    ).rejects.toThrow(/unauthorized/i);
    // No DB work should have happened.
    expect(staged.updates).toEqual([]);
    expect(staged.inserts).toEqual([]);
  });

  it('rejects owner role too (belt-and-suspenders)', async () => {
    mockVerifySession.mockResolvedValue({
      salonId: 's',
      staffId: 'u',
      role: 'owner',
    });
    const { updatePlatformSetting } = await import(
      '../src/app/actions/platform-settings'
    );
    await expect(
      updatePlatformSetting('marketplace_women_enabled', true),
    ).rejects.toThrow(/unauthorized/i);
  });

  it('super_admin update persists new value + writes audit log entry with {key, old_value, new_value}', async () => {
    // Existing row returns false; we flip to true.
    staged.selectData = { value: false };

    const { updatePlatformSetting } = await import(
      '../src/app/actions/platform-settings'
    );
    const res = await updatePlatformSetting('marketplace_women_enabled', true);
    expect(res.error).toBeNull();

    // Update landed on platform_settings with new value + updated_by.
    const update = staged.updates.find((u) => u.table === 'platform_settings');
    expect(update).toBeDefined();
    expect(update!.payload.value).toBe(true);
    expect(update!.payload.updated_by).toBe('admin-user-1');
    expect(typeof update!.payload.updated_at).toBe('string');
    expect(update!.matched).toEqual({ key: 'marketplace_women_enabled' });

    // Audit log row written with the full before/after metadata.
    const audit = staged.inserts.find((i) => i.table === 'admin_audit_log');
    expect(audit).toBeDefined();
    expect(audit!.payload.admin_auth_user_id).toBe('admin-user-1');
    expect(audit!.payload.action).toBe('platform_setting_update');
    expect(audit!.payload.target_table).toBe('platform_settings');
    expect(audit!.payload.metadata).toEqual({
      key: 'marketplace_women_enabled',
      old_value: false,
      new_value: true,
    });
  });

  it('refuses to update an unknown key (row must be seeded by migration)', async () => {
    // Row not present.
    staged.selectData = null;

    const { updatePlatformSetting } = await import(
      '../src/app/actions/platform-settings'
    );
    const res = await updatePlatformSetting('brand_new_flag', true);
    expect(res.error).toMatch(/unknown platform setting/i);
    // No update or audit insert.
    expect(staged.updates).toEqual([]);
    expect(staged.inserts).toEqual([]);
  });

  it('rejects invalid key shape via zod', async () => {
    staged.selectData = { value: false };
    const { updatePlatformSetting } = await import(
      '../src/app/actions/platform-settings'
    );
    const res = await updatePlatformSetting('Has Spaces!', true);
    expect(res.error).toBeTruthy();
    expect(staged.updates).toEqual([]);
  });
});
