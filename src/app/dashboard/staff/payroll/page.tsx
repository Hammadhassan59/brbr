'use client';

import { useEffect, useState, useCallback } from 'react';
import { Download, MessageCircle } from 'lucide-react';
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
  const { salon } = useAppStore();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [loading, setLoading] = useState(true);

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

      const payrollRows: PayrollRow[] = [];
      for (const s of staffData as Staff[]) {
        const { data: commData } = await supabase.rpc('get_staff_monthly_commission', {
          p_staff_id: s.id, p_month: month, p_year: year,
        });
        const comm = commData as {
          services_count: number; total_revenue: number; commission_earned: number;
          tips_total: number; advances_total: number; late_deductions: number; net_payable: number;
        } | null;

        // Count present days
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
        const { data: attData } = await supabase
          .from('attendance')
          .select('status')
          .eq('staff_id', s.id)
          .gte('date', startDate)
          .lte('date', endDate)
          .in('status', ['present', 'late', 'half_day']);

        const daysPresent = attData?.length || 0;
        const commission = comm?.commission_earned || 0;
        const tips = comm?.tips_total || 0;
        const earned = s.base_salary + commission + tips;
        const advances = comm?.advances_total || 0;
        const lateDeductions = comm?.late_deductions || 0;
        const netPayable = earned - advances - lateDeductions;

        payrollRows.push({
          staff: s, daysPresent, baseSalary: s.base_salary,
          commission, tips, earned, advances, lateDeductions, netPayable, paid: false,
        });
      }
      setRows(payrollRows);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [salon, month, year]);

  useEffect(() => { fetchPayroll(); }, [fetchPayroll]);

  const totalNet = rows.reduce((sum, r) => sum + r.netPayable, 0);

  function togglePaid(index: number) {
    const updated = [...rows];
    updated[index] = { ...updated[index], paid: !updated[index].paid };
    setRows(updated);
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-heading text-xl font-bold">Payroll</h2>
        <Select value={String(month)} onValueChange={(v) => { if (v) setMonth(Number(v)); }}>
          <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{Array.from({ length: 12 }, (_, i) => <SelectItem key={i + 1} value={String(i + 1)}>{new Date(2000, i).toLocaleString('default', { month: 'long' })}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => { if (v) setYear(Number(v)); }}>
          <SelectTrigger className="w-[90px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{[2024, 2025, 2026].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="ml-auto gap-1 text-xs" onClick={exportCSV}>
          <Download className="w-3 h-3" /> Export CSV
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 bg-muted rounded animate-pulse" />)}</div>
      ) : rows.length === 0 ? (
        <p className="text-center text-muted-foreground py-16">No staff to show</p>
      ) : (
        <>
          <Card>
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
