'use client';

/**
 * Desktop side-rail navigation for the consumer account area.
 *
 * Hidden on mobile (`hidden md:block`) — the mobile bottom nav owns
 * account navigation there. On desktop we render a sticky vertical list
 * of the 5 account sections called out in the Phase 1 plan (decision #8):
 *   - Bookings
 *   - Addresses
 *   - Favorites
 *   - Profile
 *   - Notifications
 *
 * Active-route detection uses `usePathname`. A link is active when the
 * pathname equals or starts with its `href` (so `/account/bookings/123`
 * still lights up the Bookings tab).
 */

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  CalendarDays,
  Heart,
  MapPin,
  UserCircle2,
} from 'lucide-react';

interface NavLink {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  match: (pathname: string) => boolean;
}

const LINKS: NavLink[] = [
  {
    href: '/account/bookings',
    label: 'Bookings',
    Icon: CalendarDays,
    match: (p) => p === '/account/bookings' || p.startsWith('/account/bookings/'),
  },
  {
    href: '/account/addresses',
    label: 'Addresses',
    Icon: MapPin,
    match: (p) => p.startsWith('/account/addresses'),
  },
  {
    href: '/account/favorites',
    label: 'Favorites',
    Icon: Heart,
    match: (p) => p.startsWith('/account/favorites'),
  },
  {
    href: '/account/profile',
    label: 'Profile',
    Icon: UserCircle2,
    match: (p) => p.startsWith('/account/profile'),
  },
  {
    href: '/account/notifications',
    label: 'Notifications',
    Icon: Bell,
    match: (p) => p.startsWith('/account/notifications'),
  },
];

export function AccountNav() {
  const pathname = usePathname() ?? '';

  return (
    <nav
      aria-label="Account sections"
      className="hidden md:block"
      data-slot="account-side-nav"
    >
      <ul className="sticky top-20 space-y-1">
        {LINKS.map((link) => {
          const active = link.match(pathname);
          const { Icon } = link;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] font-medium transition-colors ${
                  active
                    ? 'bg-[#1A1A1A] text-white'
                    : 'text-[#555] hover:bg-[#F5F5F5] hover:text-[#1A1A1A]'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{link.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
