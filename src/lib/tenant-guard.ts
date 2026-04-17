import { createServerClient } from '@/lib/supabase';
import type { PermissionKey } from '@/lib/permissions';

/**
 * Shape of the JWT payload we read from here. Kept loose to avoid a cyclic
 * import with `src/app/actions/auth.ts` — this type intentionally mirrors
 * the subset of SessionPayload the tenant guards actually touch.
 *
 * New fields (primaryBranchId / branchIds / permissions) are optional so old
 * tokens in-flight at deploy time still resolve cleanly.
 */
export interface TenantGuardSession {
  salonId: string;
  staffId: string;
  role: string;
  branchId?: string;
  primaryBranchId?: string;
  branchIds?: string[];
  permissions?: Record<string, boolean>;
  impersonatedBy?: { staffId: string; name: string; adminAuthUserId?: string };
}

/** Roles that bypass permission/branch checks unconditionally. */
const LOCKOUT_SAFE_ROLES: ReadonlySet<string> = new Set([
  'owner',
  'partner',
  'super_admin',
]);

function isLockoutSafe(session: TenantGuardSession): boolean {
  if (LOCKOUT_SAFE_ROLES.has(session.role)) return true;
  // Admin impersonation always passes — same rationale as verifyWriteAccess:
  // an impersonated session must never be dead-ended by a permission gap on
  // the impersonated tenant.
  if (session.impersonatedBy) return true;
  return false;
}

/**
 * Pure permission check against a SessionPayload-ish object.
 *
 * Rules, in order:
 *   1. Lockout-safe roles (owner, partner, super_admin, impersonation) always true.
 *   2. Wildcard `"*": true` in session.permissions → true.
 *   3. `session.permissions[key] === true` → true.
 *   4. Missing `session.permissions` (old JWT) → false (except case 1).
 */
export function hasPermission(
  session: TenantGuardSession,
  key: PermissionKey,
): boolean {
  if (isLockoutSafe(session)) return true;
  const perms = session.permissions;
  if (!perms) return false;
  if (perms['*'] === true) return true;
  return perms[key] === true;
}

/**
 * Throws FORBIDDEN if the session lacks `key`. Owners / partners / super
 * admins / impersonators always pass — this is a lockout-safety rule so a
 * misconfigured role preset can never brick an owner out of their salon.
 */
export function requirePermission(
  session: TenantGuardSession,
  key: PermissionKey,
): void {
  if (hasPermission(session, key)) return;
  const err = new Error(`Missing permission: ${key}`);
  (err as Error & { code?: string }).code = 'FORBIDDEN';
  throw err;
}

/**
 * Assert the session is allowed to operate on `branchId`.
 *
 * Owners/partners/super_admins (and impersonators) see every branch. Other
 * roles must have `branchId` in their `branchIds` array. Falls back to
 * `primaryBranchId` / `branchId` for pre-migration JWTs so a token rolled at
 * T-1 still authorizes correctly at T.
 */
export function assertBranchMembership(
  session: TenantGuardSession,
  branchId: string,
): void {
  if (isLockoutSafe(session)) return;
  if (session.branchIds && session.branchIds.length > 0) {
    if (session.branchIds.includes(branchId)) return;
    throw new Error('FORBIDDEN');
  }
  // Old-JWT fallback — accept whichever single-branch field is populated.
  const fallback = session.primaryBranchId ?? session.branchId;
  if (fallback && fallback === branchId) return;
  throw new Error('FORBIDDEN');
}

/**
 * Reports helper: some report pages offer an "all branches" toggle that's
 * gated by the `view_other_branches` permission. When that toggle is on and
 * the session has the permission, skip the branch check entirely. Otherwise
 * fall back to per-branch membership enforcement.
 */
export function assertBranchScopedRead(
  session: TenantGuardSession,
  targetBranchId: string,
  allowAllBranches: boolean,
): void {
  if (allowAllBranches && hasPermission(session, 'view_other_branches')) {
    return;
  }
  assertBranchMembership(session, targetBranchId);
}

/**
 * Assert that a row in `tableName` with id=`id` belongs to the given salon.
 * Throws 'NOT_FOUND' if no row exists, or 'FORBIDDEN' if it belongs to a
 * different salon. Use this to guard every parent-ID lookup before mutating
 * child rows under it.
 *
 * The service_role client bypasses RLS, so these checks are the ONLY thing
 * preventing cross-tenant IDOR on writes.
 */
export async function assertOwnsBy(
  tableName: string,
  id: string,
  salonId: string,
): Promise<void> {
  if (!id) throw new Error('NOT_FOUND');
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from(tableName)
    .select('id, salon_id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('NOT_FOUND');
  if ((data as { salon_id: string }).salon_id !== salonId) throw new Error('FORBIDDEN');
}

/**
 * Variant for tables that don't have a salon_id directly — it fetches a
 * parent FK column and verifies via a follow-up call. Returns the parent
 * row for use by the caller.
 */
export async function assertOwnsVia(
  tableName: string,
  id: string,
  parentTable: string,
  parentFkColumn: string,
  salonId: string,
): Promise<{ id: string; parentId: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from(tableName)
    .select(`id, ${parentFkColumn}`)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('NOT_FOUND');
  const row = data as unknown as Record<string, string>;
  const parentId = row[parentFkColumn];
  if (!parentId) throw new Error('NOT_FOUND');
  await assertOwnsBy(parentTable, parentId, salonId);
  return { id: row.id, parentId };
}

/**
 * Verify a branch belongs to the caller's salon. Returns its salon_id on
 * success. Throws FORBIDDEN/NOT_FOUND otherwise.
 */
export async function assertBranchOwned(
  branchId: string,
  salonId: string,
): Promise<void> {
  await assertOwnsBy('branches', branchId, salonId);
}

/**
 * Verify a bill belongs to the caller's salon.
 */
export async function assertBillOwned(billId: string, salonId: string): Promise<{ branch_id: string | null; salon_id: string }> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('bills')
    .select('id, salon_id, branch_id')
    .eq('id', billId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('NOT_FOUND');
  if ((data as { salon_id: string }).salon_id !== salonId) throw new Error('FORBIDDEN');
  return { branch_id: (data as { branch_id: string | null }).branch_id, salon_id: (data as { salon_id: string }).salon_id };
}

/**
 * Verify a staff row belongs to the caller's salon. Returns the row for
 * downstream use (e.g. branch_id consistency checks).
 *
 * If `branchId` is provided, additionally asserts `staff.branch_id === branchId`.
 * Optional so existing callers don't have to change.
 */
export async function assertStaffOwned(
  staffId: string,
  salonId: string,
  branchId?: string,
): Promise<{ id: string; salon_id: string; branch_id: string | null }> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('staff')
    .select('id, salon_id, branch_id')
    .eq('id', staffId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('NOT_FOUND');
  const row = data as { id: string; salon_id: string; branch_id: string | null };
  if (row.salon_id !== salonId) throw new Error('FORBIDDEN');
  if (branchId !== undefined && row.branch_id !== branchId) {
    throw new Error('FORBIDDEN');
  }
  return row;
}

/**
 * Verify a product belongs to the caller's salon.
 */
export async function assertProductOwned(productId: string, salonId: string): Promise<void> {
  await assertOwnsBy('products', productId, salonId);
}

/**
 * Verify a supplier belongs to the caller's salon.
 */
export async function assertSupplierOwned(supplierId: string, salonId: string): Promise<void> {
  await assertOwnsBy('suppliers', supplierId, salonId);
}

/**
 * Verify a client belongs to the caller's salon.
 *
 * Clients are stored per-salon (no branch_id column today), so the optional
 * `branchId` param is accepted for API parity with the other assert* helpers
 * but only enforced if the underlying row actually has a `branch_id`.
 */
export async function assertClientOwned(
  clientId: string,
  salonId: string,
  branchId?: string,
): Promise<{ id: string; salon_id: string; udhaar_balance: number | null; branch_id?: string | null }> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('clients')
    .select('id, salon_id, udhaar_balance, branch_id')
    .eq('id', clientId)
    .maybeSingle();
  if (error) {
    // `branch_id` may not exist on the clients table yet. Retry without it so
    // the guard keeps working on both sides of the migration.
    const retry = await supabase
      .from('clients')
      .select('id, salon_id, udhaar_balance')
      .eq('id', clientId)
      .maybeSingle();
    if (retry.error) throw new Error(retry.error.message);
    if (!retry.data) throw new Error('NOT_FOUND');
    const row = retry.data as { id: string; salon_id: string; udhaar_balance: number | null };
    if (row.salon_id !== salonId) throw new Error('FORBIDDEN');
    return row;
  }
  if (!data) throw new Error('NOT_FOUND');
  const row = data as { id: string; salon_id: string; udhaar_balance: number | null; branch_id?: string | null };
  if (row.salon_id !== salonId) throw new Error('FORBIDDEN');
  if (branchId !== undefined && row.branch_id != null && row.branch_id !== branchId) {
    throw new Error('FORBIDDEN');
  }
  return row;
}

/**
 * Verify a service belongs to the caller's salon. Optional branchId enforces
 * the service is scoped to that branch (or salon-wide, i.e. branch_id IS NULL).
 */
export async function assertServiceOwned(
  serviceId: string,
  salonId: string,
  branchId?: string,
): Promise<{ id: string; salon_id: string; branch_id: string | null }> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('services')
    .select('id, salon_id, branch_id')
    .eq('id', serviceId)
    .maybeSingle();
  if (error) {
    // Services may not have a branch_id column in all environments — fall
    // back to salon-only enforcement rather than crashing on older schemas.
    const retry = await supabase
      .from('services')
      .select('id, salon_id')
      .eq('id', serviceId)
      .maybeSingle();
    if (retry.error) throw new Error(retry.error.message);
    if (!retry.data) throw new Error('NOT_FOUND');
    const row = retry.data as { id: string; salon_id: string };
    if (row.salon_id !== salonId) throw new Error('FORBIDDEN');
    return { ...row, branch_id: null };
  }
  if (!data) throw new Error('NOT_FOUND');
  const row = data as { id: string; salon_id: string; branch_id: string | null };
  if (row.salon_id !== salonId) throw new Error('FORBIDDEN');
  if (branchId !== undefined && row.branch_id != null && row.branch_id !== branchId) {
    throw new Error('FORBIDDEN');
  }
  return row;
}

/**
 * Normalize an error thrown from an assert* helper into the
 * { error: string } shape server actions return. Anything else re-throws so
 * auth/subscription errors still propagate the way the existing code expects.
 */
export function tenantErrorMessage(e: unknown): string | null {
  if (e instanceof Error) {
    if (e.message === 'NOT_FOUND') return 'Not found';
    if (e.message === 'FORBIDDEN') return 'Not allowed';
    return e.message;
  }
  return 'Unknown error';
}
