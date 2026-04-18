/**
 * Tests for the consumer `/account/*` layout auth gate.
 *
 * The layout is a server component that:
 *   1. Reads the consumer session via `getConsumerSession`.
 *   2. Redirects to `/sign-in?next=<currentPath>` when the session is null.
 *
 * We mock the session helper + Next's `redirect`/`headers` functions so we can
 * assert the redirect target directly without rendering the component tree.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════
// Mocks
// ═══════════════════════════════════════════════════════════════════════════

let sessionMock: (() => Promise<unknown>) | null = null;
vi.mock('@/lib/consumer-session', () => ({
  getConsumerSession: () => (sessionMock ? sessionMock() : Promise.resolve(null)),
}));

const redirectCalls: string[] = [];
class RedirectError extends Error {}
vi.mock('next/navigation', () => ({
  redirect: (target: string) => {
    redirectCalls.push(target);
    // Next's real `redirect` throws a special control-flow error so the
    // server tree unwinds. We mirror that so the async layout halts.
    throw new RedirectError(`REDIRECT:${target}`);
  },
}));

let headerStore: Record<string, string> = {};
vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (k: string) => headerStore[k] ?? null,
  }),
}));

// AccountNav is a client component that imports `usePathname`. For the auth
// test we never render the tree, but when the layout invokes React it would
// still pull in the module. Stub it out to a no-op.
vi.mock('@/app/(marketplace)/account/components/account-nav', () => ({
  AccountNav: () => null,
}));

// ═══════════════════════════════════════════════════════════════════════════
// Lifecycle
// ═══════════════════════════════════════════════════════════════════════════

beforeEach(() => {
  redirectCalls.length = 0;
  headerStore = {};
  sessionMock = () => Promise.resolve(null);
});

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('AccountLayout (auth gate)', () => {
  it('redirects to /sign-in?next=... when session is null', async () => {
    headerStore['next-url'] = '/account/bookings';
    const mod = await import('@/app/(marketplace)/account/layout');
    await expect(
      mod.default({ children: null as unknown as React.ReactNode }),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(redirectCalls).toHaveLength(1);
    expect(redirectCalls[0]).toBe(
      `/sign-in?next=${encodeURIComponent('/account/bookings')}`,
    );
  });

  it('redirects with a default next= when no path header is present', async () => {
    // headerStore empty — every header read returns null.
    const mod = await import('@/app/(marketplace)/account/layout');
    await expect(
      mod.default({ children: null as unknown as React.ReactNode }),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(redirectCalls[0]).toBe(
      `/sign-in?next=${encodeURIComponent('/account/bookings')}`,
    );
  });

  it('redirects with the nested path when session is null and path is known', async () => {
    headerStore['x-invoke-path'] = '/account/bookings/abc123';
    const mod = await import('@/app/(marketplace)/account/layout');
    await expect(
      mod.default({ children: null as unknown as React.ReactNode }),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(redirectCalls[0]).toBe(
      `/sign-in?next=${encodeURIComponent('/account/bookings/abc123')}`,
    );
  });

  it('does NOT redirect when a session is present', async () => {
    sessionMock = () =>
      Promise.resolve({
        userId: 'u-1',
        name: 'Test User',
        email: 't@example.com',
        phone: '03000000000',
      });
    const mod = await import('@/app/(marketplace)/account/layout');
    // The layout returns JSX; importing renders into a VDOM object without
    // mounting. We only assert the redirect didn't fire.
    const result = await mod.default({
      children: 'hello' as unknown as React.ReactNode,
    });
    expect(redirectCalls).toHaveLength(0);
    expect(result).toBeTruthy();
  });
});
