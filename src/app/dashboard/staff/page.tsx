'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import { formatPKR } from '@/lib/utils/currency';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Staff, Attendance } from '@/types/database';

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-gold/20 text-gold',
  manager: 'bg-blue-500/15 text-blue-600',
  receptionist: 'bg-teal-500/15 text-teal-600',
  senior_stylist: 'bg-purple-500/15 text-purple-600',
  junior_stylist: 'bg-purple-500/10 text-purple-500',
  helper: 'bg-gray-500/10 text-gray-600',
};

export default function StaffListPage() {
  const router = useRouter();
  const { salon, currentBranch } = useAppStore();
  const [staff, setStaff] = useState<(Staff & { todayAttendance?: Attendance; todayServices?: number; todayRevenue?: number })[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStaff = useCallback(async () => {
    if (!salon) return;
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data: staffData } = await supabase
        .from('staff')
        .select('*')
        .eq('salon_id', salon.id)
        .eq('is_active', true)
        .order('name');
      if (!staffData) { setLoading(false); return; }

      const staffList = staffData as Staff[];
      const ids = staffList.map((s) => s.id);

      // Fetch today's attendance
      const { data: attData } = await supabase
        .from('attendance')
        .select('*')
        .in('staff_id', ids)
        .eq('date', today);

      // Fetch today's bills per staff
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
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [salon]);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  function getStatusBadge(att?: Attendance) {
    if (!att) return <span className="text-xs text-muted-foreground">—</span>;
    const map: Record<string, { label: string; cls: string }> = {
      present: { label: 'Present', cls: 'bg-green-500/15 text-green-600' },
      absent: { label: 'Absent', cls: 'bg-red-500/15 text-red-600' },
      late: { label: 'Late', cls: 'bg-yellow-500/15 text-yellow-600' },
      half_day: { label: 'Half Day', cls: 'bg-orange-500/15 text-orange-600' },
      leave: { label: 'Leave', cls: 'bg-blue-500/15 text-blue-600' },
    };
    const s = map[att.status] || map.present;
    return <Badge variant="secondary" className={`text-[10px] ${s.cls}`}>{s.label}</Badge>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-xl font-bold">Staff</h2>
        <div className="flex gap-2">
          <Link href="/dashboard/staff/payroll">
            <Button variant="outline" size="sm">Payroll</Button>
          </Link>
          <Button onClick={() => router.push('/dashboard/staff/new')} className="bg-gold hover:bg-gold/90 text-black border border-gold" size="sm">
            <Plus className="w-4 h-4 mr-1" /> Add Staff
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-32 bg-muted rounded-lg animate-pulse" />)}
        </div>
      ) : staff.length === 0 ? (
        <p className="text-center text-muted-foreground py-16">No staff members yet</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {staff.map((s) => (
            <Link key={s.id} href={`/dashboard/staff/${s.id}`}>
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-full bg-gold/20 text-gold font-bold flex items-center justify-center text-lg shrink-0">
                      {s.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium truncate">{s.name}</span>
                        <Badge variant="secondary" className={`text-[10px] ${ROLE_COLORS[s.role] || ''}`}>
                          {s.role.replace('_', ' ')}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        {getStatusBadge(s.todayAttendance)}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {s.role === 'owner' || s.role === 'manager' ? (
                          <span className="text-muted-foreground">{s.role === 'owner' ? 'Owner' : 'Manager'} — full access</span>
                        ) : s.role === 'receptionist' ? (
                          <span className="text-muted-foreground">Front desk</span>
                        ) : s.role === 'helper' ? (
                          <span className="text-muted-foreground">Support staff</span>
                        ) : (
                          <>
                            <span>{s.todayServices || 0} services</span>
                            <span>·</span>
                            <span>{formatPKR(s.todayRevenue || 0)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
