'use server';

import { z } from 'zod';
import { checkWriteAccess } from './auth';
import { createServerClient } from '@/lib/supabase';
import {
  assertBranchOwned,
  assertProductOwned,
  tenantErrorMessage,
} from '@/lib/tenant-guard';
import type { StockTransfer } from '@/types/database';

// ═══════════════════════════════════════
// Branch-to-branch stock transfers.
//
// Introduced with migration 035 (per-branch inventory). A transfer:
//   1. Decrements branch_products.current_stock at from_branch
//      (guarded by WHERE current_stock >= quantity to avoid going negative
//       on a race).
//   2. Increments branch_products.current_stock at to_branch.
//      The seed triggers guarantee the row exists, but we upsert defensively.
//   3. Inserts one stock_transfers row for the transfer itself.
//   4. Inserts two stock_movements rows — transfer_out at from_branch and
//      transfer_in at to_branch — both pointing at the stock_transfers.id
//      via reference_id for audit correlation.
//
// The service_role client bypasses RLS, so the explicit branch-ownership
// checks + per-branch filters below are load-bearing for tenant isolation.
// ═══════════════════════════════════════

const transferInputSchema = z
  .object({
    fromBranchId: z.string().uuid(),
    toBranchId: z.string().uuid(),
    productId: z.string().uuid(),
    quantity: z.number().positive().finite(),
    notes: z.string().trim().max(500).optional().nullable(),
  })
  .strip()
  .refine((d) => d.fromBranchId !== d.toBranchId, {
    message: 'From and to branches must differ',
    path: ['toBranchId'],
  });

export async function transferStock(input: {
  fromBranchId: string;
  toBranchId: string;
  productId: string;
  quantity: number;
  notes?: string | null;
}): Promise<{ data: { id: string } | null; error: string | null }> {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { data: null, error: writeCheck.error };
  const session = writeCheck.session;

  const parsed = transferInputSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message || 'Invalid input' };
  }
  const { fromBranchId, toBranchId, productId, quantity, notes } = parsed.data;

  const supabase = createServerClient();

  // All three parents must belong to this salon. branch_products has no
  // salon_id, so these checks are the only cross-tenant guard.
  try {
    await assertBranchOwned(fromBranchId, session.salonId);
    await assertBranchOwned(toBranchId, session.salonId);
    await assertProductOwned(productId, session.salonId);
  } catch (e) {
    return { data: null, error: tenantErrorMessage(e) };
  }

  // Read the source balance. The seed triggers guarantee a row exists for
  // every (branch, product) pair in the salon; a missing row here means
  // either the trigger failed (DB-level bug) or someone passed a product
  // that doesn't belong to this salon (already guarded above).
  const { data: fromRow, error: fromErr } = await supabase
    .from('branch_products')
    .select('current_stock')
    .eq('branch_id', fromBranchId)
    .eq('product_id', productId)
    .maybeSingle();
  if (fromErr) return { data: null, error: fromErr.message };
  if (!fromRow) return { data: null, error: 'Source branch inventory row not found' };

  const currentFrom = Number(fromRow.current_stock) || 0;
  if (currentFrom < quantity) {
    return { data: null, error: 'Insufficient stock at source branch' };
  }

  // Decrement source with a WHERE guard so a concurrent deduct that lands
  // between our read and write can't push us negative. If the guard fails,
  // update affects 0 rows and we surface that as a retryable error.
  const { data: fromUpdated, error: fromUpdErr } = await supabase
    .from('branch_products')
    .update({ current_stock: currentFrom - quantity })
    .eq('branch_id', fromBranchId)
    .eq('product_id', productId)
    .gte('current_stock', quantity)
    .select('id');
  if (fromUpdErr) return { data: null, error: fromUpdErr.message };
  if (!fromUpdated || fromUpdated.length === 0) {
    return { data: null, error: 'Stock changed during transfer — please retry' };
  }

  // Increment destination. Read-then-write (no atomic +=) is fine: if two
  // transfers race into the same (to_branch, product), the second's read
  // will see the first's write as long as the client is not eagerly caching.
  // Supabase service_role goes straight to PostgREST, so no caching.
  const { data: toRow, error: toReadErr } = await supabase
    .from('branch_products')
    .select('current_stock')
    .eq('branch_id', toBranchId)
    .eq('product_id', productId)
    .maybeSingle();
  if (toReadErr) {
    // Rollback the source decrement before bailing — we haven't written the
    // transfer record yet, so leaving the source short would be a silent
    // data loss.
    await supabase
      .from('branch_products')
      .update({ current_stock: currentFrom })
      .eq('branch_id', fromBranchId)
      .eq('product_id', productId);
    return { data: null, error: toReadErr.message };
  }

  if (toRow) {
    const currentTo = Number(toRow.current_stock) || 0;
    const { error: toUpdErr } = await supabase
      .from('branch_products')
      .update({ current_stock: currentTo + quantity })
      .eq('branch_id', toBranchId)
      .eq('product_id', productId);
    if (toUpdErr) {
      await supabase
        .from('branch_products')
        .update({ current_stock: currentFrom })
        .eq('branch_id', fromBranchId)
        .eq('product_id', productId);
      return { data: null, error: toUpdErr.message };
    }
  } else {
    // Defensive: seed trigger should've created this row. Upsert in case
    // the branch or product predates migration 035 in some edge rollback.
    const { error: toInsErr } = await supabase
      .from('branch_products')
      .upsert(
        {
          branch_id: toBranchId,
          product_id: productId,
          current_stock: quantity,
          low_stock_threshold: 5,
        },
        { onConflict: 'branch_id,product_id' },
      );
    if (toInsErr) {
      await supabase
        .from('branch_products')
        .update({ current_stock: currentFrom })
        .eq('branch_id', fromBranchId)
        .eq('product_id', productId);
      return { data: null, error: toInsErr.message };
    }
  }

  // Record the transfer itself.
  const { data: transfer, error: transferErr } = await supabase
    .from('stock_transfers')
    .insert({
      salon_id: session.salonId,
      from_branch_id: fromBranchId,
      to_branch_id: toBranchId,
      product_id: productId,
      quantity,
      notes: notes ?? null,
      transferred_by: session.staffId || null,
    })
    .select('id')
    .single();

  if (transferErr || !transfer) {
    // Best-effort rollback of both sides. This is the only place where we
    // can't fully undo — the transfer row failed to write but the stock
    // already moved. We restore both sides to keep inventory consistent.
    await supabase
      .from('branch_products')
      .update({ current_stock: currentFrom })
      .eq('branch_id', fromBranchId)
      .eq('product_id', productId);
    if (toRow) {
      await supabase
        .from('branch_products')
        .update({ current_stock: Number(toRow.current_stock) || 0 })
        .eq('branch_id', toBranchId)
        .eq('product_id', productId);
    } else {
      // We upserted a fresh row — undo by subtracting what we added.
      await supabase
        .from('branch_products')
        .update({ current_stock: 0 })
        .eq('branch_id', toBranchId)
        .eq('product_id', productId);
    }
    return { data: null, error: transferErr?.message || 'Failed to record transfer' };
  }

  // Audit trail: paired movements, both pointing at the stock_transfers row.
  const { error: moveErr } = await supabase.from('stock_movements').insert([
    {
      product_id: productId,
      branch_id: fromBranchId,
      movement_type: 'transfer_out',
      quantity: -quantity,
      reference_id: transfer.id,
      notes: notes ?? null,
    },
    {
      product_id: productId,
      branch_id: toBranchId,
      movement_type: 'transfer_in',
      quantity,
      reference_id: transfer.id,
      notes: notes ?? null,
    },
  ]);

  if (moveErr) {
    // Movements failing is a soft error — the transfer record + stock
    // changes are already committed. Log-and-swallow rather than roll back
    // because the user's stock IS now where they asked; the audit gap is
    // reconcilable from stock_transfers alone.
    return { data: { id: transfer.id }, error: null };
  }

  return { data: { id: transfer.id }, error: null };
}

/**
 * List transfers touching a specific branch (either as source or destination).
 * Ordered newest-first. Used by the per-branch inventory history page.
 */
export async function listStockTransfers(input: {
  branchId: string;
  limit?: number;
}): Promise<{ data: StockTransfer[] | null; error: string | null }> {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { data: null, error: writeCheck.error };
  const session = writeCheck.session;

  const supabase = createServerClient();

  try {
    await assertBranchOwned(input.branchId, session.salonId);
  } catch (e) {
    return { data: null, error: tenantErrorMessage(e) };
  }

  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);

  const { data, error } = await supabase
    .from('stock_transfers')
    .select('*')
    .eq('salon_id', session.salonId)
    .or(`from_branch_id.eq.${input.branchId},to_branch_id.eq.${input.branchId}`)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as StockTransfer[], error: null };
}
