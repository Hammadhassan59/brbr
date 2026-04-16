import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkRateLimit } from '../src/lib/with-rate-limit';
import { resetRateLimit } from '../src/lib/rate-limit';

describe('checkRateLimit', () => {
  beforeEach(() => {
    // checkRateLimit namespaces with `${bucket}:${key}`.
    resetRateLimit('auth:user-1');
    resetRateLimit('auth:user-2');
    resetRateLimit('other:user-1');
  });

  it('returns ok=true while under the limit', async () => {
    const result = await checkRateLimit('auth', 'user-1', 5, 60_000);
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns ok=false with a user-safe message when over the limit', async () => {
    for (let i = 0; i < 5; i++) {
      await checkRateLimit('auth', 'user-1', 5, 60_000);
    }
    const blocked = await checkRateLimit('auth', 'user-1', 5, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toMatch(/too many requests/i);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it('bucket namespaces counters so two buckets do not bleed', async () => {
    for (let i = 0; i < 5; i++) {
      await checkRateLimit('auth', 'user-1', 5, 60_000);
    }
    // Same key under a different bucket should still be fresh
    const other = await checkRateLimit('other', 'user-1', 5, 60_000);
    expect(other.ok).toBe(true);
  });

  it('different keys under the same bucket are independent', async () => {
    for (let i = 0; i < 5; i++) {
      await checkRateLimit('auth', 'user-1', 5, 60_000);
    }
    const other = await checkRateLimit('auth', 'user-2', 5, 60_000);
    expect(other.ok).toBe(true);
  });

  it('formats retry-after as seconds for short windows', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-11T10:00:00Z'));
    for (let i = 0; i < 2; i++) {
      await checkRateLimit('auth', 'user-1', 2, 30_000);
    }
    const blocked = await checkRateLimit('auth', 'user-1', 2, 30_000);
    expect(blocked.error).toMatch(/\d+s/);
    vi.useRealTimers();
  });

  it('formats retry-after as minutes for longer windows', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-11T10:00:00Z'));
    for (let i = 0; i < 2; i++) {
      await checkRateLimit('auth', 'user-1', 2, 10 * 60 * 1000);
    }
    const blocked = await checkRateLimit('auth', 'user-1', 2, 10 * 60 * 1000);
    expect(blocked.error).toMatch(/minutes?/);
    vi.useRealTimers();
  });
});
