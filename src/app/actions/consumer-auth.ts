'use server';

/**
 * Consumer authentication — the marketplace-side companion to the owner auth
 * in ./auth.ts.
 *
 * Owners authenticate via a custom JWT (`icut-token`, HttpOnly, signed with
 * SESSION_SECRET) on top of Supabase Auth. Consumers are simpler: they are
 * ordinary Supabase Auth users with email verification required. We read their
 * session directly from the `sb-*-auth-token` cookies that `auth-helpers-nextjs`
 * writes, and pair each `auth.users` row with a companion `consumers` row
 * (name, phone, rating, notification prefs — see migration 041 in the
 * marketplace plan at docs/superpowers/plans/2026-04-18-marketplace-phase-0-1.md).
 *
 * Because the two session transports are separate, `verifySession()` (owners)
 * and `getConsumerSession()` (consumers) never conflict: a browser can hold
 * both identities at once (e.g. an owner QA-testing the consumer flow), and
 * the proxy at src/proxy.ts only inspects the owner JWT — never Supabase
 * cookies — so consumer cookies can't spoof dashboard access.
 *
 * Assumptions about `consumers` schema (migration 041, NOT YET APPLIED in prod):
 *   - `id uuid PRIMARY KEY`  — equal to auth.users.id
 *   - `name text NOT NULL`
 *   - `phone text NOT NULL`
 *   - `created_at timestamptz NOT NULL DEFAULT now()`
 *   - `updated_at timestamptz NOT NULL DEFAULT now()`
 *   - plus rating/counter columns not used on signup
 * If the migration's column names or NOT-NULL shape shift before ship, only
 * the two `.from('consumers')` calls below need updating.
 */

import { createServerClient as createSupabaseSSRClient } from '@supabase/auth-helpers-nextjs';
import { cookies, headers } from 'next/headers';
import { createServerClient as createServiceClient } from '@/lib/supabase';
import { EmailSchema, PasswordSchema, PhoneSchema } from '@/lib/schemas/common';
import { checkRateLimit } from '@/lib/with-rate-limit';
import { BUCKETS } from '@/lib/rate-limit-buckets';
import { getClientIp } from '@/lib/rate-limit';
import { safeError } from '@/lib/action-error';
import { z } from 'zod';

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

/**
 * Registration input. `name` min 2 so we reject whitespace-only or single-
 * character submissions that would sail past the zod .min(1) default.
 */
const RegisterSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120, 'Name is too long'),
  email: EmailSchema,
  password: PasswordSchema,
  phone: PhoneSchema,
});

const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, 'Password is required'),
});

/**
 * Resolve the origin for building the email-verification redirect. We read
 * `x-forwarded-host`/`host` from the request headers so staging, prod, and
 * localhost each get their own link. Falls back to NEXT_PUBLIC_SITE_URL and
 * finally `https://icut.pk` so the link is never broken.
 */
async function resolveOrigin(): Promise<string> {
  try {
    const h = await headers();
    const proto = h.get('x-forwarded-proto') ?? 'https';
    const host = h.get('x-forwarded-host') ?? h.get('host');
    if (host) return `${proto}://${host}`;
  } catch {
    // headers() unavailable (e.g. in unit tests) — fall through.
  }
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://icut.pk';
}

async function getIpOrUnknown(): Promise<string> {
  try {
    const h = await headers();
    return getClientIp(new Request('http://x', { headers: h }));
  } catch {
    return 'unknown';
  }
}

/**
 * Build a Supabase client bound to the current request's Next.js cookies.
 * Reads AND writes `sb-*-auth-token` — so calls to `auth.signUp`,
 * `auth.signInWithPassword`, `auth.signOut`, `auth.getUser` all use the
 * consumer's Supabase session (NOT the service-role). This is the same
 * helper shape as `setup.ts::getAuthUserFromCookies`, extracted so every
 * consumer-auth action reuses it.
 */
async function consumerSupabase() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createSupabaseSSRClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Setting cookies outside a response context is a no-op. The auth
          // helpers call setAll eagerly on refresh — if we're on a read-only
          // path, swallow the throw rather than fail the action.
        }
      },
    },
  });
}

/**
 * POST /register (form action).
 *
 * Validates the input via zod, signs the user up through Supabase Auth with
 * email verification required (confirmation link points at `/verify-email`),
 * and inserts the companion `consumers` row using the service-role client so
 * the row lands even if RLS denies unauthenticated inserts.
 *
 * Rate-limited with the SIGNUP bucket (3/hour/IP) — stop account farming.
 *
 * Returns { data: { userId, needsVerification }, error: null } on success.
 * Success with `needsVerification=true` is the expected path in prod because
 * Supabase email-confirmation is on; the caller should render "check your
 * inbox" instead of attempting an immediate redirect.
 */
export async function registerConsumer(
  input: { name: string; email: string; password: string; phone: string; next?: string }
): Promise<ActionResult<{ userId: string; needsVerification: boolean }>> {
  const parsed = RegisterSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  // Rate-limit: SIGNUP bucket is per-IP only (not keyed by email) since a
  // fresh attacker rotates emails freely. 3/hour/IP cuts account farming while
  // leaving room for a household on a shared NAT to register a small number
  // of accounts back-to-back.
  const ip = await getIpOrUnknown();
  const rl = await checkRateLimit('signup', ip, BUCKETS.SIGNUP.max, BUCKETS.SIGNUP.windowMs);
  if (!rl.ok) return { data: null, error: rl.error ?? 'Too many signups, please try again later.' };

  const { name, email, password, phone } = parsed.data;
  const origin = await resolveOrigin();
  const nextPath = typeof input.next === 'string' && input.next.startsWith('/') ? input.next : '';
  const redirectTo = `${origin}/verify-email${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ''}`;

  try {
    const supabase = await consumerSupabase();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
        // Stash name+phone on the auth user's metadata too — useful if the
        // consumers-row insert fails (see below) and we need to reconstruct.
        data: { name, phone },
      },
    });

    if (error) {
      // Surface known auth errors verbatim — they're actionable UX, not
      // schema leaks. `safeError` is a catch-all for unknown errors.
      const msg = error.message || '';
      if (/already registered|already exists|user already/i.test(msg)) {
        return {
          data: null,
          error: 'An account with this email already exists. Try signing in, or use a different email.',
        };
      }
      if (/password/i.test(msg) && /short|weak|characters/i.test(msg)) {
        return {
          data: null,
          error: 'Password is too weak. Use at least 10 characters including letters and numbers.',
        };
      }
      if (/rate|too many/i.test(msg)) {
        return {
          data: null,
          error: 'Too many signup attempts — please wait a minute and try again.',
        };
      }
      return { data: null, error: safeError(error) };
    }
    if (!data.user) return { data: null, error: 'Signup failed — no user returned' };

    // Insert the companion `consumers` row via service-role so it lands even
    // though the user hasn't verified their email yet (they have no session
    // from the anon client's perspective until verification completes). We
    // upsert on the primary key so a retry from the same user (e.g. after a
    // browser refresh on signup) doesn't fail with a unique-violation.
    //
    // ASSUMPTION: consumers.id is the Supabase auth.users.id (per migration
    // 041's `id uuid PRIMARY KEY` with no DEFAULT). If the migration switches
    // to a separate surrogate id, change the `.upsert({ id, ... })` below.
    const service = createServiceClient();
    const { error: insertErr } = await service.from('consumers').upsert(
      {
        id: data.user.id,
        name,
        phone,
      },
      { onConflict: 'id' },
    );
    if (insertErr) {
      // Don't unwind the auth.users row — Supabase only sends the verification
      // email as a side-effect of signUp, and retrying would hit the per-email
      // cooldown. Log and surface so ops can reconcile. The resend action can
      // be used by the user to re-send the link if needed.
      return { data: null, error: safeError(insertErr) };
    }

    // `data.session` is null when email-confirmation is enabled. We report it
    // as "needs verification" so the UI can render the check-your-inbox copy.
    return {
      data: { userId: data.user.id, needsVerification: !data.session },
      error: null,
    };
  } catch (err) {
    return { data: null, error: safeError(err) };
  }
}

/**
 * POST /login (form action).
 *
 * Validates the input, signs the user in through Supabase Auth, and lets
 * auth-helpers-nextjs write the `sb-*-auth-token` cookies automatically.
 *
 * Rate-limited with the LOGIN_ATTEMPTS bucket (5/5min, keyed by IP+email) so
 * a single attacker can't lock out a legit user by flooding their email from
 * one IP without also burning their own IP quota across every account.
 *
 * IMPORTANT: we don't short-circuit on `email_confirmed_at` here. Supabase
 * rejects the login itself when the user hasn't confirmed, surfacing as an
 * auth error — no duplicate check needed. If that ever changes we gate here.
 */
export async function loginConsumer(
  input: { email: string; password: string }
): Promise<ActionResult<{ userId: string }>> {
  const parsed = LoginSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const { email, password } = parsed.data;
  const ip = await getIpOrUnknown();
  const rl = await checkRateLimit(
    'consumer-login',
    `${ip}:${email}`,
    BUCKETS.LOGIN_ATTEMPTS.max,
    BUCKETS.LOGIN_ATTEMPTS.windowMs,
  );
  if (!rl.ok) return { data: null, error: rl.error ?? 'Too many login attempts, please try again later.' };

  try {
    const supabase = await consumerSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { data: null, error: safeError(error) };
    if (!data.user) return { data: null, error: 'Login failed' };
    return { data: { userId: data.user.id }, error: null };
  } catch (err) {
    return { data: null, error: safeError(err) };
  }
}

/**
 * POST /logout (form action or client-triggered).
 *
 * Calls Supabase signOut, which clears every `sb-*-auth-token` cookie on the
 * response. Safe to call even without an active session — returns success
 * regardless so the UI can always render "logged out" after the call.
 */
export async function logoutConsumer(): Promise<ActionResult<{ success: true }>> {
  try {
    const supabase = await consumerSupabase();
    await supabase.auth.signOut();
    return { data: { success: true }, error: null };
  } catch (err) {
    return { data: null, error: safeError(err) };
  }
}

/**
 * POST /verify-email/resend — the user lost the original verification email
 * or it bounced. Re-sends the confirmation link via Supabase's built-in
 * `resend` endpoint.
 *
 * Rate-limited with PASSWORD_RESET bucket (3/hour/email+IP) because each
 * call emits a real email, same abuse profile as password resets.
 */
export async function resendVerificationEmail(
  input: { email: string; next?: string }
): Promise<ActionResult<{ success: true }>> {
  const emailParsed = EmailSchema.safeParse(input.email);
  if (!emailParsed.success) {
    return { data: null, error: emailParsed.error.issues[0]?.message ?? 'Invalid email' };
  }
  const email = emailParsed.data;

  const ip = await getIpOrUnknown();
  const rl = await checkRateLimit(
    'verification-resend',
    `${ip}:${email}`,
    BUCKETS.PASSWORD_RESET.max,
    BUCKETS.PASSWORD_RESET.windowMs,
  );
  if (!rl.ok) return { data: null, error: rl.error ?? 'Too many requests, please try again later.' };

  const origin = await resolveOrigin();
  const nextPath = typeof input.next === 'string' && input.next.startsWith('/') ? input.next : '';
  const redirectTo = `${origin}/verify-email${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ''}`;

  try {
    const supabase = await consumerSupabase();
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) return { data: null, error: safeError(error) };
    return { data: { success: true }, error: null };
  } catch (err) {
    return { data: null, error: safeError(err) };
  }
}
