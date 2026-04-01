'use client';

import Link from 'next/link';
import { Trophy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium">{t('staffPerformance')}</CardTitle>
        <Link href="/dashboard/reports/staff" className="text-xs text-gold hover:underline">
          {t('viewFullReport')}
        </Link>
      </CardHeader>
      <CardContent className="px-0">
        {loading ? (
          <div className="space-y-3 px-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 shimmer" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-8">No staff data yet</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Name</TableHead>
                <TableHead className="text-center">Services</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right pr-6">Commission</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="stagger-children">
              {data.map((staff, i) => (
                <TableRow
                  key={staff.name}
                  className={`${i === 0 ? 'bg-gold/5' : ''} animate-fade-up`}
                >
                  <TableCell className="pl-6 font-medium">
                    <span className="flex items-center gap-2">
                      {i === 0 && <Trophy className="w-3.5 h-3.5 text-gold" />}
                      {staff.name}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">{staff.services_done}</TableCell>
                  <TableCell className="text-right">{formatPKR(staff.revenue)}</TableCell>
                  <TableCell className="text-right pr-6">{formatPKR(staff.commission ?? 0)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
