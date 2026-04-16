import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../src/proxy';

function makeReq(path: string, cookies: Record<string, string>): NextRequest {
  const req = new NextRequest(`https://example.com${path}`);
  for (const [k, v] of Object.entries(cookies)) {
    req.cookies.set(k, v);
  }
  return req;
}

function locationOf(res: Response | undefined): string | null {
  if (!res) return null;
  return res.headers.get('location');
}

describe('proxy hard paywall', () => {
  it('redirects pending owner from /dashboard to /paywall', () => {
    const res = proxy(makeReq('/dashboard', { 'icut-session': '1', 'icut-role': 'owner', 'icut-sub': 'pending' }));
    expect(locationOf(res as Response)).toMatch(/\/paywall/);
  });

  it('redirects expired owner from /dashboard to /paywall', () => {
    const res = proxy(makeReq('/dashboard/reports', { 'icut-session': '1', 'icut-role': 'owner', 'icut-sub': 'expired' }));
    expect(locationOf(res as Response)).toMatch(/\/paywall/);
  });

  it('redirects suspended partner from /dashboard to /paywall', () => {
    const res = proxy(makeReq('/dashboard', { 'icut-session': '1', 'icut-role': 'partner', 'icut-sub': 'suspended' }));
    expect(locationOf(res as Response)).toMatch(/\/paywall/);
  });

  it('lets active owner reach /dashboard', () => {
    const res = proxy(makeReq('/dashboard', { 'icut-session': '1', 'icut-role': 'owner', 'icut-sub': 'active' }));
    // NextResponse.next() returns a passthrough — no redirect Location header
    expect(locationOf(res as Response)).toBeNull();
  });

  it('lets owner with no icut-sub cookie through (graceful first-load before bootstrap sets it)', () => {
    const res = proxy(makeReq('/dashboard', { 'icut-session': '1', 'icut-role': 'owner' }));
    expect(locationOf(res as Response)).toBeNull();
  });

  it('does not paywall super_admin or sales_agent on their own routes', () => {
    expect(locationOf(proxy(makeReq('/admin', { 'icut-session': '1', 'icut-role': 'super_admin' })) as Response)).toBeNull();
    expect(locationOf(proxy(makeReq('/agent', { 'icut-session': '1', 'icut-role': 'sales_agent' })) as Response)).toBeNull();
  });

  it('bounces an active owner away from /paywall back to /dashboard', () => {
    const res = proxy(makeReq('/paywall', { 'icut-session': '1', 'icut-role': 'owner', 'icut-sub': 'active' }));
    expect(locationOf(res as Response)).toMatch(/\/dashboard$/);
  });

  it('lets a pending owner stay on /paywall', () => {
    const res = proxy(makeReq('/paywall', { 'icut-session': '1', 'icut-role': 'owner', 'icut-sub': 'pending' }));
    expect(locationOf(res as Response)).toBeNull();
  });

  it('bounces a super_admin off /paywall to /admin', () => {
    const res = proxy(makeReq('/paywall', { 'icut-session': '1', 'icut-role': 'super_admin' }));
    expect(locationOf(res as Response)).toMatch(/\/admin/);
  });

  it('bounces unauthenticated /paywall request to /login', () => {
    const res = proxy(makeReq('/paywall', {}));
    expect(locationOf(res as Response)).toMatch(/\/login/);
  });
});
