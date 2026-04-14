'use client';

import { DollarSign, CalendarDays, Footprints, Wallet, Banknote, CreditCard } from 'lucide-react';
import { formatPKR } from '@/lib/utils/currency';
import { useLanguage } from '@/components/providers/language-provider';
import type { DailySummary } from '@/types/database';

interface KPICardsProps {
  summary: DailySummary | null;
  appointmentsDone: number;
  appointmentsTotal: number;
  walkIns: number;
  cashInDrawer: number;
  loading: boolean;
  activeFilter?: string;
}

export function KPICards({ summary, appointmentsDone, appointmentsTotal, walkIns, cashInDrawer, loading, activeFilter }: KPICardsProps) {
  const { t } = useLanguage();

  const revenueLabel = (() => {
    if (!activeFilter || activeFilter === 'today') return t('todayRevenue');
    if (activeFilter === '7d') return '7-Day Revenue';
    if (activeFilter === '30d') return '30-Day Revenue';
    if (activeFilter.startsWith('mon-')) {
      const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const d = new Date();
      d.setMonth(d.getMonth() - Number(activeFilter.split('-')[1]));
      return `${months[d.getMonth() + 1]} Revenue`;
    }
    if (activeFilter === 'custom') return 'Period Revenue';
    return t('todayRevenue');
  })();

  const cards = [
    {
      label: revenueLabel,
      value: formatPKR(summary?.total_revenue ?? 0),
      icon: DollarSign,
    },
    {
      label: t('totalAppointments'),
      value: `${appointmentsDone} / ${appointmentsTotal}`,
      icon: CalendarDays,
    },
    {
      label: t('walkIns'),
      value: String(walkIns),
      icon: Footprints,
    },
    {
      label: t('cashInDrawer'),
      value: formatPKR(cashInDrawer),
      icon: Wallet,
    },
    {
      label: 'Cash Received',
      value: formatPKR(summary?.cash_amount ?? 0),
      icon: Banknote,
    },
    {
      label: 'Online + Card',
      value: formatPKR(
        (summary?.jazzcash_amount ?? 0) +
        (summary?.easypaisa_amount ?? 0) +
        (summary?.card_amount ?? 0) +
        (summary?.bank_transfer_amount ?? 0)
      ),
      icon: CreditCard,
    },
  ];

  return (
    <div className={`grid grid-cols-2 lg:grid-cols-3 gap-4 ${!loading ? 'stagger-children' : ''}`}>
      {cards.map((card) => (
        <div
          key={card.label}
          className={`bg-card border border-border rounded-lg p-5 hover:border-b-gold/50 transition-all duration-200 ${!loading ? 'animate-fade-up' : ''}`}
        >
          {loading ? (
            <div className="space-y-3">
              <div className="h-5 w-24 shimmer" />
              <div className="h-8 w-32 shimmer" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{card.label}</span>
                <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center">
                  <card.icon className="w-4 h-4 text-background" />
                </div>
              </div>
              <p className="text-2xl font-bold">{card.value}</p>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
