'use server';

import { z } from 'zod';
import { createServerClient } from '@/lib/supabase';
import { requireAdminRole } from './auth';
import { safeError } from '@/lib/action-error';
import { checkRateLimit } from '@/lib/with-rate-limit';
import { BUCKETS } from '@/lib/rate-limit-buckets';

// ═══════════════════════════════════════════════════════════════════════════
// Super-admin platform settings.
//
// Generic JSONB key/value bag seeded by migration 041 with a single row,
// `marketplace_women_enabled` (defaults to false). When flipped to true the
// consumer marketplace directory begins including branches with
// gender_type IN ('women','mixed'). For now launch is men-only, and only
// super_admin can toggle the flag from /admin/marketplace/settings.
//
// NOTE: a legacy getPlatformSettings / savePlatformSetting lives in
// `admin-settings.ts` for the subscription-plans / payment / email blob —
// those return the value shape per-key as a nested Record. This file stays
// separate so the generic platform-flag UX has its own typed surface
// (row-oriented, includes description + updated_at + updated_by) and so the
// super_admin-only route isn't gated behind the super_admin+technical_support
// allow-list the legacy actions use.
// ═══════════════════════════════════════════════════════════════════════════

export interface PlatformSettingRow {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
}

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [k: string]: JsonValue }
  | JsonValue[];

// Accept any JSON-safe value. We store the raw JSON in `value jsonb` — for
// the single seeded flag this is always a boolean, but the generic bag is
// schemaless so future flags can be objects/arrays without a migration.
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

// Keys are controlled by migrations (row is inserted there, not created
// ad-hoc at runtime). Restrict shape so a crafted call can't spray garbage
// rows into the table — any new flag starts with a migration adding the
// seed row.
const updateInputSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(80)
    .regex(
      /^[a-z][a-z0-9_]*$/,
      'Key must be lowercase snake_case (a-z, 0-9, _)',
    ),
  value: jsonValueSchema,
});

/**
 * List every platform_settings row. super_admin-only — sub-roles shouldn't
 * need to read launch-gate flags and this keeps the surface minimal.
 */
export async function getPlatformSettings(): Promise<{
  data: PlatformSettingRow[];
  error: string | null;
}> {
  try {
    await requireAdminRole(['super_admin']);
  } catch (e) {
    return { data: [], error: safeError(e) };
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('platform_settings')
    .select('key, value, description, updated_at, updated_by')
    .order('key', { ascending: true });

  if (error) return { data: [], error: safeError(error) };
  return { data: (data || []) as PlatformSettingRow[], error: null };
}

/**
 * Flip a single platform_settings row. super_admin-only, rate-limited, and
 * every successful update appends a row to `admin_audit_log` with
 * action='platform_setting_update' and metadata {key, old_value, new_value}.
 *
 * The row MUST already exist — migrations own row creation. A missing key
 * returns an error rather than silently inserting, so typos don't turn into
 * live (but unused) flag rows.
 */
export async function updatePlatformSetting(
  key: string,
  value: JsonValue,
): Promise<{ error: string | null }> {
  const session = await requireAdminRole(['super_admin']);

  // Rate-limit per admin: toggling a launch-gate flag is a low-frequency
  // operation. GENERIC_WRITE's 60/min/user is generous but catches a runaway
  // script or compromised admin session pounding the endpoint.
  const rl = await checkRateLimit(
    'platform-setting-update',
    session.staffId,
    BUCKETS.GENERIC_WRITE.max,
    BUCKETS.GENERIC_WRITE.windowMs,
  );
  if (!rl.ok) {
    return { error: rl.error ?? 'Too many requests, please try again later.' };
  }

  const parsed = updateInputSchema.safeParse({ key, value });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Invalid input' };
  }

  const supabase = createServerClient();

  // Fetch the current value so we can (a) confirm the row exists and (b)
  // record old_value in the audit log metadata.
  const { data: existing, error: fetchErr } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', parsed.data.key)
    .maybeSingle();
  if (fetchErr) return { error: safeError(fetchErr) };
  if (!existing) {
    return {
      error: `Unknown platform setting '${parsed.data.key}' — new flags must be seeded by a migration.`,
    };
  }

  const oldValue = existing.value as JsonValue;
  const newValue = parsed.data.value;

  const { error: updErr } = await supabase
    .from('platform_settings')
    .update({
      value: newValue,
      updated_at: new Date().toISOString(),
      updated_by: session.staffId,
    })
    .eq('key', parsed.data.key);
  if (updErr) return { error: safeError(updErr) };

  // Audit log write is best-effort-but-logged — the flag flip already
  // committed, so don't fail the caller if the audit insert trips. Surface
  // the error in logs for the operator.
  const { error: auditErr } = await supabase.from('admin_audit_log').insert({
    admin_auth_user_id: session.staffId,
    action: 'platform_setting_update',
    target_table: 'platform_settings',
    // admin_audit_log.target_id is uuid; platform_settings PK is text, so
    // we leave target_id null and put the key in metadata instead.
    target_id: null,
    metadata: {
      key: parsed.data.key,
      old_value: oldValue,
      new_value: newValue,
    },
  });
  if (auditErr) {
     
    console.error('[platform-settings] audit log insert failed', auditErr);
  }

  return { error: null };
}
