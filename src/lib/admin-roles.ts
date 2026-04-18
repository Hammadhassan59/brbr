/**
 * Admin role permission matrix. Single source of truth for which roles can
 * access which /admin/* routes. Imported by:
 *   - src/proxy.ts             (route-level redirect on disallowed access)
 *   - src/app/admin/layout.tsx (filter sidebar nav by role)
 *   - src/app/actions/auth.ts  (requireAdminRole helper)
 *
 * Adding a new sub-role requires updating BOTH the AdminRole union here and
 * the migration 026 CHECK constraint on admin_users.role.
 */

export type AdminRole =
  | 'super_admin'
  | 'technical_support'
  | 'customer_support'
  | 'leads_team';

export const ADMIN_ROLES: readonly AdminRole[] = [
  'super_admin',
  'technical_support',
  'customer_support',
  'leads_team',
] as const;

/**
 * Per-route allow-list. Routes not present default to super_admin only —
 * fail-closed so an undeclared admin route can't accidentally be opened to
 * sub-roles.
 */
export const ADMIN_ROUTE_ACCESS: Record<string, AdminRole[]> = {
  '/admin':             ['super_admin', 'technical_support', 'customer_support', 'leads_team'],
  '/admin/leads':       ['super_admin', 'leads_team'],
  '/admin/salons':      ['super_admin', 'customer_support', 'technical_support'],
  '/admin/payments':    ['super_admin', 'customer_support', 'technical_support'],
  '/admin/users':       ['super_admin', 'customer_support', 'technical_support'],
  '/admin/analytics':   ['super_admin', 'technical_support'],
  '/admin/settings':    ['super_admin', 'technical_support'],
  '/admin/marketplace/settings': ['super_admin'],
  '/admin/marketplace/flagged': ['super_admin'],
  '/admin/marketplace/settlements': ['super_admin', 'technical_support'],
  '/admin/agents':      ['super_admin'],
  '/admin/payouts':     ['super_admin'],
  '/admin/commissions': ['super_admin'],
  '/admin/profile':     ['super_admin', 'technical_support', 'customer_support', 'leads_team'],
  '/admin/team':        ['super_admin'],
};

/**
 * Resolve which entry in ADMIN_ROUTE_ACCESS matches a given path. Picks the
 * longest prefix so `/admin/leads/anything` matches `/admin/leads`, not `/admin`.
 */
export function matchAdminRoute(pathname: string): string {
  const candidates = Object.keys(ADMIN_ROUTE_ACCESS).filter(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
  if (candidates.length === 0) return '/admin';
  return candidates.sort((a, b) => b.length - a.length)[0];
}

export function canAccess(role: string | undefined, pathname: string): boolean {
  if (!role) return false;
  const match = matchAdminRoute(pathname);
  return ADMIN_ROUTE_ACCESS[match].includes(role as AdminRole);
}

export function isAdminRole(role: string | undefined): role is AdminRole {
  return !!role && (ADMIN_ROLES as readonly string[]).includes(role);
}

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'Super Admin',
  technical_support: 'Technical Support',
  customer_support: 'Customer Support',
  leads_team: 'Leads Team',
};
