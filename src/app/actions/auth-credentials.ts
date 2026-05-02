'use server';

// Replacements for the 5 supabase.auth.* calls in src/app/login/page.tsx.
// Uses direct SQL against auth.users + Resend API for email delivery, no
// PostgREST or GoTrue. Existing bcrypt hashes from GoTrue stay valid because
// Postgres' crypt() function verifies against them natively.
//
// What's NOT in this file (intentional, comes later):
//   - admin auth.* (createUser/getUserById/listUsers/etc.) — separate file
//   - JWT / session cookies — those still go through @/app/actions/auth's
//     existing signSession() which we're keeping
//   - email templates — kept inline for now, will move to email-templates.ts

import { pool } from '@/lib/pg';
import { headers } from 'next/headers';
import { randomBytes, randomUUID } from 'crypto';
import { checkRateLimit } from '@/lib/with-rate-limit';
import { BUCKETS } from '@/lib/rate-limit-buckets';
import { getClientIp } from '@/lib/rate-limit';

async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    return getClientIp(new Request('http://x', { headers: h }));
  } catch {
    return 'unknown';
  }
}

// Result shape kept compatible with what supabase.auth returned, so the
// callsites in login/page.tsx need minimal restructuring.
export interface AuthUser {
  id: string;
  email: string;
  email_confirmed_at: string | null;
}
export type AuthResult =
  | { data: { user: AuthUser }; error: null }
  | { data: { user: null }; error: { message: string; status?: number } };

// --- Resend ----------------------------------------------------------------

interface EmailConfig {
  fromEmail: string;
  fromName: string;
  resendKey: string;
  appUrl: string;
}

async function loadEmailConfig(): Promise<EmailConfig | null> {
  // Read from platform_settings via direct PG (bypasses supabase entirely).
  const { rows } = await pool.query<{ value: { fromEmail?: string; fromName?: string; resendKey?: string; enabled?: boolean } }>(
    `SELECT value FROM public.platform_settings WHERE key = 'email' LIMIT 1`,
  );
  const settings = rows[0]?.value;
  if (!settings?.enabled || !settings.resendKey || !settings.fromEmail) return null;
  return {
    fromEmail: settings.fromEmail,
    fromName: settings.fromName ?? 'iCut',
    resendKey: settings.resendKey,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'https://icut.pk',
  };
}

async function sendEmail(cfg: EmailConfig, to: string, subject: string, html: string): Promise<{ ok: boolean; error: string | null }> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${cfg.fromName} <${cfg.fromEmail}>`,
        to,
        subject,
        html,
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      return { ok: false, error: `Resend ${res.status}: ${txt.slice(0, 200)}` };
    }
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'fetch failed' };
  }
}

// --- 6-digit OTP token (matches GoTrue's email_change/confirmation flow) ---

function generateOtp(): string {
  // Cryptographically random 6-digit code, leading zeros preserved.
  return String(randomBytes(3).readUIntBE(0, 3) % 1_000_000).padStart(6, '0');
}

// --- 1. signInWithPassword -------------------------------------------------

export async function signInWithPassword(input: { email: string; password: string }): Promise<AuthResult> {
  const ip = await clientIp();
  const rl = await checkRateLimit('login', `${ip}:${input.email.toLowerCase()}`, BUCKETS.LOGIN_ATTEMPTS.max, BUCKETS.LOGIN_ATTEMPTS.windowMs);
  if (!rl.ok) {
    return { data: { user: null }, error: { message: rl.error ?? 'Too many attempts', status: 429 } };
  }

  const email = input.email.trim().toLowerCase();
  // crypt(plain, encrypted_password) returns the encrypted_password if and
  // only if the plaintext matches. This is GoTrue's bcrypt convention.
  const { rows } = await pool.query<{ id: string; email: string; email_confirmed_at: Date | null; matched: boolean }>(
    `SELECT id, email, email_confirmed_at,
            (encrypted_password = crypt($2, encrypted_password)) AS matched
       FROM auth.users
      WHERE email = $1
        AND deleted_at IS NULL
      LIMIT 1`,
    [email, input.password],
  );
  const row = rows[0];
  if (!row || !row.matched) {
    return { data: { user: null }, error: { message: 'Invalid login credentials', status: 400 } };
  }

  return {
    data: {
      user: {
        id: row.id,
        email: row.email,
        email_confirmed_at: row.email_confirmed_at ? row.email_confirmed_at.toISOString() : null,
      },
    },
    error: null,
  };
}

// --- 2. signUp -------------------------------------------------------------

export async function signUp(input: { email: string; password: string }): Promise<AuthResult> {
  const ip = await clientIp();
  const rl = await checkRateLimit('signup', ip, BUCKETS.SIGNUP.max, BUCKETS.SIGNUP.windowMs);
  if (!rl.ok) {
    return { data: { user: null }, error: { message: rl.error ?? 'Too many signup attempts', status: 429 } };
  }

  const email = input.email.trim().toLowerCase();
  if (input.password.length < 10) {
    return { data: { user: null }, error: { message: 'Password must be at least 10 characters', status: 400 } };
  }

  // Check existing — GoTrue would either resend the confirmation if the
  // user is unconfirmed, or refuse if confirmed. Mirror that behaviour.
  const existing = await pool.query<{ id: string; email_confirmed_at: Date | null }>(
    `SELECT id, email_confirmed_at FROM auth.users WHERE email = $1 LIMIT 1`,
    [email],
  );
  if (existing.rows[0]?.email_confirmed_at) {
    return { data: { user: null }, error: { message: 'User already registered', status: 400 } };
  }

  let userId: string;
  let confirmationToken: string;
  if (existing.rows[0]) {
    // Unconfirmed retry — reset the password + new OTP.
    userId = existing.rows[0].id;
    confirmationToken = generateOtp();
    await pool.query(
      `UPDATE auth.users
          SET encrypted_password = crypt($2, gen_salt('bf', 10)),
              confirmation_token = $3,
              confirmation_sent_at = now(),
              updated_at = now()
        WHERE id = $1`,
      [userId, input.password, confirmationToken],
    );
  } else {
    // Fresh user. Mirror GoTrue's auth.users row shape.
    userId = randomUUID();
    confirmationToken = generateOtp();
    await pool.query(
      `INSERT INTO auth.users (
         id, instance_id, aud, role, email,
         encrypted_password,
         confirmation_token, confirmation_sent_at,
         created_at, updated_at,
         raw_app_meta_data, raw_user_meta_data
       ) VALUES (
         $1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2,
         crypt($3, gen_salt('bf', 10)),
         $4, now(),
         now(), now(),
         '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
       )`,
      [userId, email, input.password, confirmationToken],
    );
    // GoTrue also writes a row into auth.identities — needed for some FK
    // constraints + future SSO. Keep parity.
    await pool.query(
      `INSERT INTO auth.identities (
         id, user_id, provider_id, provider, identity_data,
         last_sign_in_at, created_at, updated_at
       ) VALUES (
         $1, $1, $1::text, 'email',
         jsonb_build_object('sub', $1::text, 'email', $2::text, 'email_verified', false),
         now(), now(), now()
       ) ON CONFLICT DO NOTHING`,
      [userId, email],
    );
  }

  // Send the confirmation email out-of-band; never let email failure block
  // the signup flow itself (GoTrue behaved the same).
  const cfg = await loadEmailConfig();
  if (cfg) {
    void sendEmail(cfg, email, 'Your iCut verification code', renderConfirmationEmail(confirmationToken));
  }

  return {
    data: { user: { id: userId, email, email_confirmed_at: null } },
    error: null,
  };
}

// --- 3. resend confirmation -----------------------------------------------

export async function resendConfirmation(email: string): Promise<{ error: { message: string } | null }> {
  const ip = await clientIp();
  const rl = await checkRateLimit('signup-resend', `${ip}:${email.toLowerCase()}`, BUCKETS.SIGNUP.max, BUCKETS.SIGNUP.windowMs);
  if (!rl.ok) {
    return { error: { message: rl.error ?? 'Too many resend attempts' } };
  }

  const lower = email.trim().toLowerCase();
  const { rows } = await pool.query<{ id: string; email_confirmed_at: Date | null }>(
    `SELECT id, email_confirmed_at FROM auth.users WHERE email = $1 LIMIT 1`,
    [lower],
  );
  const user = rows[0];
  if (!user) return { error: null };                // don't leak whether the email exists
  if (user.email_confirmed_at) return { error: null };

  const token = generateOtp();
  await pool.query(
    `UPDATE auth.users
        SET confirmation_token = $2, confirmation_sent_at = now(), updated_at = now()
      WHERE id = $1`,
    [user.id, token],
  );

  const cfg = await loadEmailConfig();
  if (cfg) {
    void sendEmail(cfg, lower, 'Your iCut verification code', renderConfirmationEmail(token));
  }
  return { error: null };
}

// --- 4. verify OTP ---------------------------------------------------------

export async function verifyOtp(input: { email: string; token: string; type: 'signup' | 'recovery' }): Promise<AuthResult> {
  const ip = await clientIp();
  const rl = await checkRateLimit('verify-otp', `${ip}:${input.email.toLowerCase()}`, BUCKETS.LOGIN_ATTEMPTS.max, BUCKETS.LOGIN_ATTEMPTS.windowMs);
  if (!rl.ok) {
    return { data: { user: null }, error: { message: rl.error ?? 'Too many attempts', status: 429 } };
  }

  const email = input.email.trim().toLowerCase();
  const tokenColumn = input.type === 'recovery' ? 'recovery_token' : 'confirmation_token';
  const sentAtColumn = input.type === 'recovery' ? 'recovery_sent_at' : 'confirmation_sent_at';

  // OTPs are valid for 1 hour. Expired tokens are wiped server-side on use.
  const { rows } = await pool.query<{ id: string; email: string; sent_at: Date | null }>(
    `SELECT id, email, ${sentAtColumn} AS sent_at
       FROM auth.users
      WHERE email = $1
        AND ${tokenColumn} = $2
        AND ${sentAtColumn} > now() - interval '1 hour'
      LIMIT 1`,
    [email, input.token],
  );
  const user = rows[0];
  if (!user) {
    return { data: { user: null }, error: { message: 'Invalid or expired token', status: 400 } };
  }

  // Burn the token + mark email confirmed (signup) or leave password reset to
  // a follow-up updateUser call (recovery).
  if (input.type === 'recovery') {
    await pool.query(
      `UPDATE auth.users
          SET recovery_token = '', recovery_sent_at = NULL, updated_at = now()
        WHERE id = $1`,
      [user.id],
    );
  } else {
    await pool.query(
      `UPDATE auth.users
          SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
              confirmation_token = '',
              confirmation_sent_at = NULL,
              updated_at = now()
        WHERE id = $1`,
      [user.id],
    );
    await pool.query(
      `UPDATE auth.identities
          SET identity_data = jsonb_set(identity_data, '{email_verified}', 'true'::jsonb),
              updated_at = now()
        WHERE user_id = $1 AND provider = 'email'`,
      [user.id],
    );
  }

  return {
    data: { user: { id: user.id, email: user.email, email_confirmed_at: new Date().toISOString() } },
    error: null,
  };
}

// --- 5. password reset (request) ------------------------------------------

export async function resetPasswordForEmail(email: string, opts?: { redirectTo?: string }): Promise<{ error: { message: string } | null }> {
  const ip = await clientIp();
  const rl = await checkRateLimit('password-reset', `${ip}:${email.toLowerCase()}`, BUCKETS.PASSWORD_RESET.max, BUCKETS.PASSWORD_RESET.windowMs);
  if (!rl.ok) {
    return { error: { message: rl.error ?? 'Too many reset attempts' } };
  }

  const lower = email.trim().toLowerCase();
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM auth.users WHERE email = $1 AND deleted_at IS NULL LIMIT 1`,
    [lower],
  );
  const user = rows[0];
  // Always return success — never leak whether the email exists.
  if (!user) return { error: null };

  const token = generateOtp();
  await pool.query(
    `UPDATE auth.users
        SET recovery_token = $2, recovery_sent_at = now(), updated_at = now()
      WHERE id = $1`,
    [user.id, token],
  );

  const cfg = await loadEmailConfig();
  if (cfg) {
    const redirect = opts?.redirectTo ?? `${cfg.appUrl}/login`;
    void sendEmail(cfg, lower, 'Reset your iCut password', renderRecoveryEmail(token, redirect));
  }
  return { error: null };
}

// --- 6. consume recovery token + update password (atomic) -----------------

export async function consumeRecoveryToken(input: { email: string; token: string; newPassword: string }): Promise<{ error: { message: string; status?: number } | null }> {
  const ip = await clientIp();
  const rl = await checkRateLimit('recovery-consume', `${ip}:${input.email.toLowerCase()}`, BUCKETS.LOGIN_ATTEMPTS.max, BUCKETS.LOGIN_ATTEMPTS.windowMs);
  if (!rl.ok) {
    return { error: { message: rl.error ?? 'Too many attempts', status: 429 } };
  }

  const email = input.email.trim().toLowerCase();
  if (input.newPassword.length < 8) {
    return { error: { message: 'Password too short', status: 400 } };
  }

  // Single round-trip: validate token + update password + burn token. The
  // RETURNING ensures we know whether any row matched (i.e. token was valid).
  const { rows } = await pool.query<{ id: string }>(
    `UPDATE auth.users
        SET encrypted_password = crypt($3, gen_salt('bf', 10)),
            recovery_token = '',
            recovery_sent_at = NULL,
            updated_at = now()
      WHERE email = $1
        AND recovery_token = $2
        AND recovery_sent_at > now() - interval '1 hour'
      RETURNING id`,
    [email, input.token, input.newPassword],
  );

  if (rows.length === 0) {
    return { error: { message: 'Invalid or expired reset link', status: 400 } };
  }
  return { error: null };
}

// --- 7. lookup whether email belongs to a sales-agent (for password rules) -

export async function lookupUserKindByEmail(email: string): Promise<{ kind: 'sales_agent' | 'other' | 'unknown' }> {
  const lower = email.trim().toLowerCase();
  const { rows } = await pool.query<{ id: string }>(
    `SELECT u.id
       FROM auth.users u
       JOIN public.sales_agents a ON a.auth_user_id = u.id
      WHERE u.email = $1
      LIMIT 1`,
    [lower],
  );
  if (rows.length > 0) return { kind: 'sales_agent' };
  const u = await pool.query<{ id: string }>(`SELECT id FROM auth.users WHERE email = $1 LIMIT 1`, [lower]);
  return { kind: u.rows[0] ? 'other' : 'unknown' };
}

// --- email templates (will move to email-templates.ts later) ---------------

function renderConfirmationEmail(otp: string): string {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;background:#000;color:#fff;padding:32px;">
    <div style="max-width:480px;margin:0 auto;text-align:center;">
      <h1 style="color:#d4af37;margin:0 0 24px;font-size:24px;">Your iCut verification code</h1>
      <p style="color:#aaa;margin:0 0 32px;">Enter this code to verify your email:</p>
      <div style="font-size:36px;letter-spacing:8px;color:#d4af37;font-family:ui-monospace,monospace;background:#111;padding:24px;border:1px solid #333;display:inline-block;">${otp}</div>
      <p style="color:#666;margin:32px 0 0;font-size:13px;">Code expires in 1 hour. If you didn't request this, ignore the email.</p>
    </div></body></html>`;
}

function renderRecoveryEmail(otp: string, redirect: string): string {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;background:#000;color:#fff;padding:32px;">
    <div style="max-width:480px;margin:0 auto;text-align:center;">
      <h1 style="color:#d4af37;margin:0 0 24px;font-size:24px;">Reset your iCut password</h1>
      <p style="color:#aaa;margin:0 0 32px;">Use this code on the password reset screen:</p>
      <div style="font-size:36px;letter-spacing:8px;color:#d4af37;font-family:ui-monospace,monospace;background:#111;padding:24px;border:1px solid #333;display:inline-block;">${otp}</div>
      <p style="color:#aaa;margin:32px 0 0;font-size:13px;">Or open <a href="${redirect}" style="color:#d4af37;">this link</a> on your phone.</p>
      <p style="color:#666;margin:16px 0 0;font-size:13px;">Code expires in 1 hour. If you didn't request a reset, ignore the email.</p>
    </div></body></html>`;
}
