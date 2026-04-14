'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Store, Users, BarChart3, Settings,
  Shield, LogOut, Scissors, Loader2,
} from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { destroySession } from '@/app/actions/auth';
import { ErrorBoundary } from '@/components/error-boundary';

const NAV_ITEMS = [
  { href: '/admin', icon: LayoutDashboard, label: 'Overview' },
  { href: '/admin/salons', icon: Store, label: 'Salons' },
  { href: '/admin/users', icon: Users, label: 'Users' },
  { href: '/admin/analytics', icon: BarChart3, label: 'Analytics' },
  { href: '/admin/settings', icon: Settings, label: 'Platform Settings' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { salon, currentStaff, isSuperAdmin, reset } = useAppStore();
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin) {
      router.push('/login');
      return;
    }
    setAuthChecked(true);
  }, [isSuperAdmin, router]);

  if (!authChecked) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  async function handleLogout() {
    document.cookie = 'icut-session=; path=/; max-age=0';
    document.cookie = 'icut-role=; path=/; max-age=0';
    await destroySession();
    reset();
    window.location.href = '/login';
  }

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar text-sidebar-foreground flex flex-col shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-sidebar-border">
          <Scissors className="w-5 h-5 text-sidebar-primary" />
          <span className="font-heading text-lg font-bold">iCut</span>
          <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-medium ml-auto flex items-center gap-1">
            <Shield className="w-3 h-3" /> ADMIN
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
          {NAV_ITEMS.map((item) => {
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
                <span>{item.label}</span>
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
              <p className="text-sm font-medium truncate">{currentStaff?.name || 'Super Admin'}</p>
              <p className="text-xs text-sidebar-foreground/40">Platform Admin</p>
            </div>
            <button onClick={handleLogout} className="text-sidebar-foreground/40 hover:text-sidebar-foreground">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 bg-card border-b px-6 h-14 flex items-center">
          <h1 className="font-heading text-lg font-semibold">iCut Admin Panel</h1>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
