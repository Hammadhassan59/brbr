'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Store, Users, BarChart3, Settings,
  Shield, LogOut, Scissors, CreditCard,
  UserCog, Target, Wallet, Receipt, User, Menu, X,
} from 'lucide-react';
import { getPendingPaymentCount } from '@/app/actions/payment-requests';
import { useAppStore } from '@/store/app-store';
import { destroySession } from '@/app/actions/auth';
import { ErrorBoundary } from '@/components/error-boundary';
import { canAccess, ADMIN_ROLE_LABELS, type AdminRole } from '@/lib/admin-roles';

const NAV_ITEMS = [
  { href: '/admin', icon: LayoutDashboard, label: 'Overview' },
  { href: '/admin/salons', icon: Store, label: 'Salons' },
  { href: '/admin/payments', icon: CreditCard, label: 'Payments' },
  { href: '/admin/agents', icon: UserCog, label: 'Sales Agents' },
  { href: '/admin/leads', icon: Target, label: 'Leads' },
  { href: '/admin/commissions', icon: Wallet, label: 'Commissions' },
  { href: '/admin/payouts', icon: Receipt, label: 'Payouts' },
  { href: '/admin/users', icon: Users, label: 'Users' },
  { href: '/admin/team', icon: Shield, label: 'Admin Team' },
  { href: '/admin/analytics', icon: BarChart3, label: 'Analytics' },
  { href: '/admin/settings', icon: Settings, label: 'Platform Settings' },
  { href: '/admin/profile', icon: User, label: 'My Profile' },
];

/**
 * Admin shell (client). The enclosing server `layout.tsx` verifies the JWT,
 * checks role, and passes it in — so we don't re-read any cookie here.
 */
export function AdminShell({ adminRole, children }: { adminRole: AdminRole; children: React.ReactNode }) {
  const pathname = usePathname();
  const { salon, currentStaff, reset } = useAppStore();
  const [pendingPayments, setPendingPayments] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Refresh pending count when route changes (cheap query, head: true).
  // Only roles that can see /admin/payments should bother fetching it.
  useEffect(() => {
    if (!canAccess(adminRole, '/admin/payments')) return;
    getPendingPaymentCount().then(setPendingPayments).catch(() => {});
  }, [adminRole, pathname]);

  // Close the drawer whenever the route changes (mobile UX)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSidebarOpen(false);
  }, [pathname]);

  async function handleLogout() {
    // Await destroySession BEFORE navigating so the Set-Cookie response
    // that clears icut-token reaches the browser. Without the await we
    // race: /login boots with a still-valid JWT and auto-redirects.
    reset();
    try { await destroySession(); } catch { /* ignore */ }
    window.location.href = '/login';
  }

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden animate-in fade-in duration-200"
          role="button"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-sidebar text-sidebar-foreground flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] lg:relative lg:translate-x-0 lg:shrink-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-sidebar-border">
          <Scissors className="w-5 h-5 text-sidebar-primary" />
          <span className="font-heading text-lg font-bold">iCut</span>
          <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-medium ml-auto flex items-center gap-1">
            <Shield className="w-3 h-3" /> ADMIN
          </span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden ml-1 text-sidebar-foreground/60 hover:text-sidebar-foreground"
            aria-label="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav — filtered by role so each sub-admin sees only what they can access */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
          {NAV_ITEMS.filter((item) => canAccess(adminRole, item.href)).map((item) => {
            const isActive = item.href === '/admin'
              ? pathname === '/admin'
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-primary font-medium'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                }`}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {item.href === '/admin/payments' && pendingPayments > 0 && (
                  <span className="text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                    {pendingPayments}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Quick switch to salon view */}
        <div className="px-3 py-3 border-t border-sidebar-border">
          <Link
            href={salon ? '/dashboard' : '/admin/salons'}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/50 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
          >
            <Scissors className="w-4 h-4" />
            <span>{salon ? 'Switch to Salon View' : 'Select a Salon'}</span>
          </Link>
        </div>

        {/* User */}
        <div className="px-5 py-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center text-xs font-bold">
              SA
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{currentStaff?.name || ADMIN_ROLE_LABELS[adminRole]}</p>
              <p className="text-xs text-sidebar-foreground/40">{ADMIN_ROLE_LABELS[adminRole]}</p>
            </div>
            <button onClick={handleLogout} className="text-sidebar-foreground/40 hover:text-sidebar-foreground">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 bg-card border-b px-4 lg:px-6 h-14 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden -ml-1 p-2 rounded-lg hover:bg-accent touch-target"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="font-heading text-base lg:text-lg font-semibold truncate">iCut Admin Panel</h1>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
