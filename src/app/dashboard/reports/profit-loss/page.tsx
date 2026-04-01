'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import { formatPKR } from '@/lib/utils/currency';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import type { Bill, Expense, Staff } from '@/types/database';

export default function ProfitLossPage() {
  const { salon, branches, currentBranch, currentStaff, isPartner } = useAppStore();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [loading, setLoading] = useState(true);
  const [bills, setBills] = useState<Bill[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [branchScope, setBranchScope] = useState<string>('all');

  const canSeeAllBranches = branches.length > 1 && (isPartner || currentStaff?.role === 'owner' || currentStaff?.role === 'manager');
  const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });

  const fetchData = useCallback(async () => {
    if (!salon) return;
    setLoading(true);
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const daysInMonth = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${daysInMonth}`;

    let billQuery = supabase.from('bills').select('*').eq('status', 'paid')
      .gte('created_at', `${startDate}T00:00:00`).lte('created_at', `${endDate}T23:59:59`);
    let expQuery = supabase.from('expenses').select('*')
      .gte('date', startDate).lte('date', endDate);

    if (branchScope === 'all') {
      billQuery = billQuery.eq('salon_id', salon.id);
    } else {
      const bid = branchScope === 'current' ? currentBranch?.id : branchScope;
      if (bid) {
        billQuery = billQuery.eq('branch_id', bid);
        expQuery = expQuery.eq('branch_id', bid);
      }
    }

    const [billRes, expRes, staffRes] = await Promise.all([
      billQuery,
      expQuery,
      supabase.from('staff').select('*').eq('salon_id', salon.id),
    ]);

    if (billRes.data) setBills(billRes.data as Bill[]);
    if (expRes.data) {
      if (branchScope === 'all') {
        const branchIds = new Set(branches.map(b => b.id));
        setExpenses((expRes.data as Expense[]).filter(e => e.branch_id && branchIds.has(e.branch_id)));
      } else {
        setExpenses(expRes.data as Expense[]);
      }
    }
    if (staffRes.data) setStaff(staffRes.data as Staff[]);
    setLoading(false);
  }, [salon, currentBranch, branches, month, year, branchScope]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Revenue breakdown ──
  const totalRevenue = bills.reduce((s, b) => s + b.total_amount, 0);
  const totalTips = bills.reduce((s, b) => s + b.tip_amount, 0);
  const serviceRevenue = totalRevenue - totalTips;

  // Revenue by payment method
  const revenueByMethod: Record<string, number> = {};
  bills.forEach(b => {
    const m = b.payment_method || 'other';
    revenueByMethod[m] = (revenueByMethod[m] || 0) + b.total_amount;
  });

  // ── Expense breakdown ──
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const expenseByCategory: Record<string, number> = {};
  expenses.forEach(e => {
    const cat = e.category || 'Uncategorized';
    expenseByCategory[cat] = (expenseByCategory[cat] || 0) + e.amount;
  });

  // ── Staff costs ──
  const relevantStaff = branchScope === 'all'
    ? staff
    : staff.filter(s => s.branch_id === (branchScope === 'current' ? currentBranch?.id : branchScope));
  const totalSalaries = relevantStaff.reduce((s, st) => s + st.base_salary, 0);

  // Commissions (estimate from bills)
  let totalCommissions = 0;
  bills.forEach(b => {
    if (!b.staff_id) return;
    const st = staff.find(s => s.id === b.staff_id);
    if (!st) return;
    if (st.commission_type === 'percentage') {
      totalCommissions += b.total_amount * st.commission_rate / 100;
    } else {
      totalCommissions += st.commission_rate;
    }
  });

  const totalStaffCosts = totalSalaries + totalCommissions + totalTips;

  // ── Net Profit ──
  const totalCosts = totalExpenses + totalStaffCosts;
  const netProfit = totalRevenue - totalCosts;
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  // ── Weekly trend ──
  const daysInMonth = new Date(year, month, 0).getDate();
  const weeklyData: { week: string; revenue: number; expenses: number; profit: number }[] = [];
  for (let w = 0; w < Math.ceil(daysInMonth / 7); w++) {
    const weekStart = w * 7 + 1;
    const weekEnd = Math.min((w + 1) * 7, daysInMonth);
    const label = `${weekStart}-${weekEnd}`;

    const weekBills = bills.filter(b => {
      const d = new Date(b.created_at).getDate();
      return d >= weekStart && d <= weekEnd;
    });
    const weekExps = expenses.filter(e => {
      const d = new Date(e.date).getDate();
      return d >= weekStart && d <= weekEnd;
    });

    const rev = weekBills.reduce((s, b) => s + b.total_amount, 0);
    const exp = weekExps.reduce((s, e) => s + e.amount, 0);
    weeklyData.push({ week: label, revenue: rev, expenses: exp, profit: rev - exp });
  }

  function exportCSV() {
    const lines = [
      `Profit & Loss Statement — ${monthName} ${year}`,
      `Salon: ${salon?.name || ''}`,
      '',
      'REVENUE',
      `Service Revenue,${serviceRevenue}`,
      `Tips,${totalTips}`,
      `Total Revenue,${totalRevenue}`,
      '',
      'EXPENSES',
      ...Object.entries(expenseByCategory).map(([cat, amt]) => `${cat},${amt}`),
      `Total Operating Expenses,${totalExpenses}`,
      '',
      'STAFF COSTS',
      `Salaries,${totalSalaries}`,
      `Commissions,${Math.round(totalCommissions)}`,
      `Tips (pass-through),${totalTips}`,
      `Total Staff Costs,${totalStaffCosts}`,
      '',
      `TOTAL COSTS,${Math.round(totalCosts)}`,
      `NET PROFIT,${Math.round(netProfit)}`,
      `Profit Margin,${profitMargin.toFixed(1)}%`,
    ];
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `profit-loss-${year}-${String(month).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <Link href="/dashboard/reports" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Back to Reports
      </Link>

      {/* Branch scope */}
      {canSeeAllBranches && (
        <div className="flex flex-wrap gap-1.5">
          {branches.map(b => (
            <button key={b.id} onClick={() => setBranchScope(b.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${branchScope === b.id ? 'bg-gold text-black' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}>
              {b.name}
            </button>
          ))}
          <button onClick={() => setBranchScope('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${branchScope === 'all' ? 'bg-gold text-white' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}>
            All Branches
          </button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <h2 className="font-heading text-xl font-bold">Profit & Loss</h2>
        <Select value={String(month)} onValueChange={(v) => { if (v) setMonth(Number(v)); }}>
          <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{Array.from({ length: 12 }, (_, i) => <SelectItem key={i + 1} value={String(i + 1)}>{new Date(2000, i).toLocaleString('default', { month: 'long' })}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => { if (v) setYear(Number(v)); }}>
          <SelectTrigger className="w-[90px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{[2024, 2025, 2026].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="ml-auto text-xs gap-1" onClick={exportCSV}>
          <Download className="w-3 h-3" /> Export
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted rounded animate-pulse" />)}</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">Total Revenue</p>
                <p className="text-xl font-bold text-green-600">{formatPKR(totalRevenue)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">Total Costs</p>
                <p className="text-xl font-bold text-red-600">{formatPKR(Math.round(totalCosts))}</p>
              </CardContent>
            </Card>
            <Card className={netProfit >= 0 ? 'border-green-500/25' : 'border-red-500/25'}>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">Net Profit</p>
                <div className="flex items-center justify-center gap-1">
                  {netProfit > 0 ? <TrendingUp className="w-4 h-4 text-green-600" /> : netProfit < 0 ? <TrendingDown className="w-4 h-4 text-red-600" /> : <Minus className="w-4 h-4" />}
                  <p className={`text-xl font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatPKR(Math.round(Math.abs(netProfit)))}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">Profit Margin</p>
                <p className={`text-xl font-bold ${profitMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>{profitMargin.toFixed(1)}%</p>
              </CardContent>
            </Card>
          </div>

          {/* Weekly Trend Chart */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Weekly Trend — {monthName} {year}</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={weeklyData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                  <Tooltip formatter={(v) => formatPKR(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="revenue" fill="#4ADE80" name="Revenue" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" fill="#F87171" name="Expenses" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* P&L Statement Table */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Statement — {monthName} {year}</CardTitle></CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableBody>
                  {/* Revenue section */}
                  <TableRow className="bg-green-500/5">
                    <TableCell className="pl-4 font-semibold text-green-600" colSpan={2}>REVENUE</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-8 text-sm">Service Revenue</TableCell>
                    <TableCell className="text-right pr-4 text-sm">{formatPKR(serviceRevenue)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-8 text-sm">Tips</TableCell>
                    <TableCell className="text-right pr-4 text-sm">{formatPKR(totalTips)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-8 text-sm">Revenue by Method</TableCell>
                    <TableCell className="text-right pr-4 text-xs text-muted-foreground">
                      {Object.entries(revenueByMethod).map(([m, v]) => `${m.replace('_', ' ')}: ${formatPKR(v)}`).join(' | ')}
                    </TableCell>
                  </TableRow>
                  <TableRow className="border-t-2">
                    <TableCell className="pl-4 font-bold text-sm">Total Revenue</TableCell>
                    <TableCell className="text-right pr-4 font-bold text-sm text-green-600">{formatPKR(totalRevenue)}</TableCell>
                  </TableRow>

                  {/* Expenses section */}
                  <TableRow className="bg-red-500/5">
                    <TableCell className="pl-4 font-semibold text-red-600" colSpan={2}>OPERATING EXPENSES</TableCell>
                  </TableRow>
                  {Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
                    <TableRow key={cat}>
                      <TableCell className="pl-8 text-sm">{cat}</TableCell>
                      <TableCell className="text-right pr-4 text-sm">{formatPKR(amt)}</TableCell>
                    </TableRow>
                  ))}
                  {Object.keys(expenseByCategory).length === 0 && (
                    <TableRow>
                      <TableCell className="pl-8 text-sm text-muted-foreground" colSpan={2}>No expenses recorded</TableCell>
                    </TableRow>
                  )}
                  <TableRow className="border-t">
                    <TableCell className="pl-4 font-medium text-sm">Total Operating Expenses</TableCell>
                    <TableCell className="text-right pr-4 font-medium text-sm text-red-600">{formatPKR(totalExpenses)}</TableCell>
                  </TableRow>

                  {/* Staff costs */}
                  <TableRow className="bg-orange-500/5">
                    <TableCell className="pl-4 font-semibold text-orange-600" colSpan={2}>STAFF COSTS</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-8 text-sm">Salaries ({relevantStaff.length} staff)</TableCell>
                    <TableCell className="text-right pr-4 text-sm">{formatPKR(totalSalaries)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-8 text-sm">Commissions</TableCell>
                    <TableCell className="text-right pr-4 text-sm">{formatPKR(Math.round(totalCommissions))}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-8 text-sm">Tips (pass-through to staff)</TableCell>
                    <TableCell className="text-right pr-4 text-sm">{formatPKR(totalTips)}</TableCell>
                  </TableRow>
                  <TableRow className="border-t">
                    <TableCell className="pl-4 font-medium text-sm">Total Staff Costs</TableCell>
                    <TableCell className="text-right pr-4 font-medium text-sm text-orange-600">{formatPKR(Math.round(totalStaffCosts))}</TableCell>
                  </TableRow>

                  {/* Net Profit */}
                  <TableRow className="border-t-2">
                    <TableCell className="pl-4 font-bold text-sm">TOTAL COSTS</TableCell>
                    <TableCell className="text-right pr-4 font-bold text-sm text-red-600">{formatPKR(Math.round(totalCosts))}</TableCell>
                  </TableRow>
                  <TableRow className={`${netProfit >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                    <TableCell className="pl-4 font-bold text-base">NET PROFIT</TableCell>
                    <TableCell className={`text-right pr-4 font-bold text-base ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {netProfit < 0 ? '(' : ''}{formatPKR(Math.round(Math.abs(netProfit)))}{netProfit < 0 ? ')' : ''}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-4 text-xs text-muted-foreground">Profit Margin</TableCell>
                    <TableCell className="text-right pr-4 text-xs text-muted-foreground">{profitMargin.toFixed(1)}%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
