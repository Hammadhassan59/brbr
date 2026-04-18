/**
 * Salon info block — about + working hours + address.
 *
 * Server component. Renders three stacked cards on mobile; on desktop the
 * about text stretches full-width on top and hours/address form a two-column
 * row below.
 *
 * Working-hours data lives as `branches.working_hours` jsonb, shape:
 *
 *   { mon: { open: '09:00', close: '21:00', off: false }, …, sun: { … } }
 *
 * The marketplace expects a friendly day-by-day display. We tolerate missing
 * days or malformed entries by falling back to "Closed" so a typo in the
 * dashboard doesn't break the page.
 */
import { Clock, MapPin } from 'lucide-react';

import type { BranchFull } from '@/lib/marketplace/queries';

interface SalonInfoProps {
  branch: BranchFull;
}

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const DAY_LABEL: Record<(typeof DAY_ORDER)[number], string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

interface DayRow {
  day: (typeof DAY_ORDER)[number];
  label: string;
  display: string;
}

function buildDayRows(
  workingHours: Record<string, unknown> | null,
): DayRow[] {
  if (!workingHours || typeof workingHours !== 'object') return [];
  return DAY_ORDER.map((day) => {
    const raw = (workingHours as Record<string, unknown>)[day];
    if (!raw || typeof raw !== 'object') {
      return { day, label: DAY_LABEL[day], display: 'Closed' };
    }
    const r = raw as { open?: unknown; close?: unknown; off?: unknown };
    if (r.off === true) {
      return { day, label: DAY_LABEL[day], display: 'Closed' };
    }
    const open = typeof r.open === 'string' ? r.open : '';
    const close = typeof r.close === 'string' ? r.close : '';
    if (!open || !close) {
      return { day, label: DAY_LABEL[day], display: 'Closed' };
    }
    return { day, label: DAY_LABEL[day], display: `${open} – ${close}` };
  });
}

export default function SalonInfo({ branch }: SalonInfoProps) {
  const days = buildDayRows(branch.working_hours);

  return (
    <section className="mb-6 space-y-4">
      {/* ── About ── */}
      {branch.about && branch.about.trim().length > 0 && (
        <div className="rounded-2xl border border-[#E8E8E8] bg-white p-5">
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[1.5px] text-gold">
            About
          </h2>
          <p className="whitespace-pre-line text-[14px] leading-relaxed text-[#333]">
            {branch.about}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* ── Hours ── */}
        {days.length > 0 && (
          <div className="rounded-2xl border border-[#E8E8E8] bg-white p-5">
            <h2 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[1.5px] text-gold">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              Hours
            </h2>
            <dl className="space-y-1.5">
              {days.map((row) => (
                <div
                  key={row.day}
                  className="flex items-center justify-between gap-4 text-[13px]"
                >
                  <dt className="font-semibold text-[#1A1A1A]">{row.label}</dt>
                  <dd
                    className={
                      row.display === 'Closed'
                        ? 'text-[#888]'
                        : 'text-[#333]'
                    }
                  >
                    {row.display}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {/* ── Address ── */}
        {branch.address && branch.address.trim().length > 0 && (
          <div className="rounded-2xl border border-[#E8E8E8] bg-white p-5">
            <h2 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[1.5px] text-gold">
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              Address
            </h2>
            <p className="text-[13px] leading-relaxed text-[#333]">
              {branch.address}
            </p>
            {branch.city?.name && (
              <p className="mt-1 text-[12px] text-[#888]">{branch.city.name}</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
