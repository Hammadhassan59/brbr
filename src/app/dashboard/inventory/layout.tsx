'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Package, Truck, Users, LayoutDashboard } from 'lucide-react';

const TABS = [
  { href: '/dashboard/inventory', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/inventory/products', label: 'Products', icon: Package },
  { href: '/dashboard/inventory/orders', label: 'Orders', icon: Truck },
  { href: '/dashboard/inventory/suppliers', label: 'Suppliers', icon: Users },
];

export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      {/* Tab navigation */}
      <div className="bg-card border border-border rounded-lg p-1.5 flex items-center gap-1">
        {TABS.map((tab) => {
          const isActive = tab.exact
            ? pathname === tab.href
            : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
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

      {children}
    </div>
  );
}
