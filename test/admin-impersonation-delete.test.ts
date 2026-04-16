import { describe, it, expect, vi, beforeEach } from 'vitest';

type Session = { salonId: string; staffId: string; role: string; branchId: string; name: string; impersonatedBy?: { staffId: string; name: string } };
let session: Session = { salonId: 'super-admin', staffId: 'admin-1', role: 'super_admin', branchId: '', name: 'Super Admin' };

const salonRow = { id: 'salon-1', name: 'Test Salon', owner_id: 'owner-auth-1' };
// branches list is hardcoded inside the fromMock branches branch — kept here
// as documentation of the shape the action expects from .order() on branches.
// const branches = [{ id: 'branch-main', is_main: true }, { id: 'branch-2', is_main: false }];
// Each row carries every field the action might select on a single from('table').
// The deleteSalonAndAllData action queries staff twice (once for auth_user_id,
// once for id) — keeping both fields per row makes the mock work for both.
const partners = [
  { id: 'partner-1', auth_user_id: 'partner-auth-1' },
  { id: 'partner-2', auth_user_id: null },
];
const staff = [
  { id: 'staff-1', auth_user_id: 'staff-auth-1' },
  { id: 'staff-2', auth_user_id: 'staff-auth-2' },
];

let deleteCalls: string[] = [];
let salonDeleteShouldFail = false;
const adminDeleteUser = vi.fn().mockResolvedValue({ error: null });
const signSessionMock = vi.fn().mockResolvedValue({ success: true });
const cookieSet = vi.fn();

// Helper that returns a thenable for chains like .select('id').eq('salon_id', x)
// where the await unwraps to { data, error }. Also supports .order().
function awaitable<T>(data: T) {
  const result = { data, error: null as { message: string } | null };
  const obj: Record<string, unknown> = {
    order: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    then: <R>(onResolve: (v: typeof result) => R, onReject?: (e: unknown) => R): Promise<R> =>
      Promise.resolve(result).then(onResolve, onReject),
  };
  return obj;
}

const fromMock = vi.fn((table: string) => {
  if (table === 'salons') {
    return {
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: salonRow, error: null }) }),
      }),
      delete: () => ({
        eq: () => {
          deleteCalls.push('salons');
          return Promise.resolve({ error: salonDeleteShouldFail ? { message: 'boom' } : null });
        },
      }),
    };
  }
  if (table === 'branches') {
    return {
      select: () => ({
        eq: () => awaitable([{ id: 'branch-main' }, { id: 'branch-2' }]),
      }),
    };
  }
  if (table === 'salon_partners') {
    return {
      select: () => ({ eq: () => awaitable(partners) }),
    };
  }
  if (table === 'staff') {
    // Same row returned for both .select('auth_user_id') and .select('id')
    // calls — each row carries both fields.
    return {
      select: () => ({ eq: () => awaitable(staff) }),
    };
  }
  if (table === 'clients' || table === 'products' || table === 'packages') {
    // Always return at least one row so every blocker delete actually fires
    // and shows up in deleteCalls — otherwise the empty-array short-circuit
    // hides whether the action would have called those purges in real life.
    return {
      select: () => ({ eq: () => awaitable([{ id: `${table}-1` }]) }),
    };
  }
  if (table === 'appointments' || table === 'bills' || table === 'loyalty_rules') {
    return {
      delete: () => ({
        eq: () => {
          deleteCalls.push(table);
          return Promise.resolve({ error: null });
        },
      }),
    };
  }
  // New blocker tables: cash_drawers, attendance, expenses, purchase_orders,
  // stock_movements, udhaar_payments, advances, client_packages.
  // Each gets a delete().in() chain — no-op (return null error) since the
  // parent ID arrays will often be empty in the mocked fixture.
  return {
    delete: () => ({
      in: () => {
        deleteCalls.push(table);
        return Promise.resolve({ error: null });
      },
    }),
  };
});

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: fromMock,
    auth: {
      admin: {
        deleteUser: (id: string) => adminDeleteUser(id),
        getUserById: (id: string) =>
          Promise.resolve({
            data: { user: { id, email: `user-${id}@example.com` } },
            error: null,
          }),
        generateLink: () =>
          Promise.resolve({
            data: { properties: { hashed_token: 'tok-abc' } },
            error: null,
          }),
      },
    },
  }),
}));

vi.mock('@/app/actions/auth', () => ({
  verifySession: () => Promise.resolve(session),
  signSession: (p: Session) => signSessionMock(p),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ set: cookieSet }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  session = { salonId: 'super-admin', staffId: 'admin-1', role: 'super_admin', branchId: '', name: 'Super Admin' };
  salonDeleteShouldFail = false;
  deleteCalls = [];
});

describe('impersonateSalon', () => {
  it('requires super_admin', async () => {
    session = { ...session, role: 'owner' };
    const { impersonateSalon } = await import('../src/app/actions/admin');
    await expect(impersonateSalon('salon-1')).rejects.toThrow(/unauthorized/i);
  });

  it('rejects re-entry while already impersonating', async () => {
    session = { ...session, impersonatedBy: { staffId: 'admin-1', name: 'Super' } };
    const { impersonateSalon } = await import('../src/app/actions/admin');
    const res = await impersonateSalon('salon-1');
    expect(res.error).toMatch(/exit first/i);
  });

  it('signs a session with role=owner, salonId set, impersonatedBy captured', async () => {
    const { impersonateSalon } = await import('../src/app/actions/admin');
    const res = await impersonateSalon('salon-1');
    expect(res.error).toBeNull();
    expect(signSessionMock).toHaveBeenCalledOnce();
    const payload = signSessionMock.mock.calls[0][0];
    expect(payload.role).toBe('owner');
    expect(payload.salonId).toBe('salon-1');
    expect(payload.branchId).toBe('branch-main');
    expect(payload.impersonatedBy).toEqual({ staffId: 'admin-1', name: 'Super Admin' });
  });

  it('sets icut-role=owner cookie for the proxy', async () => {
    const { impersonateSalon } = await import('../src/app/actions/admin');
    await impersonateSalon('salon-1');
    const roleCall = cookieSet.mock.calls.find((c) => c[0] === 'icut-role');
    expect(roleCall?.[1]).toBe('owner');
  });

  it('returns a magic-link hashed_token so the browser can mint an owner Supabase Auth session', async () => {
    // Regression: without this, client-side RLS on /dashboard evaluates auth.uid()
    // as the super admin, get_user_salon_id() returns NULL, and every query
    // returns zero rows. Confirm the server hands back the redemption token.
    const { impersonateSalon } = await import('../src/app/actions/admin');
    const res = await impersonateSalon('salon-1');
    expect(res.error).toBeNull();
    expect(res.data?.supabaseAuth).toEqual({
      tokenHash: 'tok-abc',
      email: 'user-owner-auth-1@example.com',
    });
  });
});

describe('exitImpersonation', () => {
  it('refuses when the session carries no impersonation claim', async () => {
    const { exitImpersonation } = await import('../src/app/actions/admin');
    const res = await exitImpersonation();
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/not currently impersonating/i);
  });

  it('restores super_admin session when impersonation is active', async () => {
    session = {
      salonId: 'salon-1', staffId: 'owner-auth-1', role: 'owner', branchId: 'branch-main',
      name: 'Admin viewing Test Salon',
      impersonatedBy: { staffId: 'admin-1', name: 'Super Admin' },
    };
    const { exitImpersonation } = await import('../src/app/actions/admin');
    const res = await exitImpersonation();
    expect(res.success).toBe(true);
    const payload = signSessionMock.mock.calls[0][0];
    expect(payload.role).toBe('super_admin');
    expect(payload.staffId).toBe('admin-1');
    expect(payload.impersonatedBy).toBeUndefined();
  });

  it('mints a fresh Supabase Auth token for the super admin on exit', async () => {
    // Regression: after exit, the browser's Supabase client must flip off the
    // owner's auth.uid(). Returning a hashed_token lets the client redeem it
    // via verifyOtp instead of forcing a /login round trip.
    session = {
      salonId: 'salon-1', staffId: 'owner-auth-1', role: 'owner', branchId: 'branch-main',
      name: 'Admin viewing Test Salon',
      impersonatedBy: { staffId: 'admin-1', name: 'Super Admin' },
    };
    const { exitImpersonation } = await import('../src/app/actions/admin');
    const res = await exitImpersonation();
    expect(res.supabaseAuth).toEqual({
      tokenHash: 'tok-abc',
      email: 'user-admin-1@example.com',
    });
  });
});

describe('deleteSalonAndAllData', () => {
  it('requires super_admin', async () => {
    session = { ...session, role: 'owner' };
    const { deleteSalonAndAllData } = await import('../src/app/actions/admin');
    await expect(deleteSalonAndAllData('salon-1', 'Test Salon')).rejects.toThrow(/unauthorized/i);
  });

  it('rejects when the confirmation name does not match', async () => {
    const { deleteSalonAndAllData } = await import('../src/app/actions/admin');
    const res = await deleteSalonAndAllData('salon-1', 'Wrong Name');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/name confirmation/i);
    expect(deleteCalls).toEqual([]);
  });

  it('deletes non-cascading tables first, then salon, then auth users', async () => {
    const { deleteSalonAndAllData } = await import('../src/app/actions/admin');
    const res = await deleteSalonAndAllData('salon-1', 'Test Salon');
    expect(res.success).toBe(true);
    // Blocker tables that prevent the salons cascade go first, then the
    // three NO ACTION tables on salons (appointments/bills/loyalty_rules),
    // then the salon row itself. Order matters — Postgres rejects the parent
    // delete if any FK still points at a salon-scoped child.
    // Blocker tables that prevent the salons cascade go first (in
    // dependency-safe order), then the second stock_movements pass for
    // product_id, then the three NO ACTION tables on salons
    // (appointments/bills/loyalty_rules), then the salon row itself.
    expect(deleteCalls).toEqual([
      'cash_drawers', 'attendance', 'expenses', 'purchase_orders',
      'stock_movements', 'udhaar_payments', 'advances', 'client_packages',
      'stock_movements',
      'appointments', 'bills', 'loyalty_rules', 'salons',
    ]);
    // owner + partner-auth-1 + staff-auth-1 + staff-auth-2 (4 unique)
    expect(adminDeleteUser).toHaveBeenCalledTimes(4);
    expect(res.deletedAuthUsers).toBe(4);
  });

  it('trims the confirm name', async () => {
    const { deleteSalonAndAllData } = await import('../src/app/actions/admin');
    const res = await deleteSalonAndAllData('salon-1', '  Test Salon  ');
    expect(res.success).toBe(true);
  });

  it('surfaces salon delete errors and skips auth cleanup', async () => {
    salonDeleteShouldFail = true;
    const { deleteSalonAndAllData } = await import('../src/app/actions/admin');
    const res = await deleteSalonAndAllData('salon-1', 'Test Salon');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/salons.*boom/);
    expect(adminDeleteUser).not.toHaveBeenCalled();
  });

  it('best-effort auth deletion — failures do not rollback', async () => {
    adminDeleteUser.mockResolvedValueOnce({ error: { message: 'x' } }); // owner fails
    const { deleteSalonAndAllData } = await import('../src/app/actions/admin');
    const res = await deleteSalonAndAllData('salon-1', 'Test Salon');
    expect(res.success).toBe(true);
    expect(res.deletedAuthUsers).toBe(3); // 4 attempts, 1 failed
  });
});
