import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { ADMIN_ROUTE_ACCESS, ADMIN_ROLES, matchAdminRoute } from '@/lib/admin-roles';

// Next 16 proxy runs in the Edge runtime. `jose` is edge-compatible; we can't
// import Node's `crypto` or anything from the Next server runtime here.
const JWT_ISS = 'icut.pk';
const JWT_AUD = 'icut-app';
const TOKEN_COOKIE = 'icut-token';

// Secret lookup is edge-safe (process.env on the edge is a plain object
// populated at build time for NEXT_PUBLIC_* and at request time for the rest).
// We re-encode on every request rather than cache: the proxy instance can
// live across requests and environment rotation shouldn't leave a stale key.
function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET missing in proxy runtime');
  return new TextEncoder().encode(secret);
}

interface VerifiedClaims {
  role?: string;
  salonId?: string;
  sub_active?: boolean;
}

async function verifyToken(token: string | undefined): Promise<VerifiedClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: JWT_ISS,
      audience: JWT_AUD,
    });
    return {
      role: typeof payload.role === 'string' ? payload.role : undefined,
      salonId: typeof payload.salonId === 'string' ? payload.salonId : undefined,
      sub_active: typeof payload.sub_active === 'boolean' ? payload.sub_active : undefined,
    };
  } catch {
    // Signature mismatch, expired, wrong iss/aud, or malformed — treat as
    // unauthenticated. Never leak details to the client.
    return null;
  }
}

function redirectToLogin(request: NextRequest, pathname: string) {
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('redirect', pathname);
  return NextResponse.redirect(loginUrl);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  const claims = await verifyToken(token);
  const hasSession = !!claims;
  const role = claims?.role;
  const subActive = claims?.sub_active === true;

  // All protected routes require a verified JWT. Fail-closed: if jose can't
  // verify (missing, expired, wrong iss/aud, forged), send to /login.
  if (
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/agent') ||
    pathname.startsWith('/setup') ||
    pathname.startsWith('/paywall')
  ) {
    if (!hasSession) return redirectToLogin(request, pathname);
  }

  // Admin routes require an admin role; per-route allow-list determines which
  // sub-role can see what. ADMIN_ROUTE_ACCESS is the single source of truth.
  if (pathname.startsWith('/admin')) {
    const isAdmin = role && (ADMIN_ROLES as readonly string[]).includes(role);
    if (!isAdmin) {
      const target = role === 'sales_agent' ? '/agent/leads' : '/dashboard';
      return NextResponse.redirect(new URL(target, request.url));
    }
    const matched = matchAdminRoute(pathname);
    const allowed = ADMIN_ROUTE_ACCESS[matched];
    if (allowed && !allowed.includes(role as typeof ADMIN_ROLES[number])) {
      // Bounce to /admin overview where the layout filters nav by role.
      return NextResponse.redirect(new URL('/admin', request.url));
    }
  }

  // Agent routes require sales_agent
  if (pathname.startsWith('/agent')) {
    if (role !== 'sales_agent') {
      const target = role === 'super_admin' ? '/admin' : '/dashboard';
      return NextResponse.redirect(new URL(target, request.url));
    }
  }

  // Salon routes redirect sales agents to /agent/leads (their primary surface)
  if (pathname.startsWith('/dashboard') && role === 'sales_agent') {
    return NextResponse.redirect(new URL('/agent/leads', request.url));
  }

  // Hard paywall: owners/partners with non-active subscriptions can only see
  // /paywall, never /dashboard. The sub_active claim is computed at JWT sign
  // time from salons.subscription_status + subscription_expires_at so the
  // proxy gets the gate bit without a DB roundtrip.
  if (pathname.startsWith('/dashboard') && (role === 'owner' || role === 'partner')) {
    if (!subActive) {
      return NextResponse.redirect(new URL('/paywall', request.url));
    }
  }

  // Inverse gate: an active owner/partner who lands on /paywall should be
  // bounced to the dashboard (e.g. after admin approval, on the next nav).
  if (pathname.startsWith('/paywall')) {
    if (role !== 'owner' && role !== 'partner') {
      const target = role === 'super_admin' ? '/admin' : role === 'sales_agent' ? '/agent/leads' : '/dashboard';
      return NextResponse.redirect(new URL(target, request.url));
    }
    if (subActive) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/agent/:path*', '/setup', '/paywall/:path*'],
};
