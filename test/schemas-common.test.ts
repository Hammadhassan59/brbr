import { describe, it, expect } from 'vitest';
import {
  PasswordSchema,
  EmailSchema,
  PhoneSchema,
  UUIDSchema,
  DateISOSchema,
  AmountSchema,
  PercentSchema,
} from '../src/lib/schemas/common';

describe('PasswordSchema', () => {
  it('rejects passwords shorter than 10', () => {
    expect(PasswordSchema.safeParse('short1').success).toBe(false);
    expect(PasswordSchema.safeParse('nine-char').success).toBe(false);
  });

  it('accepts a 10-char password', () => {
    expect(PasswordSchema.safeParse('abcdefghij').success).toBe(true);
  });

  it('rejects whitespace-only passwords even at 10 chars', () => {
    expect(PasswordSchema.safeParse('          ').success).toBe(false);
  });

  it('accepts long mixed passwords', () => {
    expect(PasswordSchema.safeParse('CorrectHorseBatteryStaple!').success).toBe(true);
  });
});

describe('EmailSchema', () => {
  it('accepts and lowercases', () => {
    const parsed = EmailSchema.parse('Foo@Example.COM');
    expect(parsed).toBe('foo@example.com');
  });

  it('trims whitespace', () => {
    expect(EmailSchema.parse('  a@b.co  ')).toBe('a@b.co');
  });

  it('rejects obviously invalid emails', () => {
    expect(EmailSchema.safeParse('not-an-email').success).toBe(false);
    expect(EmailSchema.safeParse('@missing.local').success).toBe(false);
  });
});

describe('PhoneSchema', () => {
  it('accepts local 03 format', () => {
    expect(PhoneSchema.safeParse('03001234567').success).toBe(true);
  });

  it('accepts +92 format', () => {
    expect(PhoneSchema.safeParse('+923001234567').success).toBe(true);
  });

  it('rejects landlines and wrong country codes', () => {
    expect(PhoneSchema.safeParse('0211234567').success).toBe(false);
    expect(PhoneSchema.safeParse('+14155551234').success).toBe(false);
  });

  it('rejects wrong lengths', () => {
    expect(PhoneSchema.safeParse('030012345').success).toBe(false);
    expect(PhoneSchema.safeParse('030012345678').success).toBe(false);
  });
});

describe('UUIDSchema', () => {
  it('accepts a valid v4 UUID', () => {
    expect(UUIDSchema.safeParse('11111111-2222-4333-8444-555555555555').success).toBe(true);
  });

  it('rejects non-UUID strings', () => {
    expect(UUIDSchema.safeParse('not-a-uuid').success).toBe(false);
  });
});

describe('DateISOSchema', () => {
  it('accepts ISO-8601 date', () => {
    expect(DateISOSchema.safeParse('2026-04-16').success).toBe(true);
  });

  it('accepts ISO-8601 datetime', () => {
    expect(DateISOSchema.safeParse('2026-04-16T12:34:56Z').success).toBe(true);
  });

  it('rejects garbage', () => {
    expect(DateISOSchema.safeParse('not-a-date').success).toBe(false);
  });
});

describe('AmountSchema', () => {
  it('accepts 0 and positive finite numbers', () => {
    expect(AmountSchema.safeParse(0).success).toBe(true);
    expect(AmountSchema.safeParse(1250).success).toBe(true);
  });

  it('rejects negative values', () => {
    expect(AmountSchema.safeParse(-1).success).toBe(false);
  });

  it('rejects Infinity and NaN', () => {
    expect(AmountSchema.safeParse(Infinity).success).toBe(false);
    expect(AmountSchema.safeParse(Number.NaN).success).toBe(false);
  });

  it('rejects absurd values over 1e10', () => {
    expect(AmountSchema.safeParse(1e11).success).toBe(false);
  });
});

describe('PercentSchema', () => {
  it('accepts boundaries', () => {
    expect(PercentSchema.safeParse(0).success).toBe(true);
    expect(PercentSchema.safeParse(100).success).toBe(true);
  });

  it('rejects outside [0,100]', () => {
    expect(PercentSchema.safeParse(-0.1).success).toBe(false);
    expect(PercentSchema.safeParse(100.1).success).toBe(false);
  });
});
