'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import { getTodayPKT } from '@/lib/utils/dates';
import { KPICards } from './components/kpi-cards';
import { RevenueChart } from './components/revenue-chart';
import { PaymentBreakdown } from './components/payment-breakdown';
import { StaffPerformanceTable } from './components/staff-performance-table';
import { AppointmentsFeed } from './components/appointments-feed';
import { AlertsPanel, buildAlerts } from './components/alerts-panel';
import { StylistDashboard } from './components/stylist-dashboard';
import { OnboardingBanner } from './components/onboarding-banner';
import { Store, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatPKDate } from '@/lib/utils/dates';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import type { DailySummary, AppointmentWithDetails, Staff } from '@/types/database';

interface ChartData {
  label: string;
  revenue: number;
  appointments: number;
}

export default function DashboardPage() {
  const { salon, currentBranch, currentStaff } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [appointments, setAppointments] = useState<AppointmentWithDetails[]>([]);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [cashInDrawer, setCashInDrawer] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [udhaarInfo, setUdhaarInfo] = useState({ clients: 0, total: 0 });
  const [branchStaff, setBranchStaff] = useState<Staff[]>([]);
  const [stylistTips, setStylistTips] = useState(0);



  const isStylist = currentStaff?.role === 'senior_stylist' || currentStaff?.role === 'junior_stylist';
  const todayPKT = getTodayPKT();
  const [selectedDate, setSelectedDate] = useState(todayPKT);
  const [activeFilter, setActiveFilter] = useState<string>('today');
  const [customOpen, setCustomOpen] = useState(false);
  const today = selectedDate;
  const isToday = selectedDate === todayPKT;

  function daysAgoStr(n: number) { const d = new Date(todayPKT); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }

  function getMonthStr(monthsAgo: number) {
    const d = new Date(todayPKT);
    d.setMonth(d.getMonth() - monthsAgo, 1);
    return d.toISOString().slice(0, 10);
  }

  function getMonthLabel(monthsAgo: number) {
    const d = new Date(todayPKT);
    d.setMonth(d.getMonth() - monthsAgo);
    return d.toLocaleDateString('en-US', { month: 'short' });
  }

  function setFilter(key: string, date: string) {
    setActiveFilter(key);
    setSelectedDate(date);
    setRangeFrom(undefined);
    setRangeTo(undefined);
  }

  function navigateDate(delta: number) {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    const newDate = d.toISOString().slice(0, 10);
    if (newDate > todayPKT) return;
    setSelectedDate(newDate);
    setActiveFilter('custom');
  }

  const [rangeFrom, setRangeFrom] = useState<Date | undefined>();
  const [rangeTo, setRangeTo] = useState<Date | undefined>();

  function handleDayClick(day: Date) {
    if (!rangeFrom || (rangeFrom && rangeTo)) {
      setRangeFrom(day);
      setRangeTo(undefined);
      setSelectedDate(day.toISOString().slice(0, 10));
      setActiveFilter('custom');
    } else {
      const from = day < rangeFrom ? day : rangeFrom;
      const to = day < rangeFrom ? rangeFrom : day;
      setRangeFrom(from);
      setRangeTo(to);
      setSelectedDate(from.toISOString().slice(0, 10));
      setActiveFilter('custom');
      setTimeout(() => setCustomOpen(false), 400);
    }
  }

  const endDate = rangeTo ? rangeTo.toISOString().slice(0, 10) : todayPKT;
  const isMultiDay = selectedDate !== endDate || activeFilter === '7d' || activeFilter === '30d' || activeFilter.startsWith('mon-');

  const computedEndDate = (() => {
    if (rangeTo) return rangeTo.toISOString().slice(0, 10);
    if (activeFilter === '7d') return todayPKT;
    if (activeFilter === '30d') return todayPKT;
    if (activeFilter.startsWith('mon-')) {
      const monthsAgo = Number(activeFilter.split('-')[1]);
      const d = new Date(todayPKT);
      d.setMonth(d.getMonth() - monthsAgo);
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const end = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${lastDay}`;
      return end > todayPKT ? todayPKT : end;
    }
    return selectedDate;
  })();

  const fetchDashboardData = useCallback(async () => {
    if (!currentBranch || !salon) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const startDate = selectedDate;
      const endDateFinal = computedEndDate;
      const multiDay = startDate !== endDateFinal;

      const { data: summaryData } = await supabase
        .rpc('get_daily_summary', { p_branch_id: currentBranch.id, p_date: startDate });
      if (summaryData) setSummary(summaryData as DailySummary);

      const aptQuery = supabase
        .from('appointments')
        .select('*, client:clients(*), staff:staff(*), services:appointment_services(*)')
        .eq('branch_id', currentBranch.id)
        .order('start_time');
      if (multiDay) {
        aptQuery.gte('appointment_date', startDate).lte('appointment_date', endDateFinal);
      } else {
        aptQuery.eq('appointment_date', startDate);
      }
      const { data: aptsData } = await aptQuery;
      if (aptsData) setAppointments(aptsData as AppointmentWithDetails[]);

      const { data: drawerData } = await supabase
        .from('cash_drawers')
        .select('*')
        .eq('branch_id', currentBranch.id)
        .eq('date', startDate)
        .maybeSingle();
      if (drawerData) {
        setCashInDrawer(
          (drawerData.opening_balance || 0) +
          (drawerData.total_cash_sales || 0) -
          (drawerData.total_expenses || 0)
        );
      }

      const { data: productsData } = await supabase
        .from('products')
        .select('current_stock, low_stock_threshold')
        .eq('salon_id', salon.id)
        .eq('is_active', true);
      if (productsData) {
        const low = productsData.filter(
          (p: { current_stock: number; low_stock_threshold: number }) =>
            p.current_stock <= p.low_stock_threshold
        );
        setLowStockCount(low.length);
      }

      const { data: udhaarData } = await supabase
        .from('clients')
        .select('udhaar_balance')
        .eq('salon_id', salon.id)
        .gt('udhaar_balance', 0);
      if (udhaarData) {
        setUdhaarInfo({
          clients: udhaarData.length,
          total: udhaarData.reduce((sum: number, c: { udhaar_balance: number }) => sum + c.udhaar_balance, 0),
        });
      }

      const { data: billsData } = await supabase
        .from('bills')
        .select('total_amount, created_at, payment_method, staff_id')
        .eq('branch_id', currentBranch.id)
        .eq('status', 'paid')
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDateFinal}T23:59:59`);

      if (multiDay) {
        const dayMap: Record<string, { revenue: number; appointments: number }> = {};
        const d = new Date(startDate);
        const end = new Date(endDateFinal);
        while (d <= end) {
          const iso = d.toISOString().slice(0, 10);
          const short = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          dayMap[`${iso}|${short}`] = { revenue: 0, appointments: 0 };
          d.setDate(d.getDate() + 1);
        }

        if (billsData) {
          billsData.forEach((bill: { total_amount: number; created_at: string }) => {
            const billDate = bill.created_at.slice(0, 10);
            const key = Object.keys(dayMap).find(k => k.startsWith(billDate));
            if (key) {
              dayMap[key].revenue += bill.total_amount;
              dayMap[key].appointments += 1;
            }
          });
        }

        setChartData(
          Object.entries(dayMap).map(([key, data]) => ({ label: key.split('|')[1], ...data }))
        );

        if (billsData && billsData.length > 0) {
          const totalRev = billsData.reduce((s: number, b: { total_amount: number }) => s + b.total_amount, 0);
          const byMethod = (m: string) => billsData.filter((b: { payment_method: string }) => b.payment_method === m).reduce((s: number, b: { total_amount: number }) => s + b.total_amount, 0);
          const allStaffData = await supabase.from('staff').select('*').eq('branch_id', currentBranch.id).eq('is_active', true);
          const staffList = (allStaffData.data || []) as Staff[];
          const staffMap = new Map<string, { services_done: number; revenue: number }>();
          for (const bill of billsData) {
            const st = staffList.find((s) => s.id === (bill as { staff_id: string }).staff_id);
            const name = st?.name || 'Unknown';
            const e = staffMap.get(name) || { services_done: 0, revenue: 0 };
            e.services_done += 1; e.revenue += bill.total_amount;
            staffMap.set(name, e);
          }
          setSummary({
            total_revenue: totalRev,
            total_bills: billsData.length,
            cash_amount: byMethod('cash'),
            jazzcash_amount: byMethod('jazzcash'),
            easypaisa_amount: byMethod('easypaisa'),
            card_amount: byMethod('card'),
            bank_transfer_amount: byMethod('bank_transfer'),
            udhaar_amount: byMethod('udhaar'),
            top_services: [],
            staff_performance: Array.from(staffMap.entries()).map(([name, s]) => ({ name, ...s })).sort((a, b) => b.revenue - a.revenue),
          } as DailySummary);
        }
      } else {
        const hourMap: Record<string, { revenue: number; appointments: number }> = {};
        for (let h = 9; h <= 21; h++) {
          const label = h === 0 ? '12AM' : h < 12 ? `${h}AM` : h === 12 ? '12PM' : `${h - 12}PM`;
          hourMap[label] = { revenue: 0, appointments: 0 };
        }

        if (billsData) {
          billsData.forEach((bill: { total_amount: number; created_at: string }) => {
            const hour = new Date(bill.created_at).getHours();
            const label = hour === 0 ? '12AM' : hour < 12 ? `${hour}AM` : hour === 12 ? '12PM' : `${hour - 12}PM`;
            if (hourMap[label]) {
              hourMap[label].revenue += bill.total_amount;
              hourMap[label].appointments += 1;
            }
          });
        }

        setChartData(
          Object.entries(hourMap).map(([label, data]) => ({ label, ...data }))
        );
      }

      const { data: staffData } = await supabase
        .from('staff')
        .select('*')
        .eq('branch_id', currentBranch.id)
        .eq('is_active', true);
      if (staffData) setBranchStaff(staffData as Staff[]);

      if (currentStaff && (currentStaff.role === 'senior_stylist' || currentStaff.role === 'junior_stylist')) {
        const { data: tipsData } = await supabase
          .from('tips')
          .select('amount')
          .eq('staff_id', currentStaff.id)
          .eq('date', today);
        if (tipsData) {
          setStylistTips(tipsData.reduce((sum: number, t: { amount: number }) => sum + t.amount, 0));
        }
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBranch, salon, today, computedEndDate, currentStaff, activeFilter]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  useEffect(() => {
    if (!currentBranch) return;

    const appointmentChannel = supabase
      .channel('appointments-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `branch_id=eq.${currentBranch.id}`,
        },
        () => { fetchDashboardData(); }
      )
      .subscribe();

    const billsChannel = supabase
      .channel('bills-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bills',
          filter: `branch_id=eq.${currentBranch.id}`,
        },
        () => { fetchDashboardData(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(appointmentChannel);
      supabase.removeChannel(billsChannel);
    };
  }, [currentBranch, fetchDashboardData]);

  if (isStylist && currentStaff) {
    const myAppointments = appointments.filter((a) => a.staff_id === currentStaff.id);

    const myPerf = summary?.staff_performance?.find((sp) => sp.name === currentStaff.name);
    const todayServicesRevenue = myPerf?.revenue ?? 0;

    let monthlyCommission = 0;
    if (currentStaff.commission_type === 'percentage') {
      monthlyCommission = todayServicesRevenue * (currentStaff.commission_rate / 100);
    } else if (currentStaff.commission_type === 'flat') {
      const servicesDone = myPerf?.services_done ?? 0;
      monthlyCommission = servicesDone * currentStaff.commission_rate;
    }

    return (
      <StylistDashboard
        staffName={currentStaff.name}
        todayAppointments={myAppointments}
        todayEarnings={{ services: todayServicesRevenue, tips: stylistTips }}
        monthlyCommission={monthlyCommission}
        loading={loading}
      />
    );
  }

  const appointmentsDone = appointments.filter((a) => a.status === 'done').length;
  const walkIns = appointments.filter((a) => a.is_walkin).length;
  const noShowCount = appointments.filter((a) => a.status === 'no_show').length;

  const staffPerf = summary?.staff_performance?.map((sp) => {
    const staffRecord = branchStaff.find((s) => s.name === sp.name);
    let commission = 0;
    if (staffRecord) {
      if (staffRecord.commission_type === 'percentage') {
        commission = sp.revenue * (staffRecord.commission_rate / 100);
      } else if (staffRecord.commission_type === 'flat') {
        commission = sp.services_done * staffRecord.commission_rate;
      }
    } else {
      commission = sp.revenue * 0.25;
    }
    return { ...sp, commission };
  }) ?? [];

  const alerts = buildAlerts({
    lowStockCount,
    udhaarClients: udhaarInfo.clients,
    udhaarTotal: udhaarInfo.total,
    noShowCount,
  });

  if (!loading && !salon) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="bg-card border border-border rounded-lg p-8 flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-lg bg-gold/10 flex items-center justify-center">
            <Store className="w-7 h-7 text-gold" />
          </div>
          <p className="text-muted-foreground text-sm">Please log in to see your dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{salon?.name ?? 'Dashboard'}</h1>
          <p className="text-muted-foreground text-sm">
            {rangeTo
              ? `${formatPKDate(selectedDate)} — ${formatPKDate(rangeTo.toISOString().slice(0, 10))}`
              : `${formatPKDate(selectedDate)}${isToday ? ' — Today' : ''}`
            }
          </p>
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          <Button variant="ghost" size="icon" onClick={() => navigateDate(-1)} className="h-11 w-11 transition-all duration-150">
            <ChevronLeft className="w-4 h-4" />
          </Button>

          {([
            { key: 'today', label: 'Today', date: todayPKT },
            { key: '7d', label: '7 Days', date: daysAgoStr(6) },
            { key: '30d', label: '30 Days', date: daysAgoStr(29) },
            { key: 'mon-0', label: getMonthLabel(0), date: getMonthStr(0) },
            { key: 'mon-1', label: getMonthLabel(1), date: getMonthStr(1) },
            { key: 'mon-2', label: getMonthLabel(2), date: getMonthStr(2) },
          ]).map(({ key, label, date: d }) => (
            <button
              key={key}
              onClick={() => setFilter(key, d)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all duration-150 ${
                activeFilter === key
                  ? 'bg-foreground text-white'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}

          <Popover open={customOpen} onOpenChange={(open) => { setCustomOpen(open); if (open) { setRangeFrom(undefined); setRangeTo(undefined); } }}>
            <PopoverTrigger
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all duration-150 flex items-center gap-1.5 outline-none ${
                activeFilter === 'custom'
                  ? 'bg-foreground text-white'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Calendar className="w-3 h-3" />
              Custom
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3" align="end">
              <div className="text-xs text-muted-foreground mb-2 px-1">
                {!rangeFrom ? 'Select start date' : !rangeTo ? 'Select end date' : `${formatPKDate(rangeFrom.toISOString().slice(0, 10))} — ${formatPKDate(rangeTo.toISOString().slice(0, 10))}`}
              </div>
              <CalendarPicker
                mode="range"
                selected={rangeFrom ? { from: rangeFrom, to: rangeTo } : undefined}
                onDayClick={handleDayClick}
                disabled={{ after: new Date(todayPKT) }}
                defaultMonth={new Date(selectedDate)}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>

          <Button variant="ghost" size="icon" onClick={() => navigateDate(1)} className="h-11 w-11 transition-all duration-150" disabled={isToday}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {currentStaff?.role === 'owner' && salon && (
        <OnboardingBanner salonId={salon.id} />
      )}

      <KPICards
        summary={summary}
        appointmentsDone={appointmentsDone}
        appointmentsTotal={appointments.length}
        walkIns={walkIns}
        cashInDrawer={cashInDrawer}
        loading={loading}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          <RevenueChart data={chartData} loading={loading} title={isMultiDay ? 'Revenue by Day' : undefined} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <PaymentBreakdown summary={summary} loading={loading} />
            <AlertsPanel alerts={alerts} loading={loading} />
          </div>

          <StaffPerformanceTable data={staffPerf} loading={loading} />
        </div>

        <div>
          <AppointmentsFeed appointments={appointments} loading={loading} />
        </div>
      </div>
    </div>
  );
}
