'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Calendar, CalendarRange, UserCog, Package, Users, TrendingUp, ArrowRight, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import { getTodayPKT } from '@/lib/utils/dates';
import { formatPKR, formatPKRShort } from '@/lib/utils/currency';

interface ReportPreview {
  daily: { revenue: number; bills: number };
  monthly: { revenue: number; trend: number };
  staff: { activeCount: number; topEarner: string };
  inventory: { lowStock: number; totalProducts: number };
  clients: { total: number; udhaarTotal: number };
  profitLoss: { revenue: number; expenses: number };
}

export default function ReportsPage() {
  const { salon, currentBranch } = useAppStore();
  const [data, setData] = useState<ReportPreview | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPreviews = useCallback(async () => {
    if (!salon || !currentBranch) { setLoading(false); return; }
    const today = getTodayPKT();

    try {
      const [billsRes, staffRes, productsRes, clientsRes, expensesRes, staffBillsRes] = await Promise.all([
        supabase.from('bills').select('total_amount, created_at, status').eq('branch_id', currentBranch.id).eq('status', 'paid'),
        supabase.from('staff').select('name, id').eq('branch_id', currentBranch.id).eq('is_active', true),
        supabase.from('products').select('current_stock, low_stock_threshold').eq('salon_id', salon.id).eq('is_active', true),
        supabase.from('clients').select('udhaar_balance').eq('salon_id', salon.id),
        supabase.from('expenses').select('amount').eq('branch_id', currentBranch.id),
        supabase.from('bills').select('staff_id, total_amount').eq('branch_id', currentBranch.id).eq('status', 'paid'),
      ]);

      const bills = (billsRes.data || []) as { total_amount: number; created_at: string; status: string }[];
      const todayBills = bills.filter(b => b.created_at?.startsWith(today));
      const todayRevenue = todayBills.reduce((s, b) => s + b.total_amount, 0);
      const totalRevenue = bills.reduce((s, b) => s + b.total_amount, 0);

      const staffList = (staffRes.data || []) as { name: string; id: string }[];
      const products = (productsRes.data || []) as { current_stock: number; low_stock_threshold: number }[];
      const lowStock = products.filter(p => p.current_stock <= p.low_stock_threshold).length;

      const clients = (clientsRes.data || []) as { udhaar_balance: number }[];
      const udhaarTotal = clients.reduce((s, c) => s + (c.udhaar_balance || 0), 0);

      const expenses = (expensesRes.data || []) as { amount: number }[];
      const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

      // Find actual top earner by aggregating revenue per staff
      const staffBills = (staffBillsRes.data || []) as { staff_id: string; total_amount: number }[];
      const revenueByStaff: Record<string, number> = {};
      staffBills.forEach((b) => {
        if (b.staff_id) {
          revenueByStaff[b.staff_id] = (revenueByStaff[b.staff_id] || 0) + b.total_amount;
        }
      });
      let topEarner = '—';
      let topRevenue = 0;
      staffList.forEach((s) => {
        const rev = revenueByStaff[s.id] || 0;
        if (rev > topRevenue) {
          topRevenue = rev;
          topEarner = s.name;
        }
      });

      const now = new Date();
      const curMonth = now.getMonth();
      const curYear = now.getFullYear();
      const prevMonthDate = new Date(curYear, curMonth - 1, 1);
      const prevMonthEnd = new Date(curYear, curMonth, 0);
      const curMonthStart = new Date(curYear, curMonth, 1);
      const curMonthBills = bills.filter(b => new Date(b.created_at) >= curMonthStart);
      const prevMonthBills = bills.filter(b => {
        const d = new Date(b.created_at);
        return d >= prevMonthDate && d <= prevMonthEnd;
      });
      const curMonthRevenue = curMonthBills.reduce((s, b) => s + b.total_amount, 0);
      const prevMonthRevenue = prevMonthBills.reduce((s, b) => s + b.total_amount, 0);
      const monthTrend = prevMonthRevenue > 0
        ? Math.round(((curMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100)
        : 0;

      setData({
        daily: { revenue: todayRevenue, bills: todayBills.length },
        monthly: { revenue: totalRevenue, trend: monthTrend },
        staff: { activeCount: staffList.length, topEarner },
        inventory: { lowStock, totalProducts: products.length },
        clients: { total: clients.length, udhaarTotal },
        profitLoss: { revenue: totalRevenue, expenses: totalExpenses },
      });
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
    <div className="space-y-4">
      <h2 className="font-heading text-xl font-bold">Reports</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {REPORTS.map((r) => (
          <Link key={r.href} href={r.href} className="group">
            <div className="flex items-center gap-4 p-4 rounded-xl border bg-card hover:border-gold/40 hover:shadow-sm transition-all">
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
                    <p className="text-[10px] text-muted-foreground">{r.metricLabel}</p>
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
