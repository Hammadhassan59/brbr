import { NextRequest, NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const hasSession = request.cookies.get('icut-session')?.value === '1';
  const role = request.cookies.get('icut-role')?.value;
  const sub = request.cookies.get('icut-sub')?.value;

  // All protected routes require session
  if (
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/agent') ||
    pathname.startsWith('/setup') ||
    pathname.startsWith('/paywall')
  ) {
    if (!hasSession) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Admin routes require super_admin
  if (pathname.startsWith('/admin')) {
    if (role !== 'super_admin') {
      const target = role === 'sales_agent' ? '/agent' : '/dashboard';
      return NextResponse.redirect(new URL(target, request.url));
    }
  }

  // Agent routes require sales_agent
  if (pathname.startsWith('/agent')) {
    if (role !== 'sales_agent') {
      const target = role === 'super_admin' ? '/admin' : '/dashboard';
      return NextResponse.redirect(new URL(target, request.url));
    }
  }

  // Salon routes redirect sales agents to /agent (they have no salon)
  if (pathname.startsWith('/dashboard') && role === 'sales_agent') {
    return NextResponse.redirect(new URL('/agent', request.url));
  }

  // Hard paywall: owners/partners with non-active subscriptions can only see
  // /paywall, never /dashboard. The cookie is mirrored from salons.subscription_status
  // by signSession + getDashboardBootstrap + checkSubscriptionStatus.
  if (pathname.startsWith('/dashboard') && (role === 'owner' || role === 'partner')) {
    if (sub && sub !== 'active') {
      return NextResponse.redirect(new URL('/paywall', request.url));
    }
  }

  // Inverse gate: an active owner/partner who lands on /paywall should be
  // bounced to the dashboard (e.g. after admin approval, on the next nav).
  if (pathname.startsWith('/paywall')) {
    if (role !== 'owner' && role !== 'partner') {
      const target = role === 'super_admin' ? '/admin' : role === 'sales_agent' ? '/agent' : '/dashboard';
      return NextResponse.redirect(new URL(target, request.url));
    }
    if (sub === 'active') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/agent/:path*', '/setup', '/paywall/:path*'],
};
