'use client';

/**
 * Step 3 — pick a time slot.
 *
 * Uses native `<input type="date">` + a simple 30-minute time grid. No date
 * picker library (per spec) — mobile browsers already have great pickers for
 * `<input type="date">`, and the time grid gives us a visible choice instead
 * of another dropdown.
 *
 * Behavior:
 *   - Date defaults to today.
 *   - Time grid = 30-minute increments between the branch's open/close for
 *     the selected weekday. Closed days return no slots.
 *   - Past slots for today are disabled.
 *   - Duration = sum of the selected services' `duration_minutes` (falls
 *     back to 30 minutes if all are null). slotEnd = slotStart + duration.
 *   - No conflict check against existing appointments — future wave.
 */

import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import type { BranchService } from '@/lib/marketplace/queries';

import { parseWorkingHours, WEEKDAY_KEYS, type WeekdayKey } from './types';

interface Props {
  workingHours: Record<string, unknown> | null;
  services: BranchService[];
  selectedIds: string[];
  slotStart: string | null;
  slotEnd: string | null;
  onSlot: (slotStart: string, slotEnd: string) => void;
  onBack: () => void;
  onContinue: () => void;
}

/** YYYY-MM-DD for `today`, computed in local time. */
function todayYMD(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse "HH:MM" → minutes since midnight. */
function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map((p) => Number.parseInt(p, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

/** Minutes since midnight → "HH:MM". */
function minutesToHM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Friendly display: "10:30 AM". */
function displayTime(hm: string): string {
  const [h, m] = hm.split(':').map((p) => Number.parseInt(p, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hm;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/** Combine a date-only ("YYYY-MM-DD") with a time ("HH:MM") to a local ISO. */
function composeISO(dateYMD: string, hm: string): string {
  const [y, m, d] = dateYMD.split('-').map((p) => Number.parseInt(p, 10));
  const [h, min] = hm.split(':').map((p) => Number.parseInt(p, 10));
  return new Date(y, (m ?? 1) - 1, d ?? 1, h ?? 0, min ?? 0, 0, 0).toISOString();
}

const SLOT_GRANULARITY_MIN = 30;

export function StepSlot({
  workingHours,
  services,
  selectedIds,
  slotStart,
  slotEnd: _slotEnd,
  onSlot,
  onBack,
  onContinue,
}: Props) {
  // Void unused to keep TS quiet + signal that we consciously don't render it.
  void _slotEnd;
  const hours = useMemo(() => parseWorkingHours(workingHours), [workingHours]);

  const [date, setDate] = useState<string>(() => {
    if (slotStart) {
      const d = new Date(slotStart);
      if (!Number.isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
    }
    return todayYMD();
  });

  const [time, setTime] = useState<string | null>(() => {
    if (!slotStart) return null;
    const d = new Date(slotStart);
    if (Number.isNaN(d.getTime())) return null;
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });

  // Total duration = sum of selected services' durations. Fallback = 30min.
  const durationMin = useMemo(() => {
    const selected = services.filter((s) => selectedIds.includes(s.id));
    const sum = selected.reduce(
      (acc, s) => acc + (s.duration_minutes && s.duration_minutes > 0 ? s.duration_minutes : 0),
      0,
    );
    return sum > 0 ? sum : 30;
  }, [services, selectedIds]);

  // Derive weekday key ("monday", etc.) from the chosen date (local).
  const weekdayKey: WeekdayKey = useMemo(() => {
    const [y, m, d] = date.split('-').map((p) => Number.parseInt(p, 10));
    const jsDay = new Date(y, (m ?? 1) - 1, d ?? 1).getDay(); // 0=Sunday
    return WEEKDAY_KEYS[jsDay] ?? 'monday';
  }, [date]);

  const entry = hours[weekdayKey];

  // Compute the 30-min slot list for the chosen weekday.
  const slots: string[] = useMemo(() => {
    if (!entry || entry.closed) return [];
    const open = hmToMinutes(entry.open);
    const close = hmToMinutes(entry.close);
    // Last slot whose END is still within hours: slotEnd = start + duration.
    const out: string[] = [];
    for (let t = open; t + durationMin <= close; t += SLOT_GRANULARITY_MIN) {
      out.push(minutesToHM(t));
    }
    return out;
  }, [entry, durationMin]);

  const isToday = date === todayYMD();
  const nowMin = (() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  })();

  const handlePick = (hm: string) => {
    setTime(hm);
    const start = composeISO(date, hm);
    const endDate = new Date(new Date(start).getTime() + durationMin * 60 * 1000);
    onSlot(start, endDate.toISOString());
  };

  return (
    <div className="space-y-5 pb-28 md:pb-0">
      <div>
        <h2 className="font-heading text-lg font-bold text-[#1A1A1A]">
          Pick a time
        </h2>
        <p className="mt-1 text-[13px] text-[#888]">
          30-minute slots. Duration: {durationMin} min based on the services you
          picked.
        </p>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="slot-date"
          className="text-[12px] font-semibold text-[#1A1A1A]"
        >
          Date
        </label>
        <input
          id="slot-date"
          type="date"
          value={date}
          min={todayYMD()}
          onChange={(e) => {
            setDate(e.target.value || todayYMD());
            setTime(null);
          }}
          className="block w-full rounded-lg border border-[#E8E8E8] bg-white px-3 py-2 text-[14px] text-[#1A1A1A] focus:border-gold focus:outline-none"
        />
      </div>

      {entry?.closed ? (
        <div className="rounded-2xl border border-dashed border-[#E8E8E8] bg-white/50 p-6 text-center">
          <p className="text-[13px] text-[#888]">
            Salon is closed on{' '}
            {weekdayKey[0].toUpperCase() + weekdayKey.slice(1)}s. Pick another
            day.
          </p>
        </div>
      ) : slots.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#E8E8E8] bg-white/50 p-6 text-center">
          <p className="text-[13px] text-[#888]">
            No slots fit your services for that day.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {slots.map((hm) => {
            const slotMin = hmToMinutes(hm);
            const disabled = isToday && slotMin <= nowMin;
            const active = time === hm;
            return (
              <button
                key={hm}
                type="button"
                disabled={disabled}
                data-testid="wizard-slot-button"
                data-slot-time={hm}
                onClick={() => handlePick(hm)}
                className={`rounded-lg border px-2 py-2 text-[13px] font-semibold transition-colors ${
                  active
                    ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white'
                    : disabled
                      ? 'border-[#EEE] bg-[#FAFAFA] text-[#BBB] cursor-not-allowed'
                      : 'border-[#E8E8E8] bg-white text-[#1A1A1A] hover:border-[#1A1A1A]/40'
                }`}
              >
                {displayTime(hm)}
              </button>
            );
          })}
        </div>
      )}

      <div className="fixed inset-x-0 bottom-16 z-20 border-t border-[#E8E8E8] bg-white px-4 py-3 md:static md:border-0 md:bg-transparent md:p-0">
        <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3 md:max-w-none">
          <Button type="button" variant="ghost" onClick={onBack} className="h-11">
            Back
          </Button>
          <Button
            type="button"
            onClick={onContinue}
            disabled={!time}
            className="h-11 bg-[#1A1A1A] px-6 text-[14px] font-bold text-white hover:bg-[#1A1A1A]/90 disabled:bg-[#BBB]"
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
