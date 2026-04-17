/**
 * Shared permission constants + client-side React hooks.
 *
 * This module is the single source of truth for:
 *   - the set of permission keys the UI and server both agree on
 *   - their human-readable labels (for the role/permission editor)
 *   - their logical grouping (for how the editor lays them out)
 *   - a pure `hasPermissionOnSession` helper usable from any surface
 *   - `usePermission` / `usePermissions` React hooks that read the resolved
 *     permission map off the Zustand app store
 *
 * IMPORTANT: keep this file dependency-light. No DB calls, no server imports.
 * Runs on both client and server — the server-side enforcement lives in
 * `src/lib/tenant-guard.ts` (which imports the PermissionKey type from here).
 */

import { useAppStore } from '@/store/app-store';

/**
 * The canonical list of permission keys. Adding a key here is a schema-level
 * change: role_presets rows and staff.permissions_override must learn about
 * it, and the permission editor UI will auto-pick it up via PERMISSION_GROUPS.
 */
export const PERMISSION_KEYS = [
  'view_reports',
  'view_commissions',
  'view_own_commissions',
  'view_other_branches',
  'manage_staff',
  'manage_permissions',
  'manage_clients',
  'delete_client',
  'manage_appointments',
  'view_own_appointments_only',
  'manage_services',
  'manage_inventory',
  'manage_suppliers',
  'manage_expenses',
  'manage_promos',
  'manage_packages',
  'open_close_drawer',
  'process_refund',
  'void_bill',
  'use_pos',
  'apply_discount',
  'override_price',
  'split_payment',
  'export_data',
  'manage_salon',
] as const;

export type PermissionKey = typeof PERMISSION_KEYS[number];

/**
 * Pseudo-keys surfaced in docs/UI but NOT user-settable:
 *   - `*` : wildcard, means "all permissions granted" (owner/partner/super_admin).
 */
export const WILDCARD_PERMISSION = '*' as const;

/**
 * Logical grouping used by the permission editor UI. Keep the order: it's the
 * order the sections render in. Every key in PERMISSION_KEYS must appear in
 * exactly one group — the editor uses this as its source of rendering truth.
 */
export const PERMISSION_GROUPS: Record<string, readonly PermissionKey[]> = {
  'Reports & Analytics': [
    'view_reports',
    'view_commissions',
    'view_own_commissions',
    'view_other_branches',
    'export_data',
  ],
  'Staff & Permissions': ['manage_staff', 'manage_permissions'],
  'Clients': ['manage_clients', 'delete_client'],
  'Appointments': ['manage_appointments', 'view_own_appointments_only'],
  'POS & Billing': [
    'use_pos',
    'apply_discount',
    'override_price',
    'split_payment',
    'process_refund',
    'void_bill',
    'open_close_drawer',
  ],
  'Catalog': ['manage_services', 'manage_packages', 'manage_promos'],
  'Inventory & Suppliers': [
    'manage_inventory',
    'manage_suppliers',
    'manage_expenses',
  ],
  'Salon Settings': ['manage_salon'],
};

/**
 * Human-readable labels for each key. Shown in the permission editor and in
 * "missing permission" error toasts. Keep under ~40 chars so the editor's
 * two-column layout doesn't wrap.
 */
export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  view_reports: 'View reports',
  view_commissions: 'View all staff commissions',
  view_own_commissions: 'View own commission only',
  view_other_branches: 'View data from other branches',
  export_data: 'Export data (CSV / PDF)',
  manage_staff: 'Manage staff members',
  manage_permissions: 'Edit role permissions',
  manage_clients: 'Create and edit clients',
  delete_client: 'Delete clients',
  manage_appointments: 'Manage all appointments',
  view_own_appointments_only: 'View own appointments only',
  manage_services: 'Manage services',
  manage_packages: 'Manage packages',
  manage_promos: 'Manage promotions',
  manage_inventory: 'Manage inventory',
  manage_suppliers: 'Manage suppliers',
  manage_expenses: 'Manage expenses',
  use_pos: 'Access POS / Billing',
  apply_discount: 'Apply discounts',
  override_price: 'Override item prices',
  split_payment: 'Split payment across methods',
  process_refund: 'Process refunds',
  void_bill: 'Void bills',
  open_close_drawer: 'Open / close cash drawer',
  manage_salon: 'Manage salon settings',
};

/**
 * Pure, non-hook permission check. Safe to call from shared code, server
 * actions, and tests. Mirrors the logic in tenant-guard.hasPermission but
 * operates on just the permissions map (role-based bypass isn't relevant
 * client-side because role-bearing sessions already sign `*: true`).
 */
export function hasPermissionOnSession(
  permissions: Record<string, boolean> | undefined | null,
  key: PermissionKey,
): boolean {
  if (!permissions) return false;
  if (permissions[WILDCARD_PERMISSION] === true) return true;
  return permissions[key] === true;
}

/**
 * React hook: does the current session have `key`?
 *
 * Reads `permissions` off the Zustand app store. Wildcard expansion handled
 * here so components don't have to check for `*` themselves.
 */
export function usePermission(key: PermissionKey): boolean {
  const permissions = useAppStore(
    (s) => (s as unknown as { permissions?: Record<string, boolean> }).permissions,
  );
  return hasPermissionOnSession(permissions, key);
}

/**
 * React hook: returns the fully-resolved permission map with wildcard
 * expansion. Every PermissionKey is guaranteed to be present as a boolean.
 *
 * Useful for the permission editor (iterating the full set) and for
 * components that need to gate multiple features on a single render.
 */
export function usePermissions(): Record<PermissionKey, boolean> {
  const permissions = useAppStore(
    (s) => (s as unknown as { permissions?: Record<string, boolean> }).permissions,
  );
  const wildcard = permissions?.[WILDCARD_PERMISSION] === true;
  const out = {} as Record<PermissionKey, boolean>;
  for (const key of PERMISSION_KEYS) {
    out[key] = wildcard ? true : permissions?.[key] === true;
  }
  return out;
}
