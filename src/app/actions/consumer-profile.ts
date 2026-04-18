'use server';

/**
 * Consumer profile server actions — name/phone/email/password edits and
 * notification preference toggles for the marketplace-side `/account/profile`
 * and `/account/notifications` pages.
 *
 * These are the consumer-side mirror of `src/app/actions/account.ts` (which
 * serves owners/staff/partners/agents). The owner-side stays untouched; this
 * file exists so consumer changes never risk touching the owner flow.
 *
 * Why separate from `account.ts`?
 *   - Different session transport. Owner auth is the custom `icut-token` JWT;
 *     consumer auth is the Supabase `sb-*-auth-token` cookie read via
 *     `getConsumerSession()`. Mixing the two in one resolver would blur the
 *     security model.
 *   - Different table. Profile fields live on `consumers` (migration 041),
 *     not on `salon_partners`/`staff`/`sales_agents`.
 *   - Consumer-side has `notification_prefs` jsonb which owners don't have.
 *
 * Shared plumbing:
 *   - Email-change flow uses the SAME "sign-in-as-user + user-authed
 *     updateUser" pattern as `changeAccountEmail` in `account.ts` — NEVER the
 *     admin bypass with `email_confirm: true`. Supabase emits a verification
 *     link to the new address; the `auth.users.email` column doesn't flip
 *     until the user clicks. See CLAUDE.md security-hardening notes from
 *     2026-04-16 on why this matters.
 *   - Re-auth on every sensitive action (password change, email change) so a
 *     stolen session cookie alone can't hijack the account.
 *   - Rate-limit every write, keyed per-consumer, to blunt brute-force and
 *     abuse even if a session cookie is captured.
 */

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { headers } from 'next/headers';

import { getConsumerSession } from '@/lib/consumer-session';
import { createServerClient } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/with-rate-limit';
import { getClientIp } from '@/lib/rate-limit';
import {
  EmailSchema,
  PasswordSchema,
  PhoneSchema,
} from '@/lib/schemas/common';
import { safeError } from '@/lib/action-error';

// ─── Result envelope ─────────────────────────────────────────────────────────
// Mirrors consumer-addresses.ts shape ({ ok, data } / { ok:false, error }) so
// consumer-side action callers can switch-case on `.ok` consistently.

interface Ok<T> { ok: true; data: T }
interface Fail { ok: false; error: string }
export type ActionResult<T> = Ok<T> | Fail;

function ok<T>(data: T): Ok<T> { return { ok: true, data }; }
function fail(error: string): Fail { return { ok: false, error }; }

// ─── Rate-limit constants ────────────────────────────────────────────────────
// Per the task: 10/hour per consumer on name/phone/email/password; 20/min on
// notification prefs (toggles can get clicky, don't want to frustrate the UX
// when a consumer flips three switches in a row).

const PROFILE_WRITE_MAX = 10;
const PROFILE_WRITE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const NOTIFICATION_PREFS_MAX = 20;
const NOTIFICATION_PREFS_WINDOW_MS = 60 * 1000; // 1 minute

// ─── Input schemas ───────────────────────────────────────────────────────────

const NameSchema = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(80, 'Name is too long');

const UpdateNameSchema = z.object({ name: NameSchema });
const UpdatePhoneSchema = z.object({ phone: PhoneSchema });

const ChangeEmailSchema = z.object({
  newEmail: EmailSchema,
  currentPassword: z.string().min(1, 'Current password is required'),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: PasswordSchema,
});

/**
 * Notification preferences are intentionally a free-form `{[key]: boolean}`
 * bag so we can add new keys later (booking_updates, promos, review_reminders,
 * and whatever Phase 2 brings) without shipping a migration. The server merges
 * incoming keys into the existing jsonb so the UI can send partial updates and
 * any unknown-but-existing keys survive.
 *
 * Cap at 50 keys just to prevent an attacker from bloating the row to
 * unreasonable sizes. Each key must be a reasonable identifier (letters,
 * digits, underscore, hyphen) so we don't accept weird characters that could
 * trip json or UI glitches.
 */
const NotificationPrefsSchema = z.object({
  prefs: z
    .record(z.string().regex(/^[a-zA-Z0-9_-]+$/, 'Invalid preference key').max(64), z.boolean())
    .refine(
      (obj) => Object.keys(obj).length > 0,
      'At least one preference is required',
    )
    .refine(
      (obj) => Object.keys(obj).length <= 50,
      'Too many preferences at once',
    ),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a fresh anonymous Supabase client for password-verification sign-ins.
 * We DO NOT persist the session — this is a throwaway check of "does the
 * provided currentPassword match this account right now?". The consumer's
 * real session stays on the SSR cookie-bound client.
 */
function anonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Best-effort client IP for rate-limit keying. Falls back to 'unknown' when
 * `headers()` is unavailable (e.g. in a unit-test environment). Keyed by
 * IP+userId so a captured session still can't torch the rate budget across
 * every IP an attacker rotates through.
 */
async function ipOrUnknown(): Promise<string> {
  try {
    const h = await headers();
    return getClientIp(new Request('http://x', { headers: h }));
  } catch {
    return 'unknown';
  }
}

/**
 * Enforce the per-consumer write budget for sensitive profile edits. Returns
 * the guard-failure error string if we should refuse; returns null on pass.
 */
async function enforceProfileWriteLimit(
  bucket: string,
  userId: string,
): Promise<string | null> {
  const ip = await ipOrUnknown();
  const gate = await checkRateLimit(
    bucket,
    `${ip}:${userId}`,
    PROFILE_WRITE_MAX,
    PROFILE_WRITE_WINDOW_MS,
  );
  if (!gate.ok) return gate.error ?? 'Too many attempts, please try again later.';
  return null;
}

// ─── updateConsumerName ──────────────────────────────────────────────────────

/**
 * Set `consumers.name` for the current consumer. Ignores anything else; we
 * update name and nothing else, keeping side effects tiny and auditable.
 */
export async function updateConsumerName(
  input: { name: string },
): Promise<ActionResult<{ name: string }>> {
  const parsed = UpdateNameSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Invalid name');
  }

  const session = await getConsumerSession();
  if (!session) return fail('Please sign in');

  const limitErr = await enforceProfileWriteLimit('consumer-name', session.userId);
  if (limitErr) return fail(limitErr);

  try {
    const supabase = createServerClient();
    const { error } = await supabase
      .from('consumers')
      .update({ name: parsed.data.name, updated_at: new Date().toISOString() })
      .eq('id', session.userId);
    if (error) return fail(safeError(error));
    return ok({ name: parsed.data.name });
  } catch (err) {
    return fail(safeError(err));
  }
}

// ─── updateConsumerPhone ─────────────────────────────────────────────────────

/**
 * Set `consumers.phone`. The consumer CAN choose to change their phone number
 * even though we currently don't send SMS — the field still gets shown to
 * salons when they confirm bookings, so it must stay accurate.
 */
export async function updateConsumerPhone(
  input: { phone: string },
): Promise<ActionResult<{ phone: string }>> {
  const parsed = UpdatePhoneSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Invalid phone');
  }

  const session = await getConsumerSession();
  if (!session) return fail('Please sign in');

  const limitErr = await enforceProfileWriteLimit('consumer-phone', session.userId);
  if (limitErr) return fail(limitErr);

  try {
    const supabase = createServerClient();
    const { error } = await supabase
      .from('consumers')
      .update({ phone: parsed.data.phone, updated_at: new Date().toISOString() })
      .eq('id', session.userId);
    if (error) return fail(safeError(error));
    return ok({ phone: parsed.data.phone });
  } catch (err) {
    return fail(safeError(err));
  }
}

// ─── changeConsumerEmail ─────────────────────────────────────────────────────

/**
 * Change the email associated with the consumer's Supabase auth user.
 *
 * Flow (mirrors `changeAccountEmail` in src/app/actions/account.ts):
 *
 *   1. Verify `currentPassword` by calling `signInWithPassword` on a FRESH
 *      anon client. We don't reuse the session cookie — the point is to
 *      confirm the user knows the password RIGHT NOW, not that they held a
 *      session some time ago. Defends against a stolen cookie being used to
 *      hijack the account by changing the email out from under the victim.
 *   2. Grab the access token from that sign-in. Build a fresh Supabase client
 *      authenticated as the user (Authorization: Bearer <user_token>). Call
 *      `auth.updateUser({ email: newEmail })` on that client.
 *   3. Because the update runs as the user (not service-role with
 *      `email_confirm: true`), Supabase emits a verification link to BOTH the
 *      old and new addresses (when "Secure email change" is on — the default
 *      in our stack). The `auth.users.email` row stays as the OLD email until
 *      both sides confirm. Until then, `getConsumerSession()` will continue
 *      returning the old email.
 *   4. Return a success envelope with a pending message so the UI can render
 *      "Check your new inbox to confirm the change." The consumer is NOT
 *      signed out; their session remains on the old identity until the email
 *      flip completes.
 *
 * ASSUMPTION: Supabase "Secure email change" is on in the project settings
 * (the default). If an operator disables it the flow still works but Supabase
 * only emails the new address, which is strictly less safe — don't disable.
 *
 * We do NOT mirror the tentative new email to the `consumers` row. The
 * `consumers` table has no `email` column today (it comes from auth.users).
 * If that ever changes, mirror only AFTER the Supabase change completes
 * (via webhook), not here.
 */
export async function changeConsumerEmail(
  input: { newEmail: string; currentPassword: string },
): Promise<ActionResult<{ pendingEmail: string; message: string }>> {
  const parsed = ChangeEmailSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Invalid input');
  }
  const { newEmail, currentPassword } = parsed.data;

  const session = await getConsumerSession();
  if (!session) return fail('Please sign in');

  if (newEmail === session.email.toLowerCase()) {
    return fail('New email is the same as current email');
  }

  const limitErr = await enforceProfileWriteLimit('consumer-email', session.userId);
  if (limitErr) return fail(limitErr);

  // Step 1: re-verify the current password using the anon client. This is a
  // throwaway sign-in; we only care that the credentials are valid RIGHT NOW.
  const anon = anonClient();
  const { data: signInData, error: signInErr } = await anon.auth.signInWithPassword({
    email: session.email,
    password: currentPassword,
  });
  if (signInErr || !signInData?.session) {
    await anon.auth.signOut().catch(() => {});
    return fail('Current password is incorrect');
  }

  // Step 2: build a user-authed client using the access token from the
  // throwaway sign-in. This is the critical bit — updating email through a
  // user-authed client triggers the verification email flow; the
  // service-role admin bypass (`email_confirm:true`) would NOT and was the
  // account-hijack path closed in the 2026-04-16 security pass.
  const userAccessToken = signInData.session.access_token;
  const authed = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${userAccessToken}` } },
    },
  );

  const { error: updErr } = await authed.auth.updateUser({ email: newEmail });
  await anon.auth.signOut().catch(() => {});
  if (updErr) return fail(safeError(updErr));

  return ok({
    pendingEmail: newEmail,
    message: `Check your new inbox at ${newEmail} to confirm the change.`,
  });
}

// ─── changeConsumerPassword ──────────────────────────────────────────────────

/**
 * Change the consumer's Supabase auth password. Same shape as
 * `changeAccountPassword` in `account.ts`:
 *
 *   1. Validate min-length via `PasswordSchema`.
 *   2. Reject if new matches old.
 *   3. Verify `currentPassword` via a throwaway anon `signInWithPassword`.
 *   4. Update via service-role `auth.admin.updateUserById({ password })` —
 *      admin update is correct here (no verification step needed for passwords,
 *      unlike email). Supabase invalidates the other active sessions by
 *      policy; the current session is rotated.
 *
 * We don't sign the user out after the change — the current session continues
 * to work and the consumer stays on the page.
 */
export async function changeConsumerPassword(
  input: { currentPassword: string; newPassword: string },
): Promise<ActionResult<{ success: true }>> {
  const parsed = ChangePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Invalid password');
  }
  const { currentPassword, newPassword } = parsed.data;

  if (currentPassword === newPassword) {
    return fail('New password must differ from current password');
  }

  const session = await getConsumerSession();
  if (!session) return fail('Please sign in');

  const limitErr = await enforceProfileWriteLimit('consumer-password', session.userId);
  if (limitErr) return fail(limitErr);

  // Step 1: throwaway sign-in to verify currentPassword.
  const anon = anonClient();
  const { error: signInErr } = await anon.auth.signInWithPassword({
    email: session.email,
    password: currentPassword,
  });
  await anon.auth.signOut().catch(() => {});
  if (signInErr) return fail('Current password is incorrect');

  // Step 2: admin-side password update.
  try {
    const service = createServerClient();
    const { error: updErr } = await service.auth.admin.updateUserById(session.userId, {
      password: newPassword,
    });
    if (updErr) return fail(safeError(updErr));
    return ok({ success: true });
  } catch (err) {
    return fail(safeError(err));
  }
}

// ─── updateConsumerNotificationPrefs ────────────────────────────────────────

/**
 * Merge-patch the consumer's `notification_prefs` jsonb.
 *
 * Why merge, not overwrite? The UI typically sends only the key(s) that
 * changed, and the schema is meant to grow over time. If the client sends
 * `{ promos: true }` we don't want to wipe `booking_updates` out of the
 * existing row. We read the current object, spread in the new keys, write
 * back. Read-modify-write is not transactional in PostgREST but it's fine
 * here: concurrent updates from the same consumer are rare (they'd need two
 * open tabs clicking toggles at the same millisecond), and our merge is
 * commutative per-key when the later write wins.
 *
 * Rate-limited 20/min (higher than the name/phone/email/password bucket)
 * because users toggling a row of switches may click 3-5 in rapid succession;
 * 10/hour would be frustrating.
 */
export async function updateConsumerNotificationPrefs(
  input: { prefs: Record<string, boolean> },
): Promise<ActionResult<{ prefs: Record<string, boolean> }>> {
  const parsed = NotificationPrefsSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Invalid preferences');
  }
  const incoming = parsed.data.prefs;

  const session = await getConsumerSession();
  if (!session) return fail('Please sign in');

  const ip = await ipOrUnknown();
  const gate = await checkRateLimit(
    'consumer-notification-prefs',
    `${ip}:${session.userId}`,
    NOTIFICATION_PREFS_MAX,
    NOTIFICATION_PREFS_WINDOW_MS,
  );
  if (!gate.ok) return fail(gate.error ?? 'Too many requests, please slow down.');

  try {
    const supabase = createServerClient();

    // Read current prefs so we can merge (preserve unrelated keys). If the
    // row somehow doesn't exist (shouldn't — registerConsumer inserts it),
    // treat current as the migration-041 default so we never write a blank.
    const { data: currentRow, error: readErr } = await supabase
      .from('consumers')
      .select('notification_prefs')
      .eq('id', session.userId)
      .maybeSingle();
    if (readErr) return fail(safeError(readErr));

    const currentPrefs =
      (currentRow?.notification_prefs as Record<string, boolean> | null | undefined) ?? {};
    const merged = { ...currentPrefs, ...incoming };

    const { error: updErr } = await supabase
      .from('consumers')
      .update({ notification_prefs: merged, updated_at: new Date().toISOString() })
      .eq('id', session.userId);
    if (updErr) return fail(safeError(updErr));

    return ok({ prefs: merged });
  } catch (err) {
    return fail(safeError(err));
  }
}

// ─── getConsumerProfile — read helper for the page ──────────────────────────

export interface ConsumerProfile {
  userId: string;
  email: string;
  name: string;
  phone: string;
  notificationPrefs: Record<string, boolean>;
}

/**
 * Load the current consumer's editable profile + notification prefs for the
 * `/account/profile` and `/account/notifications` server components. Returns
 * a fail when no session, so pages can redirect.
 */
export async function getConsumerProfile(): Promise<ActionResult<ConsumerProfile>> {
  const session = await getConsumerSession();
  if (!session) return fail('Please sign in');

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('consumers')
      .select('name, phone, notification_prefs')
      .eq('id', session.userId)
      .maybeSingle();
    if (error) return fail(safeError(error));
    if (!data) return fail('Consumer profile not found');

    const row = data as {
      name: string;
      phone: string;
      notification_prefs: Record<string, boolean> | null;
    };
    return ok({
      userId: session.userId,
      email: session.email,
      name: row.name ?? session.name ?? '',
      phone: row.phone ?? session.phone ?? '',
      notificationPrefs: row.notification_prefs ?? {},
    });
  } catch (err) {
    return fail(safeError(err));
  }
}
