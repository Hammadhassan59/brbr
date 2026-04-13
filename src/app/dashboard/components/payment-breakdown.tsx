'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLanguage } from '@/components/providers/language-provider';
import { formatPKR } from '@/lib/utils/currency';
import { Sparkles } from 'lucide-react';
import type { DailySummary } from '@/types/database';

interface PaymentBreakdownProps {
  summary: DailySummary | null;
  loading: boolean;
}

export function PaymentBreakdown({ summary, loading }: PaymentBreakdownProps) {
  const { t } = useLanguage();

  const services = summary?.top_services ?? [];
  const maxRevenue = services.length > 0 ? Math.max(...services.map((s) => s.revenue)) : 0;

  return (
    <Card className="bg-card border border-border rounded-lg">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">{t('topServices')}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-28 shimmer rounded" />
                <div className="h-3 shimmer rounded-full" />
              </div>
            ))}
          </div>
        ) : services.length === 0 ? (
          <div className="py-10 flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-muted/50 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-muted-foreground">No services yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Top services will appear after billing</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {services.map((s, i) => {
              const pct = maxRevenue > 0 ? (s.revenue / maxRevenue) * 100 : 0;
              return (
                <div key={s.name}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">
                        {i + 1}.
                      </span>
                      <span className="text-sm font-medium truncate">{s.name}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {s.count} {s.count === 1 ? 'done' : 'done'}
                      </span>
                      <span className="text-sm font-semibold tabular-nums">{formatPKR(s.revenue)}</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gold transition-all duration-500"
                      style={{ width: `${pct}%`, opacity: 1 - i * 0.12 }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
