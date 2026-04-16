import { describe, it, expect } from 'vitest';
import { BUCKETS } from '../src/lib/rate-limit-buckets';

describe('rate-limit-buckets', () => {
  it('exports all required buckets', () => {
    expect(BUCKETS.LOGIN_ATTEMPTS).toBeDefined();
    expect(BUCKETS.PASSWORD_RESET).toBeDefined();
    expect(BUCKETS.SIGNUP).toBeDefined();
    expect(BUCKETS.EMAIL_AVAILABILITY).toBeDefined();
    expect(BUCKETS.PAYMENT_SUBMIT).toBeDefined();
    expect(BUCKETS.INVITE_ADMIN).toBeDefined();
    expect(BUCKETS.GENERIC_READ).toBeDefined();
    expect(BUCKETS.GENERIC_WRITE).toBeDefined();
  });

  it('every bucket has a positive max and windowMs', () => {
    for (const [name, bucket] of Object.entries(BUCKETS)) {
      expect(bucket.max, `${name}.max`).toBeGreaterThan(0);
      expect(bucket.windowMs, `${name}.windowMs`).toBeGreaterThan(0);
      expect(bucket.key.length, `${name}.key`).toBeGreaterThan(0);
    }
  });

  it('matches the documented limits', () => {
    expect(BUCKETS.LOGIN_ATTEMPTS.max).toBe(5);
    expect(BUCKETS.LOGIN_ATTEMPTS.windowMs).toBe(5 * 60 * 1000);

    expect(BUCKETS.PASSWORD_RESET.max).toBe(3);
    expect(BUCKETS.PASSWORD_RESET.windowMs).toBe(60 * 60 * 1000);

    expect(BUCKETS.SIGNUP.max).toBe(3);
    expect(BUCKETS.SIGNUP.windowMs).toBe(60 * 60 * 1000);

    expect(BUCKETS.EMAIL_AVAILABILITY.max).toBe(30);
    expect(BUCKETS.PAYMENT_SUBMIT.max).toBe(5);
    expect(BUCKETS.INVITE_ADMIN.max).toBe(5);
    expect(BUCKETS.INVITE_ADMIN.windowMs).toBe(24 * 60 * 60 * 1000);
    expect(BUCKETS.GENERIC_READ.max).toBe(120);
    expect(BUCKETS.GENERIC_WRITE.max).toBe(60);
  });
});
