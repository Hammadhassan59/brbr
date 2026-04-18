'use client';

/**
 * Consumer account menu — the logged-in state of the top-bar's right side.
 *
 * Rendered as a dropdown anchored to the user's first-name button. The menu
 * lists the full Foodpanda-style consumer dashboard links + sign-out, per
 * the Phase-1 plan at
 * `docs/superpowers/plans/2026-04-18-marketplace-phase-0-1.md` decision #8.
 *
 * We keep this a client component because:
 *   1. The Base UI dropdown primitives used elsewhere are client-only.
 *   2. Sign-out needs a client-side `router.push('/')` after the server
 *      action clears Supabase cookies so the rest of the page (header, any
 *      client-rendered islands) picks up the logged-out state without a hard
 *      refresh.
 *
 * TODO(phase-1, Week 3): The `/account/*` routes in this menu are not yet
 * implemented — they'll 404 until Week 3 lands the account shell.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, LogOut, User } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { logoutConsumer } from '@/app/actions/consumer-auth';

interface AccountMenuProps {
  /** Consumer's display name — passed from the server-rendered top bar. */
  name: string;
}

/**
 * The `/account/*` targets listed here don't exist yet (Week 3 work). The
 * links will 404 in the meantime — intentional per the Phase-1 plan so the
 * nav shape is visible and review-able now.
 */
const ACCOUNT_LINKS: { href: string; label: string }[] = [
  { href: '/account/bookings', label: 'My Bookings' },
  { href: '/account/addresses', label: 'My Addresses' },
  { href: '/account/favorites', label: 'Favorites' },
  { href: '/account/profile', label: 'Profile' },
  { href: '/account/notifications', label: 'Notifications' },
];

export function AccountMenu({ name }: AccountMenuProps) {
  const router = useRouter();
  const [signingOut, setSigningOut] = React.useState(false);

  // First name only, trimmed, with a fallback so we never render "Hi, ".
  const firstName = (name?.split(' ')[0] ?? '').trim() || 'there';

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logoutConsumer();
    } finally {
      // Hard-ish navigation via the app router so any server components
      // on `/` re-render against the now-cleared Supabase cookies. If the
      // component has already unmounted (Base UI closes the menu on item
      // click, `closeOnClick: true` by default), the state setter is a
      // no-op — React 18+ doesn't warn on unmounted setState any more.
      router.push('/');
      router.refresh();
      setSigningOut(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:gap-2 md:px-3"
        aria-label="Account menu"
      >
        <User className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="hidden max-w-[10ch] truncate md:inline">{firstName}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-56">
        <DropdownMenuLabel className="text-sm font-medium text-foreground">
          Hi, {firstName}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {ACCOUNT_LINKS.map((link) => (
            <DropdownMenuItem
              key={link.href}
              onClick={() => router.push(link.href)}
              className="cursor-pointer"
            >
              {link.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={handleSignOut}
          disabled={signingOut}
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {signingOut ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
