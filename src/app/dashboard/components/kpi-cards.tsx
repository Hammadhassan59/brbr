'use client';

import { DollarSign, CalendarDays, Footprints, Wallet } from 'lucide-react';
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
}

export function KPICards({ summary, appointmentsDone, appointmentsTotal, walkIns, cashInDrawer, loading }: KPICardsProps) {
  const { t } = useLanguage();

  const cards = [
    {
      label: t('todayRevenue'),
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
  ];

  return (
    <div className={`grid grid-cols-2 lg:grid-cols-4 gap-4 ${!loading ? 'stagger-children' : ''}`}>
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
                <div>
                  <card.icon className="w-5 h-5 text-foreground" />
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
