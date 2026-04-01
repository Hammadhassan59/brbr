'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, UserPlus, Wallet, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function QuickActions() {
  const [open, setOpen] = useState(false);

  const actions = [
    { label: 'New Appointment', href: '/dashboard/appointments', icon: Plus, color: 'bg-blue-500' },
    { label: 'Walk-in', href: '/dashboard/appointments?walkin=true', icon: UserPlus, color: 'bg-amber-500' },
    { label: 'Cash Drawer', href: '/dashboard/reports/daily', icon: Wallet, color: 'bg-green-500' },
    { label: 'WhatsApp Blast', href: '/dashboard/whatsapp/campaigns', icon: MessageCircle, color: 'bg-purple-500' },
  ];

  return (
    <div className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-20 no-print">
      {/* Action buttons */}
      {open && (
        <div className="flex flex-col gap-2 mb-3">
          {actions.map((action) => (
            <Link key={action.label} href={action.href} onClick={() => setOpen(false)}>
              <div className="flex items-center gap-2 justify-end">
                <span className="bg-card shadow-lg text-sm font-medium px-3 py-1.5 rounded-lg border">
                  {action.label}
                </span>
                <div className={`w-10 h-10 rounded-full ${action.color} text-white flex items-center justify-center shadow-lg`}>
                  <action.icon className="w-5 h-5" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* FAB */}
      <Button
        onClick={() => setOpen(!open)}
        className={`w-14 h-14 rounded-full shadow-xl transition-all ${
          open ? 'bg-foreground rotate-45' : 'bg-gold hover:bg-gold/90'
        }`}
      >
        <Plus className="w-6 h-6" />
      </Button>
    </div>
  );
}
