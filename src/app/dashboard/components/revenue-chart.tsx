'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList } from 'recharts';
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
    <Card className="bg-card border border-border rounded-lg">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">{title || t('hourlyRevenue')}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-[280px] flex items-center justify-center overflow-hidden">
            <div className="shimmer h-full w-full rounded-lg" />
          </div>
        ) : data.length === 0 ? (
          <div className="h-[280px] flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-muted/50 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-muted-foreground">No revenue data yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Revenue will appear once transactions are recorded</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} margin={{ top: 20, right: 5, left: -15, bottom: 0 }}>
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
                cursor={{ fill: 'rgba(0,0,0,0.06)' }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const revenue = Number(payload[0].value);
                  return (
                    <div className="bg-black text-white px-3 py-2 rounded-lg border border-border shadow-lg text-xs">
                      <p className="font-semibold mb-1">{label}</p>
                      <p className="text-[#FEBE10] font-medium">{formatPKR(revenue)}</p>
                      <p className="text-white/60 mt-0.5">{payload[0].payload.appointments} appt{payload[0].payload.appointments !== 1 ? 's' : ''}</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="revenue" fill="#FEBE10" radius={[4, 4, 0, 0]} isAnimationActive={true} animationDuration={600} animationEasing="ease-out" animationBegin={200}>
                <LabelList
                  dataKey="revenue"
                  position="top"
                  formatter={(v: unknown) => { const n = Number(v); return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n > 0 ? String(n) : ''; }}
                  style={{ fontSize: 10, fill: 'var(--muted-foreground)', fontWeight: 500 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
