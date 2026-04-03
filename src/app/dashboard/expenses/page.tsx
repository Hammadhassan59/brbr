'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Wallet, Trash2 } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import toast from 'react-hot-toast';
import type { Expense } from '@/types/database';

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
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'today' | 'week' | 'month'>('today');
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Form state
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const today = getTodayPKT();

  const fetchExpenses = useCallback(async () => {
    if (!currentBranch) return;
    setLoading(true);

    let startDate = today;
    if (tab === 'week') {
      const d = new Date(today);
      d.setDate(d.getDate() - 7);
      startDate = d.toISOString().split('T')[0];
    } else if (tab === 'month') {
      const d = new Date(today);
      d.setDate(d.getDate() - 30);
      startDate = d.toISOString().split('T')[0];
    }

    const { data } = await supabase
      .from('expenses')
      .select('*')
      .eq('branch_id', currentBranch.id)
      .gte('date', startDate)
      .lte('date', today)
      .order('date', { ascending: false });

    if (data) setExpenses(data as Expense[]);
    setLoading(false);
  }, [currentBranch, today, tab]);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

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
        await supabase.from('expenses').update({
          category: finalCategory || null,
          amount: newAmount,
          description: description || null,
        }).eq('id', editingExpense.id);

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
              const { error: drawerError } = await supabase.from('cash_drawers').update({
                total_expenses: (drawer.total_expenses || 0) - oldAmount + newAmount,
              }).eq('id', drawer.id);
              if (drawerError) throw drawerError;
            }
          } catch {
            toast.error('Expense saved but cash drawer not updated');
          }
        }

        toast.success('Expense updated');
      } else {
        const createdBy = isPartner ? currentPartner?.id : currentStaff?.id;
        await supabase.from('expenses').insert({
          branch_id: currentBranch.id,
          category: finalCategory || null,
          amount: Number(amount),
          description: description || null,
          date: today,
          created_by: createdBy || null,
        });

        try {
          const { data: drawer } = await supabase
            .from('cash_drawers')
            .select('*')
            .eq('branch_id', currentBranch.id)
            .eq('date', today)
            .eq('status', 'open')
            .single();

          if (drawer) {
            const { error: drawerError } = await supabase.from('cash_drawers').update({
              total_expenses: (drawer.total_expenses || 0) + Number(amount),
            }).eq('id', drawer.id);
            if (drawerError) throw drawerError;
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

  async function deleteExpense(expense: Expense) {
    if (!confirm('Delete this expense?')) return;
    try {
      await supabase.from('expenses').delete().eq('id', expense.id);
      toast.success('Expense deleted');
      fetchExpenses();
    } catch {
      toast.error('Failed to delete');
    }
  }

  const totalAmount = expenses.reduce((s, e) => s + e.amount, 0);

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
      <div className="calendar-card bg-card border border-border shadow-sm p-4 flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="h-auto gap-1 bg-transparent p-0">
            <TabsTrigger value="today" className="calendar-card text-xs transition-all duration-150 data-[state=active]:bg-gold data-[state=active]:text-black data-[state=active]:shadow-sm bg-secondary/50 border border-border text-muted-foreground hover:border-gold/30">Today</TabsTrigger>
            <TabsTrigger value="week" className="calendar-card text-xs transition-all duration-150 data-[state=active]:bg-gold data-[state=active]:text-black data-[state=active]:shadow-sm bg-secondary/50 border border-border text-muted-foreground hover:border-gold/30">Last 7 Days</TabsTrigger>
            <TabsTrigger value="month" className="calendar-card text-xs transition-all duration-150 data-[state=active]:bg-gold data-[state=active]:text-black data-[state=active]:shadow-sm bg-secondary/50 border border-border text-muted-foreground hover:border-gold/30">Last 30 Days</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="ml-auto">
          <Button onClick={() => { setEditingExpense(null); setCategory(''); setCustomCategory(''); setAmount(''); setDescription(''); setShowAdd(true); }} className="calendar-card bg-gold hover:bg-gold/90 text-black font-bold h-10 px-4 transition-all duration-150" size="sm">
            <Plus className="w-4 h-4 mr-1" /> Record Expense
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="calendar-card shadow-sm border-border">
          <CardContent className="p-5 text-center">
            {loading ? <div className="calendar-card h-12 bg-muted animate-pulse" /> : (
              <>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Expenses</p>
                <p className="text-2xl font-bold text-foreground mt-1">{formatPKR(totalAmount)}</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="calendar-card shadow-sm border-border">
          <CardContent className="p-5 text-center">
            {loading ? <div className="calendar-card h-12 bg-muted animate-pulse" /> : (
              <>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Entries</p>
                <p className="text-2xl font-bold mt-1">{expenses.length}</p>
              </>
            )}
          </CardContent>
        </Card>
        {tab !== 'today' && (
          <Card className="calendar-card shadow-sm border-border">
            <CardContent className="p-5 text-center">
              {loading ? <div className="calendar-card h-12 bg-muted animate-pulse" /> : (
                <>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Daily Average</p>
                  <p className="text-2xl font-bold mt-1">{formatPKR(Math.round(totalAmount / (tab === 'week' ? 7 : 30)))}</p>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Category breakdown */}
      {sortedCategories.length > 0 && (
        <Card className="calendar-card shadow-sm border-border">
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

      {/* Expense list grouped by date */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="calendar-card h-16 bg-muted animate-pulse" />)}
        </div>
      ) : expenses.length === 0 ? (
        <Card className="calendar-card shadow-sm border-border">
          <CardContent className="p-8 text-center">
            <Wallet className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No expenses recorded for this period.</p>
            <Button onClick={() => { setEditingExpense(null); setCategory(''); setCustomCategory(''); setAmount(''); setDescription(''); setShowAdd(true); }} variant="outline" size="sm" className="mt-3">
              <Plus className="w-4 h-4 mr-1" /> Record First Expense
            </Button>
          </CardContent>
        </Card>
      ) : (
        Object.entries(groupedByDate).sort(([a], [b]) => b.localeCompare(a)).map(([date, dayExpenses]) => (
          <Card key={date} className="calendar-card shadow-sm border-border">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{date === today ? 'Today' : formatPKDate(date)}</CardTitle>
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
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); deleteExpense(expense); }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}

      {/* Add Expense Dialog */}
      <Dialog open={showAdd} onOpenChange={(open) => { setShowAdd(open); if (!open) setEditingExpense(null); }}>
        <DialogContent className="calendar-card max-w-sm">
          <DialogHeader><DialogTitle>{editingExpense ? 'Edit Expense' : 'Record Expense'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Category</Label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="calendar-card mt-1 w-full h-10 border border-border bg-background px-3 text-sm"
              >
                <option value="">Select category</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value="__custom">Other (type your own)</option>
              </select>
              {category === '__custom' && (
                <Input value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} placeholder="Enter category name" className="calendar-card mt-2" />
              )}
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Amount (Rs) *</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className="calendar-card mt-1 text-lg h-12" inputMode="numeric" min={0} />
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Chai for customers, cleaning supplies" className="calendar-card mt-1" />
            </div>
            <Button onClick={saveExpense} disabled={saving} className="calendar-card w-full h-11 bg-gold hover:bg-gold/90 text-black border border-gold font-bold transition-all duration-150">
              {saving ? 'Saving...' : editingExpense ? 'Update Expense' : 'Record Expense'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
