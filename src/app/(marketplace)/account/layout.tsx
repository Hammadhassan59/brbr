/**
 * Consumer account shell — wraps every `/account/*` page with a centered
 * container and the desktop `<AccountNav />` side-rail.
 *
 * Auth gate: the nested routes all require a consumer session; we enforce the
 * redirect here so the individual pages don't each duplicate the check. The
 * `next=` param captures the original path so verification / post-login
 * flows can bounce back to exactly where the user tapped.
 *
 * Mobile shape: the side-rail is hidden (`md:` up only). Mobile tab navigation
 * lives in the marketplace layout's `<MobileBottomNav>`; adding a second
 * nav strip on mobile would only push content below the fold.
 *
 * Layout choice: `max-w-3xl` matches the widest content sections in the
 * existing detail page and the Foodpanda-style "not too wide" account-area
 * feel. Each child page is free to constrain further (e.g. the list page
 * uses the same width for its cards).
 */

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

import { getConsumerSession } from '@/lib/consumer-session';

import { AccountNav } from './components/account-nav';

// Every /account/* page is session-gated and fetches per-user data, so none
// of them can be statically prerendered. Marking dynamic at the layout level
// avoids Next's "Failed to collect page data" error when redirect() fires
// during the static-collection phase.
export const dynamic = 'force-dynamic';

interface LayoutProps {
  children: React.ReactNode;
}

/**
 * Best-effort "what's the current path?" read — Next doesn't hand server
 * layouts a pathname directly, but `x-invoke-path` (or `next-url`) is
 * populated on each request. We use it only for the `?next=` param so a
 * missing header falls back to a safe default of `/account/bookings`.
 */
async function currentPath(): Promise<string> {
  try {
    const h = await headers();
    const nextUrl = h.get('next-url') ?? h.get('x-invoke-path') ?? h.get('x-pathname');
    if (nextUrl && nextUrl.startsWith('/')) return nextUrl;
  } catch {
    // ignore — fall through
  }
  return '/account/bookings';
}

export default async function AccountLayout({ children }: LayoutProps) {
  const session = await getConsumerSession();
  if (!session) {
    const next = await currentPath();
    redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-6 pb-24 md:py-10">
      <div className="md:grid md:grid-cols-[200px_1fr] md:gap-8">
        <AccountNav />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
