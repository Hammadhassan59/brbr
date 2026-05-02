import { describe, it, expect, vi, beforeEach } from 'vitest';

type Session = { salonId: string; staffId: string; role: string; branchId: string; name: string };

let session: Session = { salonId: 'salon-1', staffId: 'auth-user-1', role: 'owner', branchId: 'branch-1', name: 'Owner' };

let adminGetUserById = vi.fn().mockResolvedValue({ data: { user: { id: 'auth-user-1', email: 'owner@example.com' } }, error: null });
let adminUpdateUserById = vi.fn().mockResolvedValue({ data: { user: { id: 'auth-user-1' } }, error: null });
// signInWithPassword now also returns a session.access_token — the email-change
// flow uses that token to call supabase.auth.updateUser as the user, so the
// verification email path is honoured instead of the service-role bypass.
let anonSignIn = vi.fn().mockResolvedValue({
  data: { user: { id: 'auth-user-1' }, session: { access_token: 'user-access-token' } },
  error: null,
});
let anonSignOut = vi.fn().mockResolvedValue({ error: null });
// Separate mock for the user-authed client that performs auth.updateUser({ email }).
let userAuthedUpdateUser = vi.fn().mockResolvedValue({ data: { user: { id: 'auth-user-1' } }, error: null });

const partnerRow: { auth_user_id: string | null; salon_id: string } = { auth_user_id: 'auth-partner-1', salon_id: 'salon-1' };
const staffRow: { auth_user_id: string | null; salon_id: string } = { auth_user_id: 'auth-staff-1', salon_id: 'salon-1' };

const agentRow = { name: 'Agent Name', phone: '0300-0000000' };

const fromMock = vi.fn((table: string) => {
  if (table === 'salon_partners') {
    return {
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { ...partnerRow, name: 'Partner Name' } }) }) }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    };
  }
  if (table === 'staff') {
    return {
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { ...staffRow, name: 'Staff Name' } }) }) }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    };
  }
  if (table === 'sales_agents') {
    return {
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: agentRow }) }) }),
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

// auth-admin replaces supabase.auth.admin.* in production code; route the
// same mocks through it so existing assertions (toHaveBeenCalledWith) still
// match without rewriting every test.
vi.mock('@/app/actions/auth-admin', () => ({
  getUserById: (id: string) => adminGetUserById(id),
  updateUserById: (id: string, body: Record<string, unknown>) => adminUpdateUserById(id, body),
}));

// auth-credentials.signInWithPassword replaces the previous anon-client
// password-verification path. Email change now goes through the existing
// authAdmin.updateUserById mock (no separate user-authed client).
vi.mock('@/app/actions/auth-credentials', () => ({
  signInWithPassword: (creds: { email: string; password: string }) => anonSignIn(creds),
}));
// userAuthedUpdateUser is no longer wired through — the email change now
// just calls authAdmin.updateUserById which is already mocked above.
void userAuthedUpdateUser;
void anonSignOut;

vi.mock('@/app/actions/auth', () => ({
  verifySession: vi.fn(() => Promise.resolve(session)),
}));

// headers() returns an object with .get for x-forwarded-for / x-real-ip lookups.
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '127.0.0.1' }),
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
}));

beforeEach(async () => {
  vi.clearAllMocks();
  session = { salonId: 'salon-1', staffId: 'auth-user-1', role: 'owner', branchId: 'branch-1', name: 'Owner' };
  partnerRow.auth_user_id = 'auth-partner-1';
  partnerRow.salon_id = 'salon-1';
  staffRow.auth_user_id = 'auth-staff-1';
  staffRow.salon_id = 'salon-1';

  adminGetUserById = vi.fn().mockResolvedValue({ data: { user: { id: 'auth-user-1', email: 'owner@example.com' } }, error: null });
  adminUpdateUserById = vi.fn().mockResolvedValue({ data: { user: { id: 'auth-user-1' } }, error: null });
  anonSignIn = vi.fn().mockResolvedValue({
    data: { user: { id: 'auth-user-1' }, session: { access_token: 'user-access-token' } },
    error: null,
  });
  anonSignOut = vi.fn().mockResolvedValue({ error: null });
  userAuthedUpdateUser = vi.fn().mockResolvedValue({ data: { user: { id: 'auth-user-1' } }, error: null });

  // Clear rate-limit state between tests so tests don't bleed into each other.
  const { resetRateLimit } = await import('../src/lib/rate-limit');
  resetRateLimit('login:127.0.0.1:auth-user-1');
  resetRateLimit('change-email:auth-user-1');
  resetRateLimit('change-email:auth-partner-1');
  resetRateLimit('change-email:auth-staff-1');
});

describe('account actions — getAccountEmail', () => {
  it('returns the owner email from Supabase auth', async () => {
    const { getAccountEmail } = await import('../src/app/actions/account');
    const res = await getAccountEmail();
    expect(res.error).toBeNull();
    expect(res.data?.email).toBe('owner@example.com');
  });

  it('super_admin uses session.staffId directly as auth user id', async () => {
    session = { ...session, role: 'super_admin' };
    const { getAccountEmail } = await import('../src/app/actions/account');
    const res = await getAccountEmail();
    expect(res.error).toBeNull();
    expect(adminGetUserById).toHaveBeenCalledWith('auth-user-1');
  });

  it('sales_agent uses session.staffId directly as auth user id', async () => {
    session = { ...session, role: 'sales_agent' };
    const { getAccountEmail } = await import('../src/app/actions/account');
    const res = await getAccountEmail();
    expect(res.error).toBeNull();
    expect(adminGetUserById).toHaveBeenCalledWith('auth-user-1');
  });
});

describe('account actions — changeAccountPassword', () => {
  it('updates password when current is correct', async () => {
    const { changeAccountPassword } = await import('../src/app/actions/account');
    const res = await changeAccountPassword({ currentPassword: 'oldpass', newPassword: 'Newpass123!' });
    expect(res.error).toBeNull();
    expect(adminUpdateUserById).toHaveBeenCalledWith('auth-user-1', { password: 'Newpass123!' });
  });

  it('rejects when current password is wrong', async () => {
    anonSignIn = vi.fn().mockResolvedValue({ data: null, error: { message: 'Invalid credentials' } });
    const { changeAccountPassword } = await import('../src/app/actions/account');
    const res = await changeAccountPassword({ currentPassword: 'wrong', newPassword: 'Newpass123!' });
    expect(res.error).toMatch(/incorrect/i);
    expect(adminUpdateUserById).not.toHaveBeenCalled();
  });

  it('rejects passwords shorter than 8 chars', async () => {
    const { changeAccountPassword } = await import('../src/app/actions/account');
    const res = await changeAccountPassword({ currentPassword: 'oldpass', newPassword: '123' });
    expect(res.error).toMatch(/8 characters/);
    expect(anonSignIn).not.toHaveBeenCalled();
  });

  it('rejects when new password matches current', async () => {
    const { changeAccountPassword } = await import('../src/app/actions/account');
    const res = await changeAccountPassword({ currentPassword: 'Samepass123!', newPassword: 'Samepass123!' });
    expect(res.error).toMatch(/differ/i);
  });

  it('rejects when current password missing', async () => {
    const { changeAccountPassword } = await import('../src/app/actions/account');
    const res = await changeAccountPassword({ currentPassword: '', newPassword: 'Newpass123!' });
    expect(res.error).toMatch(/current password/i);
  });
});

describe('account actions — changeAccountEmail', () => {
  // After de-Supabase: the email update goes through authAdmin.updateUserById
  // directly (with email_confirm: true). The previous user-authed
  // supabase.auth.updateUser({ email }) verification flow is gone — TODO is
  // tracked in account.ts for re-introducing a proper double-opt-in.

  it('invokes authAdmin.updateUserById with the new email', async () => {
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
    expect(adminUpdateUserById).toHaveBeenCalledWith('auth-user-1', { email: 'new@example.com', email_confirm: true });
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

  it('surfaces updateUser errors (e.g. email already taken)', async () => {
    adminUpdateUserById = vi.fn().mockResolvedValue({ data: null, error: { message: 'Email already registered' } });
    const { changeAccountEmail } = await import('../src/app/actions/account');
    const res = await changeAccountEmail({ currentPassword: 'oldpass', newEmail: 'taken@example.com' });
    expect(res.error).toMatch(/already registered/i);
  });
});

describe('account actions — getAccountProfile', () => {
  it('owner gets email only — name/phone not editable here', async () => {
    const { getAccountProfile } = await import('../src/app/actions/account');
    const res = await getAccountProfile();
    expect(res.data).toMatchObject({
      email: 'owner@example.com',
      role: 'owner',
      name: null,
      phone: null,
      nameEditable: false,
      phoneEditable: false,
    });
  });

  it('super_admin gets email only', async () => {
    session = { ...session, role: 'super_admin' };
    const { getAccountProfile } = await import('../src/app/actions/account');
    const res = await getAccountProfile();
    expect(res.data?.nameEditable).toBe(false);
    expect(res.data?.phoneEditable).toBe(false);
  });

  it('sales_agent gets name + phone editable', async () => {
    session = { salonId: '', staffId: 'auth-user-1', role: 'sales_agent', branchId: '', name: 'A' };
    const { getAccountProfile } = await import('../src/app/actions/account');
    const res = await getAccountProfile();
    expect(res.data?.nameEditable).toBe(true);
    expect(res.data?.phoneEditable).toBe(true);
  });
});

describe('account actions — updateAccountProfile', () => {
  it('partner can update name + phone', async () => {
    session = { salonId: 'salon-1', staffId: 'partner-row-1', role: 'partner', branchId: 'b1', name: 'P' };
    const { updateAccountProfile } = await import('../src/app/actions/account');
    const res = await updateAccountProfile({ name: 'New Name', phone: '0300 1234567' });
    expect(res.error).toBeNull();
    expect(res.data).toEqual({ name: 'New Name', phone: '0300 1234567' });
  });

  it('staff can update phone only', async () => {
    session = { salonId: 'salon-1', staffId: 'staff-row-1', role: 'manager', branchId: 'b1', name: 'S' };
    const { updateAccountProfile } = await import('../src/app/actions/account');
    const res = await updateAccountProfile({ phone: '0300 9999999' });
    expect(res.error).toBeNull();
  });

  it('rejects empty name when name is provided', async () => {
    session = { salonId: 'salon-1', staffId: 'partner-row-1', role: 'partner', branchId: 'b1', name: 'P' };
    const { updateAccountProfile } = await import('../src/app/actions/account');
    const res = await updateAccountProfile({ name: '   ' });
    expect(res.error).toMatch(/cannot be empty/i);
  });

  it('rejects empty phone when phone is provided', async () => {
    session = { salonId: 'salon-1', staffId: 'partner-row-1', role: 'partner', branchId: 'b1', name: 'P' };
    const { updateAccountProfile } = await import('../src/app/actions/account');
    const res = await updateAccountProfile({ phone: '' });
    expect(res.error).toMatch(/cannot be empty/i);
  });

  it('rejects when nothing to update', async () => {
    session = { salonId: 'salon-1', staffId: 'partner-row-1', role: 'partner', branchId: 'b1', name: 'P' };
    const { updateAccountProfile } = await import('../src/app/actions/account');
    const res = await updateAccountProfile({});
    expect(res.error).toMatch(/nothing to update/i);
  });

  it('owner/super_admin cannot update name/phone here', async () => {
    const { updateAccountProfile } = await import('../src/app/actions/account');
    const res = await updateAccountProfile({ name: 'Test' });
    expect(res.error).toMatch(/not editable/i);
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
