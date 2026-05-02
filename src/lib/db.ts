// All the runtime helpers in this module called supabase.from(...) against
// the browser client. Those endpoints are gone — every consumer now uses the
// per-domain server actions in @/app/actions/* (lists.ts, pos.ts, etc.).
//
// Keeping this file as a type-only re-export so existing
//   import type { ProductWithBranchStock } from '@/lib/db'
// imports keep compiling. To use the runtime helper, call
// getProductsWithBranchStock() in @/app/actions/lists.

import type { Product } from '@/types/database';

/**
 * A Product row plus the per-branch stock fields from `branch_products`
 * for the caller's current branch. Shape is a strict superset of Product so
 * existing UI that reads `p.current_stock` / `p.low_stock_threshold` keeps
 * working — the values are now branch-scoped, not salon-wide.
 *
 * `branch_product_id` is the primary key of the branch_products row, useful
 * when the caller needs to write back (e.g. updating thresholds).
 */
export interface ProductWithBranchStock extends Omit<Product, 'current_stock' | 'low_stock_threshold'> {
  current_stock: number;
  low_stock_threshold: number;
  /** Primary key of the branch_products row, or undefined if no row exists yet. */
  branch_product_id?: string;
}
