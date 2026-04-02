'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ErrorBoundary } from '@/components/error-boundary';
import {
  LayoutDashboard, CalendarDays, Users, Receipt, UserCog,
  Package, BarChart3, Settings, LogOut,
  Scissors, Bell, Plus, Menu, X, ChevronDown, Gift, Check, Wallet,
} from 'lucide-react';
import { useLanguage } from '@/components/providers/language-provider';
import { useAppStore } from '@/store/app-store';
import { getRoleAccess, type StaffRoleAccess } from '@/lib/role-access';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { getTodayPKT, formatPKDate } from '@/lib/utils/dates';
import type { Branch } from '@/types/database';

interface NavItem {
  href: string;
  icon: typeof LayoutDashboard;
  labelKey: 'dashboard' | 'appointments' | 'clients' | 'pos' | 'staff' | 'inventory' | 'expenses' | 'reports' | 'settings' | 'more';
  access: StaffRoleAccess[];
}

const ALL_NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', icon: LayoutDashboard, labelKey: 'dashboard', access: ['full', 'front_desk', 'stylist', 'minimal'] },
  { href: '/dashboard/appointments', icon: CalendarDays, labelKey: 'appointments', access: ['full', 'front_desk', 'stylist'] },
  { href: '/dashboard/clients', icon: Users, labelKey: 'clients', access: ['full', 'front_desk'] },
  { href: '/dashboard/pos', icon: Receipt, labelKey: 'pos', access: ['full', 'front_desk'] },
  { href: '/dashboard/staff', icon: UserCog, labelKey: 'staff', access: ['full'] },
  { href: '/dashboard/inventory', icon: Package, labelKey: 'inventory', access: ['full'] },
  { href: '/dashboard/expenses', icon: Wallet, labelKey: 'expenses', access: ['full', 'front_desk'] },
  { href: '/dashboard/packages', icon: Gift, labelKey: 'more', access: ['full'] },
  { href: '/dashboard/reports', icon: BarChart3, labelKey: 'reports', access: ['full'] },
  { href: '/dashboard/settings', icon: Settings, labelKey: 'settings', access: ['full'] },
];

const ALL_MOBILE_NAV: NavItem[] = [
  { href: '/dashboard', icon: LayoutDashboard, labelKey: 'dashboard', access: ['full', 'front_desk', 'stylist', 'minimal'] },
  { href: '/dashboard/appointments', icon: CalendarDays, labelKey: 'appointments', access: ['full', 'front_desk', 'stylist'] },
  { href: '/dashboard/clients', icon: Users, labelKey: 'clients', access: ['full', 'front_desk'] },
  { href: '/dashboard/pos', icon: Receipt, labelKey: 'pos', access: ['full', 'front_desk'] },
  { href: '/dashboard/settings', icon: Settings, labelKey: 'more', access: ['full', 'front_desk', 'stylist', 'minimal'] },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguage();
  const { salon, branches, currentBranch, currentStaff, currentPartner, isPartner, isSuperAdmin, setCurrentBranch } = useAppStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Redirect to login if no session
  const hasSession = !!(currentStaff || currentPartner || isSuperAdmin);
  if (!hasSession && typeof window !== 'undefined') {
    window.location.href = '/login?redirect=' + encodeURIComponent(pathname);
    return null;
  }

  const roleAccess: StaffRoleAccess = isPartner ? 'full' : getRoleAccess(currentStaff?.role || 'helper');
  const canSwitchBranch = branches.length > 1 && (roleAccess === 'full' || isPartner);

  const navItems = useMemo(
    () => ALL_NAV_ITEMS.filter((item) => item.access.includes(roleAccess)),
    [roleAccess]
  );

  const mobileNav = useMemo(
    () => ALL_MOBILE_NAV.filter((item) => item.access.includes(roleAccess)),
    [roleAccess]
  );

  const currentNav = navItems.find((item) =>
    item.href === '/dashboard'
      ? pathname === '/dashboard'
      : pathname.startsWith(item.href)
  );
  const pageTitle = currentNav ? t(currentNav.labelKey) : t('dashboard');

  const showNewAppointment = roleAccess === 'full' || roleAccess === 'front_desk';

  const displayName = isPartner ? currentPartner?.name : currentStaff?.name;
  const displayRole = isPartner ? 'Owner' : currentStaff?.role?.replace('_', ' ');
  const displayInitial = displayName?.charAt(0) || 'U';

  function switchBranch(branch: Branch) {
    setCurrentBranch(branch);
  }

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden animate-in fade-in duration-200" role="button" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
        </div>
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-sidebar text-sidebar-foreground flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] lg:relative lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-sidebar-border">
          <Scissors className="w-6 h-6 text-sidebar-primary" />
          <span className="font-heading text-xl font-bold">BrBr</span>
          {salon && (
            <span className="text-xs text-sidebar-foreground/60 truncate ml-auto">
              {salon.name}
            </span>
          )}
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden ml-auto" aria-label="Close menu">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Branch selector */}
        {currentBranch && (
          <div className="px-5 py-3 border-b border-sidebar-border">
            {canSwitchBranch ? (
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-2 text-sm text-sidebar-foreground/80 hover:text-sidebar-foreground w-full outline-none">
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="truncate">{currentBranch.name}</span>
                  <ChevronDown className="w-3 h-3 ml-auto" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {branches.map((branch) => (
                    <DropdownMenuItem
                      key={branch.id}
                      onClick={() => switchBranch(branch)}
                      className="flex items-center gap-2"
                    >
                      <div className={`w-2 h-2 rounded-full ${branch.id === currentBranch.id ? 'bg-green-400' : 'bg-border'}`} />
                      <span className="flex-1">{branch.name}</span>
                      {branch.id === currentBranch.id && <Check className="w-4 h-4 text-green-600" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex items-center gap-2 text-sm text-sidebar-foreground/80">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <span className="truncate">{currentBranch.name}</span>
              </div>
            )}
          </div>
        )}

        {/* Role badge */}
        <div className="px-5 py-2 border-b border-sidebar-border">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
            isPartner ? 'bg-gold/20 text-gold' :
            roleAccess === 'full' ? 'bg-gold/20 text-gold' :
            roleAccess === 'front_desk' ? 'bg-teal-500/20 text-teal-400' :
            roleAccess === 'stylist' ? 'bg-purple-500/20 text-purple-400' :
            'bg-gray-500/20 text-gray-400'
          }`}>
            {isPartner ? 'Owner' :
             roleAccess === 'full' ? 'Full Access' :
             roleAccess === 'front_desk' ? 'Front Desk' :
             roleAccess === 'stylist' ? 'Stylist View' :
             'Limited Access'}
          </span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
          {navItems.map((item) => {
            const isActive = item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-primary font-medium'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-sidebar-primary rounded-full animate-in fade-in zoom-in-50 duration-200" />
                )}
                <item.icon className="w-5 h-5 shrink-0" />
                <span>{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </nav>

        {/* User info at bottom */}
        <div className="px-5 py-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-sidebar-primary text-sidebar-primary-foreground">
              {displayInitial}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{displayName || 'Guest'}</p>
              <p className="text-xs text-sidebar-foreground/60 capitalize">
                {displayRole || 'Unknown'}
              </p>
            </div>
            <button
              onClick={() => {
                document.cookie = 'brbr-session=; path=/; max-age=0';
                document.cookie = 'brbr-role=; path=/; max-age=0';
                useAppStore.getState().reset();
                window.location.href = '/login';
              }}
              className="text-sidebar-foreground/60 hover:text-sidebar-foreground"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="sticky top-0 z-30 bg-card border-b px-4 lg:px-6 h-14 flex items-center gap-3 no-print">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden touch-target" aria-label="Open menu">
            <Menu className="w-5 h-5" />
          </button>

          <h1 className="font-heading text-lg font-semibold truncate">{pageTitle}</h1>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden sm:block text-xs text-muted-foreground">{formatPKDate(getTodayPKT())}</span>

            {roleAccess === 'full' && (
              <Button
                variant="ghost"
                size="icon"
                className="relative touch-target"
                style={{ animation: 'pulse-gold 2s ease-in-out infinite' }}
                title="View daily report"
                onClick={() => router.push('/dashboard/reports/daily')}
              >
                <Bell className="w-5 h-5" />
              </Button>
            )}

            {showNewAppointment && (
              <Link href="/dashboard/appointments">
                <Button size="sm" className="bg-gold hover:bg-gold/90 text-black touch-target border border-gold font-semibold">
                  <Plus className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">{t('newAppointment')}</span>
                </Button>
              </Link>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 pb-20 lg:pb-6">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-card border-t flex lg:hidden no-print">
        {mobileNav.map((item) => {
          const isActive = item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex-1 flex flex-col items-center py-2 text-xs touch-target transition-all duration-150 ${
                isActive ? 'text-gold scale-105' : 'text-muted-foreground'
              }`}
            >
              <item.icon className="w-5 h-5 mb-0.5" />
              <span>{t(item.labelKey)}</span>
              {isActive && (
                <span className="absolute bottom-1 w-1 h-1 rounded-full bg-gold animate-in zoom-in duration-200" />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
