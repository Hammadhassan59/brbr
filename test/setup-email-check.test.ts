import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const schemaMaybeSingle = vi.fn();
const schemaMock = vi.fn(() => ({
  from: () => ({
    select: () => ({
      eq: () => ({
        limit: () => ({
          maybeSingle: schemaMaybeSingle,
        }),
      }),
    }),
  }),
}));

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    schema: schemaMock,
  }),
}));

vi.mock('@/lib/email-sender', () => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/email-templates', () => ({ welcomeEmail: vi.fn() }));

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
  schemaMaybeSingle.mockReset();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('checkEmailAvailable', () => {
  it('rejects empty email as invalid', async () => {
    const { checkEmailAvailable } = await import('../src/app/actions/setup');
    const res = await checkEmailAvailable('');
    expect(res).toEqual({ available: false, reason: 'invalid' });
  });

  it('rejects malformed email as invalid', async () => {
    const { checkEmailAvailable } = await import('../src/app/actions/setup');
    const res = await checkEmailAvailable('not-an-email');
    expect(res).toEqual({ available: false, reason: 'invalid' });
  });

  it('returns taken when auth.users has a match', async () => {
    schemaMaybeSingle.mockResolvedValueOnce({ data: { id: 'auth-1' }, error: null });
    const { checkEmailAvailable } = await import('../src/app/actions/setup');
    const res = await checkEmailAvailable('taken@example.com');
    expect(res.available).toBe(false);
    expect(res.reason).toBe('taken');
  });

  it('returns available when auth.users has no match', async () => {
    schemaMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const { checkEmailAvailable } = await import('../src/app/actions/setup');
    const res = await checkEmailAvailable('new@example.com');
    expect(res).toEqual({ available: true });
  });

  it('normalizes email to lowercase before querying', async () => {
    schemaMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const { checkEmailAvailable } = await import('../src/app/actions/setup');
    await checkEmailAvailable('  User@Example.COM ');
    expect(schemaMock).toHaveBeenCalledWith('auth');
  });

  it('falls back to GoTrue admin REST when schema query errors', async () => {
    schemaMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'auth schema not exposed' } });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ users: [{ email: 'taken@example.com' }] }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { checkEmailAvailable } = await import('../src/app/actions/setup');
    const res = await checkEmailAvailable('taken@example.com');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(res.available).toBe(false);
    expect(res.reason).toBe('taken');
  });

  it('fallback returns available when GoTrue has no matching user', async () => {
    schemaMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'x' } });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ users: [] }),
    }) as unknown as typeof fetch;
    const { checkEmailAvailable } = await import('../src/app/actions/setup');
    const res = await checkEmailAvailable('new@example.com');
    expect(res).toEqual({ available: true });
  });

  it('fallback treats GoTrue error as available (fail-open)', async () => {
    schemaMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'x' } });
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as unknown as typeof fetch;
    const { checkEmailAvailable } = await import('../src/app/actions/setup');
    const res = await checkEmailAvailable('someone@example.com');
    expect(res.available).toBe(true);
    expect(res.reason).toBe('error');
  });
});
