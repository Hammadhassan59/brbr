/**
 * with-rate-limit — tiny wrapper around `rateLimit()` for use inside server
 * actions and API route handlers.
 *
 * Why a wrapper? `rate-limit.ts` returns rich telemetry (remaining count,
 * retry-after seconds). Most call sites just want a yes/no with a safe
 * error string. This module standardizes that shape so every server action
 * gating call looks the same and produces a user-friendly error.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * USAGE IN A SERVER ACTION
 * ──────────────────────────────────────────────────────────────────────────
 *
 *   'use server';
 *   import { headers } from 'next/headers';
 *   import { getClientIp } from '@/lib/rate-limit';
 *   import { checkRateLimit } from '@/lib/with-rate-limit';
 *   import { BUCKETS } from '@/lib/rate-limit-buckets';
 *
 *   export async function login(email: string, password: string) {
 *     const ip = getClientIp(new Request('http://x', { headers: await headers() }));
 *     const gate = await checkRateLimit(
 *       'login',
 *       `${ip}:${email.toLowerCase()}`,
 *       BUCKETS.LOGIN_ATTEMPTS.max,
 *       BUCKETS.LOGIN_ATTEMPTS.windowMs,
 *     );
 *     if (!gate.ok) return { error: gate.error };
 *     // …actual login logic…
 *   }
 *
 * ──────────────────────────────────────────────────────────────────────────
 * USAGE IN AN API ROUTE (app/api/.../route.ts)
 * ──────────────────────────────────────────────────────────────────────────
 *
 *   import { NextResponse } from 'next/server';
 *   import { getClientIp } from '@/lib/rate-limit';
 *   import { checkRateLimit } from '@/lib/with-rate-limit';
 *   import { BUCKETS } from '@/lib/rate-limit-buckets';
 *
 *   export async function POST(req: Request) {
 *     const ip = getClientIp(req);
 *     const gate = await checkRateLimit(
 *       'signup',
 *       ip,
 *       BUCKETS.SIGNUP.max,
 *       BUCKETS.SIGNUP.windowMs,
 *     );
 *     if (!gate.ok) {
 *       return NextResponse.json({ error: gate.error }, { status: 429 });
 *     }
 *     // …handle request…
 *   }
 *
 * ──────────────────────────────────────────────────────────────────────────
 * KEY DESIGN
 * ──────────────────────────────────────────────────────────────────────────
 *
 * The `key` argument should identify the caller — IP for pre-auth endpoints,
 * user-id for post-auth endpoints, or a composite (IP+email) for pre-auth
 * endpoints where you want to defeat a single attacker cycling through many
 * accounts from one IP. The `bucket` string namespaces the counters so that,
 * e.g., a user's login rate limit doesn't bleed into their password-reset
 * rate limit. See rate-limit-buckets.ts for the canonical bucket names.
 */

import { rateLimit } from './rate-limit';

export interface RateLimitCheck {
  ok: boolean;
  /** User-safe error message when ok=false. Undefined when ok=true. */
  error?: string;
  /** Seconds until the next request would be allowed (0 if ok). */
  retryAfterSec?: number;
}

/**
 * Returns { ok: true } if the request is within the rate limit, or
 * { ok: false, error, retryAfterSec } otherwise. The error string is safe to
 * return to the user verbatim.
 *
 * @param bucket   Namespace for the counter (e.g. 'login', 'signup'). Two
 *                 buckets with the same `key` have independent counters.
 * @param key      Identifier for the caller (IP, user-id, IP+email, etc).
 * @param max      Maximum allowed requests inside `windowMs`.
 * @param windowMs Sliding window in milliseconds.
 */
export async function checkRateLimit(
  bucket: string,
  key: string,
  max: number,
  windowMs: number,
): Promise<RateLimitCheck> {
  const result = rateLimit(`${bucket}:${key}`, max, windowMs);
  if (result.allowed) {
    return { ok: true };
  }
  const mins = Math.ceil(result.retryAfterSec / 60);
  const human =
    result.retryAfterSec < 60
      ? `${result.retryAfterSec}s`
      : mins === 1
        ? '1 minute'
        : `${mins} minutes`;
  return {
    ok: false,
    error: `Too many requests. Please try again in ${human}.`,
    retryAfterSec: result.retryAfterSec,
  };
}
