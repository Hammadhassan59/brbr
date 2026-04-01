'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLanguage } from '@/components/providers/language-provider';
import { formatPKR } from '@/lib/utils/currency';
import type { DailySummary } from '@/types/database';

const COLORS: Record<string, string> = {
  Cash: '#4ADE80',
  JazzCash: '#F87171',
  EasyPaisa: '#34D399',
  Card: '#60A5FA',
  'Bank Transfer': '#C084FC',
  Udhaar: '#FB923C',
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
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{t('paymentBreakdown')}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-[250px] flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
          </div>
        ) : data.length === 0 ? (
          <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
            No payment data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={3}
                dataKey="value"
              >
                {data.map((entry) => (
                  <Cell key={entry.name} fill={COLORS[entry.name] || '#555555'} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => formatPKR(Number(value))}
                contentStyle={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Legend
                formatter={(value: string) => {
                  const item = data.find((d) => d.name === value);
                  return `${value}: ${item ? formatPKR(item.value) : ''}`;
                }}
                wrapperStyle={{ fontSize: '11px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
