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

  async function addExpense() {
    if (!currentBranch) return;
    const finalCategory = category === '__custom' ? customCategory : category;
    if (!amount || Number(amount) <= 0) { toast.error('Enter a valid amount'); return; }

    setSaving(true);
    try {
      const createdBy = isPartner ? currentPartner?.id : currentStaff?.id;
      await supabase.from('expenses').insert({
        branch_id: currentBranch.id,
        category: finalCategory || null,
        amount: Number(amount),
        description: description || null,
        date: today,
        created_by: createdBy || null,
      });

      // Update today's cash drawer if open
      const { data: drawer } = await supabase
        .from('cash_drawers')
        .select('*')
        .eq('branch_id', currentBranch.id)
        .eq('date', today)
        .eq('status', 'open')
        .single();

      if (drawer) {
        await supabase.from('cash_drawers').update({
          total_expenses: (drawer.total_expenses || 0) + Number(amount),
        }).eq('id', drawer.id);
      }

      toast.success('Expense recorded');
      setShowAdd(false);
      setCategory(''); setCustomCategory(''); setAmount(''); setDescription('');
      fetchExpenses();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add expense');
    } finally {
      setSaving(false);
    }
  }

  async function deleteExpense(expense: Expense) {
    if (!confirm(`Delete "${expense.description || expense.category || 'expense'}" (${formatPKR(expense.amount)})?`)) return;
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-xl font-bold">Expenses</h2>
        <Button onClick={() => setShowAdd(true)} className="bg-gold text-black border border-gold" size="sm">
          <Plus className="w-4 h-4 mr-1" /> Record Expense
        </Button>
      </div>

      {/* Period tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="h-auto gap-1">
          <TabsTrigger value="today" className="text-xs">Today</TabsTrigger>
          <TabsTrigger value="week" className="text-xs">Last 7 Days</TabsTrigger>
          <TabsTrigger value="month" className="text-xs">Last 30 Days</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            {loading ? <div className="h-12 bg-muted rounded animate-pulse" /> : (
              <>
                <p className="text-xs text-muted-foreground">Total Expenses</p>
                <p className="text-2xl font-bold text-foreground">{formatPKR(totalAmount)}</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            {loading ? <div className="h-12 bg-muted rounded animate-pulse" /> : (
              <>
                <p className="text-xs text-muted-foreground">Entries</p>
                <p className="text-2xl font-bold">{expenses.length}</p>
              </>
            )}
          </CardContent>
        </Card>
        {tab !== 'today' && (
          <Card>
            <CardContent className="p-4 text-center">
              {loading ? <div className="h-12 bg-muted rounded animate-pulse" /> : (
                <>
                  <p className="text-xs text-muted-foreground">Daily Average</p>
                  <p className="text-2xl font-bold">{formatPKR(Math.round(totalAmount / (tab === 'week' ? 7 : 30)))}</p>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Category breakdown */}
      {sortedCategories.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">By Category</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sortedCategories.map(([cat, total]) => (
                <div key={cat} className="flex items-center gap-3">
                  <span className="text-sm flex-1">{cat}</span>
                  <div className="w-32 bg-secondary rounded-full h-2">
                    <div className="bg-gold/60 h-2" style={{ width: `${(total / totalAmount) * 100}%` }} />
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
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted rounded animate-pulse" />)}
        </div>
      ) : expenses.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Wallet className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No expenses recorded for this period.</p>
            <Button onClick={() => setShowAdd(true)} variant="outline" size="sm" className="mt-3">
              <Plus className="w-4 h-4 mr-1" /> Record First Expense
            </Button>
          </CardContent>
        </Card>
      ) : (
        Object.entries(groupedByDate).map(([date, dayExpenses]) => (
          <Card key={date}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{date === today ? 'Today' : formatPKDate(date)}</CardTitle>
                <span className="text-sm font-medium text-foreground">{formatPKR(dayExpenses.reduce((s, e) => s + e.amount, 0))}</span>
              </div>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableBody>
                  {dayExpenses.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="pl-4">
                        <p className="text-sm font-medium">{e.description || e.category || 'Expense'}</p>
                        {e.category && e.description && <p className="text-xs text-muted-foreground">{e.category}</p>}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium text-foreground">{formatPKR(e.amount)}</TableCell>
                      <TableCell className="text-right pr-4 w-10">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => deleteExpense(e)}>
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
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Record Expense</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Category</Label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border bg-background px-3 text-sm"
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
              <Label className="text-xs">Amount (Rs) *</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className="mt-1 text-lg" inputMode="numeric" />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Chai for customers, cleaning supplies" className="mt-1" />
            </div>
            <Button onClick={addExpense} disabled={saving} className="w-full bg-gold text-black border border-gold">
              {saving ? 'Recording...' : 'Record Expense'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
