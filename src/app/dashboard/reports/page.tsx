'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Calendar, CalendarRange, UserCog, Package, Users, TrendingUp, ArrowRight, ArrowUpRight, ArrowDownRight, BarChart3 } from 'lucide-react';
import { getReportsOverview } from '@/app/actions/dashboard';
import { useAppStore } from '@/store/app-store';
import { usePermission } from '@/lib/permissions';
import { formatPKR, formatPKRShort } from '@/lib/utils/currency';
import { EmptyState } from '@/components/empty-state';

interface ReportPreview {
  daily: { revenue: number; bills: number };
  monthly: { revenue: number; trend: number };
  staff: { activeCount: number; topEarner: string };
  inventory: { lowStock: number; totalProducts: number };
  clients: { total: number; udhaarTotal: number };
  profitLoss: { revenue: number; expenses: number };
}

export default function ReportsPage() {
  const router = useRouter();
  const { salon, currentBranch } = useAppStore();
  const canViewReports = usePermission('view_reports');
  const [data, setData] = useState<ReportPreview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!canViewReports) {
      toast.error('You do not have permission to view reports');
      router.replace('/dashboard');
    }
  }, [canViewReports, router]);

  const fetchPreviews = useCallback(async () => {
    if (!salon || !currentBranch) { setLoading(false); return; }
    try {
      // One server-action call replaces 7 client-side .from() reads + the
      // PostgREST embedded join (staff_branches!inner) the page used to
      // resolve branch-membership client-side.
      const { data: overview } = await getReportsOverview({ branchId: currentBranch.id });
      if (overview) setData(overview);
    } catch (err) {
      console.error('Reports preview fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [salon, currentBranch]);

  useEffect(() => { fetchPreviews(); }, [fetchPreviews]);

  const REPORTS = [
    {
      href: '/dashboard/reports/daily',
      label: 'Daily Report',
      desc: 'Cash drawer, sales, payments',
      icon: Calendar,
      metric: data ? formatPKR(data.daily.revenue) : '—',
      metricLabel: "Today's revenue",
      sub: data ? `${data.daily.bills} bills` : '',
    },
    {
      href: '/dashboard/reports/monthly',
      label: 'Monthly Report',
      desc: 'Revenue trend, top services',
      icon: CalendarRange,
      metric: data ? formatPKRShort(data.monthly.revenue) : '—',
      metricLabel: 'This month',
      sub: data?.monthly.trend ? `${data.monthly.trend > 0 ? '+' : ''}${data.monthly.trend}%` : '',
      subPositive: (data?.monthly.trend || 0) > 0,
    },
    {
      href: '/dashboard/reports/staff',
      label: 'Staff Report',
      desc: 'Earnings, attendance, services',
      icon: UserCog,
      metric: data ? `${data.staff.activeCount} active` : '—',
      metricLabel: 'Staff members',
      sub: data?.staff.topEarner ? `Top: ${data.staff.topEarner}` : '',
    },
    {
      href: '/dashboard/reports/inventory',
      label: 'Inventory Report',
      desc: 'Consumption, retail, stock',
      icon: Package,
      metric: data ? `${data.inventory.totalProducts} items` : '—',
      metricLabel: 'Products tracked',
      sub: data?.inventory.lowStock ? `${data.inventory.lowStock} low stock` : 'All stocked',
      subAlert: (data?.inventory.lowStock || 0) > 0,
    },
    {
      href: '/dashboard/reports/clients',
      label: 'Client Report',
      desc: 'New, lapsed, udhaar',
      icon: Users,
      metric: data ? `${data.clients.total}` : '—',
      metricLabel: 'Total clients',
      sub: data?.clients.udhaarTotal ? `${formatPKRShort(data.clients.udhaarTotal)} udhaar` : 'No udhaar',
      subAlert: (data?.clients.udhaarTotal || 0) > 0,
    },
    {
      href: '/dashboard/reports/profit-loss',
      label: 'Profit & Loss',
      desc: 'Revenue vs expenses, net profit',
      icon: TrendingUp,
      metric: data ? formatPKRShort(data.profitLoss.revenue - data.profitLoss.expenses) : '—',
      metricLabel: 'Net profit',
      subPositive: (data?.profitLoss.revenue || 0) > (data?.profitLoss.expenses || 0),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-lg p-4">
        <h2 className="font-heading text-xl font-bold">Reports</h2>
      </div>
      {!loading && data === null && (
        <EmptyState icon={BarChart3} text="noDataYet" />
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 stagger-children">
        {REPORTS.map((r) => (
          <Link key={r.href} href={r.href} className="group animate-fade-up">
            <div className="flex items-center gap-4 p-4 border border-border bg-card hover:border-gold/40 transition-all">
              <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                <r.icon className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-heading font-semibold text-sm">{r.label}</p>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <p className="text-[11px] text-muted-foreground">{r.desc}</p>
              </div>
              <div className="text-right shrink-0">
                {loading ? (
                  <div className="w-16 h-5 bg-secondary rounded animate-pulse" />
                ) : (
                  <>
                    <p className="font-heading font-bold text-sm tabular-nums">{r.metric}</p>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">{r.metricLabel}</p>
                    {r.sub && (
                      <p className={`text-[10px] font-medium mt-0.5 flex items-center justify-end gap-0.5 ${
                        r.subAlert ? 'text-amber-600' : r.subPositive ? 'text-green-600' : 'text-muted-foreground'
                      }`}>
                        {r.subPositive && <ArrowUpRight className="w-3 h-3" />}
                        {r.subAlert && <ArrowDownRight className="w-3 h-3" />}
                        {r.sub}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
