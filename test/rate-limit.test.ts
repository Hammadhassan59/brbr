import { describe, it, expect, beforeEach, vi } from 'vitest';
import { rateLimit, resetRateLimit, getClientIp, isBodyTooLarge } from '../src/lib/rate-limit';

describe('rateLimit', () => {
  beforeEach(() => {
    resetRateLimit('test-key');
  });

  it('allows up to max requests', () => {
    for (let i = 0; i < 5; i++) {
      expect(rateLimit('test-key', 5, 60_000).allowed).toBe(true);
    }
  });

  it('blocks the Nth+1 request', () => {
    for (let i = 0; i < 5; i++) rateLimit('test-key', 5, 60_000);
    const blocked = rateLimit('test-key', 5, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it('returns correct remaining count', () => {
    expect(rateLimit('test-key', 5, 60_000).remaining).toBe(4);
    expect(rateLimit('test-key', 5, 60_000).remaining).toBe(3);
    expect(rateLimit('test-key', 5, 60_000).remaining).toBe(2);
  });

  it('isolates buckets by key', () => {
    for (let i = 0; i < 5; i++) rateLimit('key-a', 5, 60_000);
    expect(rateLimit('key-a', 5, 60_000).allowed).toBe(false);
    expect(rateLimit('key-b', 5, 60_000).allowed).toBe(true);
    resetRateLimit('key-a');
    resetRateLimit('key-b');
  });

  it('resets after the window expires', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-11T10:00:00Z'));
    for (let i = 0; i < 5; i++) rateLimit('test-key', 5, 60_000);
    expect(rateLimit('test-key', 5, 60_000).allowed).toBe(false);

    vi.setSystemTime(new Date('2026-04-11T10:01:01Z')); // 61 seconds later
    expect(rateLimit('test-key', 5, 60_000).allowed).toBe(true);
    vi.useRealTimers();
  });

  it('resetRateLimit clears the bucket', () => {
    for (let i = 0; i < 5; i++) rateLimit('test-key', 5, 60_000);
    expect(rateLimit('test-key', 5, 60_000).allowed).toBe(false);
    resetRateLimit('test-key');
    expect(rateLimit('test-key', 5, 60_000).allowed).toBe(true);
  });
});

// Content-Length is a forbidden header name — the Request constructor
// silently ignores it. Build a minimal fake with a headers.get() shim so the
// tests can exercise isBodyTooLarge directly.
function fakeReq(contentLength: string | null): Request {
  return {
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-length' ? contentLength : null,
    },
  } as unknown as Request;
}

describe('isBodyTooLarge', () => {
  it('returns false when body is within limit', () => {
    expect(isBodyTooLarge(fakeReq('500'), 1024)).toBe(false);
  });

  it('returns true when body exceeds limit', () => {
    expect(isBodyTooLarge(fakeReq('2048'), 1024)).toBe(true);
  });

  it('returns false when header is missing (callers must check after read)', () => {
    expect(isBodyTooLarge(fakeReq(null), 1024)).toBe(false);
  });

  it('returns true for an unparseable header', () => {
    expect(isBodyTooLarge(fakeReq('not-a-number'), 1024)).toBe(true);
  });

  it('returns true for a negative content-length', () => {
    expect(isBodyTooLarge(fakeReq('-1'), 1024)).toBe(true);
  });

  it('handles exact-limit body as within limit', () => {
    expect(isBodyTooLarge(fakeReq('1024'), 1024)).toBe(false);
  });
});

describe('getClientIp', () => {
  it('reads x-forwarded-for first segment', () => {
    const req = new Request('http://example.com', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    });
    expect(getClientIp(req)).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip', () => {
    const req = new Request('http://example.com', {
      headers: { 'x-real-ip': '9.9.9.9' },
    });
    expect(getClientIp(req)).toBe('9.9.9.9');
  });

  it('returns "unknown" when no header present', () => {
    const req = new Request('http://example.com');
    expect(getClientIp(req)).toBe('unknown');
  });
});
