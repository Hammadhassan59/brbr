'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Edit, Calendar, Clock, DollarSign, CreditCard, TrendingUp, ChevronRight,
  CheckCircle, XCircle, AlertCircle, MinusCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatPKR } from '@/lib/utils/currency';
import { formatPKDate, formatTime } from '@/lib/utils/dates';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import toast from 'react-hot-toast';
import type { Staff, Attendance, Advance, AppointmentWithDetails, AttendanceStatus } from '@/types/database';

const ROLE_COLORS: Record<string, string> = {
  owner: 'text-gold', manager: 'text-blue-600', receptionist: 'text-teal-600',
  senior_stylist: 'text-purple-600', junior_stylist: 'text-purple-600', helper: 'text-gray-500',
};

const ATT_COLORS: Record<string, string> = {
  present: 'bg-green-500', absent: 'bg-red-500', late: 'bg-yellow-500', half_day: 'bg-orange-400', leave: 'bg-blue-500',
};

export default function StaffProfilePage() {
  const params = useParams();
  const router = useRouter();
  const staffId = params.id as string;

  const [staff, setStaff] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);
  const [todayAppointments, setTodayAppointments] = useState<AppointmentWithDetails[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [commissionData, setCommissionData] = useState<{
    services_count: number; total_revenue: number; commission_earned: number;
    tips_total: number; advances_total: number; late_deductions: number; net_payable: number;
  } | null>(null);

  // Month selector
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  // Attendance modal
  const [showAttModal, setShowAttModal] = useState(false);
  const [attDate, setAttDate] = useState('');
  const [attStatus, setAttStatus] = useState<AttendanceStatus>('present');
  const [attCheckIn, setAttCheckIn] = useState('');
  const [attCheckOut, setAttCheckOut] = useState('');
  const [attNotes, setAttNotes] = useState('');
  const [savingAtt, setSavingAtt] = useState(false);

  // Advance modal
  const [showAdvModal, setShowAdvModal] = useState(false);
  const [advAmount, setAdvAmount] = useState('');
  const [advReason, setAdvReason] = useState('');
  const [savingAdv, setSavingAdv] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

      const [staffRes, aptsRes, attRes, advRes, commRes] = await Promise.all([
        supabase.from('staff').select('*').eq('id', staffId).single(),
        supabase.from('appointments').select('*, client:clients(*), services:appointment_services(*)').eq('staff_id', staffId).eq('appointment_date', today).order('start_time'),
        supabase.from('attendance').select('*').eq('staff_id', staffId).gte('date', startDate).lte('date', endDate).order('date'),
        supabase.from('advances').select('*').eq('staff_id', staffId).order('date', { ascending: false }).limit(50),
        supabase.rpc('get_staff_monthly_commission', { p_staff_id: staffId, p_month: month, p_year: year }),
      ]);

      if (staffRes.data) setStaff(staffRes.data as Staff);
      if (aptsRes.data) setTodayAppointments(aptsRes.data as AppointmentWithDetails[]);
      if (attRes.data) setAttendance(attRes.data as Attendance[]);
      if (advRes.data) setAdvances(advRes.data as Advance[]);
      if (commRes.data) setCommissionData(commRes.data as typeof commissionData);
    } catch { toast.error('Failed to load staff data'); } finally { setLoading(false); }
  }, [staffId, month, year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function saveAttendance() {
    setSavingAtt(true);
    try {
      const { error } = await supabase.from('attendance').upsert({
        staff_id: staffId,
        branch_id: staff?.branch_id,
        date: attDate,
        status: attStatus,
        check_in: attCheckIn || null,
        check_out: attCheckOut || null,
        notes: attNotes || null,
        late_minutes: attStatus === 'late' ? 30 : 0,
        deduction_amount: attStatus === 'late' ? 100 : attStatus === 'absent' ? 500 : 0,
      }, { onConflict: 'staff_id,date' }).select().single();
      if (error) throw error;
      toast.success('Attendance saved');
      setShowAttModal(false);
      fetchData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setSavingAtt(false); }
  }

  async function saveAdvance() {
    setSavingAdv(true);
    try {
      const { error } = await supabase.from('advances').insert({
        staff_id: staffId,
        amount: Number(advAmount),
        reason: advReason || null,
      }).select().single();
      if (error) throw error;
      toast.success('Advance recorded');
      setShowAdvModal(false);
      setAdvAmount(''); setAdvReason('');
      fetchData();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setSavingAdv(false); }
  }

  if (loading && !staff) {
    return <div className="space-y-4"><div className="h-32 bg-muted rounded-lg animate-pulse" /><div className="h-64 bg-muted rounded-lg animate-pulse" /></div>;
  }
  if (!staff) return <p className="text-center py-16 text-muted-foreground">Staff member not found</p>;

  // Attendance summary
  const attPresent = attendance.filter((a) => a.status === 'present').length;
  const attAbsent = attendance.filter((a) => a.status === 'absent').length;
  const attLate = attendance.filter((a) => a.status === 'late').length;
  const attLeave = attendance.filter((a) => a.status === 'leave').length;

  // Build calendar days
  const daysInMonth = new Date(year, month, 0).getDate();
  const calDays = Array.from({ length: daysInMonth }, (_, i) => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
    return { date: dateStr, day: i + 1, att: attendance.find((a) => a.date === dateStr) };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link href="/dashboard/staff" className="hover:text-foreground transition-colors">Staff</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-foreground font-medium">{staff.name}</span>
        </div>
        <Button variant="outline" size="sm" className="calendar-card transition-all duration-150" onClick={() => router.push(`/dashboard/staff/${staffId}/edit`)}><Edit className="w-4 h-4 mr-1" /> Edit</Button>
      </div>

      <Card className="calendar-card border-border">
        <CardContent className="p-6 flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl bg-gold/20 text-gold text-xl font-bold flex items-center justify-center shrink-0">{staff.name.charAt(0)}</div>
          <div>
            <div className="flex items-center gap-2"><h2 className="font-heading text-xl font-bold">{staff.name}</h2><Badge variant="secondary" className={`text-xs ${ROLE_COLORS[staff.role] || ''}`}>{staff.role.replace('_', ' ')}</Badge></div>
            <p className="text-sm text-muted-foreground">{staff.phone || 'No phone'} · Joined {formatPKDate(staff.join_date)}</p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="schedule">
        <TabsList className="flex-wrap h-auto gap-1.5 bg-transparent">
          <TabsTrigger value="schedule" className="calendar-card text-xs gap-1 transition-all duration-150 data-[state=active]:bg-gold data-[state=active]:text-black data-[state=active]:text-muted-foreground hover:text-foreground"><Clock className="w-3 h-3" /> Schedule</TabsTrigger>
          <TabsTrigger value="attendance" className="calendar-card text-xs gap-1 transition-all duration-150 data-[state=active]:bg-gold data-[state=active]:text-black data-[state=active]:text-muted-foreground hover:text-foreground"><Calendar className="w-3 h-3" /> Attendance</TabsTrigger>
          <TabsTrigger value="commission" className="calendar-card text-xs gap-1 transition-all duration-150 data-[state=active]:bg-gold data-[state=active]:text-black data-[state=active]:text-muted-foreground hover:text-foreground"><DollarSign className="w-3 h-3" /> Commission</TabsTrigger>
          <TabsTrigger value="advances" className="calendar-card text-xs gap-1 transition-all duration-150 data-[state=active]:bg-gold data-[state=active]:text-black data-[state=active]:text-muted-foreground hover:text-foreground"><CreditCard className="w-3 h-3" /> Advances</TabsTrigger>
          <TabsTrigger value="performance" className="calendar-card text-xs gap-1 transition-all duration-150 data-[state=active]:bg-gold data-[state=active]:text-black data-[state=active]:text-muted-foreground hover:text-foreground"><TrendingUp className="w-3 h-3" /> Performance</TabsTrigger>
        </TabsList>

        {/* Schedule */}
        <TabsContent value="schedule" className="mt-4">
          <Card className="calendar-card border-border">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Today&apos;s Schedule ({todayAppointments.filter((a) => a.status === 'done').length}/{todayAppointments.length} done)</CardTitle></CardHeader>
            <CardContent>
              {todayAppointments.length === 0 ? <p className="text-center text-muted-foreground text-sm py-6">No appointments</p> : (
                <div className="space-y-2">
                  {todayAppointments.map((apt) => (
                    <div key={apt.id} className={`flex items-center gap-3 p-3 rounded-lg border ${apt.status === 'done' ? 'opacity-50' : apt.status === 'in_progress' ? 'border-amber-500/25 bg-amber-500/10' : ''}`}>
                      <div className="w-14 text-center shrink-0"><p className="text-sm font-mono font-medium">{formatTime(apt.start_time)}</p></div>
                      <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{apt.client?.name || 'Walk-in'}</p><p className="text-xs text-muted-foreground truncate">{apt.services?.map((s) => s.service_name).join(', ')}</p></div>
                      <Badge variant={apt.status === 'done' ? 'secondary' : 'default'} className="text-[10px]">{apt.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Attendance */}
        <TabsContent value="attendance" className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <Select value={String(month)} onValueChange={(v) => { if (v) setMonth(Number(v)); }}>
              <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{Array.from({ length: 12 }, (_, i) => <SelectItem key={i + 1} value={String(i + 1)}>{new Date(2000, i).toLocaleString('default', { month: 'long' })}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => { if (v) setYear(Number(v)); }}>
              <SelectTrigger className="w-[90px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{[2024, 2025, 2026].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="ml-auto text-xs" onClick={() => {
              setAttDate(new Date().toISOString().slice(0, 10)); setAttStatus('present'); setAttCheckIn(''); setAttCheckOut(''); setAttNotes(''); setShowAttModal(true);
            }}>Mark Attendance</Button>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-4 gap-2">
            {[{ label: 'Present', count: attPresent, icon: CheckCircle, color: 'text-green-600' }, { label: 'Absent', count: attAbsent, icon: XCircle, color: 'text-red-600' }, { label: 'Late', count: attLate, icon: AlertCircle, color: 'text-yellow-600' }, { label: 'Leave', count: attLeave, icon: MinusCircle, color: 'text-blue-600' }].map((s) => (
              <Card key={s.label}><CardContent className="p-3 text-center"><s.icon className={`w-4 h-4 ${s.color} mx-auto mb-1`} /><p className="text-lg font-bold">{s.count}</p><p className="text-[10px] text-muted-foreground">{s.label}</p></CardContent></Card>
            ))}
          </div>

          {/* Calendar grid */}
          <Card className="calendar-card border-border"><CardContent className="p-3">
            <div className="grid grid-cols-7 gap-1">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <div key={i} className="text-center text-[10px] text-muted-foreground font-medium py-1">{d}</div>)}
              {/* Offset for first day */}
              {Array.from({ length: (new Date(year, month - 1, 1).getDay() + 6) % 7 }).map((_, i) => <div key={`pad-${i}`} />)}
              {calDays.map((d) => (
                <button key={d.day} onClick={() => { setAttDate(d.date); setAttStatus(d.att?.status || 'present'); setAttCheckIn(d.att?.check_in || ''); setAttCheckOut(d.att?.check_out || ''); setAttNotes(d.att?.notes || ''); setShowAttModal(true); }}
                  className="aspect-square rounded-md flex items-center justify-center text-xs relative hover:ring-1 ring-gold"
                >
                  {d.att && <div className={`absolute inset-1 rounded-md ${ATT_COLORS[d.att.status]} opacity-20`} />}
                  <span className="relative z-10">{d.day}</span>
                </button>
              ))}
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* Commission */}
        <TabsContent value="commission" className="mt-4 space-y-4">
          {commissionData ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[{ label: 'Services', value: String(commissionData.services_count) }, { label: 'Revenue', value: formatPKR(commissionData.total_revenue) }, { label: 'Commission', value: formatPKR(commissionData.commission_earned) }, { label: 'Tips', value: formatPKR(commissionData.tips_total) }].map((c) => (
                  <Card key={c.label}><CardContent className="p-3 text-center"><p className="text-lg font-bold">{c.value}</p><p className="text-[10px] text-muted-foreground">{c.label}</p></CardContent></Card>
                ))}
              </div>
              <Card className="border-gold/30 bg-gold/5"><CardContent className="p-4 text-center">
                <p className="text-sm text-muted-foreground mb-1">Net Payable This Month</p>
                <p className="text-3xl font-heading font-bold">{formatPKR(commissionData.net_payable)}</p>
                <p className="text-xs text-muted-foreground mt-1">Base {formatPKR(staff.base_salary)} + Commission {formatPKR(commissionData.commission_earned)} + Tips {formatPKR(commissionData.tips_total)} - Advances {formatPKR(commissionData.advances_total)} - Deductions {formatPKR(commissionData.late_deductions)}</p>
              </CardContent></Card>
            </>
          ) : <p className="text-center text-muted-foreground py-8">No commission data</p>}
        </TabsContent>

        {/* Advances */}
        <TabsContent value="advances" className="mt-4 space-y-4">
          <Button size="sm" onClick={() => setShowAdvModal(true)} className="bg-gold text-black border border-gold">+ Add Advance</Button>
          {advances.length === 0 ? <p className="text-center text-muted-foreground py-8">No advances</p> : (
            <div className="space-y-2">
              {advances.map((adv) => (
                <Card key={adv.id}><CardContent className="p-3 flex items-center justify-between">
                  <div><p className="text-sm font-medium">{formatPKR(adv.amount)}</p><p className="text-xs text-muted-foreground">{formatPKDate(adv.date)} · {adv.reason || 'No reason'}</p></div>
                  <Badge variant={adv.is_deducted ? 'secondary' : 'outline'} className="text-[10px]">{adv.is_deducted ? 'Deducted' : 'Pending'}</Badge>
                </CardContent></Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Performance */}
        <TabsContent value="performance" className="mt-4 space-y-4">
          {commissionData ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Card className="calendar-card border-border"><CardContent className="p-3 text-center"><p className="text-lg font-bold">{commissionData.services_count}</p><p className="text-[10px] text-muted-foreground">Services</p></CardContent></Card>
                <Card className="calendar-card border-border"><CardContent className="p-3 text-center"><p className="text-lg font-bold">{formatPKR(commissionData.total_revenue)}</p><p className="text-[10px] text-muted-foreground">Revenue</p></CardContent></Card>
                <Card className="calendar-card border-border"><CardContent className="p-3 text-center"><p className="text-lg font-bold">{formatPKR(commissionData.commission_earned)}</p><p className="text-[10px] text-muted-foreground">Commission</p></CardContent></Card>
              </div>
              <Card className="calendar-card border-border"><CardContent className="p-4 space-y-3">
                <h3 className="text-sm font-medium">Monthly Summary</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between p-2 bg-secondary/50 rounded"><span className="text-muted-foreground">Tips</span><span className="font-medium">{formatPKR(commissionData.tips_total)}</span></div>
                  <div className="flex justify-between p-2 bg-secondary/50 rounded"><span className="text-muted-foreground">Advances</span><span className="font-medium text-red-600">{formatPKR(commissionData.advances_total)}</span></div>
                  <div className="flex justify-between p-2 bg-secondary/50 rounded"><span className="text-muted-foreground">Late Deductions</span><span className="font-medium text-red-600">{formatPKR(commissionData.late_deductions)}</span></div>
                  <div className="flex justify-between p-2 bg-gold/10 border border-gold/20 rounded"><span className="text-muted-foreground">Net Payable</span><span className="font-bold">{formatPKR(commissionData.net_payable)}</span></div>
                </div>
              </CardContent></Card>
              <Card className="calendar-card border-border"><CardContent className="p-4 space-y-2">
                <h3 className="text-sm font-medium">Attendance This Month</h3>
                <div className="grid grid-cols-4 gap-2 text-center text-sm">
                  <div><p className="text-lg font-bold text-green-600">{attPresent}</p><p className="text-[10px] text-muted-foreground">Present</p></div>
                  <div><p className="text-lg font-bold text-red-600">{attAbsent}</p><p className="text-[10px] text-muted-foreground">Absent</p></div>
                  <div><p className="text-lg font-bold text-yellow-600">{attLate}</p><p className="text-[10px] text-muted-foreground">Late</p></div>
                  <div><p className="text-lg font-bold text-blue-600">{attLeave}</p><p className="text-[10px] text-muted-foreground">Leave</p></div>
                </div>
              </CardContent></Card>
            </>
          ) : (
            <Card className="calendar-card border-border"><CardContent className="p-4">
              <p className="text-center text-muted-foreground text-sm py-8">No performance data available for this month.</p>
            </CardContent></Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Attendance Modal */}
      <Dialog open={showAttModal} onOpenChange={setShowAttModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Mark Attendance — {attDate}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Status</Label>
              <Select value={attStatus} onValueChange={(v) => { if (v) setAttStatus(v as AttendanceStatus); }}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['present', 'absent', 'late', 'half_day', 'leave'] as AttendanceStatus[]).map((s) => <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Check In</Label><Input type="time" value={attCheckIn} onChange={(e) => setAttCheckIn(e.target.value)} className="mt-1" /></div>
              <div><Label className="text-xs">Check Out</Label><Input type="time" value={attCheckOut} onChange={(e) => setAttCheckOut(e.target.value)} className="mt-1" /></div>
            </div>
            <div><Label className="text-xs">Notes</Label><Textarea value={attNotes} onChange={(e) => setAttNotes(e.target.value)} rows={2} className="mt-1" /></div>
            <Button onClick={saveAttendance} disabled={savingAtt} className="w-full bg-gold text-black border border-gold">{savingAtt ? 'Saving...' : 'Save'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Advance Modal */}
      <Dialog open={showAdvModal} onOpenChange={setShowAdvModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Record Advance</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Amount (Rs)</Label><Input type="number" value={advAmount} onChange={(e) => setAdvAmount(e.target.value)} className="mt-1" inputMode="numeric" /></div>
            <div><Label className="text-xs">Reason</Label><Input value={advReason} onChange={(e) => setAdvReason(e.target.value)} className="mt-1" /></div>
            <Button onClick={saveAdvance} disabled={savingAdv} className="w-full bg-gold text-black border border-gold">{savingAdv ? 'Saving...' : 'Record Advance'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
