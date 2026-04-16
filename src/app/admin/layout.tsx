import { redirect } from 'next/navigation';
import { verifySession } from '@/app/actions/auth';
import { ADMIN_ROLES, type AdminRole } from '@/lib/admin-roles';
import { AdminShell } from './admin-shell';

/**
 * Admin layout — server component. Verifies the HttpOnly icut-token JWT
 * via verifySession() before rendering; non-admins never see the shell.
 *
 * Previously this was a client component that read `icut-role` from a
 * non-HttpOnly cookie (forgeable from any XSS). We now derive the role
 * from the verified JWT payload, on the server, before a single byte of
 * admin UI reaches the client.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let role: string | undefined;
  try {
    const session = await verifySession();
    role = session.role;
  } catch {
    redirect('/login');
  }

  if (!role || !(ADMIN_ROLES as readonly string[]).includes(role)) {
    // The proxy should already have bounced these requests, but defense in
    // depth: a direct hit without JWT, or with a non-admin JWT, lands here.
    redirect('/login');
  }

  return <AdminShell adminRole={role as AdminRole}>{children}</AdminShell>;
}
