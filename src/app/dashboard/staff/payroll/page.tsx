'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Download, MessageCircle, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import { formatPKR } from '@/lib/utils/currency';
import { generateWhatsAppLink } from '@/lib/utils/whatsapp';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import toast from 'react-hot-toast';
import type { Staff } from '@/types/database';

interface PayrollRow {
  staff: Staff;
  daysPresent: number;
  baseSalary: number;
  commission: number;
  tips: number;
  earned: number;
  advances: number;
  lateDeductions: number;
  netPayable: number;
  paid: boolean;
}

export default function PayrollPage() {
  const { salon, currentBranch, currentStaff } = useAppStore();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingPaid, setMarkingPaid] = useState(false);

  const fetchPayroll = useCallback(async () => {
    if (!salon) return;
    setLoading(true);
    try {
      const { data: staffData } = await supabase
        .from('staff')
        .select('*')
        .eq('salon_id', salon.id)
        .eq('is_active', true)
        .order('name');
      if (!staffData) { setLoading(false); return; }

      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
      const monthLabel = new Date(year, month - 1).toLocaleString('default', { month: 'long' });

      // Fetch commission + attendance for all staff in parallel (fixes N+1)
      const staffList = staffData as Staff[];
      const results = await Promise.all(
        staffList.map(async (s) => {
          const [commRes, attRes] = await Promise.all([
            supabase.rpc('get_staff_monthly_commission', {
              p_staff_id: s.id, p_month: month, p_year: year,
            }),
            supabase
              .from('attendance')
              .select('status')
              .eq('staff_id', s.id)
              .gte('date', startDate)
              .lte('date', endDate)
              .in('status', ['present', 'late', 'half_day']),
          ]);
          return { staff: s, commData: commRes.data, attData: attRes.data };
        })
      );

      // Check which staff already have a salary expense for this month
      const { data: existingExpenses } = await supabase
        .from('expenses')
        .select('description')
        .eq('category', 'salary')
        .gte('date', startDate)
        .lte('date', endDate);
      const paidDescriptions = new Set(
        (existingExpenses || []).map((e: { description: string | null }) => e.description)
      );

      const payrollRows: PayrollRow[] = results.map(({ staff: s, commData, attData }) => {
        const comm = commData as {
          services_count: number; total_revenue: number; commission_earned: number;
          tips_total: number; advances_total: number; late_deductions: number; net_payable: number;
        } | null;

        const daysPresent = attData?.length || 0;
        const commission = comm?.commission_earned || 0;
        const tips = comm?.tips_total || 0;
        const earned = s.base_salary + commission + tips;
        const advances = comm?.advances_total || 0;
        const lateDeductions = comm?.late_deductions || 0;
        const netPayable = earned - advances - lateDeductions;
        const salaryDesc = `Salary: ${s.name} — ${monthLabel} ${year}`;
        const paid = paidDescriptions.has(salaryDesc);

        return {
          staff: s, daysPresent, baseSalary: s.base_salary,
          commission, tips, earned, advances, lateDeductions, netPayable, paid,
        };
      });
      setRows(payrollRows);
    } catch { toast.error('Failed to load payroll data'); }
    finally { setLoading(false); }
  }, [salon, month, year]);

  useEffect(() => { fetchPayroll(); }, [fetchPayroll]);

  const totalNet = rows.reduce((sum, r) => sum + r.netPayable, 0);

  async function togglePaid(index: number) {
    const row = rows[index];
    const monthLabel = new Date(year, month - 1).toLocaleString('default', { month: 'long' });
    const salaryDesc = `Salary: ${row.staff.name} — ${monthLabel} ${year}`;
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;

    if (!row.paid) {
      // Mark as paid — insert expense record
      const { error } = await supabase.from('expenses').insert({
        branch_id: currentBranch?.id || null,
        category: 'salary',
        amount: row.netPayable,
        description: salaryDesc,
        date: new Date().toISOString().split('T')[0],
        created_by: currentStaff?.id || null,
      });
      if (error) { toast.error('Failed to save payment'); return; }
      toast.success(`${row.staff.name} marked as paid`);
    } else {
      // Unmark — delete the expense record
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('category', 'salary')
        .eq('description', salaryDesc)
        .gte('date', startDate)
        .lte('date', endDate);
      if (error) { toast.error('Failed to undo payment'); return; }
      toast.success(`${row.staff.name} unmarked as paid`);
    }

    const updated = [...rows];
    updated[index] = { ...updated[index], paid: !updated[index].paid };
    setRows(updated);
  }

  async function markAllPaid() {
    const unpaid = rows.filter((r) => !r.paid && r.netPayable > 0);
    if (unpaid.length === 0) { toast.success('All staff already marked as paid'); return; }

    setMarkingPaid(true);
    try {
      const monthLabel = new Date(year, month - 1).toLocaleString('default', { month: 'long' });
      const today = new Date().toISOString().split('T')[0];

      const inserts = unpaid.map((row) => ({
        branch_id: currentBranch?.id || null,
        category: 'salary',
        amount: row.netPayable,
        description: `Salary: ${row.staff.name} — ${monthLabel} ${year}`,
        date: today,
        created_by: currentStaff?.id || null,
      }));

      const { error } = await supabase.from('expenses').insert(inserts);
      if (error) throw error;

      setRows(rows.map((r) => ({ ...r, paid: r.paid || r.netPayable > 0 })));
      toast.success(`${unpaid.length} staff marked as paid`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark all paid');
    } finally {
      setMarkingPaid(false);
    }
  }

  function sendSalarySlip(row: PayrollRow) {
    if (!row.staff.phone) return;
    const msg = `*BrBr — Salary Slip*
Staff: ${row.staff.name}
Month: ${new Date(year, month - 1).toLocaleString('default', { month: 'long' })} ${year}
─────────────────
Base Salary:        ${formatPKR(row.baseSalary)}
Commission:         ${formatPKR(row.commission)}
Tips:               ${formatPKR(row.tips)}
─────────────────
Gross Earnings:     ${formatPKR(row.earned)}
Advance Deduction: -${formatPKR(row.advances)}
Late Deductions:   -${formatPKR(row.lateDeductions)}
─────────────────
*NET PAYABLE:       ${formatPKR(row.netPayable)}*

Thank you 🙏 — BrBr Management`;

    window.open(generateWhatsAppLink(row.staff.phone, msg), '_blank');
  }

  function exportCSV() {
    const header = ['Name', 'Role', 'Days Present', 'Base Salary', 'Commission', 'Tips', 'Earned', 'Advances', 'Late Ded', 'Net Payable'];
    const csvRows = rows.map((r) => [
      r.staff.name, r.staff.role, r.daysPresent, r.baseSalary, r.commission, r.tips, r.earned, r.advances, r.lateDeductions, r.netPayable,
    ].map(String));
    const csv = [header, ...csvRows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `brbr-payroll-${year}-${String(month).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/dashboard/staff" className="hover:text-foreground transition-colors">Staff</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-foreground font-medium">Payroll</span>
      </div>

      <div className="calendar-card bg-card border border-border p-4 flex flex-wrap items-center gap-3">
        <h2 className="font-heading text-xl font-bold">Payroll</h2>
        <Select value={String(month)} onValueChange={(v) => { if (v) setMonth(Number(v)); }}>
          <SelectTrigger className="calendar-card w-[130px] h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{Array.from({ length: 12 }, (_, i) => <SelectItem key={i + 1} value={String(i + 1)}>{new Date(2000, i).toLocaleString('default', { month: 'long' })}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => { if (v) setYear(Number(v)); }}>
          <SelectTrigger className="calendar-card w-[90px] h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{[2024, 2025, 2026].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" className="calendar-card gap-1 text-xs transition-all duration-150" onClick={markAllPaid} disabled={markingPaid || loading}>
            {markingPaid ? 'Saving...' : 'Mark All Paid'}
          </Button>
          <Button variant="outline" size="sm" className="calendar-card gap-1 text-xs transition-all duration-150" onClick={exportCSV}>
            <Download className="w-3 h-3" /> Export CSV
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="calendar-card h-14 bg-muted animate-pulse" />)}</div>
      ) : rows.length === 0 ? (
        <p className="text-center text-muted-foreground py-16">No staff to show</p>
      ) : (
        <>
          <Card className="calendar-card border-border">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Name</TableHead>
                    <TableHead className="text-center">Days</TableHead>
                    <TableHead className="text-right">Base</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                    <TableHead className="text-right">Tips</TableHead>
                    <TableHead className="text-right">Advances</TableHead>
                    <TableHead className="text-right">Deductions</TableHead>
                    <TableHead className="text-right font-bold">Net Payable</TableHead>
                    <TableHead className="text-center">Paid</TableHead>
                    <TableHead className="text-center pr-4">Slip</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, i) => (
                    <TableRow key={row.staff.id}>
                      <TableCell className="pl-4">
                        <p className="font-medium text-sm">{row.staff.name}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">{row.staff.role.replace('_', ' ')}</p>
                      </TableCell>
                      <TableCell className="text-center text-sm">{row.daysPresent}</TableCell>
                      <TableCell className="text-right text-sm">{formatPKR(row.baseSalary)}</TableCell>
                      <TableCell className="text-right text-sm">{formatPKR(row.commission)}</TableCell>
                      <TableCell className="text-right text-sm">{formatPKR(row.tips)}</TableCell>
                      <TableCell className="text-right text-sm text-red-600">{row.advances > 0 ? `-${formatPKR(row.advances)}` : '—'}</TableCell>
                      <TableCell className="text-right text-sm text-red-600">{row.lateDeductions > 0 ? `-${formatPKR(row.lateDeductions)}` : '—'}</TableCell>
                      <TableCell className="text-right text-sm font-bold">{formatPKR(row.netPayable)}</TableCell>
                      <TableCell className="text-center">
                        <Checkbox checked={row.paid} onCheckedChange={() => togglePaid(i)} />
                      </TableCell>
                      <TableCell className="text-center pr-4">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => sendSalarySlip(row)} title="Send salary slip on WhatsApp">
                          <MessageCircle className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Totals */}
                  <TableRow className="font-bold bg-secondary/50">
                    <TableCell className="pl-4">TOTAL</TableCell>
                    <TableCell />
                    <TableCell className="text-right">{formatPKR(rows.reduce((s, r) => s + r.baseSalary, 0))}</TableCell>
                    <TableCell className="text-right">{formatPKR(rows.reduce((s, r) => s + r.commission, 0))}</TableCell>
                    <TableCell className="text-right">{formatPKR(rows.reduce((s, r) => s + r.tips, 0))}</TableCell>
                    <TableCell className="text-right text-red-600">{formatPKR(rows.reduce((s, r) => s + r.advances, 0))}</TableCell>
                    <TableCell className="text-right text-red-600">{formatPKR(rows.reduce((s, r) => s + r.lateDeductions, 0))}</TableCell>
                    <TableCell className="text-right text-lg">{formatPKR(totalNet)}</TableCell>
                    <TableCell />
                    <TableCell />
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
