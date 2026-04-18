import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for src/app/actions/consumer-auth.ts — the marketplace-side auth
 * server actions (registerConsumer, loginConsumer, logoutConsumer,
 * resendVerificationEmail).
 *
 * Covers validation, happy paths, and error surfaces. We mock both the
 * cookie-bound SSR client (auth-helpers-nextjs) and the service-role client
 * (@/lib/supabase) separately so we can assert against either independently.
 */

// ── Mocks ──────────────────────────────────────────────────────────────────

// SSR client (cookie-bound) methods. Each test can override.
let signUpMock = vi.fn();
let signInMock = vi.fn();
let signOutMock = vi.fn();
let resendMock = vi.fn();

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerClient: () => ({
    auth: {
      signUp: (args: Record<string, unknown>) => signUpMock(args),
      signInWithPassword: (args: Record<string, unknown>) => signInMock(args),
      signOut: () => signOutMock(),
      resend: (args: Record<string, unknown>) => resendMock(args),
    },
  }),
}));

// Service-role client — used for the consumers-row insert.
let consumersUpsertMock = vi.fn();
vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: (table: string) => {
      if (table === 'consumers') {
        return {
          upsert: (row: Record<string, unknown>, opts?: Record<string, unknown>) =>
            consumersUpsertMock(row, opts),
        };
      }
      return { upsert: vi.fn().mockResolvedValue({ error: null }) };
    },
  }),
}));

// Request context: headers() returns the IP + host so resolveOrigin() and
// rate-limiter keying both work. cookies() is only touched indirectly via
// the mocked SSR client, so a bare stub is enough.
vi.mock('next/headers', () => ({
  headers: async () =>
    new Headers({
      'x-forwarded-for': '127.0.0.1',
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'icut.pk',
    }),
  cookies: async () => ({
    getAll: () => [],
    set: () => undefined,
  }),
}));

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(async () => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

  signUpMock = vi.fn().mockResolvedValue({
    data: { user: { id: 'auth-consumer-1' }, session: null },
    error: null,
  });
  signInMock = vi.fn().mockResolvedValue({
    data: { user: { id: 'auth-consumer-1' }, session: { access_token: 'tok' } },
    error: null,
  });
  signOutMock = vi.fn().mockResolvedValue({ error: null });
  resendMock = vi.fn().mockResolvedValue({ error: null });
  consumersUpsertMock = vi.fn().mockResolvedValue({ error: null });

  // Reset the in-memory rate-limit buckets so tests don't bleed into each
  // other. The bucket key format matches what the action uses.
  const { resetRateLimit } = await import('../src/lib/rate-limit');
  resetRateLimit('signup:127.0.0.1');
  resetRateLimit('consumer-login:127.0.0.1:new@example.com');
  resetRateLimit('consumer-login:127.0.0.1:user@example.com');
  resetRateLimit('verification-resend:127.0.0.1:user@example.com');
});

// ── registerConsumer ──────────────────────────────────────────────────────

describe('registerConsumer', () => {
  it('validates password length (must be >= 10)', async () => {
    const { registerConsumer } = await import('../src/app/actions/consumer-auth');
    const res = await registerConsumer({
      name: 'Ayesha Khan',
      email: 'new@example.com',
      password: 'short',
      phone: '03001234567',
    });
    expect(res.error).toMatch(/10 characters/);
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it('validates phone format (rejects landlines)', async () => {
    const { registerConsumer } = await import('../src/app/actions/consumer-auth');
    const res = await registerConsumer({
      name: 'Ayesha Khan',
      email: 'new@example.com',
      password: 'strongpass12',
      phone: '0211234567', // landline-ish: wrong prefix
    });
    expect(res.error).toMatch(/Pakistani mobile/);
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it('validates phone format (accepts +92 international form)', async () => {
    const { registerConsumer } = await import('../src/app/actions/consumer-auth');
    const res = await registerConsumer({
      name: 'Ayesha Khan',
      email: 'new@example.com',
      password: 'strongpass12',
      phone: '+923001234567',
    });
    expect(res.error).toBeNull();
    expect(signUpMock).toHaveBeenCalledOnce();
  });

  it('rejects a name shorter than 2 chars', async () => {
    const { registerConsumer } = await import('../src/app/actions/consumer-auth');
    const res = await registerConsumer({
      name: 'A',
      email: 'new@example.com',
      password: 'strongpass12',
      phone: '03001234567',
    });
    expect(res.error).toMatch(/at least 2/);
  });

  it('calls signUp with emailRedirectTo derived from request host + next param', async () => {
    const { registerConsumer } = await import('../src/app/actions/consumer-auth');
    await registerConsumer({
      name: 'Ayesha Khan',
      email: 'new@example.com',
      password: 'strongpass12',
      phone: '03001234567',
      next: '/book/some-salon',
    });
    expect(signUpMock).toHaveBeenCalledOnce();
    const args = signUpMock.mock.calls[0][0] as {
      email: string;
      password: string;
      options: { emailRedirectTo: string; data: Record<string, string> };
    };
    expect(args.email).toBe('new@example.com');
    expect(args.options.emailRedirectTo).toBe(
      'https://icut.pk/verify-email?next=%2Fbook%2Fsome-salon',
    );
    // Name+phone also land in user_metadata as a reconstruction fallback.
    expect(args.options.data).toEqual({ name: 'Ayesha Khan', phone: '03001234567' });
  });

  it('inserts companion consumers row after signUp', async () => {
    const { registerConsumer } = await import('../src/app/actions/consumer-auth');
    const res = await registerConsumer({
      name: 'Ayesha Khan',
      email: 'new@example.com',
      password: 'strongpass12',
      phone: '03001234567',
    });
    expect(res.error).toBeNull();
    expect(consumersUpsertMock).toHaveBeenCalledOnce();
    const [row, opts] = consumersUpsertMock.mock.calls[0];
    expect(row).toEqual({ id: 'auth-consumer-1', name: 'Ayesha Khan', phone: '03001234567' });
    expect(opts).toEqual({ onConflict: 'id' });
  });

  it('reports needsVerification=true when Supabase returns no session', async () => {
    const { registerConsumer } = await import('../src/app/actions/consumer-auth');
    const res = await registerConsumer({
      name: 'Ayesha Khan',
      email: 'new@example.com',
      password: 'strongpass12',
      phone: '03001234567',
    });
    expect(res.data?.needsVerification).toBe(true);
    expect(res.data?.userId).toBe('auth-consumer-1');
  });

  it('surfaces Supabase signUp errors (e.g. already registered)', async () => {
    signUpMock = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'User already registered' },
    });
    const { registerConsumer } = await import('../src/app/actions/consumer-auth');
    const res = await registerConsumer({
      name: 'Ayesha Khan',
      email: 'dup@example.com',
      password: 'strongpass12',
      phone: '03001234567',
    });
    expect(res.error).toMatch(/already registered/i);
    expect(consumersUpsertMock).not.toHaveBeenCalled();
  });

  it('surfaces consumers-row insert errors', async () => {
    consumersUpsertMock = vi.fn().mockResolvedValue({ error: { message: 'constraint violation' } });
    const { registerConsumer } = await import('../src/app/actions/consumer-auth');
    const res = await registerConsumer({
      name: 'Ayesha Khan',
      email: 'new@example.com',
      password: 'strongpass12',
      phone: '03001234567',
    });
    expect(res.error).toMatch(/constraint/i);
  });

  it('rate-limits by IP after BUCKETS.SIGNUP.max attempts', async () => {
    const { registerConsumer } = await import('../src/app/actions/consumer-auth');
    // Three successful attempts then a fourth that should be limited.
    for (let i = 0; i < 3; i++) {
      await registerConsumer({
        name: 'Ayesha Khan',
        email: `n${i}@example.com`,
        password: 'strongpass12',
        phone: '03001234567',
      });
    }
    const res = await registerConsumer({
      name: 'Ayesha Khan',
      email: 'n4@example.com',
      password: 'strongpass12',
      phone: '03001234567',
    });
    expect(res.error).toMatch(/too many/i);
  });
});

// ── loginConsumer ─────────────────────────────────────────────────────────

describe('loginConsumer', () => {
  it('rejects invalid email format before hitting Supabase', async () => {
    const { loginConsumer } = await import('../src/app/actions/consumer-auth');
    const res = await loginConsumer({ email: 'not-an-email', password: 'something' });
    expect(res.error).toMatch(/email/i);
    expect(signInMock).not.toHaveBeenCalled();
  });

  it('rejects empty password', async () => {
    const { loginConsumer } = await import('../src/app/actions/consumer-auth');
    const res = await loginConsumer({ email: 'user@example.com', password: '' });
    expect(res.error).toMatch(/password/i);
    expect(signInMock).not.toHaveBeenCalled();
  });

  it('returns userId on successful login', async () => {
    const { loginConsumer } = await import('../src/app/actions/consumer-auth');
    const res = await loginConsumer({ email: 'user@example.com', password: 'rightpass' });
    expect(res.error).toBeNull();
    expect(res.data?.userId).toBe('auth-consumer-1');
    expect(signInMock).toHaveBeenCalledWith({ email: 'user@example.com', password: 'rightpass' });
  });

  it('surfaces Supabase invalid-credentials errors', async () => {
    signInMock = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Invalid login credentials' },
    });
    const { loginConsumer } = await import('../src/app/actions/consumer-auth');
    const res = await loginConsumer({ email: 'user@example.com', password: 'wrong' });
    expect(res.error).toMatch(/invalid/i);
  });
});

// ── logoutConsumer ────────────────────────────────────────────────────────

describe('logoutConsumer', () => {
  it('calls Supabase signOut and returns success', async () => {
    const { logoutConsumer } = await import('../src/app/actions/consumer-auth');
    const res = await logoutConsumer();
    expect(res.error).toBeNull();
    expect(res.data?.success).toBe(true);
    expect(signOutMock).toHaveBeenCalledOnce();
  });
});

// ── resendVerificationEmail ───────────────────────────────────────────────

describe('resendVerificationEmail', () => {
  it('rejects invalid email', async () => {
    const { resendVerificationEmail } = await import('../src/app/actions/consumer-auth');
    const res = await resendVerificationEmail({ email: 'bad' });
    expect(res.error).toMatch(/email/i);
    expect(resendMock).not.toHaveBeenCalled();
  });

  it('calls Supabase resend with the signup type and correct redirect', async () => {
    const { resendVerificationEmail } = await import('../src/app/actions/consumer-auth');
    const res = await resendVerificationEmail({ email: 'user@example.com', next: '/book/s' });
    expect(res.error).toBeNull();
    const args = resendMock.mock.calls[0][0] as {
      type: string;
      email: string;
      options: { emailRedirectTo: string };
    };
    expect(args.type).toBe('signup');
    expect(args.email).toBe('user@example.com');
    expect(args.options.emailRedirectTo).toBe(
      'https://icut.pk/verify-email?next=%2Fbook%2Fs',
    );
  });

  it('surfaces Supabase resend errors', async () => {
    resendMock = vi.fn().mockResolvedValue({ error: { message: 'rate limited by supabase' } });
    const { resendVerificationEmail } = await import('../src/app/actions/consumer-auth');
    const res = await resendVerificationEmail({ email: 'user@example.com' });
    expect(res.error).toMatch(/rate limited/);
  });
});
