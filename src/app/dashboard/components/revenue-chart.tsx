'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLanguage } from '@/components/providers/language-provider';
import { formatPKR } from '@/lib/utils/currency';
import { TrendingUp } from 'lucide-react';

interface ChartData {
  label: string;
  revenue: number;
  appointments: number;
}

interface RevenueChartProps {
  data: ChartData[];
  loading: boolean;
  title?: string;
}

export function RevenueChart({ data, loading, title }: RevenueChartProps) {
  const { t } = useLanguage();

  return (
    <Card className="calendar-card bg-card border border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">{title || t('hourlyRevenue')}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-[280px] flex items-center justify-center calendar-card overflow-hidden">
            <div className="shimmer h-full w-full rounded-xl" />
          </div>
        ) : data.length === 0 ? (
          <div className="h-[280px] flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-muted-foreground">No revenue data yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Revenue will appear once transactions are recorded</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: data.length > 15 ? 9 : 11, fill: 'var(--muted-foreground)' }}
                axisLine={false}
                tickLine={false}
                interval={data.length > 20 ? Math.floor(data.length / 10) : 0}
                angle={data.length > 15 ? -45 : 0}
                textAnchor={data.length > 15 ? 'end' : 'middle'}
                height={data.length > 15 ? 50 : 30}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
              />
              <Tooltip
                formatter={(value) => [formatPKR(Number(value)), 'Revenue']}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Bar dataKey="revenue" fill="#FEBE10" radius={[4, 4, 0, 0]} isAnimationActive={true} animationDuration={600} animationEasing="ease-out" animationBegin={200} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
