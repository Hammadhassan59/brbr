'use client';

/**
 * Mobile-only bottom navigation bar for the consumer marketplace.
 *
 * Three tabs: Home (`/`), Barbers (`/barbers`), Account. The Account tab
 * routes to `/account/bookings` when logged in and `/sign-in` otherwise —
 * determined by the `isAuthenticated` prop the server-rendered layout passes
 * in, so we avoid duplicating session reads on every client navigation.
 *
 * Hidden on `md:` and larger; desktop users get the top-bar account menu.
 * Respects iOS safe-area-inset-bottom so the nav doesn't sit under the
 * home indicator on iPhone notch devices — `paddingBottom` on the inner
 * flex row adds the inset, and the fixed container itself is flush to
 * `bottom: 0`. Same pattern as the dashboard's own bottom nav.
 *
 * Spec: `docs/superpowers/plans/2026-04-18-marketplace-phase-0-1.md`
 *   → "Mobile-first rules (consumer shell)" — tap targets ≥ 44px, no
 *     sidebar on mobile, bottom-sheet-ish nav for account.
 */

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Scissors, User } from 'lucide-react';

interface MobileBottomNavProps {
  /**
   * Whether the viewing consumer has an active Supabase session. Determines
   * where the "Account" tab points — to the bookings list (logged in) or
   * the sign-in page (anonymous).
   */
  isAuthenticated: boolean;
}

interface TabDef {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  /**
   * Prefix matcher for active-state. `/` is special-cased to strict-equals
   * so the Home tab doesn't light up on every single consumer page.
   */
  match: (pathname: string) => boolean;
}

export function MobileBottomNav({ isAuthenticated }: MobileBottomNavProps) {
  const pathname = usePathname() ?? '/';

  const tabs: TabDef[] = [
    {
      href: '/',
      label: 'Home',
      Icon: Home,
      match: (p) => p === '/',
    },
    {
      href: '/barbers',
      label: 'Barbers',
      Icon: Scissors,
      match: (p) => p === '/barbers' || p.startsWith('/barbers/') || p.startsWith('/barber/'),
    },
    {
      href: isAuthenticated ? '/account/bookings' : '/sign-in',
      label: 'Account',
      Icon: User,
      match: (p) => p.startsWith('/account') || p === '/sign-in' || p === '/sign-up',
    },
  ];

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white shadow-[0_-1px_0_rgba(0,0,0,0.03)] md:hidden"
      style={{
        // iOS notch / home-indicator: push the touch row up above the
        // safe-area inset while keeping the bar's background flush to the
        // viewport bottom. Matches the dashboard layout's approach.
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      data-slot="marketplace-mobile-bottom-nav"
    >
      <ul className="flex h-16 items-stretch">
        {tabs.map((tab) => {
          const active = tab.match(pathname);
          const { Icon } = tab;
          return (
            <li key={tab.label} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`flex h-full min-h-[44px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                  active ? 'text-gold' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                    active ? 'bg-gold/10' : ''
                  }`}
                >
                  <Icon className="h-5 w-5" aria-hidden={true} />
                </span>
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
