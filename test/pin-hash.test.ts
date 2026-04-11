import { describe, it, expect } from 'vitest';
import { hashPin, verifyPin, isHashedPin } from '../src/lib/pin-hash';

describe('hashPin / verifyPin', () => {
  it('round-trips a PIN', () => {
    const stored = hashPin('1234');
    expect(verifyPin('1234', stored)).toBe(true);
  });

  it('rejects the wrong PIN', () => {
    const stored = hashPin('1234');
    expect(verifyPin('4321', stored)).toBe(false);
  });

  it('rejects empty PIN against a hash', () => {
    const stored = hashPin('0000');
    expect(verifyPin('', stored)).toBe(false);
  });

  it('produces a different hash each call (salted)', () => {
    expect(hashPin('9999')).not.toBe(hashPin('9999'));
  });

  it('isHashedPin returns true for new hashes', () => {
    expect(isHashedPin(hashPin('1234'))).toBe(true);
  });

  it('isHashedPin returns false for legacy plaintext', () => {
    expect(isHashedPin('1234')).toBe(false);
    expect(isHashedPin('')).toBe(false);
  });

  it('verifyPin falls back to plaintext comparison for legacy rows', () => {
    // Lazy migration — plaintext rows must still authenticate on the first
    // post-fix login before being re-hashed.
    expect(verifyPin('1234', '1234')).toBe(true);
    expect(verifyPin('1234', '4321')).toBe(false);
  });

  it('verifyPin rejects blank/null stored values', () => {
    expect(verifyPin('1234', '')).toBe(false);
  });

  it('verifyPin rejects malformed hash strings', () => {
    expect(verifyPin('1234', 'scrypt$notenoughparts')).toBe(false);
    expect(verifyPin('1234', 'scrypt$deadbeef$zzzz')).toBe(false);
  });
});
