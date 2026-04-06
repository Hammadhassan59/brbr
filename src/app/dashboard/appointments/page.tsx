'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, CalendarIcon, RefreshCw, Filter, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import { getTodayPKT } from '@/lib/utils/dates';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarGrid } from './components/calendar-grid';
import { NewAppointmentModal } from './components/new-appointment-modal';
import { AppointmentDetail } from './components/appointment-detail';
import { WalkInQueue } from './components/walk-in-queue';
import type { AppointmentWithDetails, Staff, WorkingHours, PrayerBlocks } from '@/types/database';

interface WalkInEntry {
  id: string;
  tokenNumber: number;
  clientName: string;
  services: string;
  preferredStylist: string;
  addedAt: Date;
}

export default function AppointmentsPage() {
  return (
    <Suspense>
      <AppointmentsContent />
    </Suspense>
  );
}

function AppointmentsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { salon, currentBranch } = useAppStore();

  const [date, setDate] = useState(getTodayPKT());
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<AppointmentWithDetails[]>([]);
  const [stylists, setStylists] = useState<Staff[]>([]);
  const [filterStaffId, setFilterStaffId] = useState<string | null>(null);

  // Modal states
  const [showNewModal, setShowNewModal] = useState(false);
  const [newModalPrefill, setNewModalPrefill] = useState<{
    staffId?: string | null;
    time?: string | null;
    date?: string | null;
    isWalkin?: boolean;
    notes?: string;
  }>({});
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentWithDetails | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  // Walk-in queue
  const [walkInQueue, setWalkInQueue] = useState<WalkInEntry[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem('brbr_walkin_queue');
      if (stored) {
        const parsed = JSON.parse(stored) as WalkInEntry[];
        return parsed.map((e) => ({ ...e, addedAt: new Date(e.addedAt) }));
      }
    } catch {}
    return [];
  });
  const [nextToken, setNextToken] = useState(() => {
    if (typeof window === 'undefined') return 1;
    try {
      const stored = localStorage.getItem('brbr_walkin_queue');
      if (stored) {
        const parsed = JSON.parse(stored) as WalkInEntry[];
        if (parsed.length > 0) {
          return Math.max(...parsed.map((e) => e.tokenNumber)) + 1;
        }
      }
    } catch {}
    return 1;
  });

  useEffect(() => {
    try {
      localStorage.setItem('brbr_walkin_queue', JSON.stringify(walkInQueue));
    } catch {}
  }, [walkInQueue]);

  // Working hours
  const [workingHours, setWorkingHours] = useState<WorkingHours | null>(null);
  const [prayerBlocks, setPrayerBlocks] = useState<PrayerBlocks | null>(null);
  const prayerBlockEnabled = salon?.prayer_block_enabled || false;

  const isToday = date === getTodayPKT();

  // Fetch data
  const fetchData = useCallback(async () => {
    if (!currentBranch || !salon) return;
    setLoading(true);

    try {
      const [aptsRes, staffRes, branchRes] = await Promise.all([
        supabase
          .from('appointments')
          .select('*, client:clients(*), staff:staff(*), services:appointment_services(*)')
          .eq('branch_id', currentBranch.id)
          .eq('appointment_date', date)
          .order('start_time'),
        supabase
          .from('staff')
          .select('*')
          .eq('branch_id', currentBranch.id)
          .eq('is_active', true)
          .in('role', ['senior_stylist', 'junior_stylist', 'owner', 'manager'])
          .order('name'),
        supabase
          .from('branches')
          .select('working_hours, prayer_blocks')
          .eq('id', currentBranch.id)
          .single(),
      ]);

      if (aptsRes.data) setAppointments(aptsRes.data as AppointmentWithDetails[]);
      if (staffRes.data) setStylists(staffRes.data as Staff[]);
      if (branchRes.data) {
        setWorkingHours(branchRes.data.working_hours as WorkingHours);
        setPrayerBlocks(branchRes.data.prayer_blocks as PrayerBlocks);
      }
    } catch {
      toast.error('Failed to load appointments');
    } finally {
      setLoading(false);
    }
  }, [currentBranch, salon, date]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Check for query params
  useEffect(() => {
    const aptId = searchParams.get('id');
    const isWalkin = searchParams.get('walkin');

    if (aptId) {
      const apt = appointments.find((a) => a.id === aptId);
      if (apt) {
        setSelectedAppointment(apt);
        setShowDetail(true);
      }
    }
    if (isWalkin === 'true') {
      setNewModalPrefill({ isWalkin: true });
      setShowNewModal(true);
      router.replace('/dashboard/appointments', { scroll: false });
    }
    if (searchParams.get('new') === 'true') {
      setNewModalPrefill({ date });
      setShowNewModal(true);
      router.replace('/dashboard/appointments', { scroll: false });
    }
  }, [searchParams, appointments]);

  // Real-time subscription
  useEffect(() => {
    if (!currentBranch) return;

    const channel = supabase
      .channel('appointments-calendar')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `branch_id=eq.${currentBranch.id}`,
        },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          const changedDate = payload.new?.appointment_date
            || payload.old?.appointment_date;
          if (changedDate === date) {
            fetchData();
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentBranch, fetchData, date]);

  // Date navigation
  function navigateDate(delta: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + delta);
    setDate(d.toISOString().slice(0, 10));
  }

  // Calendar slot click
  function handleSlotClick(staffId: string, time: string) {
    setNewModalPrefill({ staffId, time, date });
    setShowNewModal(true);
  }

  // Appointment click
  function handleAppointmentClick(apt: AppointmentWithDetails) {
    setSelectedAppointment(apt);
    setShowDetail(true);
  }

  // Walk-in queue handlers
  function handleAddWalkIn(entry: Omit<WalkInEntry, 'id' | 'tokenNumber' | 'addedAt'>) {
    const newEntry: WalkInEntry = {
      ...entry,
      id: crypto.randomUUID(),
      tokenNumber: nextToken,
      addedAt: new Date(),
    };
    setWalkInQueue([...walkInQueue, newEntry]);
    setNextToken(nextToken + 1);
  }

  function handleAssignWalkIn(entry: WalkInEntry) {
    setNewModalPrefill({
      date,
      isWalkin: true,
      notes: `Walk-in #${entry.tokenNumber} — ${entry.services}${entry.preferredStylist ? ` (prefers ${entry.preferredStylist})` : ''}`,
    });
    setShowNewModal(true);
    setWalkInQueue(walkInQueue.filter((e) => e.id !== entry.id));
  }

  function handleRemoveWalkIn(id: string) {
    setWalkInQueue(walkInQueue.filter((e) => e.id !== id));
  }

  const formattedDate = (() => {
    const d = new Date(date + 'T00:00:00');
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  })();

  return (
    <div className="space-y-4">
      <div className="calendar-card bg-card text-foreground border border-border p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigateDate(-1)}
              className="h-11 w-11 touch-target transition-all duration-150 hover:bg-muted"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <Button
              variant={isToday ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDate(getTodayPKT())}
              className={`h-9 px-4 font-semibold transition-all duration-150 ${isToday ? 'bg-[#1A1A1A] text-white border border-[#1A1A1A]' : 'border border-border hover:bg-muted'}`}
            >
              Today
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigateDate(1)}
              className="h-11 w-11 touch-target transition-all duration-150 hover:bg-muted"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-muted-foreground" />
            <span className="text-lg font-semibold tracking-tight text-foreground">{formattedDate}</span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <Select value={filterStaffId || 'all'} onValueChange={(v) => setFilterStaffId(v === 'all' ? null : v)}>
              <SelectTrigger className="calendar-card h-10 w-[180px] bg-secondary border-border text-foreground transition-all duration-150">
                <SelectValue placeholder="All stylists" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stylists</SelectItem>
                {stylists.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <WalkInQueue
              queue={walkInQueue}
              onAddWalkIn={handleAddWalkIn}
              onAssign={handleAssignWalkIn}
              onRemove={handleRemoveWalkIn}
            />

            <Button
              variant="ghost"
              size="icon"
              onClick={fetchData}
              className="h-10 w-10 text-muted-foreground hover:text-foreground transition-all duration-150"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      {loading && appointments.length === 0 ? (
        <div className="calendar-card bg-card border border-border p-6">
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-[52px] bg-muted/40 shimmer" />
            ))}
          </div>
        </div>
      ) : !loading && stylists.length === 0 ? (
        <div className="calendar-card bg-card border border-border">
          <div className="flex flex-col items-center justify-center h-[400px] gap-4">
            <div className="w-16 h-16 bg-muted/40 flex items-center justify-center" style={{ borderRadius: '12px' }}>
              <Users className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-foreground">No stylists available</p>
              <p className="text-sm text-muted-foreground mt-1">Add staff with stylist roles to see the calendar</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="calendar-card bg-card border border-border overflow-hidden">
          <CalendarGrid
            date={date}
            stylists={stylists}
            appointments={appointments}
            workingHours={workingHours}
            prayerBlocks={prayerBlocks}
            prayerBlockEnabled={prayerBlockEnabled}
            onSlotClick={handleSlotClick}
            onAppointmentClick={handleAppointmentClick}
            filterStaffId={filterStaffId}
          />
        </div>
      )}

      <NewAppointmentModal
        open={showNewModal}
        onClose={() => { setShowNewModal(false); setNewModalPrefill({}); }}
        onCreated={fetchData}
        prefillStaffId={newModalPrefill.staffId}
        prefillTime={newModalPrefill.time}
        prefillDate={newModalPrefill.date}
        isWalkin={newModalPrefill.isWalkin}
        prefillNotes={newModalPrefill.notes}
      />

      <AppointmentDetail
        appointment={selectedAppointment}
        open={showDetail}
        onClose={() => { setShowDetail(false); setSelectedAppointment(null); }}
        onUpdated={fetchData}
      />
    </div>
  );
}
