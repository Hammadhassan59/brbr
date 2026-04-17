'use server';

import { verifySession, checkWriteAccess } from './auth';
import { createServerClient } from '@/lib/supabase';
import {
  requirePermission,
  tenantErrorMessage,
} from '@/lib/tenant-guard';
import {
  PERMISSION_KEYS,
  WILDCARD_PERMISSION,
  type PermissionKey,
} from '@/lib/permissions';

/**
 * Role names seeded into `role_presets` by migration 036 (platform defaults +
 * the per-salon copies the trigger clones). Anything outside this set is
 * rejected before we write — otherwise a typo like `'senior'` would orphan a
 * preset row that no staff.role could ever match.
 */
const ALLOWED_ROLE_NAMES: ReadonlyArray<string> = [
  'owner',
  'manager',
  'receptionist',
  'senior_stylist',
  'junior_stylist',
  'helper',
];

const PERMISSION_KEY_SET: ReadonlySet<string> = new Set<string>([
  ...PERMISSION_KEYS,
  WILDCARD_PERMISSION,
]);

/**
 * Caller must be signed in, own the salon they're editing presets for, and
 * hold `manage_permissions`. The `salonId` parameter is a guard against a
 * stale/forged call from the client — we compare it to the JWT's salonId
 * rather than trusting whichever value the browser sends.
 */
function assertSalonOwned(salonId: string, sessionSalonId: string): void {
  if (!salonId || salonId !== sessionSalonId) {
    throw new Error('FORBIDDEN');
  }
}

/**
 * Upsert the permission map for one role within the caller's salon. The row
 * is keyed by (salon_id, role_name) so repeated calls overwrite cleanly. The
 * platform-default row (salon_id IS NULL) is never touched here — each
 * salon's copy was cloned in by the salons_seed_role_presets trigger.
 */
export async function updateRolePreset(
  salonId: string,
  roleName: string,
  permissions: Record<string, boolean>,
) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { data: null, error: writeCheck.error };
  const session = writeCheck.session;

  try {
    assertSalonOwned(salonId, session.salonId);
    requirePermission(session, 'manage_permissions');
  } catch (e) {
    return { data: null, error: tenantErrorMessage(e) };
  }

  if (!ALLOWED_ROLE_NAMES.includes(roleName)) {
    return { data: null, error: 'Invalid role name' };
  }

  if (!permissions || typeof permissions !== 'object') {
    return { data: null, error: 'Invalid permissions payload' };
  }

  // Validate every key is known AND every value is a boolean. Anything else
  // would land unfiltered in JSONB and eventually mis-gate a permission check.
  const clean: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(permissions)) {
    if (!PERMISSION_KEY_SET.has(k)) {
      return { data: null, error: `Unknown permission key: ${k}` };
    }
    if (typeof v !== 'boolean') {
      return { data: null, error: `Permission value for "${k}" must be boolean` };
    }
    clean[k] = v;
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('role_presets')
    .upsert(
      {
        salon_id: salonId,
        role_name: roleName,
        permissions: clean,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'salon_id,role_name' },
    )
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

/**
 * Write (or clear) a per-staff permission override. `override=null` deletes
 * the override so the row falls back to the role preset; otherwise we store
 * only the keys with explicit boolean grants/denies — `null` values mean
 * "inherit from preset" and are dropped rather than stored as `null`, which
 * keeps the resolver's shallow-merge logic simple.
 */
export async function updateStaffPermissions(
  staffId: string,
  override: Record<string, boolean | null> | null,
) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;

  try {
    requirePermission(session, 'manage_permissions');
  } catch (e) {
    return { error: tenantErrorMessage(e) };
  }

  const supabase = createServerClient();

  // Verify the staff row belongs to this salon (service_role bypasses RLS,
  // so this is the only thing blocking cross-tenant overrides).
  const { data: staffRow, error: staffErr } = await supabase
    .from('staff')
    .select('id, salon_id, role')
    .eq('id', staffId)
    .maybeSingle();
  if (staffErr) return { error: staffErr.message };
  if (!staffRow) return { error: 'Not found' };
  if ((staffRow as { salon_id: string }).salon_id !== session.salonId) {
    return { error: 'Not allowed' };
  }

  let payload: Record<string, boolean> | null = null;
  if (override !== null) {
    if (typeof override !== 'object') {
      return { error: 'Invalid override payload' };
    }
    const clean: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(override)) {
      if (!PERMISSION_KEY_SET.has(k)) {
        return { error: `Unknown permission key: ${k}` };
      }
      // null === "inherit from preset" → drop from the stored JSONB so the
      // resolver never sees it. Only explicit booleans land in the override.
      if (v === null) continue;
      if (typeof v !== 'boolean') {
        return { error: `Override value for "${k}" must be boolean or null` };
      }
      clean[k] = v;
    }
    payload = clean;
  }

  const { error } = await supabase
    .from('staff')
    .update({ permissions_override: payload })
    .eq('id', staffId)
    .eq('salon_id', session.salonId);

  if (error) return { error: error.message };
  return { error: null };
}

/**
 * Read the caller-salon's role presets. Helper-only — enforces the same
 * `manage_permissions` gate as the writes so we don't accidentally leak
 * the preset map to a staff member who isn't allowed to edit it.
 */
export async function listRolePresets(salonId: string) {
  const session = await verifySession();
  if (!session.salonId) return { data: null, error: 'No salon context' };

  try {
    assertSalonOwned(salonId, session.salonId);
    requirePermission(session, 'manage_permissions');
  } catch (e) {
    return { data: null, error: tenantErrorMessage(e) };
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('role_presets')
    .select('role_name, permissions')
    .eq('salon_id', salonId);

  if (error) return { data: null, error: error.message };
  return {
    data: (data ?? []) as Array<{ role_name: string; permissions: Record<string, boolean> }>,
    error: null,
  };
}
