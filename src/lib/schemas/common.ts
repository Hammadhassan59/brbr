/**
 * Common zod schemas used across iCut server actions and API routes.
 *
 * This file lives in `src/lib/schemas/` (subdirectory, not a single file) so
 * multiple agents can add sibling files (e.g. `tenant.ts` for tenant-isolation
 * schemas, `billing.ts` for payment shapes) without collisions. Import from
 * the specific file you need — do not re-export from an index to keep tree-
 * shaking obvious.
 *
 * Usage:
 *
 *   import { PasswordSchema, EmailSchema } from '@/lib/schemas/common';
 *
 *   const parsed = PasswordSchema.safeParse(input);
 *   if (!parsed.success) return { error: parsed.error.issues[0].message };
 */

import { z } from 'zod';

/**
 * Password rules for iCut accounts.
 *
 * - Minimum length 8.
 * - Must contain at least one uppercase letter, one digit, one special char.
 * - Must contain at least one non-whitespace character (no all-whitespace).
 * - No max length — let the hasher handle it.
 *
 * Keep in sync with GoTrue env on the self-hosted Supabase:
 *   GOTRUE_PASSWORD_MIN_LENGTH=8
 *   GOTRUE_PASSWORD_REQUIRED_CHARACTERS=abcdefghijklmnopqrstuvwxyz:ABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789:!@#$%^&*()_-=+[]{}|;:,.<>?/~`
 *
 * TODO(HIBP): integrate Have-I-Been-Pwned k-anonymity check
 * (https://haveibeenpwned.com/API/v3#PwnedPasswords) before saving.
 */
export const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must include at least one uppercase letter')
  .regex(/\d/, 'Password must include at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must include at least one special character')
  .refine((s) => /\S/.test(s), 'Password cannot be only whitespace');

/**
 * Returns the first password-policy error message, or null if the password
 * passes all rules. Callers (client forms + server actions) use this instead
 * of redeclaring the rules inline — keeps policy drift out of the codebase.
 */
export function getPasswordError(pwd: string | null | undefined): string | null {
  const s = pwd ?? '';
  if (s.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(s)) return 'Password must include at least one uppercase letter';
  if (!/\d/.test(s)) return 'Password must include at least one number';
  if (!/[^A-Za-z0-9]/.test(s)) return 'Password must include at least one special character';
  if (!/\S/.test(s)) return 'Password cannot be only whitespace';
  return null;
}

/**
 * Email address. Lowercased and trimmed so downstream comparisons (rate
 * limiting, Supabase auth lookups) all see the same canonical form.
 *
 * The preprocess step strips whitespace and normalizes case BEFORE the
 * `.email()` validator runs — zod v4 applies validators left-to-right, and
 * an email with surrounding whitespace would otherwise fail the regex.
 */
export const EmailSchema = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
  z.string().email('Invalid email address'),
);

/**
 * Pakistani mobile number. Tolerant of the two common user formats:
 *   03XXXXXXXXX       (local, 11 digits starting with 03)
 *   +923XXXXXXXXX     (international, +92 then 10 digits starting with 3)
 *
 * Rejects landlines and short codes. Callers that need to store the number
 * should normalize to +92 form after validation.
 */
export const PhoneSchema = z
  .string()
  .trim()
  .regex(
    /^(?:03\d{9}|\+923\d{9})$/,
    'Enter a valid Pakistani mobile (03XXXXXXXXX or +923XXXXXXXXX)',
  );

export const UUIDSchema = z.string().uuid('Invalid ID');

/**
 * ISO-8601 date string. Accepts both date-only (YYYY-MM-DD) and full datetime
 * (with timezone). Use this at the zod boundary and parse with `new Date()`
 * only after validation.
 */
export const DateISOSchema = z
  .string()
  .refine(
    (s) => !Number.isNaN(new Date(s).getTime()),
    'Invalid ISO-8601 date',
  );

/**
 * Non-negative monetary amount. Finite, not NaN, capped at 1e10 to reject
 * absurd inputs that would blow past number precision. Use this for any
 * price, balance, or payment value.
 */
export const AmountSchema = z
  .number()
  .finite('Amount must be finite')
  .nonnegative('Amount must be non-negative')
  .max(1e10, 'Amount is unreasonably large');

/**
 * Percentage 0-100 inclusive. Use for commission rates, tax rates, discount
 * rates.
 */
export const PercentSchema = z
  .number()
  .finite('Percent must be finite')
  .min(0, 'Percent must be 0 or greater')
  .max(100, 'Percent must be 100 or less');
