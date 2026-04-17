'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getStaffMonthlyCommissionAction } from '@/app/actions/dashboard';
import { useAppStore } from '@/store/app-store';
import { formatPKR } from '@/lib/utils/currency';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Staff } from '@/types/database';

type BranchScope = 'current' | 'all';

export default function StaffReportPage() {
  const { salon, currentBranch, branches, isPartner, currentStaff } = useAppStore();
  const now = new Date();
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [loading, setLoading] = useState(true);
  const [commData, setCommData] = useState<{ services_count: number; total_revenue: number; commission_earned: number; tips_total: number; advances_total: number; late_deductions: number; net_payable: number } | null>(null);
  const [attendance, setAttendance] = useState<{ present: number; absent: number; late: number; leave: number }>({ present: 0, absent: 0, late: 0, leave: 0 });
  const [branchScope, setBranchScope] = useState<BranchScope>('current');

  const canSeeAllBranches = branches.length > 1 && (isPartner || currentStaff?.role === 'owner' || currentStaff?.role === 'manager');

  useEffect(() => {
    if (!salon) return;
    let query = supabase.from('staff').select('*').eq('salon_id', salon.id).eq('is_active', true);
    if (branchScope === 'current' && currentBranch) {
      query = query.eq('branch_id', currentBranch.id);
    }
    query.order('name').then(({ data }: { data: Staff[] | null }) => {
      if (data) {
        setStaffList(data);
        // Preserve the current selection if still in the filtered list;
        // otherwise pick the first row.
        if (!data.some((s) => s.id === selectedStaffId)) {
          setSelectedStaffId(data.length > 0 ? data[0].id : '');
        }
      }
    });
    // selectedStaffId deliberately omitted — we only want to refetch when
    // salon/branch scope changes, not on every selection change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salon, currentBranch, branchScope]);

  const fetchReport = useCallback(async () => {
    if (!selectedStaffId) return;
    setLoading(true);
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;

    const [commRes, attRes] = await Promise.all([
      getStaffMonthlyCommissionAction(selectedStaffId, month, year),
      supabase.from('attendance').select('status').eq('staff_id', selectedStaffId).gte('date', startDate).lte('date', endDate),
    ]);
    if (commRes.data) setCommData(commRes.data as typeof commData);
    if (attRes.data) {
      const atts = attRes.data as { status: string }[];
      setAttendance({
        present: atts.filter((a) => a.status === 'present').length,
        absent: atts.filter((a) => a.status === 'absent').length,
        late: atts.filter((a) => a.status === 'late').length,
        leave: atts.filter((a) => a.status === 'leave').length,
      });
    }
    setLoading(false);
  }, [selectedStaffId, month, year]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const staff = staffList.find((s) => s.id === selectedStaffId);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/dashboard/reports" className="hover:text-foreground">Reports</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-foreground font-medium">Staff</span>
      </div>

      <div className="bg-card border border-border rounded-lg p-4 flex flex-wrap items-center gap-3">
        <h2 className="font-heading text-xl font-bold">Staff Report</h2>
        {canSeeAllBranches && (
          <div className="inline-flex rounded-md border border-border bg-background p-0.5">
            <Button
              size="sm"
              variant={branchScope === 'current' ? 'default' : 'ghost'}
              className="h-7 px-3 text-xs"
              onClick={() => setBranchScope('current')}
            >
              {currentBranch?.name || 'Current Branch'}
            </Button>
            <Button
              size="sm"
              variant={branchScope === 'all' ? 'default' : 'ghost'}
              className="h-7 px-3 text-xs"
              onClick={() => setBranchScope('all')}
            >
              All Branches
            </Button>
          </div>
        )}
        <select value={selectedStaffId} onChange={(e) => { if (e.target.value) setSelectedStaffId(e.target.value); }}
          className="w-[180px] h-8 text-xs border border-border bg-background rounded-md px-2">
          <option value="">Select staff</option>
          {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <Select value={String(month)} onValueChange={(v) => { if (v) setMonth(Number(v)); }}>
          <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{Array.from({ length: 12 }, (_, i) => <SelectItem key={i + 1} value={String(i + 1)}>{new Date(2000, i).toLocaleString('default', { month: 'long' })}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => { if (v) setYear(Number(v)); }}>
          <SelectTrigger className="w-[90px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {loading ? <div className="h-64 bg-muted rounded-lg animate-pulse" /> : !commData ? <p className="text-center text-muted-foreground py-8">No data</p> : (
        <>
          {/* Earnings */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Services', value: String(commData.services_count) },
              { label: 'Revenue', value: formatPKR(commData.total_revenue) },
              { label: 'Commission', value: formatPKR(commData.commission_earned) },
              { label: 'Tips', value: formatPKR(commData.tips_total) },
            ].map((c) => (
              <Card key={c.label} className="border-border"><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground uppercase tracking-wider">{c.label}</p><p className="text-xl font-bold">{c.value}</p></CardContent></Card>
            ))}
          </div>

          {/* Net payable */}
          <Card className="border-border border-gold/30 bg-gold/5">
            <CardContent className="p-4">
              <Table>
                <TableBody>
                  <TableRow><TableCell>Base Salary</TableCell><TableCell className="text-right">{formatPKR(staff?.base_salary || 0)}</TableCell></TableRow>
                  <TableRow><TableCell>+ Commission</TableCell><TableCell className="text-right">{formatPKR(commData.commission_earned)}</TableCell></TableRow>
                  <TableRow><TableCell>+ Tips</TableCell><TableCell className="text-right">{formatPKR(commData.tips_total)}</TableCell></TableRow>
                  <TableRow><TableCell>- Advances</TableCell><TableCell className="text-right text-red-600">{formatPKR(commData.advances_total)}</TableCell></TableRow>
                  <TableRow><TableCell>- Late Deductions</TableCell><TableCell className="text-right text-red-600">{formatPKR(commData.late_deductions)}</TableCell></TableRow>
                  <TableRow className="font-bold text-lg"><TableCell>NET PAYABLE</TableCell><TableCell className="text-right">{formatPKR(commData.net_payable)}</TableCell></TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Attendance summary */}
          <Card className="border-border">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Attendance</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-3 text-center">
                {[
                  { label: 'Present', value: attendance.present, color: 'text-green-600' },
                  { label: 'Absent', value: attendance.absent, color: 'text-red-600' },
                  { label: 'Late', value: attendance.late, color: 'text-yellow-600' },
                  { label: 'Leave', value: attendance.leave, color: 'text-blue-600' },
                ].map((a) => (
                  <div key={a.label}><p className={`text-2xl font-bold ${a.color}`}>{a.value}</p><p className="text-xs text-muted-foreground uppercase tracking-wider">{a.label}</p></div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
