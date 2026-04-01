'use client';

import { DollarSign, CalendarDays, Footprints, Wallet } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
      color: 'text-green-600',
      bg: 'bg-green-500/10',
    },
    {
      label: t('totalAppointments'),
      value: `${appointmentsDone} / ${appointmentsTotal}`,
      icon: CalendarDays,
      color: 'text-blue-600',
      bg: 'bg-blue-500/10',
    },
    {
      label: t('walkIns'),
      value: String(walkIns),
      icon: Footprints,
      color: 'text-amber-600',
      bg: 'bg-amber-500/10',
    },
    {
      label: t('cashInDrawer'),
      value: formatPKR(cashInDrawer),
      icon: Wallet,
      color: 'text-purple-600',
      bg: 'bg-purple-500/10',
    },
  ];

  return (
    <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 ${!loading ? 'stagger-children' : ''}`}>
      {cards.map((card) => (
        <Card key={card.label} className={`relative overflow-hidden ${!loading ? 'animate-fade-up' : ''}`}>
          <CardContent className="p-4">
            {loading ? (
              <div className="space-y-2">
                <div className="h-4 w-20 shimmer" />
                <div className="h-7 w-28 shimmer" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground font-medium">{card.label}</span>
                  <div className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center`}>
                    <card.icon className={`w-4 h-4 ${card.color}`} />
                  </div>
                </div>
                <p className="text-xl lg:text-2xl font-heading font-bold">{card.value}</p>
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
