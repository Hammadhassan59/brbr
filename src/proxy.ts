import { NextRequest, NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const hasSession = request.cookies.get('brbr-session')?.value === '1';

  // Protected routes require session
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/admin') || pathname.startsWith('/setup')) {
    if (!hasSession) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Admin routes require super_admin role
  if (pathname.startsWith('/admin')) {
    const role = request.cookies.get('brbr-role')?.value;
    if (role !== 'super_admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/setup'],
};
