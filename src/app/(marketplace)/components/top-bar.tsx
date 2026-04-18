/**
 * Consumer-marketplace top bar. Server component — resolves
 * `getConsumerSession()` itself so the SSR HTML already contains the right
 * auth-state markup (no flash of "Sign in" on a logged-in user) and so the
 * component is directly testable by mocking the session helper.
 *
 * The marketplace layout also reads the session separately to pass
 * `isAuthenticated` into the mobile bottom nav. That's one extra Supabase
 * `getUser` per request — cheap (signature check on a cookie) and the
 * service-role `.from('consumers')` lookup returns the same row the cache
 * warmed up a millisecond earlier. Keeping the two surfaces independent
 * simplifies unit testing and future refactors.
 *
 * Layout: logo on the left, account affordance on the right. Spec in the
 * Phase 1 plan at
 * `docs/superpowers/plans/2026-04-18-marketplace-phase-0-1.md`
 * ("Mobile-first rules (consumer shell)" + consumer-dashboard section list).
 *
 * We deliberately do NOT reuse the owner dashboard's `/dashboard/layout.tsx`
 * top bar — that thing has branch switchers, notifications, agent-demo
 * exits, and subscription banners that make no sense for a browsing consumer.
 * The consumer surface is lighter by design.
 */

import Link from 'next/link';

import { getConsumerSession } from '@/lib/consumer-session';

import { AccountMenu } from './account-menu';
import { BrandLogo } from './brand-logo';

export async function TopBar() {
  const session = await getConsumerSession();

  return (
    <header
      className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70"
      data-slot="marketplace-top-bar"
    >
      {/* Match the mobile-first max-width rules in the plan — 480px on
          phones feels cramped for a directory header, so we let this bar
          stretch full-width on mobile and cap at 960px on desktop. */}
      <div className="mx-auto flex h-14 w-full max-w-screen-md items-center justify-between px-4 md:h-16 md:max-w-screen-lg md:px-6">
        <Link
          href="/"
          className="inline-flex items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="iCut home"
        >
          <BrandLogo />
        </Link>

        <nav className="flex items-center gap-1 md:gap-2">
          {session ? (
            <AccountMenu name={session.name || session.email} />
          ) : (
            <Link
              href="/sign-in"
              className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-10 md:px-4"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
