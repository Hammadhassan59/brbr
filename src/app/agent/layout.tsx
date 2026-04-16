'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Users, Store, Wallet, Receipt, UserCircle,
  LogOut, Scissors, Loader2, AlertTriangle,
} from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { destroySession, getAgentSessionInfo } from '@/app/actions/auth';
import { ErrorBoundary } from '@/components/error-boundary';

const NAV_ITEMS = [
  { href: '/agent', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/agent/leads', icon: Users, label: 'Leads' },
  { href: '/agent/salons', icon: Store, label: 'My Salons' },
  { href: '/agent/commissions', icon: Wallet, label: 'Commissions' },
  { href: '/agent/payouts', icon: Receipt, label: 'Payouts' },
  { href: '/agent/profile', icon: UserCircle, label: 'Profile' },
];

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isSalesAgent, reset } = useAppStore();
  const [isHydrated, setIsHydrated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    getAgentSessionInfo().then((info) => {
      if (info?.isDemo) setIsDemo(true);
    });
  }, []);

  // Wait for Zustand persist to rehydrate before the auth check — otherwise
  // the initial `isSalesAgent: false` state triggers a flash redirect.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setIsHydrated(true); }, []);

  useEffect(() => {
    if (!isHydrated) return;
    if (isSalesAgent) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAuthChecked(true);
      return;
    }
    // Zustand says we're not a sales agent, but the proxy already gated this
    // route via the JWT — so if we got past the proxy, the JWT says we are.
    // Ask the server once to disambiguate (stale localStorage vs actually
    // logged out). Previously we read the non-HttpOnly icut-role cookie here;
    // that cookie is gone now that the proxy uses the HttpOnly JWT.
    let cancelled = false;
    getAgentSessionInfo().then((info) => {
      if (cancelled) return;
      if (info) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setAuthChecked(true);
      } else {
        router.push('/login');
      }
    });
    return () => { cancelled = true; };
  }, [isHydrated, isSalesAgent, router]);

  if (!authChecked) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  function handleLogout() {
    // destroySession clears the HttpOnly icut-token JWT and legacy gate cookies.
    reset();
    destroySession().catch(() => {});
    window.location.href = '/login';
  }

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex w-64 bg-sidebar text-sidebar-foreground flex-col shrink-0">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-sidebar-border">
          <Scissors className="w-5 h-5 text-sidebar-primary" />
          <span className="font-heading text-lg font-bold">iCut</span>
          <span className="text-[10px] bg-gold/20 text-gold px-1.5 py-0.5 rounded font-medium ml-auto">
            AGENT
          </span>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === '/agent'
              ? pathname === '/agent'
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
        <div className="px-5 py-4 border-t border-sidebar-border">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
          >
            <LogOut className="w-4 h-4" />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {isDemo && (
          <div className="bg-amber-500 text-black px-4 py-2 flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span><strong>Demo mode</strong> — this dataset resets every 10 minutes. Anything you create here will not persist.</span>
          </div>
        )}
        <header className="sticky top-0 z-30 bg-card border-b px-6 h-14 flex items-center">
          <h1 className="font-heading text-lg font-semibold">Sales Agent {isDemo && <span className="text-amber-600 text-xs ml-2">(DEMO)</span>}</h1>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>

        {/* Mobile bottom tabs */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-sidebar border-t border-sidebar-border flex justify-around z-40">
          {NAV_ITEMS.slice(0, 5).map((item) => {
            const isActive = item.href === '/agent'
              ? pathname === '/agent'
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] ${
                  isActive ? 'text-sidebar-primary' : 'text-sidebar-foreground/60'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
