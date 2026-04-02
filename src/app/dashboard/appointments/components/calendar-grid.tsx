'use client';

import { useMemo } from 'react';
import { formatTime, getPrayerBlocks as getPrayerBlockTimes } from '@/lib/utils/dates';
import { formatPKR } from '@/lib/utils/currency';
import type { AppointmentWithDetails, Staff, AppointmentStatus, PrayerBlocks, WorkingHours } from '@/types/database';

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  booked: 'bg-blue-500/10 border-blue-500/20 text-blue-600',
  confirmed: 'bg-blue-500/15 border-blue-500/25 text-blue-700',
  in_progress: 'bg-amber-500/15 border-amber-500/25 text-amber-600',
  done: 'bg-gray-500/10 border-gray-200 text-gray-500',
  no_show: 'bg-red-500/10 border-red-500/20 text-red-600',
  cancelled: 'bg-gray-500/5 border-gray-200 text-gray-400 line-through',
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

  // Use centralized prayer times from the dates utility
  const prayerTimes = getPrayerBlockTimes();
  const keyMap: Record<string, keyof PrayerBlocks> = {
    Fajr: 'fajr', Zuhr: 'zuhr', Asr: 'asr', Maghrib: 'maghrib', Isha: 'isha',
  };

  for (const prayer of prayerTimes) {
    const key = keyMap[prayer.name];
    // Only block prayers enabled in the branch's prayer_blocks settings
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
  if (!enabled || dayOfWeek !== 5) return false; // Friday = 5
  const [h, m] = time.split(':').map(Number);
  const mins = h * 60 + m;
  return mins >= 750 && mins < 840; // 12:30 - 14:00
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

  // Map appointments by staff+time for quick lookup
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

  // Calculate appointment height (spans)
  function getAppointmentSpan(apt: AppointmentWithDetails): number {
    const totalDuration = apt.services?.reduce((sum, s) => sum + (s.duration_minutes || 30), 0) || 30;
    return Math.max(1, Math.ceil(totalDuration / 30));
  }

  // Track which slots are occupied by multi-slot appointments
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
        <div className="text-center">
          <p className="text-lg font-medium">Day Off</p>
          <p className="text-sm">Salon is closed today</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        {/* Header: stylist names */}
        <div className="flex border-b sticky top-0 bg-card z-10">
          <div className="w-16 shrink-0 p-2 text-xs text-muted-foreground font-medium border-r">
            Time
          </div>
          {filteredStylists.map((stylist) => (
            <div
              key={stylist.id}
              className="flex-1 min-w-[140px] p-2 text-center border-r last:border-r-0"
            >
              <div className="w-8 h-8 rounded-full bg-gold/20 text-gold text-xs font-bold flex items-center justify-center mx-auto mb-1">
                {stylist.name.charAt(0)}
              </div>
              <p className="text-xs font-medium truncate">{stylist.name}</p>
              <p className="text-[10px] text-muted-foreground capitalize">{stylist.role.replace('_', ' ')}</p>
            </div>
          ))}
        </div>

        {/* Time slots grid */}
        <div>
          {timeSlots.map((time) => {
            const prayerName = isPrayerBlock(time, prayerBlocks, prayerBlockEnabled);
            const jummah = isJummahBlock(time, dayOfWeek, !!hasJummahBreak);
            const isBlocked = !!prayerName || jummah;

            return (
              <div key={time} className="flex border-b min-h-[48px]">
                {/* Time label */}
                <div className="w-16 shrink-0 p-1 text-[11px] text-muted-foreground font-mono border-r flex items-start justify-end pr-2 pt-1">
                  {formatTime(time)}
                </div>

                {/* Stylist columns */}
                {filteredStylists.map((stylist) => {
                  const key = `${stylist.id}-${time}`;
                  const apts = appointmentMap[key];
                  const isOccupied = occupiedSlots.has(key) && !apts;

                  if (isBlocked) {
                    return (
                      <div
                        key={key}
                        className="flex-1 min-w-[140px] border-r last:border-r-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,var(--muted)_4px,var(--muted)_5px)] flex items-center justify-center"
                      >
                        <span className="text-[10px] text-muted-foreground font-medium">
                          {prayerName || 'Jummah'}
                        </span>
                      </div>
                    );
                  }

                  if (isOccupied) {
                    // Slot occupied by a multi-slot appointment above
                    return (
                      <div key={key} className="flex-1 min-w-[140px] border-r last:border-r-0" />
                    );
                  }

                  if (apts && apts.length > 0) {
                    const apt = apts[0];
                    const span = getAppointmentSpan(apt);
                    const totalPrice = apt.services?.reduce((sum, s) => sum + s.price, 0) || 0;

                    return (
                      <div key={key} className="flex-1 min-w-[140px] border-r last:border-r-0 p-0.5 relative" style={{ minHeight: span > 1 ? `${span * 48}px` : undefined }}>
                        <button
                          onClick={() => onAppointmentClick(apt)}
                          className={`w-full text-left p-2 rounded-md border text-xs transition-all hover:shadow-md ${STATUS_COLORS[apt.status]}`}
                          style={{ height: span > 1 ? `${span * 48 - 4}px` : undefined }}
                        >
                          <p className="font-medium truncate">{apt.client?.name || 'Walk-in'}</p>
                          <p className="truncate opacity-80">
                            {apt.services?.map((s) => s.service_name).join(', ')}
                          </p>
                          {totalPrice > 0 && (
                            <p className="opacity-70 mt-0.5">{formatPKR(totalPrice)}</p>
                          )}
                        </button>
                      </div>
                    );
                  }

                  // Empty slot — clickable
                  return (
                    <div key={key} className="flex-1 min-w-[140px] border-r last:border-r-0">
                      <button
                        onClick={() => onSlotClick(stylist.id, time)}
                        className="w-full h-full min-h-[48px] hover:bg-gold/5 cursor-pointer transition-colors"
                        aria-label={`Book ${stylist.name} at ${time}`}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
