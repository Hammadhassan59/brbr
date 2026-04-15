'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, CalendarIcon, RefreshCw, Filter, CalendarDays } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import { getTodayPKT } from '@/lib/utils/dates';
import { isDemoBranchId, getDemoBranchFixture } from '@/lib/demo-branch-fixtures';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarGrid } from './components/calendar-grid';
import { NewAppointmentModal } from './components/new-appointment-modal';
import { AppointmentDetail } from './components/appointment-detail';
import { WalkInQueue } from './components/walk-in-queue';
import { EmptyState } from '@/components/empty-state';
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
  const [editingAppointment, setEditingAppointment] = useState<AppointmentWithDetails | null>(null);

  // Walk-in queue
  const [walkInQueue, setWalkInQueue] = useState<WalkInEntry[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem('icut_walkin_queue');
      if (stored) {
        const parsed = JSON.parse(stored) as WalkInEntry[];
        return parsed.map((e) => ({ ...e, addedAt: new Date(e.addedAt) }));
      }
    } catch {}
    return [];
  });
  useEffect(() => {
    try {
      localStorage.setItem('icut_walkin_queue', JSON.stringify(walkInQueue));
    } catch {
      toast.error('Walk-in queue is too large to save locally');
    }
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

    // Demo mode: skip Supabase entirely for known demo branch IDs.
    // The DB has no rows for these IDs; hitting it produces 406 errors
    // and a broken empty state (ISSUE-002).
    if (isDemoBranchId(currentBranch.id)) {
      const fixture = getDemoBranchFixture(currentBranch.id);
      if (fixture) {
        setAppointments([]);
        setStylists(fixture.stylists);
        setWorkingHours(fixture.branch.working_hours as WorkingHours);
        setPrayerBlocks(fixture.branch.prayer_blocks as PrayerBlocks);
      }
      setLoading(false);
      return;
    }

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
          .maybeSingle(),
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
    setDate((prev) => {
      const d = new Date(prev + 'T00:00:00');
      d.setDate(d.getDate() + delta);
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      return `${y}-${mo}-${da}`;
    });
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
  const WALK_IN_MAX = 200;
  function handleAddWalkIn(entry: Omit<WalkInEntry, 'id' | 'tokenNumber' | 'addedAt'>) {
    setWalkInQueue((prev) => {
      if (prev.length >= WALK_IN_MAX) {
        toast.error(`Walk-in queue is full (${WALK_IN_MAX} max)`);
        return prev;
      }
      const maxToken = prev.reduce((m, e) => Math.max(m, e.tokenNumber), 0);
      const newEntry: WalkInEntry = {
        ...entry,
        id: crypto.randomUUID(),
        tokenNumber: maxToken + 1,
        addedAt: new Date(),
      };
      return [...prev, newEntry];
    });
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
      <h1 className="sr-only">Appointments — {formattedDate}</h1>
      <div className="bg-card text-foreground border border-border p-3">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigateDate(-1)}
              aria-label="Previous day"
              className="h-11 w-11 touch-target transition-all duration-150 hover:bg-muted"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <Button
              variant={isToday ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDate(getTodayPKT())}
              aria-label="Jump to today"
              className={`h-11 px-4 font-semibold transition-all duration-150 ${isToday ? 'bg-[#1A1A1A] text-white border border-[#1A1A1A]' : 'border border-border hover:bg-muted'}`}
            >
              Today
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigateDate(1)}
              aria-label="Next day"
              className="h-11 w-11 touch-target transition-all duration-150 hover:bg-muted"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <CalendarIcon className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
            <h2 className="text-base sm:text-lg font-semibold tracking-tight text-foreground m-0 truncate">{formattedDate}</h2>
          </div>

          <div className="flex items-center gap-2 sm:ml-auto flex-wrap">
            <Filter className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
            <select value={filterStaffId || 'all'} onChange={(e) => setFilterStaffId(e.target.value === 'all' ? null : e.target.value)}
              aria-label="Filter by stylist" className="h-11 w-full sm:w-[180px] flex-1 sm:flex-none min-w-0 bg-secondary border border-border text-foreground rounded-md px-3 text-sm transition-all duration-150">
              <option value="all">All Stylists</option>
              {stylists.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

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
              aria-label="Refresh appointments"
              className="h-11 w-11 shrink-0 text-muted-foreground hover:text-foreground transition-all duration-150"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>

      {loading && appointments.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-[52px] bg-muted/40 shimmer" />
            ))}
          </div>
        </div>
      ) : !loading && stylists.length === 0 ? (
        <EmptyState icon={CalendarDays} text="noAppointmentsYet" ctaLabel="bookAppointmentCta" ctaHref="/dashboard/appointments?new=true" />
      ) : (
        <>
          {/* Mobile: list view grouped by stylist (calendar grid not usable on narrow screens) */}
          <div className="md:hidden space-y-3">
            <Button
              onClick={() => { setNewModalPrefill({ date }); setShowNewModal(true); }}
              className="w-full h-11 bg-[#1A1A1A] text-white hover:bg-[#2A2A2A] font-semibold"
            >
              + New Appointment
            </Button>
            {(() => {
              const visibleStylists = filterStaffId ? stylists.filter((s) => s.id === filterStaffId) : stylists;
              const appts = appointments.slice().sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
              if (appts.length === 0) {
                return (
                  <div className="bg-card border border-border rounded-lg p-6 text-center">
                    <p className="text-sm text-muted-foreground">No appointments for this day.</p>
                  </div>
                );
              }
              return visibleStylists.map((stylist) => {
                const forStylist = appts.filter((a) => a.staff_id === stylist.id);
                if (forStylist.length === 0) return null;
                return (
                  <div key={stylist.id} className="bg-card border border-border rounded-lg overflow-hidden">
                    <div className="px-3 py-2 border-b border-border bg-secondary/40">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{stylist.name}</p>
                    </div>
                    <ul className="divide-y divide-border">
                      {forStylist.map((apt) => {
                        const clientName = apt.client?.name || 'Walk-in';
                        const serviceList = (apt.services || []).map((s) => s.service_name).filter(Boolean).join(', ') || '—';
                        return (
                          <li key={apt.id}>
                            <button
                              onClick={() => handleAppointmentClick(apt)}
                              className="w-full text-left px-3 py-3 hover:bg-muted/40 transition-colors"
                            >
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="font-mono text-sm font-semibold">{apt.start_time?.slice(0, 5)}</span>
                                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{apt.status || 'scheduled'}</span>
                              </div>
                              <p className="text-sm font-medium mt-1 truncate">{clientName}</p>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{serviceList}</p>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              });
            })()}
          </div>

          {/* Tablet+ : original calendar grid with drag-drop */}
          <div className="hidden md:block bg-card border border-border rounded-lg overflow-hidden">
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
        </>
      )}

      <NewAppointmentModal
        open={showNewModal}
        onClose={() => { setShowNewModal(false); setNewModalPrefill({}); setEditingAppointment(null); }}
        onCreated={fetchData}
        prefillStaffId={newModalPrefill.staffId}
        prefillTime={newModalPrefill.time}
        prefillDate={newModalPrefill.date}
        isWalkin={newModalPrefill.isWalkin}
        prefillNotes={newModalPrefill.notes}
        editing={editingAppointment}
      />

      <AppointmentDetail
        appointment={selectedAppointment}
        open={showDetail}
        onClose={() => { setShowDetail(false); setSelectedAppointment(null); }}
        onUpdated={fetchData}
        onEdit={(apt) => { setEditingAppointment(apt); setShowNewModal(true); }}
      />
    </div>
  );
}
