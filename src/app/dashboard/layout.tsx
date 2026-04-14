'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ErrorBoundary } from '@/components/error-boundary';
import { WhatsAppComposeProvider } from '@/components/whatsapp-compose/provider';
import { WhatsAppComposeSheet } from '@/components/whatsapp-compose/sheet';
import {
  LayoutDashboard, CalendarDays, Users, Receipt, UserCog,
  Package, BarChart3, Settings, LogOut,
  Scissors, Bell, Plus, Menu, X, ChevronDown, Gift, Check, Wallet,
  AlertTriangle, CreditCard, UserX, Search,
} from 'lucide-react';
import { useLanguage } from '@/components/providers/language-provider';
import { useAppStore } from '@/store/app-store';
import { getRoleAccess, type StaffRoleAccess } from '@/lib/role-access';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { getTodayPKT, formatPKDate } from '@/lib/utils/dates';
import type { Branch } from '@/types/database';
import { destroySession } from '@/app/actions/auth';

interface NavItem {
  href: string;
  icon: typeof LayoutDashboard;
  labelKey: 'dashboard' | 'appointments' | 'clients' | 'pos' | 'staff' | 'inventory' | 'expenses' | 'reports' | 'settings' | 'packages';
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
  { href: '/dashboard/packages', icon: Gift, labelKey: 'packages', access: ['full'] },
  { href: '/dashboard/reports', icon: BarChart3, labelKey: 'reports', access: ['full'] },
];

const ALL_MOBILE_NAV: NavItem[] = [
  { href: '/dashboard', icon: LayoutDashboard, labelKey: 'dashboard', access: ['full', 'front_desk', 'stylist', 'minimal'] },
  { href: '/dashboard/appointments', icon: CalendarDays, labelKey: 'appointments', access: ['full', 'front_desk', 'stylist'] },
  { href: '/dashboard/clients', icon: Users, labelKey: 'clients', access: ['full', 'front_desk'] },
  { href: '/dashboard/pos', icon: Receipt, labelKey: 'pos', access: ['full', 'front_desk'] },
  { href: '/dashboard/settings', icon: Settings, labelKey: 'settings', access: ['full', 'front_desk', 'stylist', 'minimal'] },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguage();
  const { salon, branches, currentBranch, currentStaff, currentPartner, isOwner, isPartner, isSuperAdmin, setCurrentBranch } = useAppStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Zustand 5 persist hydrates synchronously from localStorage on the client,
  // but during SSR there is no localStorage so the first render has empty state.
  // Wait one tick so the client-side store is populated before running the auth check.
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => { setIsHydrated(true); }, []);

  const roleAccess: StaffRoleAccess = (isOwner || isPartner) ? 'full' : getRoleAccess(currentStaff?.role || 'helper');
  const canSwitchBranch = branches.length > 1 && (roleAccess === 'full' || isOwner || isPartner);

  const navItems = useMemo(
    () => ALL_NAV_ITEMS.filter((item) => item.access.includes(roleAccess)),
    [roleAccess]
  );

  const mobileNav = useMemo(
    () => ALL_MOBILE_NAV.filter((item) => item.access.includes(roleAccess)),
    [roleAccess]
  );

  // --- Early returns AFTER all hooks ---

  if (!isHydrated) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Redirect to login if no session
  const hasSession = !!(salon || currentStaff || currentPartner || isSuperAdmin);
  if (!hasSession && typeof window !== 'undefined') {
    window.location.href = '/login?redirect=' + encodeURIComponent(pathname);
    return null;
  }

  const currentNav = navItems.find((item) =>
    item.href === '/dashboard'
      ? pathname === '/dashboard'
      : pathname.startsWith(item.href)
  );
  const pageTitle = currentNav ? t(currentNav.labelKey) : t('dashboard');

  const showNewAppointment = roleAccess === 'full' || roleAccess === 'front_desk';

  const displayName = isOwner ? (salon?.name || 'Owner') : isPartner ? currentPartner?.name : currentStaff?.name;
  const displayRole = isOwner ? 'Owner' : isPartner ? 'Owner' : currentStaff?.role?.replace('_', ' ');
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

      {/* Sidebar — dark navy, TaskPro style */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-sidebar text-sidebar-foreground flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] lg:relative lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border">
          <div className="w-9 h-9 rounded-lg bg-gold/15 flex items-center justify-center">
            <Scissors className="w-5 h-5 text-gold" />
          </div>
          <div className="flex flex-col">
            <span className="font-heading text-lg font-bold tracking-tight text-white">iCut</span>
            {salon && (
              <span className="text-[11px] text-slate-400 truncate">
                {salon.name}
              </span>
            )}
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden ml-auto p-2 rounded-lg hover:bg-sidebar-accent transition-colors" aria-label="Close menu">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Branch selector */}
        {currentBranch && (
          <div className="px-5 py-3 border-b border-sidebar-border">
            {canSwitchBranch ? (
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 w-full outline-none">
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
              <div className="flex items-center gap-2 text-sm text-slate-400">
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
            'bg-slate-500/20 text-slate-400'
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
                className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-all duration-200 ${
                  isActive
                    ? 'bg-gold/15 text-gold font-medium'
                    : 'text-slate-400 hover:bg-sidebar-accent hover:text-slate-200'
                }`}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                <span>{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </nav>

        {/* Settings + Logout at bottom */}
        <div className="px-3 py-3 border-t border-sidebar-border space-y-0.5">
          <Link
            href="/dashboard/settings"
            onClick={() => setSidebarOpen(false)}
            className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-all duration-200 ${
              pathname.startsWith('/dashboard/settings')
                ? 'bg-gold/15 text-gold font-medium'
                : 'text-slate-400 hover:bg-sidebar-accent hover:text-slate-200'
            }`}
          >
            <Settings className="w-5 h-5 shrink-0" />
            <span>{t('settings')}</span>
          </Link>
          <button
            onClick={() => {
              document.cookie = 'icut-session=; path=/; max-age=0';
              document.cookie = 'icut-role=; path=/; max-age=0';
              useAppStore.getState().reset();
              destroySession().catch(() => {});
              window.location.href = '/login';
            }}
            className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-slate-400 hover:bg-sidebar-accent hover:text-slate-200 transition-all duration-200 w-full"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            <span>Log Out</span>
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar — light/white, TaskPro style */}
        <header className="sticky top-0 z-30 bg-white border-b border-border px-4 lg:px-6 h-16 flex items-center gap-4 no-print">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden touch-target p-2 -ml-2 rounded-lg hover:bg-accent transition-colors text-foreground" aria-label="Open menu">
            <Menu className="w-5 h-5" />
          </button>

          {/* Search bar */}
          <div className="hidden sm:flex items-center gap-2 bg-muted rounded-lg px-3 h-10 w-72 focus-within:w-80 border border-border transition-all duration-300">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search..."
              aria-label="Search"
              className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full"
            />
          </div>

          <div className="ml-auto flex items-center gap-3">
            {roleAccess === 'full' && (
              <DropdownMenu>
                <DropdownMenuTrigger className="relative w-11 h-11 rounded-lg bg-muted hover:bg-muted/80 flex items-center justify-center transition-all duration-150 outline-none text-foreground" aria-label="Notifications">
                  <Bell className="w-[18px] h-[18px]" />
                  <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-gold" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72 p-2">
                  <p className="text-xs font-semibold text-muted-foreground px-2 py-1.5 uppercase tracking-wider">Notifications</p>
                  <DropdownMenuItem onClick={() => router.push('/dashboard/inventory')} className="flex items-center gap-3 p-3 cursor-pointer">
                    <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Low Stock Items</p>
                      <p className="text-xs text-muted-foreground">Check inventory levels</p>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push('/dashboard/reports/clients')} className="flex items-center gap-3 p-3 cursor-pointer">
                    <div className="w-8 h-8 rounded-lg bg-orange-500/15 flex items-center justify-center shrink-0">
                      <CreditCard className="w-4 h-4 text-orange-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Udhaar Pending</p>
                      <p className="text-xs text-muted-foreground">View outstanding balances</p>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push('/dashboard/reports/daily')} className="flex items-center gap-3 p-3 cursor-pointer">
                    <div className="w-8 h-8 rounded-lg bg-gold/100/15 flex items-center justify-center shrink-0">
                      <BarChart3 className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Daily Report</p>
                      <p className="text-xs text-muted-foreground">View today&apos;s summary</p>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {showNewAppointment && (
              <Link href="/dashboard/appointments?new=true">
                <Button size="sm" className="bg-gold hover:bg-gold/90 text-black touch-target font-semibold h-10 px-4 text-sm">
                  <Plus className="w-4 h-4 mr-1.5" />
                  <span className="hidden sm:inline">{t('newAppointment')}</span>
                  <span className="sm:hidden">Book</span>
                </Button>
              </Link>
            )}

            {/* User avatar + name */}
            <DropdownMenu>
              <DropdownMenuTrigger className="hidden lg:flex items-center gap-3 pl-3 border-l border-border outline-none cursor-pointer hover:opacity-80 transition-opacity">
                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-foreground">
                  {displayInitial}
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-sm font-semibold text-foreground">{displayName || 'Guest'}</span>
                  <span className="text-[11px] text-muted-foreground capitalize">{displayRole || 'Unknown'}</span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => router.push('/dashboard/settings')} className="flex items-center gap-3 p-3 cursor-pointer">
                  <Settings className="w-4 h-4" />
                  <span>{t('settings')}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    document.cookie = 'icut-session=; path=/; max-age=0';
                    document.cookie = 'icut-role=; path=/; max-age=0';
                    useAppStore.getState().reset();
                    destroySession().catch(() => {});
                    window.location.href = '/login';
                  }}
                  className="flex items-center gap-3 p-3 cursor-pointer text-red-600"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Log Out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 pb-20 lg:pb-6">
          <WhatsAppComposeProvider>
            <ErrorBoundary>{children}</ErrorBoundary>
            <WhatsAppComposeSheet />
          </WhatsAppComposeProvider>
        </main>
      </div>

      {/* Mobile bottom nav — light, TaskPro style */}
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-border flex lg:hidden no-print safe-area-bottom">
        {mobileNav.map((item) => {
          const isActive = item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex-1 flex flex-col items-center py-2.5 text-[11px] touch-target transition-all duration-150 ${
                isActive ? 'text-gold' : 'text-slate-400'
              }`}
            >
              <div className={`p-1.5 rounded-lg mb-0.5 transition-colors ${isActive ? 'bg-gold/10' : ''}`}>
                <item.icon className="w-5 h-5" />
              </div>
              <span className="font-medium">{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
