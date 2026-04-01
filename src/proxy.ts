import { NextRequest, NextResponse } from 'next/server';

const PROTECTED_PATHS = ['/dashboard', '/admin', '/setup'];
const PUBLIC_PATHS = ['/', '/login'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths and static assets
  if (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/icons') ||
    pathname.match(/\.(ico|svg|png|jpg|jpeg|gif|webp|woff2?|ttf|css|js|map)$/)
  ) {
    return NextResponse.next();
  }

  const isProtected = PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
  if (!isProtected) return NextResponse.next();

  // Demo mode: check for demo session cookie (set on demo/staff login)
  const demoSession = request.cookies.get('brbr-session');

  // Real Supabase mode: check for Supabase auth cookies
  const supabaseSession =
    request.cookies.get('sb-access-token') ||
    request.cookies.getAll().some((c) => c.name.includes('supabase') && c.name.includes('auth'));

  if (!demoSession && !supabaseSession) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin routes require super admin
  if (pathname.startsWith('/admin')) {
    const role = request.cookies.get('brbr-role')?.value;
    if (role !== 'super_admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
