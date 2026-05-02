'use server';

// Replacements for supabase.auth.admin.* calls. All mutate auth.users directly
// via the @/lib/pg pool. Result shapes mirror the Supabase Admin API just
// enough so existing call sites need only the import swap, not destructuring
// changes.
//
// Auth.users column reference (GoTrue-managed schema, untouched on disk):
//   id uuid pk
//   instance_id uuid (always 00000000-...)
//   aud text ('authenticated')
//   role text ('authenticated')
//   email text
//   encrypted_password text (bcrypt; verified by Postgres crypt())
//   email_confirmed_at timestamptz
//   confirmation_token text   recovery_token text
//   confirmation_sent_at timestamptz   recovery_sent_at timestamptz
//   raw_app_meta_data jsonb   raw_user_meta_data jsonb
//   created_at / updated_at / deleted_at timestamptz

import { pool } from '@/lib/pg';
import { randomBytes, randomUUID } from 'crypto';

export interface AdminUser {
  id: string;
  email: string;
  email_confirmed_at: string | null;
  user_metadata: Record<string, unknown>;
  app_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
type AdminError = { message: string; status?: number };
type AdminResult<T> = { data: T; error: null } | { data: null; error: AdminError };

interface AuthRow {
  id: string;
  email: string;
  email_confirmed_at: Date | null;
  raw_user_meta_data: Record<string, unknown> | null;
  raw_app_meta_data: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

function rowToUser(r: AuthRow): AdminUser {
  return {
    id: r.id,
    email: r.email,
    email_confirmed_at: r.email_confirmed_at ? r.email_confirmed_at.toISOString() : null,
    user_metadata: r.raw_user_meta_data ?? {},
    app_metadata: r.raw_app_meta_data ?? {},
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
  };
}

function generateOtp(): string {
  return String(randomBytes(3).readUIntBE(0, 3) % 1_000_000).padStart(6, '0');
}

// --- createUser -----------------------------------------------------------

export interface CreateUserInput {
  email: string;
  password: string;
  email_confirm?: boolean;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}

export async function createUser(input: CreateUserInput): Promise<AdminResult<{ user: AdminUser }>> {
  const email = input.email.trim().toLowerCase();
  if (!email || !input.password) {
    return { data: null, error: { message: 'email and password required', status: 400 } };
  }

  // Check for existing user — mirror GoTrue's "User already registered" error.
  const existing = await pool.query<{ id: string }>(`SELECT id FROM auth.users WHERE email = $1 LIMIT 1`, [email]);
  if (existing.rows[0]) {
    return { data: null, error: { message: 'User already registered', status: 422 } };
  }

  const userId = randomUUID();
  const userMeta = JSON.stringify(input.user_metadata ?? {});
  const appMeta = JSON.stringify(input.app_metadata ?? { provider: 'email', providers: ['email'] });
  const confirmAt = input.email_confirm ? 'now()' : 'NULL';

  const { rows } = await pool.query<AuthRow>(
    `INSERT INTO auth.users (
       id, instance_id, aud, role, email,
       encrypted_password,
       email_confirmed_at,
       raw_user_meta_data, raw_app_meta_data,
       created_at, updated_at
     ) VALUES (
       $1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2,
       crypt($3, gen_salt('bf', 10)),
       ${confirmAt},
       $4::jsonb, $5::jsonb,
       now(), now()
     )
     RETURNING id, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at`,
    [userId, email, input.password, userMeta, appMeta],
  );

  // Mirror the auth.identities row GoTrue creates so SSO/identity FKs work.
  await pool.query(
    `INSERT INTO auth.identities (
       id, user_id, provider_id, provider, identity_data,
       last_sign_in_at, created_at, updated_at
     ) VALUES (
       $1, $1, $1::text, 'email',
       jsonb_build_object('sub', $1::text, 'email', $2::text, 'email_verified', $3::boolean),
       now(), now(), now()
     ) ON CONFLICT DO NOTHING`,
    [userId, email, !!input.email_confirm],
  );

  return { data: { user: rowToUser(rows[0]) }, error: null };
}

// --- getUserById ---------------------------------------------------------

export async function getUserById(id: string): Promise<AdminResult<{ user: AdminUser }>> {
  if (!id) return { data: null, error: { message: 'id required', status: 400 } };
  const { rows } = await pool.query<AuthRow>(
    `SELECT id, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at
       FROM auth.users WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [id],
  );
  const row = rows[0];
  if (!row) return { data: null, error: { message: 'user not found', status: 404 } };
  return { data: { user: rowToUser(row) }, error: null };
}

// --- deleteUser ----------------------------------------------------------

export async function deleteUser(id: string): Promise<{ error: AdminError | null }> {
  if (!id) return { error: { message: 'id required', status: 400 } };
  // Hard delete to match GoTrue's default. auth.identities/sessions cascade.
  const r = await pool.query(`DELETE FROM auth.users WHERE id = $1`, [id]);
  if (r.rowCount === 0) return { error: { message: 'user not found', status: 404 } };
  return { error: null };
}

// --- updateUserById ------------------------------------------------------

export interface UpdateUserAttrs {
  email?: string;
  password?: string;
  email_confirm?: boolean;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}

export async function updateUserById(id: string, attrs: UpdateUserAttrs): Promise<AdminResult<{ user: AdminUser }>> {
  if (!id) return { data: null, error: { message: 'id required', status: 400 } };

  const sets: string[] = [];
  const vals: unknown[] = [id];
  let p = 2;

  if (attrs.email !== undefined) {
    sets.push(`email = $${p++}`);
    vals.push(attrs.email.trim().toLowerCase());
  }
  if (attrs.password !== undefined) {
    sets.push(`encrypted_password = crypt($${p++}, gen_salt('bf', 10))`);
    vals.push(attrs.password);
  }
  if (attrs.email_confirm) {
    sets.push(`email_confirmed_at = COALESCE(email_confirmed_at, now())`);
  }
  if (attrs.user_metadata !== undefined) {
    sets.push(`raw_user_meta_data = $${p++}::jsonb`);
    vals.push(JSON.stringify(attrs.user_metadata));
  }
  if (attrs.app_metadata !== undefined) {
    sets.push(`raw_app_meta_data = $${p++}::jsonb`);
    vals.push(JSON.stringify(attrs.app_metadata));
  }
  if (sets.length === 0) return getUserById(id);

  sets.push(`updated_at = now()`);

  const { rows } = await pool.query<AuthRow>(
    `UPDATE auth.users SET ${sets.join(', ')} WHERE id = $1
       RETURNING id, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at`,
    vals,
  );
  const row = rows[0];
  if (!row) return { data: null, error: { message: 'user not found', status: 404 } };
  return { data: { user: rowToUser(row) }, error: null };
}

// --- listUsers -----------------------------------------------------------

export interface ListUsersOptions {
  page?: number;
  perPage?: number;
}

export async function listUsers(opts: ListUsersOptions = {}): Promise<AdminResult<{ users: AdminUser[] }>> {
  const perPage = Math.min(opts.perPage ?? 1000, 5000);
  const offset = ((opts.page ?? 1) - 1) * perPage;
  const { rows } = await pool.query<AuthRow>(
    `SELECT id, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at
       FROM auth.users WHERE deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
    [perPage, offset],
  );
  return { data: { users: rows.map(rowToUser) }, error: null };
}

// --- generateLink --------------------------------------------------------
//
// GoTrue's generateLink for type='recovery' / 'invite' / 'magiclink' returns
// a URL with embedded token that the frontend opens. We mirror the same
// outer shape: { data: { properties: { action_link } } }. The token format
// we issue is a 6-digit OTP appended as a query param — the iCut
// reset-password page reads ?token=&email= and validates via verifyOtp().

export type LinkType = 'recovery' | 'invite' | 'magiclink' | 'signup';

export interface GenerateLinkInput {
  type: LinkType;
  email: string;
  password?: string;             // for type='invite' or 'signup' if creating
  options?: { redirectTo?: string };
}

export interface GenerateLinkResult {
  properties: {
    action_link: string;
    email_otp: string;
    hashed_token: string;
    redirect_to: string;
    verification_type: LinkType;
  };
  user: AdminUser;
}

export async function generateLink(input: GenerateLinkInput): Promise<AdminResult<GenerateLinkResult>> {
  const email = input.email.trim().toLowerCase();
  if (!email) return { data: null, error: { message: 'email required', status: 400 } };

  // Find or create the user depending on type.
  let user: AdminUser;
  const existing = await pool.query<AuthRow>(
    `SELECT id, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at
       FROM auth.users WHERE email = $1 AND deleted_at IS NULL LIMIT 1`,
    [email],
  );
  if (existing.rows[0]) {
    user = rowToUser(existing.rows[0]);
  } else {
    if (input.type === 'recovery' || input.type === 'magiclink') {
      return { data: null, error: { message: 'user not found', status: 404 } };
    }
    // invite / signup — create the user (no password unless caller supplied one)
    const created = await createUser({ email, password: input.password ?? randomUUID(), email_confirm: false });
    if (created.error) return { data: null, error: created.error };
    user = created.data.user;
  }

  const token = generateOtp();
  const tokenColumn = input.type === 'recovery' ? 'recovery_token' : 'confirmation_token';
  const sentAtColumn = input.type === 'recovery' ? 'recovery_sent_at' : 'confirmation_sent_at';

  await pool.query(
    `UPDATE auth.users SET ${tokenColumn} = $2, ${sentAtColumn} = now(), updated_at = now() WHERE id = $1`,
    [user.id, token],
  );

  const baseUrl = input.options?.redirectTo
    ?? process.env.NEXT_PUBLIC_APP_URL
    ?? 'https://icut.pk';
  // Token + email as query params; reset-password page calls verifyOtp().
  const url = new URL(baseUrl);
  url.searchParams.set('token', token);
  url.searchParams.set('email', email);
  url.searchParams.set('type', input.type);

  return {
    data: {
      properties: {
        action_link: url.toString(),
        email_otp: token,
        hashed_token: token,
        redirect_to: baseUrl,
        verification_type: input.type,
      },
      user,
    },
    error: null,
  };
}
