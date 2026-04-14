'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Package, Truck, Users, LayoutDashboard, Beaker } from 'lucide-react';

type TabDef = {
  href: string;
  label: string;
  icon: typeof Package;
  exact?: boolean;
  matchQuery?: { key: string; value: string };
};

const TABS: TabDef[] = [
  { href: '/dashboard/inventory', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/inventory/products', label: 'Products', icon: Package },
  { href: '/dashboard/inventory/products?tab=backbar', label: 'Back Bar', icon: Beaker, matchQuery: { key: 'tab', value: 'backbar' } },
  { href: '/dashboard/inventory/orders', label: 'Orders', icon: Truck },
  { href: '/dashboard/inventory/suppliers', label: 'Suppliers', icon: Users },
];

function InventoryTabsInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get('tab');

  return (
    <div className="bg-card border border-border rounded-lg p-1.5 flex items-center gap-1">
      {TABS.map((tab) => {
        const basePath = tab.href.split('?')[0];
        let isActive: boolean;
        if (tab.matchQuery) {
          isActive = pathname === basePath && currentTab === tab.matchQuery.value;
        } else if (tab.exact) {
          isActive = pathname === tab.href;
        } else if (basePath === '/dashboard/inventory/products') {
          isActive = pathname.startsWith(basePath) && currentTab !== 'backbar';
        } else {
          isActive = pathname.startsWith(basePath);
        }
        return (
          <Link
            key={tab.label}
            href={tab.href}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-md transition-all duration-150 ${
              isActive
                ? 'bg-foreground text-white'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<div className="h-12 bg-card border border-border rounded-lg" />}>
        <InventoryTabsInner />
      </Suspense>
      {children}
    </div>
  );
}
