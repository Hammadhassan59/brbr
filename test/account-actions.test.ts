import { describe, it, expect, vi, beforeEach } from 'vitest';

type Session = { salonId: string; staffId: string; role: string; branchId: string; name: string };

let session: Session = { salonId: 'salon-1', staffId: 'auth-user-1', role: 'owner', branchId: 'branch-1', name: 'Owner' };

let adminGetUserById = vi.fn().mockResolvedValue({ data: { user: { id: 'auth-user-1', email: 'owner@example.com' } }, error: null });
let adminUpdateUserById = vi.fn().mockResolvedValue({ data: { user: { id: 'auth-user-1' } }, error: null });
let anonSignIn = vi.fn().mockResolvedValue({ data: { user: { id: 'auth-user-1' } }, error: null });
let anonSignOut = vi.fn().mockResolvedValue({ error: null });

const partnerRow: { auth_user_id: string | null; salon_id: string } = { auth_user_id: 'auth-partner-1', salon_id: 'salon-1' };
const staffRow: { auth_user_id: string | null; salon_id: string } = { auth_user_id: 'auth-staff-1', salon_id: 'salon-1' };

const fromMock = vi.fn((table: string) => {
  if (table === 'salon_partners') {
    return {
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: partnerRow }) }) }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    };
  }
  if (table === 'staff') {
    return {
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: staffRow }) }) }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    };
  }
  return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) };
});

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: fromMock,
    auth: {
      admin: {
        getUserById: (id: string) => adminGetUserById(id),
        updateUserById: (id: string, body: Record<string, unknown>) => adminUpdateUserById(id, body),
      },
    },
  }),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: (creds: { email: string; password: string }) => anonSignIn(creds),
      signOut: () => anonSignOut(),
    },
  }),
}));

vi.mock('@/app/actions/auth', () => ({
  verifySession: vi.fn(() => Promise.resolve(session)),
}));

beforeEach(() => {
  vi.clearAllMocks();
  session = { salonId: 'salon-1', staffId: 'auth-user-1', role: 'owner', branchId: 'branch-1', name: 'Owner' };
  partnerRow.auth_user_id = 'auth-partner-1';
  partnerRow.salon_id = 'salon-1';
  staffRow.auth_user_id = 'auth-staff-1';
  staffRow.salon_id = 'salon-1';

  adminGetUserById = vi.fn().mockResolvedValue({ data: { user: { id: 'auth-user-1', email: 'owner@example.com' } }, error: null });
  adminUpdateUserById = vi.fn().mockResolvedValue({ data: { user: { id: 'auth-user-1' } }, error: null });
  anonSignIn = vi.fn().mockResolvedValue({ data: { user: { id: 'auth-user-1' } }, error: null });
  anonSignOut = vi.fn().mockResolvedValue({ error: null });
});

describe('account actions — getAccountEmail', () => {
  it('returns the owner email from Supabase auth', async () => {
    const { getAccountEmail } = await import('../src/app/actions/account');
    const res = await getAccountEmail();
    expect(res.error).toBeNull();
    expect(res.data?.email).toBe('owner@example.com');
  });

  it('rejects super_admin role', async () => {
    session = { ...session, role: 'super_admin' };
    const { getAccountEmail } = await import('../src/app/actions/account');
    const res = await getAccountEmail();
    expect(res.data).toBeNull();
    expect(res.error).toMatch(/not available/i);
  });

  it('rejects sales_agent role', async () => {
    session = { ...session, role: 'sales_agent' };
    const { getAccountEmail } = await import('../src/app/actions/account');
    const res = await getAccountEmail();
    expect(res.error).toMatch(/not available/i);
  });
});

describe('account actions — changeAccountPassword', () => {
  it('updates password when current is correct', async () => {
    const { changeAccountPassword } = await import('../src/app/actions/account');
    const res = await changeAccountPassword({ currentPassword: 'oldpass', newPassword: 'newpass1' });
    expect(res.error).toBeNull();
    expect(adminUpdateUserById).toHaveBeenCalledWith('auth-user-1', { password: 'newpass1' });
  });

  it('rejects when current password is wrong', async () => {
    anonSignIn = vi.fn().mockResolvedValue({ data: null, error: { message: 'Invalid credentials' } });
    const { changeAccountPassword } = await import('../src/app/actions/account');
    const res = await changeAccountPassword({ currentPassword: 'wrong', newPassword: 'newpass1' });
    expect(res.error).toMatch(/incorrect/i);
    expect(adminUpdateUserById).not.toHaveBeenCalled();
  });

  it('rejects passwords shorter than 6 chars', async () => {
    const { changeAccountPassword } = await import('../src/app/actions/account');
    const res = await changeAccountPassword({ currentPassword: 'oldpass', newPassword: '123' });
    expect(res.error).toMatch(/6 characters/);
    expect(anonSignIn).not.toHaveBeenCalled();
  });

  it('rejects when new password matches current', async () => {
    const { changeAccountPassword } = await import('../src/app/actions/account');
    const res = await changeAccountPassword({ currentPassword: 'samepass', newPassword: 'samepass' });
    expect(res.error).toMatch(/differ/i);
  });

  it('rejects when current password missing', async () => {
    const { changeAccountPassword } = await import('../src/app/actions/account');
    const res = await changeAccountPassword({ currentPassword: '', newPassword: 'newpass1' });
    expect(res.error).toMatch(/current password/i);
  });
});

describe('account actions — changeAccountEmail', () => {
  it('updates email when current password is correct', async () => {
    const { changeAccountEmail } = await import('../src/app/actions/account');
    const res = await changeAccountEmail({ currentPassword: 'oldpass', newEmail: 'new@example.com' });
    expect(res.error).toBeNull();
    expect(res.data?.email).toBe('new@example.com');
    expect(adminUpdateUserById).toHaveBeenCalledWith('auth-user-1', { email: 'new@example.com', email_confirm: true });
  });

  it('normalizes email to lowercase', async () => {
    const { changeAccountEmail } = await import('../src/app/actions/account');
    const res = await changeAccountEmail({ currentPassword: 'oldpass', newEmail: '  New@Example.COM  ' });
    expect(res.data?.email).toBe('new@example.com');
  });

  it('rejects invalid email format', async () => {
    const { changeAccountEmail } = await import('../src/app/actions/account');
    const res = await changeAccountEmail({ currentPassword: 'oldpass', newEmail: 'not-an-email' });
    expect(res.error).toMatch(/valid email/i);
    expect(anonSignIn).not.toHaveBeenCalled();
  });

  it('rejects when new email equals current', async () => {
    const { changeAccountEmail } = await import('../src/app/actions/account');
    const res = await changeAccountEmail({ currentPassword: 'oldpass', newEmail: 'OWNER@example.com' });
    expect(res.error).toMatch(/same as current/i);
    expect(adminUpdateUserById).not.toHaveBeenCalled();
  });

  it('rejects when current password is wrong', async () => {
    anonSignIn = vi.fn().mockResolvedValue({ data: null, error: { message: 'Invalid credentials' } });
    const { changeAccountEmail } = await import('../src/app/actions/account');
    const res = await changeAccountEmail({ currentPassword: 'wrong', newEmail: 'new@example.com' });
    expect(res.error).toMatch(/incorrect/i);
    expect(adminUpdateUserById).not.toHaveBeenCalled();
  });

  it('surfaces admin API errors (e.g. email already taken)', async () => {
    adminUpdateUserById = vi.fn().mockResolvedValue({ data: null, error: { message: 'Email already registered' } });
    const { changeAccountEmail } = await import('../src/app/actions/account');
    const res = await changeAccountEmail({ currentPassword: 'oldpass', newEmail: 'taken@example.com' });
    expect(res.error).toMatch(/already registered/i);
  });
});

describe('account actions — role resolution', () => {
  it('partner: looks up auth_user_id from salon_partners row', async () => {
    session = { salonId: 'salon-1', staffId: 'partner-row-1', role: 'partner', branchId: 'b1', name: 'P' };
    adminGetUserById = vi.fn().mockResolvedValue({ data: { user: { id: 'auth-partner-1', email: 'partner@example.com' } }, error: null });
    const { getAccountEmail } = await import('../src/app/actions/account');
    const res = await getAccountEmail();
    expect(res.error).toBeNull();
    expect(adminGetUserById).toHaveBeenCalledWith('auth-partner-1');
  });

  it('staff: looks up auth_user_id from staff row', async () => {
    session = { salonId: 'salon-1', staffId: 'staff-row-1', role: 'manager', branchId: 'b1', name: 'S' };
    adminGetUserById = vi.fn().mockResolvedValue({ data: { user: { id: 'auth-staff-1', email: 's@example.com' } }, error: null });
    const { getAccountEmail } = await import('../src/app/actions/account');
    const res = await getAccountEmail();
    expect(res.error).toBeNull();
    expect(adminGetUserById).toHaveBeenCalledWith('auth-staff-1');
  });

  it('partner: rejects if salon_id does not match session', async () => {
    session = { salonId: 'salon-1', staffId: 'partner-row-1', role: 'partner', branchId: 'b1', name: 'P' };
    partnerRow.salon_id = 'salon-OTHER';
    const { getAccountEmail } = await import('../src/app/actions/account');
    const res = await getAccountEmail();
    expect(res.error).toMatch(/denied/i);
  });

  it('staff: rejects if salon_id does not match session', async () => {
    session = { salonId: 'salon-1', staffId: 'staff-row-1', role: 'manager', branchId: 'b1', name: 'S' };
    staffRow.salon_id = 'salon-OTHER';
    const { getAccountEmail } = await import('../src/app/actions/account');
    const res = await getAccountEmail();
    expect(res.error).toMatch(/denied/i);
  });

  it('partner: rejects if auth_user_id is not linked', async () => {
    session = { salonId: 'salon-1', staffId: 'partner-row-1', role: 'partner', branchId: 'b1', name: 'P' };
    partnerRow.auth_user_id = null;
    const { getAccountEmail } = await import('../src/app/actions/account');
    const res = await getAccountEmail();
    expect(res.error).toMatch(/not linked/i);
  });
});
