import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for `src/app/actions/consumer-profile.ts` — the marketplace-side
 * profile/notification server actions (updateConsumerName, updateConsumerPhone,
 * changeConsumerEmail, changeConsumerPassword, updateConsumerNotificationPrefs,
 * getConsumerProfile).
 *
 * The email-change flow is the critical correctness target: it must NEVER go
 * through the admin bypass (`auth.admin.updateUserById({ email_confirm: true })`)
 * and must ALWAYS go through a user-authed `auth.updateUser({ email })` so
 * Supabase emits verification links to both old and new addresses. The tests
 * assert this directly by asserting the user-authed mock is called and the
 * admin mock is not.
 *
 * Mock surface:
 *   - `@/lib/supabase` (service-role `createServerClient`) — the .from(...)
 *     chainable for `consumers` reads/updates, plus auth.admin.
 *   - `@supabase/supabase-js` (throwaway anon + user-authed clients) —
 *     `createClient` returns two distinct shapes based on whether the caller
 *     passed an Authorization header in `global.headers`.
 *   - `@/lib/consumer-session` — returns a fake session for the tests.
 *   - `next/headers` — returns a basic Headers bag so rate-limit key building
 *     works.
 */

// ─── consumers-table in-memory store ───────────────────────────────────────
// Small enough we don't need the full postgrest-emulation fixture; a single
// row keyed by id is all we exercise.

interface ConsumerRow {
  id: string;
  name: string;
  phone: string;
  notification_prefs: Record<string, boolean>;
}

let consumerRow: ConsumerRow = {
  id: 'consumer-1',
  name: 'Ayesha',
  phone: '03001234567',
  notification_prefs: { booking_updates: true, promos: false },
};

// Track update patches to make assertions easy.
let lastConsumersUpdate: Record<string, unknown> | null = null;

// Service-role client (mocked `@/lib/supabase`).
let adminUpdateUserById = vi.fn().mockResolvedValue({ data: { user: { id: 'consumer-1' } }, error: null });

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: (table: string) => {
      if (table !== 'consumers') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { ...consumerRow }, error: null }),
          }),
        }),
        update: (patch: Record<string, unknown>) => {
          lastConsumersUpdate = patch;
          const chain = {
            eq: (_col: string, val: unknown) => {
              if (val === consumerRow.id) {
                consumerRow = { ...consumerRow, ...(patch as Partial<ConsumerRow>) };
              }
              // Terminal: return a promise so `await supabase.from().update().eq()` resolves.
              return Promise.resolve({ error: null });
            },
          };
          return chain;
        },
      };
    },
    auth: {
      admin: {
        updateUserById: (id: string, body: Record<string, unknown>) =>
          adminUpdateUserById(id, body),
      },
    },
  }),
}));

// Anonymous + user-authed clients (mocked `@supabase/supabase-js`).
let anonSignIn = vi.fn().mockResolvedValue({
  data: { user: { id: 'consumer-1' }, session: { access_token: 'user-access-token' } },
  error: null,
});
let anonSignOut = vi.fn().mockResolvedValue({ error: null });
let userAuthedUpdateUser = vi.fn().mockResolvedValue({
  data: { user: { id: 'consumer-1' } },
  error: null,
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url: string, _key: string, opts?: { global?: { headers?: Record<string, string> } }) => {
    const isUserAuthed = !!opts?.global?.headers?.Authorization;
    if (isUserAuthed) {
      return {
        auth: {
          updateUser: (body: Record<string, unknown>) => userAuthedUpdateUser(body),
        },
      };
    }
    return {
      auth: {
        signInWithPassword: (creds: { email: string; password: string }) => anonSignIn(creds),
        signOut: () => anonSignOut(),
      },
    };
  },
}));

// Consumer session mock.
let sessionMock: (() => Promise<unknown>) | null = () =>
  Promise.resolve({
    userId: 'consumer-1',
    name: 'Ayesha',
    email: 'ayesha@example.com',
    phone: '03001234567',
  });

vi.mock('@/lib/consumer-session', () => ({
  getConsumerSession: () => (sessionMock ? sessionMock() : Promise.resolve(null)),
}));

// headers() — rate-limiting needs an IP lookup; stub one.
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '127.0.0.1' }),
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
}));

// ─── Lifecycle ─────────────────────────────────────────────────────────────

beforeEach(async () => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  consumerRow = {
    id: 'consumer-1',
    name: 'Ayesha',
    phone: '03001234567',
    notification_prefs: { booking_updates: true, promos: false },
  };
  lastConsumersUpdate = null;

  sessionMock = () =>
    Promise.resolve({
      userId: 'consumer-1',
      name: 'Ayesha',
      email: 'ayesha@example.com',
      phone: '03001234567',
    });

  anonSignIn = vi.fn().mockResolvedValue({
    data: { user: { id: 'consumer-1' }, session: { access_token: 'user-access-token' } },
    error: null,
  });
  anonSignOut = vi.fn().mockResolvedValue({ error: null });
  userAuthedUpdateUser = vi.fn().mockResolvedValue({
    data: { user: { id: 'consumer-1' } },
    error: null,
  });
  adminUpdateUserById = vi.fn().mockResolvedValue({ data: { user: { id: 'consumer-1' } }, error: null });

  const { resetRateLimit } = await import('../src/lib/rate-limit');
  resetRateLimit('consumer-name:127.0.0.1:consumer-1');
  resetRateLimit('consumer-phone:127.0.0.1:consumer-1');
  resetRateLimit('consumer-email:127.0.0.1:consumer-1');
  resetRateLimit('consumer-password:127.0.0.1:consumer-1');
  resetRateLimit('consumer-notification-prefs:127.0.0.1:consumer-1');
});

// ─── updateConsumerName ────────────────────────────────────────────────────

describe('updateConsumerName', () => {
  it('rejects when not signed in', async () => {
    sessionMock = () => Promise.resolve(null);
    const { updateConsumerName } = await import('../src/app/actions/consumer-profile');
    const res = await updateConsumerName({ name: 'New Name' });
    expect(res.ok).toBe(false);
  });

  it('rejects names shorter than 2 chars', async () => {
    const { updateConsumerName } = await import('../src/app/actions/consumer-profile');
    const res = await updateConsumerName({ name: 'A' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/at least 2/i);
  });

  it('rejects names longer than 80 chars', async () => {
    const { updateConsumerName } = await import('../src/app/actions/consumer-profile');
    const res = await updateConsumerName({ name: 'x'.repeat(81) });
    expect(res.ok).toBe(false);
  });

  it('updates the consumers.name row on happy path', async () => {
    const { updateConsumerName } = await import('../src/app/actions/consumer-profile');
    const res = await updateConsumerName({ name: 'Ayesha Khan' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.name).toBe('Ayesha Khan');
    expect(consumerRow.name).toBe('Ayesha Khan');
    expect(lastConsumersUpdate?.name).toBe('Ayesha Khan');
  });

  it('rate-limits after 10 successful updates within an hour', async () => {
    const { updateConsumerName } = await import('../src/app/actions/consumer-profile');
    for (let i = 0; i < 10; i++) {
      const r = await updateConsumerName({ name: `Name Number ${i + 1}` });
      expect(r.ok).toBe(true);
    }
    const limited = await updateConsumerName({ name: 'Name Number 11' });
    expect(limited.ok).toBe(false);
    if (!limited.ok) expect(limited.error).toMatch(/too many/i);
  });
});

// ─── updateConsumerPhone ───────────────────────────────────────────────────

describe('updateConsumerPhone', () => {
  it('rejects landlines', async () => {
    const { updateConsumerPhone } = await import('../src/app/actions/consumer-profile');
    const res = await updateConsumerPhone({ phone: '0211234567' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Pakistani/);
  });

  it('accepts both 03XX and +92 formats', async () => {
    const { updateConsumerPhone } = await import('../src/app/actions/consumer-profile');
    const res1 = await updateConsumerPhone({ phone: '03007654321' });
    expect(res1.ok).toBe(true);
    const res2 = await updateConsumerPhone({ phone: '+923007654322' });
    expect(res2.ok).toBe(true);
  });

  it('writes the new phone to the consumers row', async () => {
    const { updateConsumerPhone } = await import('../src/app/actions/consumer-profile');
    await updateConsumerPhone({ phone: '03001112222' });
    expect(consumerRow.phone).toBe('03001112222');
  });
});

// ─── changeConsumerEmail ───────────────────────────────────────────────────

describe('changeConsumerEmail', () => {
  it('rejects missing current password', async () => {
    const { changeConsumerEmail } = await import('../src/app/actions/consumer-profile');
    const res = await changeConsumerEmail({ newEmail: 'new@example.com', currentPassword: '' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/current password/i);
    expect(anonSignIn).not.toHaveBeenCalled();
  });

  it('rejects when current password is wrong', async () => {
    anonSignIn = vi.fn().mockResolvedValue({ data: null, error: { message: 'Invalid credentials' } });
    const { changeConsumerEmail } = await import('../src/app/actions/consumer-profile');
    const res = await changeConsumerEmail({
      newEmail: 'new@example.com',
      currentPassword: 'wrong',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/incorrect/i);
    // MUST NOT call updateUser if re-auth failed.
    expect(userAuthedUpdateUser).not.toHaveBeenCalled();
    expect(adminUpdateUserById).not.toHaveBeenCalled();
  });

  it('rejects invalid new-email format', async () => {
    const { changeConsumerEmail } = await import('../src/app/actions/consumer-profile');
    const res = await changeConsumerEmail({
      newEmail: 'not-an-email',
      currentPassword: 'password123',
    });
    expect(res.ok).toBe(false);
    expect(anonSignIn).not.toHaveBeenCalled();
  });

  it('rejects when new email matches current', async () => {
    const { changeConsumerEmail } = await import('../src/app/actions/consumer-profile');
    const res = await changeConsumerEmail({
      newEmail: 'AYESHA@example.com',
      currentPassword: 'password123',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/same/i);
  });

  it('on success, invokes the USER-AUTHED updateUser (not the admin bypass) and returns a pending message', async () => {
    const { changeConsumerEmail } = await import('../src/app/actions/consumer-profile');
    const res = await changeConsumerEmail({
      newEmail: 'new@example.com',
      currentPassword: 'right-password',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.pendingEmail).toBe('new@example.com');
    expect(res.data.message).toMatch(/check your new inbox/i);
    // Authoritative: user-authed updateUser was called with the new email.
    expect(userAuthedUpdateUser).toHaveBeenCalledWith({ email: 'new@example.com' });
    // Critical: admin bypass was NOT used.
    expect(adminUpdateUserById).not.toHaveBeenCalled();
  });

  it('surfaces Supabase updateUser errors (e.g. email already in use)', async () => {
    userAuthedUpdateUser = vi.fn().mockResolvedValue({ data: null, error: { message: 'Email already registered' } });
    const { changeConsumerEmail } = await import('../src/app/actions/consumer-profile');
    const res = await changeConsumerEmail({
      newEmail: 'taken@example.com',
      currentPassword: 'right-password',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/already registered/i);
  });
});

// ─── changeConsumerPassword ────────────────────────────────────────────────

describe('changeConsumerPassword', () => {
  it('rejects empty current password', async () => {
    const { changeConsumerPassword } = await import('../src/app/actions/consumer-profile');
    const res = await changeConsumerPassword({ currentPassword: '', newPassword: 'longenoughpass' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/current password/i);
  });

  it('rejects new passwords shorter than 10 chars (PasswordSchema)', async () => {
    const { changeConsumerPassword } = await import('../src/app/actions/consumer-profile');
    const res = await changeConsumerPassword({
      currentPassword: 'something',
      newPassword: 'short',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/10 characters/i);
    expect(anonSignIn).not.toHaveBeenCalled();
  });

  it('rejects when new password equals current', async () => {
    const { changeConsumerPassword } = await import('../src/app/actions/consumer-profile');
    const res = await changeConsumerPassword({
      currentPassword: 'samepass123!',
      newPassword: 'samepass123!',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/differ/i);
  });

  it('rejects when current password is wrong', async () => {
    anonSignIn = vi.fn().mockResolvedValue({ data: null, error: { message: 'Invalid credentials' } });
    const { changeConsumerPassword } = await import('../src/app/actions/consumer-profile');
    const res = await changeConsumerPassword({
      currentPassword: 'wrong',
      newPassword: 'brand-new-password',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/incorrect/i);
    expect(adminUpdateUserById).not.toHaveBeenCalled();
  });

  it('updates via admin.updateUserById on happy path', async () => {
    const { changeConsumerPassword } = await import('../src/app/actions/consumer-profile');
    const res = await changeConsumerPassword({
      currentPassword: 'old-password',
      newPassword: 'brand-new-password',
    });
    expect(res.ok).toBe(true);
    expect(adminUpdateUserById).toHaveBeenCalledWith('consumer-1', { password: 'brand-new-password' });
  });
});

// ─── updateConsumerNotificationPrefs ───────────────────────────────────────

describe('updateConsumerNotificationPrefs', () => {
  it('rejects when not signed in', async () => {
    sessionMock = () => Promise.resolve(null);
    const { updateConsumerNotificationPrefs } = await import('../src/app/actions/consumer-profile');
    const res = await updateConsumerNotificationPrefs({ prefs: { promos: true } });
    expect(res.ok).toBe(false);
  });

  it('rejects empty prefs objects', async () => {
    const { updateConsumerNotificationPrefs } = await import('../src/app/actions/consumer-profile');
    const res = await updateConsumerNotificationPrefs({ prefs: {} });
    expect(res.ok).toBe(false);
  });

  it('rejects invalid key formats (spaces, punctuation)', async () => {
    const { updateConsumerNotificationPrefs } = await import('../src/app/actions/consumer-profile');
    const res = await updateConsumerNotificationPrefs({
      prefs: { 'bad key!': true },
    });
    expect(res.ok).toBe(false);
  });

  it('merges with existing prefs — does NOT wipe unrelated keys', async () => {
    // Seed: booking_updates:true, promos:false (from beforeEach default), plus an extra key.
    consumerRow = {
      ...consumerRow,
      notification_prefs: { booking_updates: true, promos: false, review_reminders: true },
    };
    const { updateConsumerNotificationPrefs } = await import('../src/app/actions/consumer-profile');
    const res = await updateConsumerNotificationPrefs({
      prefs: { promos: true },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // booking_updates and review_reminders must survive; promos must flip.
    expect(res.data.prefs).toEqual({
      booking_updates: true,
      promos: true,
      review_reminders: true,
    });
    // And the DB row reflects the merged blob.
    expect(consumerRow.notification_prefs).toEqual({
      booking_updates: true,
      promos: true,
      review_reminders: true,
    });
  });

  it('adds new keys the row has never seen before', async () => {
    const { updateConsumerNotificationPrefs } = await import('../src/app/actions/consumer-profile');
    const res = await updateConsumerNotificationPrefs({
      prefs: { review_reminders: true },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.prefs.review_reminders).toBe(true);
    expect(res.data.prefs.booking_updates).toBe(true); // untouched default from before
    expect(res.data.prefs.promos).toBe(false); // untouched default from before
  });
});

// ─── getConsumerProfile ────────────────────────────────────────────────────

describe('getConsumerProfile', () => {
  it('returns the current row', async () => {
    const { getConsumerProfile } = await import('../src/app/actions/consumer-profile');
    const res = await getConsumerProfile();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.email).toBe('ayesha@example.com');
    expect(res.data.name).toBe('Ayesha');
    expect(res.data.phone).toBe('03001234567');
    expect(res.data.notificationPrefs).toEqual({
      booking_updates: true,
      promos: false,
    });
  });

  it('fails without a session', async () => {
    sessionMock = () => Promise.resolve(null);
    const { getConsumerProfile } = await import('../src/app/actions/consumer-profile');
    const res = await getConsumerProfile();
    expect(res.ok).toBe(false);
  });
});
