import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

const SCRYPT_PREFIX = 'scrypt$';
const KEY_LEN = 64;
const COST = 16384;

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, KEY_LEN, { N: COST });
  return `${SCRYPT_PREFIX}${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function isHashedPin(stored: string): boolean {
  return typeof stored === 'string' && stored.startsWith(SCRYPT_PREFIX);
}

const HEX_RE = /^[0-9a-fA-F]+$/;

export function verifyPin(pin: string, stored: string): boolean {
  if (!stored) return false;

  if (!isHashedPin(stored)) {
    // Plaintext fallback for rows that haven't been migrated yet.
    // Caller must re-hash on successful match (see staff-login route).
    return stored.length > 0 && stored === pin;
  }

  const parts = stored.split('$');
  // Expect: ['scrypt', '<salt-hex>', '<hash-hex>']
  if (parts.length !== 3) return false;
  if (!HEX_RE.test(parts[1]) || parts[1].length !== 32) return false;
  if (!HEX_RE.test(parts[2]) || parts[2].length !== KEY_LEN * 2) return false;

  try {
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    const actual = scryptSync(pin, salt, expected.length, { N: COST });
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
