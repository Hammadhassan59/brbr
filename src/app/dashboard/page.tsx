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
import { QuickActions } from './components/quick-actions';
import { StylistDashboard } from './components/stylist-dashboard';
import type { DailySummary, AppointmentWithDetails } from '@/types/database';

interface HourlyData {
  hour: string;
  revenue: number;
  appointments: number;
}

export default function DashboardPage() {
  const { salon, currentBranch, currentStaff } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [appointments, setAppointments] = useState<AppointmentWithDetails[]>([]);
  const [hourlyData, setHourlyData] = useState<HourlyData[]>([]);
  const [cashInDrawer, setCashInDrawer] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [udhaarInfo, setUdhaarInfo] = useState({ clients: 0, total: 0 });

  const isStylist = currentStaff?.role === 'senior_stylist' || currentStaff?.role === 'junior_stylist';
  const today = getTodayPKT();

  const fetchDashboardData = useCallback(async () => {
    if (!currentBranch || !salon) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Fetch daily summary via RPC
      const { data: summaryData } = await supabase
        .rpc('get_daily_summary', { p_branch_id: currentBranch.id, p_date: today });
      if (summaryData) setSummary(summaryData as DailySummary);

      // Fetch today's appointments
      const { data: aptsData } = await supabase
        .from('appointments')
        .select('*, client:clients(*), staff:staff(*), services:appointment_services(*)')
        .eq('branch_id', currentBranch.id)
        .eq('appointment_date', today)
        .order('start_time');
      if (aptsData) setAppointments(aptsData as AppointmentWithDetails[]);

      // Fetch cash drawer
      const { data: drawerData } = await supabase
        .from('cash_drawers')
        .select('*')
        .eq('branch_id', currentBranch.id)
        .eq('date', today)
        .single();
      if (drawerData) {
        setCashInDrawer(
          (drawerData.opening_balance || 0) +
          (drawerData.total_cash_sales || 0) -
          (drawerData.total_expenses || 0)
        );
      }

      // Fetch low stock count
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

      // Fetch udhaar info
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

      // Build hourly data from bills
      const { data: billsData } = await supabase
        .from('bills')
        .select('total_amount, created_at')
        .eq('branch_id', currentBranch.id)
        .eq('status', 'paid')
        .gte('created_at', `${today}T00:00:00`)
        .lte('created_at', `${today}T23:59:59`);

      const hourMap: Record<string, { revenue: number; appointments: number }> = {};
      for (let h = 9; h <= 21; h++) {
        const label = h <= 12 ? `${h}AM` : `${h - 12}PM`;
        hourMap[label] = { revenue: 0, appointments: 0 };
      }

      if (billsData) {
        billsData.forEach((bill: { total_amount: number; created_at: string }) => {
          const hour = new Date(bill.created_at).getHours();
          const label = hour <= 12 ? `${hour}AM` : `${hour - 12}PM`;
          if (hourMap[label]) {
            hourMap[label].revenue += bill.total_amount;
            hourMap[label].appointments += 1;
          }
        });
      }

      setHourlyData(
        Object.entries(hourMap).map(([hour, data]) => ({ hour, ...data }))
      );
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [currentBranch, salon, today]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Real-time subscriptions
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

  // Stylist dashboard
  if (isStylist && currentStaff) {
    const myAppointments = appointments.filter((a) => a.staff_id === currentStaff.id);
    return (
      <StylistDashboard
        staffName={currentStaff.name}
        todayAppointments={myAppointments}
        todayEarnings={{ services: 0, tips: 0 }}
        monthlyCommission={0}
        loading={loading}
      />
    );
  }

  // Derived values
  const appointmentsDone = appointments.filter((a) => a.status === 'done').length;
  const walkIns = appointments.filter((a) => a.is_walkin).length;
  const noShowCount = appointments.filter((a) => a.status === 'no_show').length;

  const staffPerf = summary?.staff_performance?.map((sp) => ({
    ...sp,
    commission: sp.revenue * 0.25, // rough estimate; real calc via RPC
  })) ?? [];

  const alerts = buildAlerts({
    lowStockCount,
    udhaarClients: udhaarInfo.clients,
    udhaarTotal: udhaarInfo.total,
    noShowCount,
  });

  // Empty state
  if (!loading && !salon) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-muted-foreground">Please log in to see your dashboard.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* KPI Cards */}
      <KPICards
        summary={summary}
        appointmentsDone={appointmentsDone}
        appointmentsTotal={appointments.length}
        walkIns={walkIns}
        cashInDrawer={cashInDrawer}
        loading={loading}
      />

      {/* Charts + Appointments */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Left: Charts (2 cols) */}
        <div className="lg:col-span-2 space-y-4 lg:space-y-6">
          <RevenueChart data={hourlyData} loading={loading} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PaymentBreakdown summary={summary} loading={loading} />
            <AlertsPanel alerts={alerts} loading={loading} />
          </div>

          <StaffPerformanceTable data={staffPerf} loading={loading} />
        </div>

        {/* Right: Appointments feed (1 col) */}
        <div>
          <AppointmentsFeed appointments={appointments} loading={loading} />
        </div>
      </div>

      {/* Quick Actions FAB */}
      <QuickActions />
    </div>
  );
}
