'use client';

import Link from 'next/link';
import { Trophy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/components/providers/language-provider';
import { formatPKR } from '@/lib/utils/currency';

interface StaffPerf {
  name: string;
  services_done: number;
  revenue: number;
  commission?: number;
}

interface StaffPerformanceTableProps {
  data: StaffPerf[];
  loading: boolean;
}

export function StaffPerformanceTable({ data, loading }: StaffPerformanceTableProps) {
  const { t } = useLanguage();

  return (
    <Card className="bg-card border border-border rounded-lg">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium">{t('staffPerformance')}</CardTitle>
        <Link href="/dashboard/reports/staff" className="text-xs text-muted-foreground hover:text-gold transition-colors">
          {t('viewFullReport')}
        </Link>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 shimmer" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-8">No staff data yet</p>
        ) : (
          <div className="space-y-2 stagger-children">
            {data.map((staff, i) => (
              <div
                key={staff.name}
                className={`flex items-center justify-between p-4 rounded-lg border hover:border-border/60 transition-all duration-200 animate-fade-up ${
                  i === 0
                    ? 'border-gold/30 bg-gold/5'
                    : 'bg-background/50 border-border'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gold/20 flex items-center justify-center text-gold font-bold text-sm">
                    {staff.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex items-center gap-2">
                    {i === 0 && <Trophy className="w-3.5 h-3.5 text-gold" />}
                    <span className="text-sm font-medium">{staff.name}</span>
                  </div>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {staff.services_done} services
                </Badge>
                <div className="text-right">
                  <p className="text-sm font-bold">{formatPKR(staff.revenue)}</p>
                  <p className="text-xs text-muted-foreground">{formatPKR(staff.commission ?? 0)} comm.</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
