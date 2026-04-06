'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLanguage } from '@/components/providers/language-provider';
import { formatPKR } from '@/lib/utils/currency';
import { PieChartIcon } from 'lucide-react';
import type { DailySummary } from '@/types/database';

const COLORS: Record<string, string> = {
  Cash: '#22C55E',
  JazzCash: '#EF4444',
  EasyPaisa: '#10B981',
  Card: '#3B82F6',
  'Bank Transfer': '#8B5CF6',
  Udhaar: '#F97316',
};

interface PaymentBreakdownProps {
  summary: DailySummary | null;
  loading: boolean;
}

export function PaymentBreakdown({ summary, loading }: PaymentBreakdownProps) {
  const { t } = useLanguage();

  const data = summary ? [
    { name: 'Cash', value: summary.cash_amount },
    { name: 'JazzCash', value: summary.jazzcash_amount },
    { name: 'EasyPaisa', value: summary.easypaisa_amount },
    { name: 'Card', value: summary.card_amount },
    { name: 'Bank Transfer', value: summary.bank_transfer_amount },
    { name: 'Udhaar', value: summary.udhaar_amount },
  ].filter((d) => d.value > 0) : [];

  return (
    <Card className="calendar-card bg-card border border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">{t('paymentBreakdown')}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-[280px] flex items-center justify-center calendar-card overflow-hidden">
            <div className="shimmer h-full w-full rounded-xl" />
          </div>
        ) : data.length === 0 ? (
          <div className="h-[280px] flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center">
              <PieChartIcon className="w-6 h-6 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-muted-foreground">No payment data yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Payment breakdown will appear after transactions</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={95}
                paddingAngle={3}
                dataKey="value"
                label={false}
                isAnimationActive={true}
                animationDuration={800}
                animationBegin={300}
              >
                {data.map((entry) => (
                  <Cell key={entry.name} fill={COLORS[entry.name] || '#555555'} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => formatPKR(Number(value))}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Legend
                formatter={(value: string) => {
                  const item = data.find((d) => d.name === value);
                  return `${value}: ${item ? formatPKR(item.value) : ''}`;
                }}
                wrapperStyle={{ fontSize: '13px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
