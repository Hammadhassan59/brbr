'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight as ChevronRightIcon, Printer, Wallet, Plus, Lock } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { getDailyReport } from '@/app/actions/dashboard';
import { useAppStore } from '@/store/app-store';
import { usePermission } from '@/lib/permissions';
import { formatPKR } from '@/lib/utils/currency';
import { getTodayPKT, formatPKDate, formatDateTime } from '@/lib/utils/dates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import toast from 'react-hot-toast';
import { showActionError, handleSubscriptionError } from '@/components/paywall-dialog';
import { createExpense, updateCashDrawerExpenses } from '@/app/actions/expenses';
import { openCashDrawer as openCashDrawerAction, closeCashDrawer as closeCashDrawerAction } from '@/app/actions/cash-drawer';
import type { DailySummary, Bill, BillItem, CashDrawer, Expense } from '@/types/database';

const PIE_COLORS: Record<string, string> = {
  Cash: '#4ADE80', JazzCash: '#F87171', EasyPaisa: '#34D399', Card: '#60A5FA', 'Bank Transfer': '#C084FC', Udhaar: '#FB923C',
};

export default function DailyReportPage() {
  const router = useRouter();
  const { salon, currentBranch, currentStaff, memberBranches } = useAppStore();
  const [date, setDate] = useState(getTodayPKT());
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [bills, setBills] = useState<(Bill & { items?: BillItem[] })[]>([]);
  const [drawer, setDrawer] = useState<CashDrawer | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [branchScope, setBranchScope] = useState<string>('current'); // 'current' | 'all' | branch id

  // Permission-driven now — role check replaced with the resolved permission
  // map. Multi-branch UI only renders when the session actually has more than
  // one member branch to choose from. Call the hooks unconditionally to keep
  // the hook order stable across renders.
  const canViewReports = usePermission('view_reports');
  const hasViewOtherBranches = usePermission('view_other_branches');
  const canSeeAllBranches = memberBranches.length > 1 && hasViewOtherBranches;

  // Page-level gate: bounce anyone without `view_reports` back to /dashboard
  // with a toast. Owners/partners always have it (lockout-safe).
  useEffect(() => {
    if (!canViewReports) {
      toast.error('You do not have permission to view reports');
      router.replace('/dashboard');
    }
  }, [canViewReports, router]);
  const effectiveBranchId = branchScope === 'current' ? currentBranch?.id : branchScope === 'all' ? null : branchScope;

  // Modals
  const [showOpenDrawer, setShowOpenDrawer] = useState(false);
  const [openingBalance, setOpeningBalance] = useState('');
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expCategory, setExpCategory] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expDesc, setExpDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const isToday = date === getTodayPKT();

  const fetchData = useCallback(async () => {
    if (!salon) return;
    if (!effectiveBranchId && branchScope !== 'all') return;
    setLoading(true);
    try {
      // One server-action call covers both modes (single-branch and
      // cross-branch all-branches). 4 client-side reads collapsed into one.
      const memberBranchIds = memberBranches.map((b) => b.id);
      const branchIdForRead = branchScope === 'all'
        ? null
        : (effectiveBranchId || currentBranch?.id || null);
      const { data } = await getDailyReport({
        branchId: branchIdForRead,
        memberBranchIds,
        date,
      });
      if (data) {
        setSummary(data.summary);
        setBills(data.bills);
        setDrawer(data.drawer);
        setExpenses(data.expenses);
      }
      // For all-branches mode, drawer is always null.
      if (branchScope === 'all') setDrawer(null);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [currentBranch, salon, date, branchScope, effectiveBranchId, memberBranches]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function navDate(delta: number) {
    const d = new Date(date); d.setDate(d.getDate() + delta);
    setDate(d.toISOString().slice(0, 10));
  }

  async function openCashDrawer() {
    if (!currentBranch) return;
    setSaving(true);
    try {
      const result = await openCashDrawerAction({
        branchId: currentBranch.id, date, openingBalance: Number(openingBalance) || 0,
        openedBy: currentStaff?.id || null,
      });
      if (showActionError(result?.error)) return;
      toast.success('Cash drawer opened');
      setShowOpenDrawer(false); fetchData();
    } catch (err: unknown) {
      if (handleSubscriptionError(err)) return;
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
    finally { setSaving(false); }
  }

  async function closeDay() {
    if (!drawer) return;
    const closingBalance = (drawer.opening_balance || 0) + (drawer.total_cash_sales || 0) - totalExpenses;
    await closeCashDrawerAction(drawer.id, {
      closingBalance, closedBy: currentStaff?.id || null, totalExpenses,
    });
    toast.success('Day closed');
    fetchData();
  }

  async function addExpense() {
    if (!currentBranch || !expAmount) return;
    setSaving(true);
    try {
      const { error: expError } = await createExpense({
        branchId: currentBranch.id, category: expCategory || null,
        amount: Number(expAmount), description: expDesc || null, date,
        createdBy: currentStaff?.id || null,
      });
      if (showActionError(expError)) return;
      // Update cash drawer expenses
      if (drawer) {
        await updateCashDrawerExpenses(currentBranch.id, date, (drawer.total_expenses || 0) + Number(expAmount));
      }
      toast.success('Expense added');
      setShowAddExpense(false); setExpCategory(''); setExpAmount(''); setExpDesc('');
      fetchData();
    } catch (err: unknown) {
      if (handleSubscriptionError(err)) return;
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
    finally { setSaving(false); }
  }

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const paidBills = bills.filter((b) => b.status === 'paid');
  const avgBill = paidBills.length > 0 ? paidBills.reduce((s, b) => s + b.total_amount, 0) / paidBills.length : 0;

  // Payment breakdown for chart
  const paymentData = summary ? [
    { name: 'Cash', value: summary.cash_amount },
    { name: 'JazzCash', value: summary.jazzcash_amount },
    { name: 'EasyPaisa', value: summary.easypaisa_amount },
    { name: 'Card', value: summary.card_amount },
    { name: 'Bank Transfer', value: summary.bank_transfer_amount },
    { name: 'Udhaar', value: summary.udhaar_amount },
  ].filter((d) => d.value > 0) : [];

  // Service chart
  const serviceData = summary?.top_services?.map((s) => ({ name: s.name, revenue: s.revenue, count: s.count })) || [];

  return (
    <div className="space-y-6">
      <nav className="no-print flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/dashboard/reports" className="hover:text-foreground">Reports</Link>
        <ChevronRightIcon className="w-3.5 h-3.5" />
        <span className="text-foreground font-medium">Daily</span>
      </nav>

      <div className="no-print bg-card border border-border rounded-lg p-4 space-y-3">
        {canSeeAllBranches && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setBranchScope('current')}
              className={`px-3 py-1.5 text-xs font-medium transition-all ${branchScope === 'current' ? 'bg-gold text-black' : 'bg-secondary/50 border border-border text-muted-foreground hover:bg-secondary/80'}`}
            >
              {currentBranch?.name || 'Current'}
            </button>
            {memberBranches.filter(b => b.id !== currentBranch?.id).map(b => (
              <button
                key={b.id}
                onClick={() => setBranchScope(b.id)}
                className={`px-3 py-1.5 text-xs font-medium transition-all ${branchScope === b.id ? 'bg-gold text-black' : 'bg-secondary/50 border border-border text-muted-foreground hover:bg-secondary/80'}`}
              >
                {b.name}
              </button>
            ))}
            <button
              onClick={() => setBranchScope('all')}
              className={`px-3 py-1.5 text-xs font-medium transition-all ${branchScope === 'all' ? 'bg-gold text-black' : 'bg-secondary/50 border border-border text-muted-foreground hover:bg-secondary/80'}`}
            >
              All Branches
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navDate(-1)}><ChevronLeft className="w-4 h-4" /></Button>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40 h-8" />
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navDate(1)}><ChevronRightIcon className="w-4 h-4" /></Button>
          {!isToday && <Button variant="outline" size="sm" className="text-xs" onClick={() => setDate(getTodayPKT())}>Today</Button>}
          <span className="text-sm font-medium">{formatPKDate(date)}</span>
          <Button variant="outline" size="sm" className="ml-auto gap-1 text-xs" onClick={() => window.print()}><Printer className="w-3 h-3" /> Print</Button>
        </div>
      </div>

      {/* Cash Drawer */}
      <Card className="border-border border-green-500/20">
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Wallet className="w-4 h-4" /> Cash Drawer</CardTitle></CardHeader>
        <CardContent>
          {loading ? <div className="h-20 bg-muted rounded-lg animate-pulse" /> : !drawer ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-2">Cash drawer not opened for this day</p>
              {isToday && <Button size="sm" onClick={() => setShowOpenDrawer(true)} className="bg-gold hover:bg-gold/90 text-black font-bold">Open Cash Drawer</Button>}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div><p className="text-xs text-muted-foreground uppercase tracking-wider">Opening</p><p className="text-lg font-bold">{formatPKR(drawer.opening_balance || 0)}</p></div>
                <div><p className="text-xs text-muted-foreground uppercase tracking-wider">+ Cash Sales</p><p className="text-lg font-bold text-green-600">{formatPKR(drawer.total_cash_sales || 0)}</p></div>
                <div><p className="text-xs text-muted-foreground uppercase tracking-wider">- Expenses</p><p className="text-lg font-bold text-red-600">{formatPKR(totalExpenses)}</p></div>
                <div><p className="text-xs text-muted-foreground uppercase tracking-wider">= Balance</p><p className="text-lg font-bold">{formatPKR((drawer.opening_balance || 0) + (drawer.total_cash_sales || 0) - totalExpenses)}</p></div>
              </div>
              {drawer.status === 'open' && isToday && (
                <div className="no-print flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setShowAddExpense(true)} className="text-xs gap-1"><Plus className="w-3 h-3" /> Add Expense</Button>
                  <Button size="sm" variant="outline" onClick={closeDay} className="text-xs gap-1 ml-auto"><Lock className="w-3 h-3" /> Close Day</Button>
                </div>
              )}
              {drawer.status === 'closed' && <Badge variant="secondary" className="text-xs">Day Closed — {drawer.closing_balance !== null ? formatPKR(drawer.closing_balance) : ''}</Badge>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sales summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-border"><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground uppercase tracking-wider">Bills</p><p className="text-2xl font-bold">{summary?.total_bills || 0}</p></CardContent></Card>
        <Card className="border-border"><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground uppercase tracking-wider">Revenue</p><p className="text-2xl font-bold">{formatPKR(summary?.total_revenue || 0)}</p></CardContent></Card>
        <Card className="border-border"><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground uppercase tracking-wider">Avg Bill</p><p className="text-2xl font-bold">{formatPKR(Math.round(avgBill))}</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Payment Breakdown</CardTitle></CardHeader>
          <CardContent>
            {paymentData.length === 0 ? <p className="text-center text-muted-foreground text-sm py-6">No data</p> : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart><Pie data={paymentData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
                  {paymentData.map((e) => <Cell key={e.name} fill={PIE_COLORS[e.name] || '#555555'} />)}
                </Pie><Tooltip formatter={(v) => formatPKR(Number(v))} /><Legend wrapperStyle={{ fontSize: '11px' }} /></PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Services Today</CardTitle></CardHeader>
          <CardContent>
            {serviceData.length === 0 ? <p className="text-center text-muted-foreground text-sm py-6">No data</p> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={serviceData} layout="vertical" margin={{ left: 5, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => formatPKR(v)} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip formatter={(v) => formatPKR(Number(v))} />
                  <Bar dataKey="revenue" fill="#FEBE10" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Staff performance */}
      {summary?.staff_performance && summary.staff_performance.length > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Staff Performance</CardTitle></CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="pl-4">Name</TableHead><TableHead className="text-center">Services</TableHead><TableHead className="text-right pr-4">Revenue</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {summary.staff_performance.map((sp, i) => (
                  <TableRow key={i}><TableCell className="pl-4 font-medium text-sm">{sp.name}</TableCell><TableCell className="text-center text-sm">{sp.services_done}</TableCell><TableCell className="text-right pr-4 text-sm">{formatPKR(sp.revenue)}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Expenses */}
      {expenses.length > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Expenses ({formatPKR(totalExpenses)})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1">
              {expenses.map((e) => (
                <div key={e.id} className="flex justify-between text-sm py-1 border-b last:border-0">
                  <div><p className="font-medium">{e.description || e.category || 'Expense'}</p><p className="text-xs text-muted-foreground">{e.category}</p></div>
                  <span className="text-red-600 font-medium">{formatPKR(e.amount)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bills list */}
      {paidBills.length > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm">All Bills ({paidBills.length})</CardTitle></CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="pl-4">Bill #</TableHead><TableHead>Time</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right pr-4">Method</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {paidBills.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="pl-4 font-mono text-xs">{b.bill_number}</TableCell>
                    <TableCell className="text-xs">{formatDateTime(b.created_at).split(',')[1]?.trim()}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{formatPKR(b.total_amount)}</TableCell>
                    <TableCell className="text-right pr-4 text-xs capitalize">{b.payment_method?.replace('_', ' ')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Open Drawer Modal */}
      <Dialog open={showOpenDrawer} onOpenChange={setShowOpenDrawer}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Open Cash Drawer</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Opening Balance (Rs)</Label><Input type="number" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} className="mt-1 text-lg" inputMode="numeric" placeholder="0" /></div>
            <Button onClick={openCashDrawer} disabled={saving} className="w-full bg-gold hover:bg-gold/90 text-black font-bold">{saving ? 'Opening...' : 'Open Drawer'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Expense Modal */}
      <Dialog open={showAddExpense} onOpenChange={setShowAddExpense}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Expense</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Category</Label>
              <select value={expCategory} onChange={(e) => setExpCategory(e.target.value)} className="mt-1 w-full h-9 border bg-background px-3 text-sm">
                <option value="">Select</option>
                {['Chai/Snacks', 'Cleaning Supplies', 'Transport', 'Utility', 'Miscellaneous'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div><Label className="text-xs">Amount (Rs) *</Label><Input type="number" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} className="mt-1" inputMode="numeric" /></div>
            <div><Label className="text-xs">Description</Label><Input value={expDesc} onChange={(e) => setExpDesc(e.target.value)} className="mt-1" /></div>
            <Button onClick={addExpense} disabled={saving} className="w-full bg-gold hover:bg-gold/90 text-black font-bold">{saving ? 'Adding...' : 'Add Expense'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
