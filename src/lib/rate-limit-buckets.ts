/**
 * Canonical rate-limit buckets for iCut.
 *
 * Rather than sprinkle magic numbers across the codebase, every rate-limited
 * entry point should pull its limits from here. Changes land in one place,
 * and an auditor can read this file to understand the blast radius of any
 * given endpoint.
 *
 * Conventions:
 *   - Values are { max, windowMs } pairs consumable directly by
 *     `checkRateLimit()` from `with-rate-limit.ts`.
 *   - `key` describes what identifier the caller should use — IP, user-id,
 *     or a composite — so that the same bucket name means the same thing
 *     everywhere.
 *   - Comments explain the intent, not the math. Tune the numbers later
 *     without rewriting every comment.
 *
 * Example:
 *
 *   import { BUCKETS } from '@/lib/rate-limit-buckets';
 *   import { checkRateLimit } from '@/lib/with-rate-limit';
 *
 *   const gate = await checkRateLimit(
 *     'login',
 *     `${ip}:${email}`,
 *     BUCKETS.LOGIN_ATTEMPTS.max,
 *     BUCKETS.LOGIN_ATTEMPTS.windowMs,
 *   );
 */

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export interface Bucket {
  /** Max allowed requests inside `windowMs`. */
  max: number;
  /** Sliding window in milliseconds. */
  windowMs: number;
  /** Human description of the correct key to pass (IP, user, IP+email, …). */
  key: string;
}

export const BUCKETS = {
  /**
   * Login form submissions. Pre-auth, so IP-based. We pair IP with the
   * attempted email so a single attacker can't lock out a legit user by
   * flooding their email from one IP without also burning their own IP
   * quota across every account they try.
   */
  LOGIN_ATTEMPTS: {
    max: 5,
    windowMs: 5 * MIN,
    key: 'IP + lowercased email',
  } satisfies Bucket,

  /**
   * Password-reset email requests. Low limit because each request emits a
   * real email — both an abuse vector (email bomb) and a cost. Keyed by
   * IP+email so one attacker can't exhaust the quota for every user.
   */
  PASSWORD_RESET: {
    max: 3,
    windowMs: 1 * HOUR,
    key: 'IP + lowercased email',
  } satisfies Bucket,

  /**
   * New-account signup. Low limit per IP to prevent automated account
   * farming. Does not key by email because a fresh attacker rotates
   * emails freely.
   */
  SIGNUP: {
    max: 3,
    windowMs: 1 * HOUR,
    key: 'IP',
  } satisfies Bucket,

  /**
   * `checkEmailAvailable` and similar "is this identifier taken?" endpoints.
   * Intentionally generous — legitimate users type and retype emails during
   * signup, and the endpoint only returns a boolean so the attacker gain is
   * purely enumeration. 30/hour/IP lets real users breathe while cutting
   * scraper throughput by 100×.
   */
  EMAIL_AVAILABILITY: {
    max: 30,
    windowMs: 1 * HOUR,
    key: 'IP',
  } satisfies Bucket,

  /**
   * Payment submissions (bill payments, udhaar settlements, subscription
   * top-ups). Low per-user limit because legitimate payments are infrequent
   * and each submission hits the payment provider — abuse is expensive.
   */
  PAYMENT_SUBMIT: {
    max: 5,
    windowMs: 1 * HOUR,
    key: 'user-id',
  } satisfies Bucket,

  /**
   * Admin-invite endpoint. Extremely low — inviting 5 admins per day is
   * already unusual. Keyed per invoking admin to surface a compromised
   * account before it mass-invites backdoors.
   */
  INVITE_ADMIN: {
    max: 5,
    windowMs: 1 * DAY,
    key: 'admin user-id',
  } satisfies Bucket,

  /**
   * Generic read endpoints (list/get endpoints that don't mutate state).
   * High enough not to bother normal dashboard use; low enough to slow a
   * full-database scrape to a crawl.
   */
  GENERIC_READ: {
    max: 120,
    windowMs: 1 * MIN,
    key: 'IP',
  } satisfies Bucket,

  /**
   * Generic write endpoints (create/update/delete that mutate state).
   * Per-user, not per-IP, because a shared office IP is legitimate for
   * heavy writes (a busy salon POS shift).
   */
  GENERIC_WRITE: {
    max: 60,
    windowMs: 1 * MIN,
    key: 'user-id',
  } satisfies Bucket,
} as const;

export type BucketName = keyof typeof BUCKETS;
