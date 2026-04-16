import { createServerClient } from '@/lib/supabase';

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
 */
export async function assertStaffOwned(
  staffId: string,
  salonId: string,
): Promise<{ id: string; salon_id: string; branch_id: string | null }> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('staff')
    .select('id, salon_id, branch_id')
    .eq('id', staffId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('NOT_FOUND');
  if ((data as { salon_id: string }).salon_id !== salonId) throw new Error('FORBIDDEN');
  return data as { id: string; salon_id: string; branch_id: string | null };
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
 */
export async function assertClientOwned(clientId: string, salonId: string): Promise<{ id: string; salon_id: string; udhaar_balance: number | null }> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('clients')
    .select('id, salon_id, udhaar_balance')
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('NOT_FOUND');
  if ((data as { salon_id: string }).salon_id !== salonId) throw new Error('FORBIDDEN');
  return data as { id: string; salon_id: string; udhaar_balance: number | null };
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
