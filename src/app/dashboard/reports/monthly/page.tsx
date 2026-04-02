'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import { formatPKR } from '@/lib/utils/currency';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Bill, Staff } from '@/types/database';

const PIE_COLORS = ['#4ADE80', '#F87171', '#34D399', '#60A5FA', '#C084FC', '#FB923C', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

export default function MonthlyReportPage() {
  const { salon, branches, currentBranch, currentStaff, isPartner } = useAppStore();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [loading, setLoading] = useState(true);
  const [bills, setBills] = useState<Bill[]>([]);
  const [prevBills, setPrevBills] = useState<Bill[]>([]);
  const [staffNameMap, setStaffNameMap] = useState<Record<string, string>>({});
  const [branchScope, setBranchScope] = useState<string>('current');

  const canSeeAllBranches = branches.length > 1 && (isPartner || currentStaff?.role === 'owner' || currentStaff?.role === 'manager');

  const fetchData = useCallback(async () => {
    if (!salon) return;
    setLoading(true);
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const daysInMonth = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${daysInMonth}`;

    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevStart = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
    const prevDays = new Date(prevYear, prevMonth, 0).getDate();
    const prevEnd = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${prevDays}`;

    // Build query based on scope
    let curQuery = supabase.from('bills').select('*').eq('status', 'paid').gte('created_at', `${startDate}T00:00:00`).lte('created_at', `${endDate}T23:59:59`);
    let prevQuery = supabase.from('bills').select('*').eq('status', 'paid').gte('created_at', `${prevStart}T00:00:00`).lte('created_at', `${prevEnd}T23:59:59`);

    if (branchScope === 'all') {
      curQuery = curQuery.eq('salon_id', salon.id);
      prevQuery = prevQuery.eq('salon_id', salon.id);
    } else {
      const bid = branchScope === 'current' ? currentBranch?.id : branchScope;
      if (!bid) { setLoading(false); return; }
      curQuery = curQuery.eq('branch_id', bid);
      prevQuery = prevQuery.eq('branch_id', bid);
    }

    const [curRes, prevRes, staffRes] = await Promise.all([
      curQuery,
      prevQuery,
      supabase.from('staff').select('*').eq('salon_id', salon.id),
    ]);
    if (curRes.data) setBills(curRes.data as Bill[]);
    if (prevRes.data) setPrevBills(prevRes.data as Bill[]);
    if (staffRes.data) {
      const map: Record<string, string> = {};
      (staffRes.data as Staff[]).forEach((s) => { map[s.id] = s.name; });
      setStaffNameMap(map);
    }
    setLoading(false);
  }, [currentBranch, salon, month, year, branchScope]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalRevenue = bills.reduce((s, b) => s + b.total_amount, 0);
  const daysInMonth = new Date(year, month, 0).getDate();
  const avgDaily = bills.length > 0 ? totalRevenue / daysInMonth : 0;

  // Daily revenue trend — compare only up to the min days shared by both months
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevDaysInMonth = new Date(prevYear, prevMonth, 0).getDate();
  const comparableDays = Math.min(daysInMonth, prevDaysInMonth);

  const dailyData = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const dayStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayBills = bills.filter((b) => b.created_at.startsWith(dayStr));
    // Only include previous month data for days both months share
    const prevDayBills = day <= comparableDays
      ? prevBills.filter((b) => {
          const d = new Date(b.created_at).getDate();
          return d === day;
        })
      : [];
    return {
      day: `Day ${day}`,
      current: dayBills.reduce((s, b) => s + b.total_amount, 0),
      previous: prevDayBills.reduce((s, b) => s + b.total_amount, 0),
    };
  });

  // Payment breakdown
  const paymentMap: Record<string, number> = {};
  bills.forEach((b) => {
    const method = b.payment_method || 'other';
    paymentMap[method] = (paymentMap[method] || 0) + b.total_amount;
  });
  const paymentData = Object.entries(paymentMap).map(([name, value]) => ({ name: name.replace('_', ' '), value }));

  // Staff leaderboard
  const staffLeaderMap: Record<string, { name: string; count: number; revenue: number }> = {};
  bills.forEach((b) => {
    if (!b.staff_id) return;
    if (!staffLeaderMap[b.staff_id]) staffLeaderMap[b.staff_id] = { name: staffNameMap[b.staff_id] || 'Unknown', count: 0, revenue: 0 };
    staffLeaderMap[b.staff_id].count++;
    staffLeaderMap[b.staff_id].revenue += b.total_amount;
  });
  const staffLeaderboard = Object.values(staffLeaderMap).sort((a, b) => b.revenue - a.revenue);

  return (
    <div className="space-y-4">
      <Link href="/dashboard/reports" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Back to Reports
      </Link>

      {/* Branch scope selector */}
      {canSeeAllBranches && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setBranchScope('current')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${branchScope === 'current' ? 'bg-gold text-black' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}
          >
            {currentBranch?.name || 'Current'}
          </button>
          {branches.filter(b => b.id !== currentBranch?.id).map(b => (
            <button
              key={b.id}
              onClick={() => setBranchScope(b.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${branchScope === b.id ? 'bg-gold text-black' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}
            >
              {b.name}
            </button>
          ))}
          <button
            onClick={() => setBranchScope('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${branchScope === 'all' ? 'bg-gold text-black' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}
          >
            All Branches
          </button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <h2 className="font-heading text-xl font-bold">Monthly Report</h2>
        <Select value={String(month)} onValueChange={(v) => { if (v) setMonth(Number(v)); }}>
          <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{Array.from({ length: 12 }, (_, i) => <SelectItem key={i + 1} value={String(i + 1)}>{new Date(2000, i).toLocaleString('default', { month: 'long' })}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => { if (v) setYear(Number(v)); }}>
          <SelectTrigger className="w-[90px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{[2024, 2025, 2026].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Revenue', value: formatPKR(totalRevenue) },
          { label: 'Total Bills', value: String(bills.length) },
          { label: 'Avg Daily Revenue', value: formatPKR(Math.round(avgDaily)) },
          { label: 'Avg Bill Size', value: formatPKR(bills.length > 0 ? Math.round(totalRevenue / bills.length) : 0) },
        ].map((c) => (
          <Card key={c.label}><CardContent className="p-4 text-center">
            {loading ? <div className="h-12 bg-muted rounded animate-pulse" /> : (<><p className="text-xs text-muted-foreground">{c.label}</p><p className="text-xl font-bold">{c.value}</p></>)}
          </CardContent></Card>
        ))}
      </div>

      {/* Revenue trend */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Revenue Trend — This Month vs Last Month</CardTitle></CardHeader>
        <CardContent>
          {loading ? <div className="h-[250px] bg-muted rounded animate-pulse" /> : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={dailyData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                <Tooltip formatter={(v) => formatPKR(Number(v))} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Line type="monotone" dataKey="current" stroke="#FEBE10" strokeWidth={2} name="This Month" dot={false} />
                <Line type="monotone" dataKey="previous" stroke="#555555" strokeWidth={1} strokeDasharray="5 5" name="Last Month" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Payment methods */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Payment Methods</CardTitle></CardHeader>
          <CardContent>
            {paymentData.length === 0 ? <p className="text-center text-muted-foreground text-sm py-6">No data</p> : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart><Pie data={paymentData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={2}>
                  {paymentData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie><Tooltip formatter={(v) => formatPKR(Number(v))} /><Legend wrapperStyle={{ fontSize: '10px' }} /></PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Staff leaderboard */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Staff Leaderboard</CardTitle></CardHeader>
          <CardContent className="px-0">
            {staffLeaderboard.length === 0 ? <p className="text-center text-muted-foreground text-sm py-6">No data</p> : (
              <Table><TableHeader><TableRow><TableHead className="pl-4">#</TableHead><TableHead>Staff</TableHead><TableHead className="text-center">Bills</TableHead><TableHead className="text-right pr-4">Revenue</TableHead></TableRow></TableHeader>
                <TableBody>{staffLeaderboard.slice(0, 10).map((s, i) => (
                  <TableRow key={s.name}><TableCell className="pl-4 text-sm">{i + 1}</TableCell><TableCell className="text-sm font-medium">{s.name}</TableCell><TableCell className="text-center text-sm">{s.count}</TableCell><TableCell className="text-right pr-4 text-sm">{formatPKR(s.revenue)}</TableCell></TableRow>
                ))}</TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
