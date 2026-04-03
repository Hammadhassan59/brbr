'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, UserPlus, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function QuickActions() {
  const [open, setOpen] = useState(false);

  const actions = [
    { label: 'New Appointment', href: '/dashboard/appointments', icon: Plus, color: 'bg-blue-500' },
    { label: 'Walk-in', href: '/dashboard/appointments?walkin=true', icon: UserPlus, color: 'bg-amber-500' },
    { label: 'Cash Drawer', href: '/dashboard/reports/daily', icon: Wallet, color: 'bg-green-500' },
  ];

  return (
    <div className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-20 no-print">
      {open && (
        <div className="flex flex-col gap-2 mb-3 stagger-children">
          {actions.map((action, i) => (
            <Link key={action.label} href={action.href} onClick={() => setOpen(false)}>
              <div
                className="flex items-center gap-2 justify-end animate-fade-up"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <span className="calendar-card bg-card border border-border/50 shadow-lg text-sm font-medium px-4 py-2 rounded-xl">
                  {action.label}
                </span>
                <div className={`w-12 h-12 rounded-full ${action.color} text-white flex items-center justify-center shadow-lg`}>
                  <action.icon className="w-6 h-6" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Button
        onClick={() => setOpen(!open)}
        aria-label="Quick actions"
        className={`w-16 h-16 rounded-full shadow-xl border-0 transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
          open ? 'bg-foreground text-background rotate-45' : 'bg-gold hover:bg-gold/90 text-black'
        }`}
      >
        <Plus className="w-7 h-7" />
      </Button>
    </div>
  );
}
