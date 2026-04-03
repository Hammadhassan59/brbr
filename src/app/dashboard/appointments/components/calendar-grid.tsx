'use client';

import { useMemo } from 'react';
import { CalendarIcon } from 'lucide-react';
import { formatTime, getPrayerBlocks as getPrayerBlockTimes } from '@/lib/utils/dates';
import { formatPKR } from '@/lib/utils/currency';
import type { AppointmentWithDetails, Staff, AppointmentStatus, PrayerBlocks, WorkingHours } from '@/types/database';

const STATUS_STRIPE: Record<AppointmentStatus, string> = {
  booked: 'border-l-blue-500',
  confirmed: 'border-l-blue-700',
  in_progress: 'border-l-amber-500',
  done: 'border-l-gray-400',
  no_show: 'border-l-red-500',
  cancelled: 'border-l-gray-400',
};

const STATUS_BG: Record<AppointmentStatus, string> = {
  booked: 'bg-blue-500/8 hover:bg-blue-500/12',
  confirmed: 'bg-blue-700/8 hover:bg-blue-700/12',
  in_progress: 'bg-amber-500/8 hover:bg-amber-500/12',
  done: 'bg-muted/30 hover:bg-muted/40 opacity-70',
  no_show: 'bg-red-500/8 hover:bg-red-500/12',
  cancelled: 'bg-muted/20 hover:bg-muted/30 opacity-50',
};

interface CalendarGridProps {
  date: string;
  stylists: Staff[];
  appointments: AppointmentWithDetails[];
  workingHours: WorkingHours | null;
  prayerBlocks: PrayerBlocks | null;
  prayerBlockEnabled: boolean;
  onSlotClick: (staffId: string, time: string) => void;
  onAppointmentClick: (appointment: AppointmentWithDetails) => void;
  filterStaffId?: string | null;
}

function generateTimeSlots(openTime: string, closeTime: string): string[] {
  const slots: string[] = [];
  const [openH, openM] = openTime.split(':').map(Number);
  const [closeH, closeM] = closeTime.split(':').map(Number);
  let h = openH;
  let m = openM;
  while (h < closeH || (h === closeH && m < closeM)) {
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    m += 30;
    if (m >= 60) { h++; m = 0; }
  }
  return slots;
}

function isPrayerBlock(time: string, prayerBlocks: PrayerBlocks | null, enabled: boolean): string | null {
  if (!enabled || !prayerBlocks) return null;
  const [h, m] = time.split(':').map(Number);
  const mins = h * 60 + m;

  const prayerTimes = getPrayerBlockTimes();
  const keyMap: Record<string, keyof PrayerBlocks> = {
    Fajr: 'fajr', Zuhr: 'zuhr', Asr: 'asr', Maghrib: 'maghrib', Isha: 'isha',
  };

  for (const prayer of prayerTimes) {
    const key = keyMap[prayer.name];
    if (!key || !prayerBlocks[key]) continue;

    const [sH, sM] = prayer.start.split(':').map(Number);
    const [eH, eM] = prayer.end.split(':').map(Number);
    const startMins = sH * 60 + sM;
    const endMins = eH * 60 + eM;

    if (mins >= startMins && mins < endMins) {
      return prayer.name;
    }
  }
  return null;
}

function isJummahBlock(time: string, dayOfWeek: number, enabled: boolean): boolean {
  if (!enabled || dayOfWeek !== 5) return false;
  const [h, m] = time.split(':').map(Number);
  const mins = h * 60 + m;
  return mins >= 750 && mins < 840;
}

export function CalendarGrid({
  date,
  stylists,
  appointments,
  workingHours,
  prayerBlocks,
  prayerBlockEnabled,
  onSlotClick,
  onAppointmentClick,
  filterStaffId,
}: CalendarGridProps) {
  const dayOfWeek = new Date(date).getDay();
  const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dayOfWeek] as keyof WorkingHours;
  const dayHours = workingHours?.[dayKey];
  const openTime = dayHours?.open || '09:00';
  const closeTime = dayHours?.close || '21:00';
  const isDayOff = dayHours?.off || false;
  const hasJummahBreak = dayKey === 'fri' && (dayHours as { jummah_break?: boolean })?.jummah_break;

  const timeSlots = useMemo(() => generateTimeSlots(openTime, closeTime), [openTime, closeTime]);

  const filteredStylists = filterStaffId
    ? stylists.filter((s) => s.id === filterStaffId)
    : stylists;

  const appointmentMap = useMemo(() => {
    const map: Record<string, AppointmentWithDetails[]> = {};
    appointments.forEach((apt) => {
      if (!apt.staff_id) return;
      const key = `${apt.staff_id}-${apt.start_time.slice(0, 5)}`;
      if (!map[key]) map[key] = [];
      map[key].push(apt);
    });
    return map;
  }, [appointments]);

  function getAppointmentSpan(apt: AppointmentWithDetails): number {
    const totalDuration = apt.services?.reduce((sum, s) => sum + (s.duration_minutes || 30), 0) || 30;
    return Math.max(1, Math.ceil(totalDuration / 30));
  }

  const occupiedSlots = useMemo(() => {
    const set = new Set<string>();
    appointments.forEach((apt) => {
      if (!apt.staff_id) return;
      const [h, m] = apt.start_time.split(':').map(Number);
      const span = getAppointmentSpan(apt);
      for (let i = 0; i < span; i++) {
        let slotM = m + i * 30;
        let slotH = h;
        while (slotM >= 60) { slotH++; slotM -= 60; }
        set.add(`${apt.staff_id}-${String(slotH).padStart(2, '0')}:${String(slotM).padStart(2, '0')}`);
      }
    });
    return set;
  }, [appointments]);

  if (isDayOff) {
    return (
      <div className="flex items-center justify-center h-[400px] text-muted-foreground">
        <div className="text-center space-y-2">
          <CalendarIcon className="w-12 h-12 text-muted-foreground/30 mx-auto" />
          <p className="text-lg font-semibold">Day Off</p>
          <p className="text-sm text-muted-foreground">Salon is closed today</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        <div className="flex border-b border-border/50 sticky top-0 bg-card z-10">
          <div className="w-24 shrink-0 px-3 py-3 text-xs font-medium text-muted-foreground border-r border-border flex items-end justify-end">
            Time
          </div>
          {filteredStylists.map((stylist) => (
            <div
              key={stylist.id}
              className="flex-1 min-w-[160px] border-r border-border last:border-r-0"
            >
              <div className="bg-secondary m-1.5 p-3 border border-border calendar-card flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gold/15 text-gold text-sm font-bold flex items-center justify-center shrink-0 ring-2 ring-gold/20">
                  {stylist.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate text-foreground">{stylist.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{stylist.role.replace('_', ' ')}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div>
          {timeSlots.map((time, idx) => {
            const prayerName = isPrayerBlock(time, prayerBlocks, prayerBlockEnabled);
            const jummah = isJummahBlock(time, dayOfWeek, !!hasJummahBreak);
            const isBlocked = !!prayerName || jummah;

            return (
              <div
                key={time}
                className={`flex border-b border-border/50 min-h-[52px] ${idx % 2 === 0 ? 'bg-card' : 'bg-secondary/30'}`}
              >
                <div className="w-24 shrink-0 px-3 py-2 text-sm text-muted-foreground/60 font-mono border-r border-border/50 flex items-start justify-end">
                  {formatTime(time)}
                </div>

                {filteredStylists.map((stylist) => {
                  const key = `${stylist.id}-${time}`;
                  const apts = appointmentMap[key];
                  const isOccupied = occupiedSlots.has(key) && !apts;

                  if (isBlocked) {
                    return (
                      <div
                        key={key}
                        className="flex-1 min-w-[160px] border-r border-border/50 last:border-r-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,var(--muted)_6px,var(--muted)_7px)] flex items-center justify-center opacity-40"
                      >
                        <span className="text-xs text-muted-foreground font-medium px-2 py-0.5 bg-card/60">
                          {prayerName || 'Jummah'}
                        </span>
                      </div>
                    );
                  }

                  if (isOccupied) {
                    return (
                      <div key={key} className="flex-1 min-w-[160px] border-r border-border/30 last:border-r-0" />
                    );
                  }

                  if (apts && apts.length > 0) {
                    const apt = apts[0];
                    const span = getAppointmentSpan(apt);
                    const totalPrice = apt.services?.reduce((sum, s) => sum + s.price, 0) || 0;
                    const isCancelled = apt.status === 'cancelled';

                    return (
                      <div
                        key={key}
                        className="flex-1 min-w-[160px] border-r border-border/30 last:border-r-0 p-1 relative"
                        style={{ minHeight: span > 1 ? `${span * 52}px` : undefined }}
                      >
                        <button
                          onClick={() => onAppointmentClick(apt)}
                          className={`
                            calendar-card w-full text-left p-3 border-l-4 border border-border/40
                            bg-card shadow-md transition-all duration-150 hover:scale-[1.02] hover:shadow-lg
                            ${STATUS_STRIPE[apt.status]}
                            ${isCancelled ? 'line-through opacity-60' : ''}
                          `}
                          style={{ height: span > 1 ? `${span * 52 - 8}px` : undefined }}
                        >
                          <p className="text-sm font-semibold truncate">{apt.client?.name || 'Walk-in'}</p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {apt.services?.map((s) => s.service_name).join(', ')}
                          </p>
                          {totalPrice > 0 && (
                            <p className="text-xs font-medium text-foreground/70 mt-1">{formatPKR(totalPrice)}</p>
                          )}
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div key={key} className="flex-1 min-w-[160px] border-r border-border/50 last:border-r-0 p-0.5">
                      <button
                        onClick={() => onSlotClick(stylist.id, time)}
                        className="w-full h-full min-h-[48px] border border-transparent hover:border-gold/20 hover:bg-card/80 hover:shadow-sm cursor-pointer transition-all duration-150 calendar-card"
                        aria-label={`Book ${stylist.name} at ${time}`}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
          {appointments.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <CalendarIcon className="w-10 h-10 text-muted-foreground/25 mx-auto mb-3" />
              <p className="text-sm font-medium">No appointments yet</p>
              <p className="text-xs text-muted-foreground mt-1">Tap a slot to book</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
