import { NextRequest, NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const hasSession = request.cookies.get('icut-session')?.value === '1';
  const role = request.cookies.get('icut-role')?.value;

  // All protected routes require session
  if (
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/agent') ||
    pathname.startsWith('/setup')
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

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/agent/:path*', '/setup'],
};
