/**
 * TopBar is an async React Server Component. We exercise it by mocking
 * `getConsumerSession` (the only async dependency) and awaiting the
 * component function to get back a resolved JSX tree we can render under
 * happy-dom with @testing-library/react.
 *
 * Two cases, per the Phase-1 nav brief:
 *   1. No session → shows a "Sign in" link.
 *   2. Valid session → shows the account menu trigger with the user's name.
 *
 * We also mock next/link (so the Link component renders as a plain anchor
 * under happy-dom, same as `test/dashboard-components.test.tsx`) and
 * next/navigation (AccountMenu imports `useRouter` at module scope; even
 * though we never open the menu in these tests, the import path must
 * resolve).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// ─── Mocks ────────────────────────────────────────────────────────────

const getConsumerSessionMock = vi.fn();

vi.mock('@/lib/consumer-session', () => ({
  getConsumerSession: () => getConsumerSessionMock(),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/',
}));

// logoutConsumer is a server action — the test never triggers it, but
// AccountMenu imports it at module scope, so we stub the module so the
// import resolves without executing server-action machinery.
vi.mock('@/app/actions/consumer-auth', () => ({
  logoutConsumer: vi.fn(async () => ({ data: { success: true }, error: null })),
}));

// ─── Tests ────────────────────────────────────────────────────────────

describe('Marketplace TopBar', () => {
  beforeEach(() => {
    getConsumerSessionMock.mockReset();
  });

  it('renders a Sign in link when the consumer is logged out', async () => {
    getConsumerSessionMock.mockResolvedValue(null);

    const { TopBar } = await import('../src/app/(marketplace)/components/top-bar');
    const ui = await TopBar();
    render(ui);

    const link = screen.getByRole('link', { name: /sign in/i });
    expect(link).toBeDefined();
    expect(link.getAttribute('href')).toBe('/sign-in');

    // Account menu trigger should not be present when logged out.
    expect(screen.queryByLabelText('Account menu')).toBeNull();
  });

  it("renders the account menu with the consumer's first name when logged in", async () => {
    getConsumerSessionMock.mockResolvedValue({
      userId: 'user-1',
      name: 'Ayesha Khan',
      email: 'ayesha@example.com',
      phone: '0300-1234567',
    });

    const { TopBar } = await import('../src/app/(marketplace)/components/top-bar');
    const ui = await TopBar();
    render(ui);

    // Account menu trigger is present and labelled.
    const trigger = screen.getByLabelText('Account menu');
    expect(trigger).toBeDefined();

    // First-name label is rendered inside the trigger (hidden on mobile via
    // Tailwind, but present in the DOM).
    expect(trigger.textContent).toContain('Ayesha');

    // The logged-out Sign in link should NOT be present.
    expect(screen.queryByRole('link', { name: /^sign in$/i })).toBeNull();
  });
});
