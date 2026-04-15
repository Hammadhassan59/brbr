import { describe, it, expect, vi, beforeEach } from 'vitest';

type Session = { salonId: string; staffId: string; role: string; branchId: string; name: string; impersonatedBy?: { staffId: string; name: string } };
let session: Session = { salonId: 'super-admin', staffId: 'admin-1', role: 'super_admin', branchId: '', name: 'Super Admin' };

const salonRow = { id: 'salon-1', name: 'Test Salon', owner_id: 'owner-auth-1' };
const branches = [{ id: 'branch-main', is_main: true }, { id: 'branch-2', is_main: false }];
const partners = [{ auth_user_id: 'partner-auth-1' }, { auth_user_id: null }];
const staff = [{ auth_user_id: 'staff-auth-1' }, { auth_user_id: 'staff-auth-2' }];

let deleteCalls: string[] = [];
let salonDeleteShouldFail = false;
const adminDeleteUser = vi.fn().mockResolvedValue({ error: null });
const signSessionMock = vi.fn().mockResolvedValue({ success: true });
const cookieSet = vi.fn();

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
        eq: () => ({ order: () => Promise.resolve({ data: branches, error: null }) }),
      }),
    };
  }
  if (table === 'salon_partners') {
    return {
      select: () => ({ eq: () => Promise.resolve({ data: partners, error: null }) }),
    };
  }
  if (table === 'staff') {
    return {
      select: () => ({ eq: () => Promise.resolve({ data: staff, error: null }) }),
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
  return { select: () => ({}) };
});

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: fromMock,
    auth: {
      admin: {
        deleteUser: (id: string) => adminDeleteUser(id),
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
    expect(deleteCalls).toEqual(['appointments', 'bills', 'loyalty_rules', 'salons']);
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
