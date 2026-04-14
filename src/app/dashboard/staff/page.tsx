'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, DollarSign, Users, LayoutGrid, List } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import { formatPKR } from '@/lib/utils/currency';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import type { Staff, Attendance } from '@/types/database';

type ViewMode = 'card' | 'list';

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-amber-100 text-amber-700',
  manager: 'bg-blue-100 text-blue-700',
  receptionist: 'bg-teal-100 text-teal-700',
  senior_stylist: 'bg-purple-100 text-purple-700',
  junior_stylist: 'bg-violet-100 text-violet-700',
  helper: 'bg-gray-100 text-gray-700',
};

export default function StaffListPage() {
  const router = useRouter();
  const { salon, currentBranch } = useAppStore();
  const [staff, setStaff] = useState<(Staff & { todayAttendance?: Attendance; todayServices?: number; todayRevenue?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') return (localStorage.getItem('icut-staff-view') as ViewMode) || 'card';
    return 'card';
  });

  const fetchStaff = useCallback(async () => {
    if (!salon) return;
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      let staffQuery = supabase
        .from('staff')
        .select('*')
        .eq('salon_id', salon.id)
        .eq('is_active', true)
        .order('name');
      if (currentBranch) staffQuery = staffQuery.eq('branch_id', currentBranch.id);
      const { data: staffData } = await staffQuery;
      if (!staffData) { setLoading(false); return; }

      const staffList = staffData as Staff[];
      const ids = staffList.map((s) => s.id);

      const { data: attData } = await supabase
        .from('attendance')
        .select('*')
        .in('staff_id', ids)
        .eq('date', today);

      const { data: billsData } = await supabase
        .from('bills')
        .select('staff_id, total_amount')
        .in('staff_id', ids)
        .eq('status', 'paid')
        .gte('created_at', `${today}T00:00:00`)
        .lte('created_at', `${today}T23:59:59`);

      const attMap = new Map((attData || []).map((a: Attendance) => [a.staff_id, a]));
      const billMap = new Map<string, { count: number; revenue: number }>();
      (billsData || []).forEach((b: { staff_id: string; total_amount: number }) => {
        const existing = billMap.get(b.staff_id) || { count: 0, revenue: 0 };
        billMap.set(b.staff_id, { count: existing.count + 1, revenue: existing.revenue + b.total_amount });
      });

      setStaff(staffList.map((s) => ({
        ...s,
        todayAttendance: attMap.get(s.id) as Attendance | undefined,
        todayServices: billMap.get(s.id)?.count || 0,
        todayRevenue: billMap.get(s.id)?.revenue || 0,
      })));
    } catch {
      toast.error('Failed to load staff');
    } finally {
      setLoading(false);
    }
  }, [salon, currentBranch]);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  function getStatusBadge(att?: Attendance) {
    if (!att) return <span className="text-xs text-muted-foreground">—</span>;
    const map: Record<string, { label: string; cls: string }> = {
      present: { label: 'Present', cls: 'bg-green-100 text-green-700' },
      absent: { label: 'Absent', cls: 'bg-red-100 text-red-700' },
      late: { label: 'Late', cls: 'bg-yellow-100 text-yellow-700' },
      half_day: { label: 'Half Day', cls: 'bg-orange-100 text-orange-700' },
      leave: { label: 'Leave', cls: 'bg-blue-100 text-blue-700' },
    };
    const s = map[att.status] || map.present;
    return <Badge variant="secondary" className={`text-[10px] ${s.cls}`}>{s.label}</Badge>;
  }

  const filteredStaff = staff.filter((s) => {
    if (roleFilter !== 'all') {
      if (roleFilter === 'stylists') {
        if (s.role !== 'senior_stylist' && s.role !== 'junior_stylist') return false;
      } else if (s.role !== roleFilter) {
        return false;
      }
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!s.name.toLowerCase().includes(q) && !s.role.replace('_', ' ').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {[
            { value: 'all', label: 'All' },
            { value: 'stylists', label: 'Stylists' },
            { value: 'receptionist', label: 'Receptionist' },
            { value: 'helper', label: 'Helper' },
          ].map((t) => (
            <button key={t.value} onClick={() => setRoleFilter(t.value)}
              className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-all duration-150 ${
                roleFilter === t.value ? 'bg-foreground text-white' : 'text-muted-foreground hover:text-foreground border border-border'
              }`}
            >{t.label}</button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search staff..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 w-56 pl-9 text-sm border border-border bg-background"
          />
        </div>

        <div className="flex items-center border border-border rounded-lg overflow-hidden ml-auto">
          <button
            onClick={() => { setViewMode('card'); localStorage.setItem('icut-staff-view', 'card'); }}
            className={`p-2 transition-all duration-150 ${viewMode === 'card' ? 'bg-foreground text-white' : 'text-muted-foreground hover:text-foreground'}`}
            title="Card view"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setViewMode('list'); localStorage.setItem('icut-staff-view', 'list'); }}
            className={`p-2 transition-all duration-150 ${viewMode === 'list' ? 'bg-foreground text-white' : 'text-muted-foreground hover:text-foreground'}`}
            title="List view"
          >
            <List className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-2">
          <Link href="/dashboard/staff/payroll">
            <Button variant="outline" size="sm" className="h-10 px-4 font-medium border border-border transition-all duration-150 gap-1.5 hover:bg-secondary/50">
              <DollarSign className="w-3.5 h-3.5" /> Payroll
            </Button>
          </Link>
          <Button onClick={() => router.push('/dashboard/staff/new')} className="bg-gold hover:bg-gold/90 text-black font-bold h-10 px-4 transition-all duration-150" size="sm">
            <Plus className="w-4 h-4 mr-1" /> Add Staff
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-32 bg-muted rounded-lg animate-pulse" />)}
        </div>
      ) : filteredStaff.length === 0 ? (
        <EmptyState icon={Users} text="noStaffYet" ctaLabel="addStaff" ctaHref="/dashboard/staff/new" />
      ) : viewMode === 'card' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger-children">
          {filteredStaff.map((s) => (
            <Link key={s.id} href={`/dashboard/staff/${s.id}`}>
              <div className="animate-fade-up bg-card border border-border rounded-lg hover:shadow-lg hover:border-gold/40 hover:-translate-y-0.5 p-5 transition-all duration-200">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-accent text-foreground font-bold flex items-center justify-center text-xl shrink-0">
                    {s.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold truncate">{s.name}</span>
                      <Badge variant="secondary" className={`text-[10px] ${ROLE_COLORS[s.role] || ''}`}>
                        {s.role.replace('_', ' ')}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      {getStatusBadge(s.todayAttendance)}
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs font-medium text-foreground/70">
                        {s.role === 'owner' || s.role === 'manager' ? (
                          `${s.role === 'owner' ? 'Owner' : 'Manager'} — full access`
                        ) : s.role === 'receptionist' ? (
                          'Front desk'
                        ) : s.role === 'helper' ? (
                          'Support staff'
                        ) : (
                          `${s.todayServices || 0} services · ${formatPKR(s.todayRevenue || 0)}`
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center">Services</TableHead>
                <TableHead className="text-right pr-4">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStaff.map((s) => (
                <TableRow key={s.id} className="cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/dashboard/staff/${s.id}`)}>
                  <TableCell className="pl-4">
                    <span className="font-medium text-sm">{s.name}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={`text-[10px] ${ROLE_COLORS[s.role] || ''}`}>
                      {s.role.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">{getStatusBadge(s.todayAttendance)}</TableCell>
                  <TableCell className="text-center text-sm">{s.todayServices || 0}</TableCell>
                  <TableCell className="text-right text-sm pr-4">{formatPKR(s.todayRevenue || 0)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
