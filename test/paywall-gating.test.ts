import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { SignJWT } from 'jose';
import { proxy } from '../src/proxy';

// Matches the proxy's expected iss/aud/kid. If those constants ever change,
// this test becomes a regression signal — which is exactly what we want.
const JWT_ISS = 'icut.pk';
const JWT_AUD = 'icut-app';
const TEST_SECRET = 'test-secret-please-ignore-32-chars!!';

beforeAll(() => {
  process.env.SESSION_SECRET = TEST_SECRET;
});

async function makeToken(claims: Record<string, unknown>): Promise<string> {
  return await new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256', kid: 'v1' })
    .setIssuer(JWT_ISS)
    .setAudience(JWT_AUD)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(TEST_SECRET));
}

async function makeReq(path: string, claims?: Record<string, unknown>): Promise<NextRequest> {
  const req = new NextRequest(`https://example.com${path}`);
  if (claims) {
    const token = await makeToken(claims);
    req.cookies.set('icut-token', token);
  }
  return req;
}

function locationOf(res: Response | undefined): string | null {
  if (!res) return null;
  return res.headers.get('location');
}

describe('proxy hard paywall (JWT-gated)', () => {
  it('redirects owner without sub_active from /dashboard to /paywall', async () => {
    const req = await makeReq('/dashboard', { role: 'owner', salonId: 's1', sub_active: false });
    const res = await proxy(req);
    expect(locationOf(res as Response)).toMatch(/\/paywall/);
  });

  it('redirects owner without sub_active from /dashboard/reports to /paywall', async () => {
    const req = await makeReq('/dashboard/reports', { role: 'owner', salonId: 's1', sub_active: false });
    const res = await proxy(req);
    expect(locationOf(res as Response)).toMatch(/\/paywall/);
  });

  it('redirects partner without sub_active from /dashboard to /paywall', async () => {
    const req = await makeReq('/dashboard', { role: 'partner', salonId: 's1', sub_active: false });
    const res = await proxy(req);
    expect(locationOf(res as Response)).toMatch(/\/paywall/);
  });

  it('lets sub_active owner reach /dashboard', async () => {
    const req = await makeReq('/dashboard', { role: 'owner', salonId: 's1', sub_active: true });
    const res = await proxy(req);
    expect(locationOf(res as Response)).toBeNull();
  });

  it('redirects owner with missing sub_active to /paywall (fail-closed)', async () => {
    // Previously a missing cookie let them through. Under JWT gating, the
    // absence of sub_active means "not active" — the sign path always sets it.
    const req = await makeReq('/dashboard', { role: 'owner', salonId: 's1' });
    const res = await proxy(req);
    expect(locationOf(res as Response)).toMatch(/\/paywall/);
  });

  it('does not paywall super_admin or sales_agent on their own routes', async () => {
    const adminReq = await makeReq('/admin', { role: 'super_admin', sub_active: true });
    expect(locationOf(await proxy(adminReq) as Response)).toBeNull();
    const agentReq = await makeReq('/agent', { role: 'sales_agent', sub_active: true });
    expect(locationOf(await proxy(agentReq) as Response)).toBeNull();
  });

  it('bounces a sub_active owner away from /paywall back to /dashboard', async () => {
    const req = await makeReq('/paywall', { role: 'owner', salonId: 's1', sub_active: true });
    const res = await proxy(req);
    expect(locationOf(res as Response)).toMatch(/\/dashboard$/);
  });

  it('lets an owner without sub_active stay on /paywall', async () => {
    const req = await makeReq('/paywall', { role: 'owner', salonId: 's1', sub_active: false });
    const res = await proxy(req);
    expect(locationOf(res as Response)).toBeNull();
  });

  it('bounces a super_admin off /paywall to /admin', async () => {
    const req = await makeReq('/paywall', { role: 'super_admin', sub_active: true });
    const res = await proxy(req);
    expect(locationOf(res as Response)).toMatch(/\/admin/);
  });

  it('bounces unauthenticated /paywall request to /login', async () => {
    const req = await makeReq('/paywall');
    const res = await proxy(req);
    expect(locationOf(res as Response)).toMatch(/\/login/);
  });

  it('bounces request with a forged/invalid token to /login', async () => {
    const req = new NextRequest('https://example.com/dashboard');
    req.cookies.set('icut-token', 'not-a-real-jwt');
    const res = await proxy(req);
    expect(locationOf(res as Response)).toMatch(/\/login/);
  });

  it('bounces request with a token signed by the wrong secret to /login', async () => {
    const wrong = await new SignJWT({ role: 'super_admin', sub_active: true })
      .setProtectedHeader({ alg: 'HS256', kid: 'v1' })
      .setIssuer(JWT_ISS)
      .setAudience(JWT_AUD)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('a-different-secret-that-is-32-long!!'));
    const req = new NextRequest('https://example.com/admin');
    req.cookies.set('icut-token', wrong);
    const res = await proxy(req);
    expect(locationOf(res as Response)).toMatch(/\/login/);
  });
});
