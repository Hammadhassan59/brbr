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
 * - Minimum length 10 (bumped from 6 in 2026-04; see account.ts TODO).
 * - Must contain at least one non-whitespace character (no all-whitespace).
 * - No max length — let the hasher handle it.
 *
 * TODO(HIBP): integrate Have-I-Been-Pwned k-anonymity check
 * (https://haveibeenpwned.com/API/v3#PwnedPasswords) before saving. Hash the
 * password with SHA-1, send the first 5 hex chars, reject if the suffix
 * appears in the response. Keep the fetch timeout tight (~500ms) and fail
 * open on network errors — never lock a user out because the HIBP API is
 * down.
 */
export const PasswordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .refine((s) => /\S/.test(s), 'Password cannot be only whitespace');

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

/**
 * Salon gender classification — mirrors the `salon_gender_type` Postgres enum
 * from migration 041 (`'men' | 'women' | 'mixed'`). The marketplace launches
 * men-only; women/mixed salons are gated off the consumer directory by the
 * superadmin `marketplace_women_enabled` platform flag, but the column on
 * `branches.gender_type` still has to be truthful so flipping the flag later
 * is a one-switch change.
 */
export const GenderTypeSchema = z.enum(['men', 'women', 'mixed']);

