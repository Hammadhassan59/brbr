'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, Wallet, Banknote, Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import { formatPKR } from '@/lib/utils/currency';
import { getTodayPKT, formatPKDate } from '@/lib/utils/dates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import toast from 'react-hot-toast';
import type { Expense, Staff, Advance } from '@/types/database';
import { createExpense, updateExpense, deleteExpense as deleteExpenseAction, updateCashDrawerExpenses } from '@/app/actions/expenses';
import { recordAdvance } from '@/app/actions/staff';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/empty-state';

const CATEGORIES = [
  'Chai/Snacks',
  'Cleaning Supplies',
  'Transport',
  'Utility Bills',
  'Salon Maintenance',
  'Staff Meals',
  'Office Supplies',
  'Miscellaneous',
];

export default function ExpensesPage() {
  const { salon, currentBranch, currentStaff, currentPartner, isPartner } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [income, setIncome] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>('today');
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Advances display
  const [recentAdvances, setRecentAdvances] = useState<(Advance & { staff_name?: string })[]>([]);

  // Advance state
  const [showAdvance, setShowAdvance] = useState(false);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [advStaffId, setAdvStaffId] = useState('');
  const [advAmount, setAdvAmount] = useState('');
  const [advReason, setAdvReason] = useState('');
  const [editingAdvanceId, setEditingAdvanceId] = useState<string | null>(null);
  const [savingAdv, setSavingAdv] = useState(false);

  // Form state
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const todayPKT = getTodayPKT();

  function daysAgoStr(n: number) { const d = new Date(todayPKT); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }
  function getMonthStr(monthsAgo: number) { const d = new Date(todayPKT); d.setMonth(d.getMonth() - monthsAgo, 1); return d.toISOString().slice(0, 10); }
  function getMonthLabel(monthsAgo: number) { const d = new Date(todayPKT); d.setMonth(d.getMonth() - monthsAgo); return d.toLocaleDateString('en-US', { month: 'short' }); }

  const dateRange = (() => {
    switch (activeFilter) {
      case 'today': return { start: todayPKT, end: todayPKT };
      case '7d': return { start: daysAgoStr(6), end: todayPKT };
      case '30d': return { start: daysAgoStr(29), end: todayPKT };
      default:
        if (activeFilter.startsWith('mon-')) {
          const monthsAgo = Number(activeFilter.split('-')[1]);
          const d = new Date(todayPKT); d.setMonth(d.getMonth() - monthsAgo);
          const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
          const end = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${lastDay}`;
          return { start: getMonthStr(monthsAgo), end: end > todayPKT ? todayPKT : end };
        }
        return { start: todayPKT, end: todayPKT };
    }
  })();

  const fetchExpenses = useCallback(async () => {
    if (!currentBranch) return;
    setLoading(true);

    const { start, end } = dateRange;

    const [expenseRes, billsRes] = await Promise.all([
      supabase.from('expenses').select('*').eq('branch_id', currentBranch.id).gte('date', start).lte('date', end).order('date', { ascending: false }),
      supabase.from('bills').select('total_amount').eq('branch_id', currentBranch.id).eq('status', 'paid').gte('created_at', `${start}T00:00:00`).lte('created_at', `${end}T23:59:59`),
    ]);

    if (expenseRes.data) setExpenses(expenseRes.data as Expense[]);
    setIncome(billsRes.data?.reduce((s: number, b: { total_amount: number }) => s + b.total_amount, 0) || 0);

    // Fetch advances for the same period
    if (salon) {
      const { data: staffData } = await supabase
        .from('staff').select('id, name').eq('salon_id', salon.id);
      const staffMap = new Map((staffData || []).map((s: { id: string; name: string }) => [s.id, s.name]));

      const { data: advData } = await supabase
        .from('advances').select('*')
        .in('staff_id', Array.from(staffMap.keys()))
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: false });

      if (advData) {
        setRecentAdvances(advData.map((a: Advance) => ({ ...a, staff_name: staffMap.get(a.staff_id) || 'Unknown' })));
      }
    }

    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBranch, salon, activeFilter]);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  // Fetch staff for advance dialog
  useEffect(() => {
    if (!currentBranch) return;
    supabase.from('staff').select('*').eq('branch_id', currentBranch.id).eq('is_active', true).order('name')
      .then(({ data }) => { if (data) setStaffList(data as Staff[]); });
  }, [currentBranch]);

  async function saveAdvance() {
    if (!advStaffId) { toast.error('Select a staff member'); return; }
    if (!advAmount || Number(advAmount) <= 0) { toast.error('Enter a valid amount'); return; }
    setSavingAdv(true);
    try {
      if (editingAdvanceId) {
        const { createServerClient } = await import('@/lib/supabase');
        const { error } = await supabase
          .from('advances')
          .update({ amount: Number(advAmount), reason: advReason || null })
          .eq('id', editingAdvanceId);
        if (error) throw new Error(error.message);
        toast.success('Advance updated');
      } else {
        const { error } = await recordAdvance(advStaffId, Number(advAmount), advReason || null);
        if (error) throw new Error(error);
        const staffName = staffList.find((s) => s.id === advStaffId)?.name || 'Staff';
        toast.success(`Advance of Rs ${advAmount} recorded for ${staffName}`);
      }
      setShowAdvance(false);
      setAdvStaffId(''); setAdvAmount(''); setAdvReason(''); setEditingAdvanceId(null);
      fetchExpenses();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save advance');
    } finally {
      setSavingAdv(false);
    }
  }

  function openEditExpense(expense: Expense) {
    setEditingExpense(expense);
    const cat = CATEGORIES.includes(expense.category || '') ? expense.category! : (expense.category ? '__custom' : '');
    setCategory(cat);
    if (cat === '__custom') setCustomCategory(expense.category || '');
    else setCustomCategory('');
    setAmount(String(expense.amount));
    setDescription(expense.description || '');
    setShowAdd(true);
  }

  async function saveExpense() {
    if (!currentBranch) return;
    const finalCategory = category === '__custom' ? customCategory.trim() : category;
    if (category === '__custom' && !finalCategory) { toast.error('Enter a category name'); return; }
    if (!amount || Number(amount) <= 0) { toast.error('Enter a valid amount'); return; }

    setSaving(true);
    try {
      if (editingExpense) {
        const oldAmount = editingExpense.amount;
        const newAmount = Number(amount);
        const { error: updateError } = await updateExpense(editingExpense.id, {
          category: finalCategory || null,
          amount: newAmount,
          description: description || null,
        });
        if (updateError) throw new Error(updateError);

        if (oldAmount !== newAmount) {
          try {
            const { data: drawer } = await supabase
              .from('cash_drawers')
              .select('*')
              .eq('branch_id', currentBranch.id)
              .eq('date', editingExpense.date)
              .eq('status', 'open')
              .single();

            if (drawer) {
              const newTotal = (drawer.total_expenses || 0) - oldAmount + newAmount;
              const { error: drawerError } = await updateCashDrawerExpenses(currentBranch.id, editingExpense.date, newTotal);
              if (drawerError) throw new Error(drawerError);
            }
          } catch {
            toast.error('Expense saved but cash drawer not updated');
          }
        }

        toast.success('Expense updated');
      } else {
        const createdBy = isPartner ? currentPartner?.id : currentStaff?.id;
        const { error: createError } = await createExpense({
          branchId: currentBranch.id,
          category: finalCategory || null,
          amount: Number(amount),
          description: description || null,
          date: todayPKT,
          createdBy: createdBy || null,
        });
        if (createError) throw new Error(createError);

        try {
          const { data: drawer } = await supabase
            .from('cash_drawers')
            .select('*')
            .eq('branch_id', currentBranch.id)
            .eq('date', todayPKT)
            .eq('status', 'open')
            .single();

          if (drawer) {
            const newTotal = (drawer.total_expenses || 0) + Number(amount);
            const { error: drawerError } = await updateCashDrawerExpenses(currentBranch.id, todayPKT, newTotal);
            if (drawerError) throw new Error(drawerError);
          }
        } catch {
          toast.error('Expense saved but cash drawer not updated');
        }

        toast.success('Expense recorded');
      }

      setShowAdd(false);
      setEditingExpense(null);
      setCategory(''); setCustomCategory(''); setAmount(''); setDescription('');
      fetchExpenses();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save expense');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteExpense(expense: Expense) {
    if (!confirm('Delete this expense?')) return;
    try {
      const { error } = await deleteExpenseAction(expense.id);
      if (error) throw new Error(error);
      toast.success('Expense deleted');
      fetchExpenses();
    } catch {
      toast.error('Failed to delete');
    }
  }

  const totalAmount = expenses.reduce((s, e) => s + e.amount, 0);
  const totalAdvances = recentAdvances.reduce((s, a) => s + a.amount, 0);

  // Group by date
  const groupedByDate = expenses.reduce<Record<string, Expense[]>>((acc, e) => {
    const d = e.date;
    if (!acc[d]) acc[d] = [];
    acc[d].push(e);
    return acc;
  }, {});

  // Category breakdown
  const categoryTotals = expenses.reduce<Record<string, number>>((acc, e) => {
    const cat = e.category || 'Uncategorized';
    acc[cat] = (acc[cat] || 0) + e.amount;
    return acc;
  }, {});
  const sortedCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1">
          {([
            { key: 'today', label: 'Today' },
            { key: '7d', label: '7 Days' },
            { key: '30d', label: '30 Days' },
            { key: 'mon-0', label: getMonthLabel(0) },
            { key: 'mon-1', label: getMonthLabel(1) },
            { key: 'mon-2', label: getMonthLabel(2) },
          ]).map(({ key, label }) => (
            <button key={key} onClick={() => setActiveFilter(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 ${
                activeFilter === key ? 'bg-foreground text-white' : 'text-muted-foreground hover:text-foreground'
              }`}
            >{label}</button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => { setAdvStaffId(''); setAdvAmount(''); setAdvReason(''); setEditingAdvanceId(null); setShowAdvance(true); }} className="h-10 px-4 font-medium transition-all duration-150" size="sm">
            <Banknote className="w-4 h-4 mr-1" /> Staff Advance
          </Button>
          <Button onClick={() => { setEditingExpense(null); setCategory(''); setCustomCategory(''); setAmount(''); setDescription(''); setShowAdd(true); }} className="bg-gold hover:bg-gold/90 text-black font-bold h-10 px-4 transition-all duration-150" size="sm">
            <Plus className="w-4 h-4 mr-1" /> Record Expense
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children animate-fade-in">
        <Card className="border-border">
          <CardContent className="p-5 text-center">
            {loading ? <div className="h-12 bg-muted rounded-lg animate-pulse" /> : (
              <>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Income</p>
                <p className="text-2xl font-bold text-green-600 mt-1">{formatPKR(income)}</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-5 text-center">
            {loading ? <div className="h-12 bg-muted rounded-lg animate-pulse" /> : (
              <>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Expenses</p>
                <p className="text-2xl font-bold text-foreground mt-1">{formatPKR(totalAmount)}</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-5 text-center">
            {loading ? <div className="h-12 bg-muted rounded-lg animate-pulse" /> : (
              <>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Advances</p>
                <p className="text-2xl font-bold text-orange-600 mt-1">{formatPKR(totalAdvances)}</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-5 text-center">
            {loading ? <div className="h-12 bg-muted rounded-lg animate-pulse" /> : (
              <>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Net Profit</p>
                <p className={`text-2xl font-bold mt-1 ${income - totalAmount - totalAdvances >= 0 ? 'text-green-600' : 'text-destructive'}`}>{formatPKR(income - totalAmount - totalAdvances)}</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Category breakdown */}
      {sortedCategories.length > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm">By Category</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sortedCategories.map(([cat, total]) => (
                <div key={cat} className="flex items-center gap-3">
                  <span className="text-sm flex-1">{cat}</span>
                  <div className="w-32 bg-secondary rounded-full h-2">
                    <div className="bg-gold/60 h-2" style={{ width: `${totalAmount > 0 ? (total / totalAmount) * 100 : 0}%` }} />
                  </div>
                  <span className="text-sm font-medium w-24 text-right">{formatPKR(total)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Staff Advances */}
      {recentAdvances.length > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Staff Advances</CardTitle>
              <span className="text-sm font-medium text-foreground">{formatPKR(recentAdvances.reduce((s, a) => s + a.amount, 0))}</span>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableBody>
                {recentAdvances.map((adv) => (
                  <TableRow key={adv.id} className="cursor-pointer hover:bg-muted/50" onClick={() => {
                    setAdvStaffId(adv.staff_id);
                    setAdvAmount(String(adv.amount));
                    setAdvReason(adv.reason || '');
                    setEditingAdvanceId(adv.id);
                    setShowAdvance(true);
                  }}>
                    <TableCell className="pl-4">
                      <p className="text-sm font-medium">{adv.staff_name}</p>
                      <p className="text-xs text-muted-foreground">{formatPKDate(adv.date)}{adv.reason ? ` — ${adv.reason}` : ''}</p>
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium text-orange-600">{formatPKR(adv.amount)}</TableCell>
                    <TableCell className="text-right pr-4 w-10">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={(e) => {
                        e.stopPropagation();
                        setAdvStaffId(adv.staff_id);
                        setAdvAmount(String(adv.amount));
                        setAdvReason(adv.reason || '');
                        setEditingAdvanceId(adv.id);
                        setShowAdvance(true);
                      }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Expense list grouped by date */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />)}
        </div>
      ) : expenses.length === 0 ? (
        <EmptyState icon={Wallet} text="noExpensesYet" ctaLabel="addExpense" onAction={() => { setEditingExpense(null); setCategory(''); setCustomCategory(''); setAmount(''); setDescription(''); setShowAdd(true); }} />
      ) : (
        <div className="space-y-4 stagger-children">
        {Object.entries(groupedByDate).sort(([a], [b]) => b.localeCompare(a)).map(([date, dayExpenses]) => (
          <Card key={date} className="border-border animate-fade-up">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{date === todayPKT ? 'Today' : formatPKDate(date)}</CardTitle>
                <span className="text-sm font-medium text-foreground">{formatPKR(dayExpenses.reduce((s, e) => s + e.amount, 0))}</span>
              </div>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableBody>
                  {dayExpenses.map((expense) => (
                    <TableRow key={expense.id} className="cursor-pointer" onClick={() => openEditExpense(expense)}>
                      <TableCell className="pl-4">
                        <p className="text-sm font-medium">{expense.description || expense.category || 'Expense'}</p>
                        {expense.category && expense.description && <p className="text-xs text-muted-foreground">{expense.category}</p>}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium text-foreground">{formatPKR(expense.amount)}</TableCell>
                      <TableCell className="text-right pr-4 w-10">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDeleteExpense(expense); }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
        </div>
      )}

      {/* Staff Advance Dialog */}
      <Dialog open={showAdvance} onOpenChange={(open) => { setShowAdvance(open); if (!open) setEditingAdvanceId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editingAdvanceId ? 'Edit Advance' : 'Record Staff Advance'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Staff Member *</Label>
              <select
                value={advStaffId}
                onChange={(e) => setAdvStaffId(e.target.value)}
                className="mt-1 w-full h-10 border border-border bg-background px-3 text-sm rounded-md"
              >
                <option value="">Select staff</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} — {s.role.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Amount (Rs) *</Label>
              <Input type="number" value={advAmount} onChange={(e) => setAdvAmount(e.target.value)} placeholder="0" className="mt-1 text-lg h-12" inputMode="numeric" min={0} />
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reason</Label>
              <Input value={advReason} onChange={(e) => setAdvReason(e.target.value)} placeholder="e.g. Personal emergency, medical" className="mt-1" />
            </div>
            <Button onClick={saveAdvance} disabled={savingAdv} className="w-full h-11 bg-gold hover:bg-gold/90 text-black border border-gold font-bold transition-all duration-150">
              {savingAdv ? 'Saving...' : editingAdvanceId ? 'Update Advance' : 'Record Advance'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Expense Dialog */}
      <Dialog open={showAdd} onOpenChange={(open) => { setShowAdd(open); if (!open) setEditingExpense(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editingExpense ? 'Edit Expense' : 'Record Expense'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Category</Label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full h-10 border border-border bg-background px-3 text-sm"
              >
                <option value="">Select category</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value="__custom">Other (type your own)</option>
              </select>
              {category === '__custom' && (
                <Input value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} placeholder="Enter category name" className="mt-2" />
              )}
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Amount (Rs) *</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className="mt-1 text-lg h-12" inputMode="numeric" min={0} />
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Chai for customers, cleaning supplies" className="mt-1" />
            </div>
            <Button onClick={saveExpense} disabled={saving} className="w-full h-11 bg-gold hover:bg-gold/90 text-black border border-gold font-bold transition-all duration-150">
              {saving ? 'Saving...' : editingExpense ? 'Update Expense' : 'Record Expense'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
