'use client';

/**
 * Status pill for the 8 booking statuses. Shared between the bookings list
 * page (every row) and the detail page (big header + inline references).
 *
 * Color map — keyed on plan decision "status tracking" semantics:
 *   PENDING                → amber  (waiting on salon action)
 *   CONFIRMED              → blue   (future, all set)
 *   IN_PROGRESS            → indigo (happening now)
 *   COMPLETED              → green  (terminal, happy path)
 *   DECLINED               → rose   (terminal, salon said no)
 *   CANCELLED_BY_CONSUMER  → gray   (terminal, consumer withdrew)
 *   CANCELLED_BY_SALON     → rose   (terminal, salon withdrew)
 *   NO_SHOW                → rose   (terminal, flagged)
 *
 * Client component only because `usePathname` in the sibling nav tainted the
 * whole components/ folder — pure-presentation here, but the `'use client'`
 * keeps imports in both server and client contexts equally cheap.
 */

import type { BookingStatus } from '@/app/actions/bookings';

interface Props {
  status: BookingStatus;
  /** Optional compact mode for tight rows (uses `text-[11px]`). */
  compact?: boolean;
}

interface BadgeSpec {
  label: string;
  className: string;
}

const SPEC: Record<BookingStatus, BadgeSpec> = {
  PENDING: {
    label: 'Pending',
    className: 'bg-amber-50 text-amber-900 border-amber-200',
  },
  CONFIRMED: {
    label: 'Confirmed',
    className: 'bg-blue-50 text-blue-900 border-blue-200',
  },
  IN_PROGRESS: {
    label: 'In progress',
    className: 'bg-indigo-50 text-indigo-900 border-indigo-200',
  },
  COMPLETED: {
    label: 'Completed',
    className: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  },
  DECLINED: {
    label: 'Declined',
    className: 'bg-rose-50 text-rose-900 border-rose-200',
  },
  CANCELLED_BY_CONSUMER: {
    label: 'Cancelled',
    className: 'bg-[#F5F5F5] text-[#555] border-[#E8E8E8]',
  },
  CANCELLED_BY_SALON: {
    label: 'Cancelled by salon',
    className: 'bg-rose-50 text-rose-900 border-rose-200',
  },
  NO_SHOW: {
    label: 'No-show',
    className: 'bg-rose-50 text-rose-900 border-rose-200',
  },
};

export function BookingStatusBadge({ status, compact = false }: Props) {
  const spec = SPEC[status] ?? SPEC.PENDING;
  const sizing = compact
    ? 'text-[11px] px-2 py-0.5'
    : 'text-[12px] px-2.5 py-1';
  return (
    <span
      role="status"
      data-status={status}
      className={`inline-flex items-center rounded-full border font-semibold ${sizing} ${spec.className}`}
    >
      {spec.label}
    </span>
  );
}

/** Export the label map for reuse in non-badge UI (e.g. status timeline). */
export function labelForBookingStatus(status: BookingStatus): string {
  return SPEC[status]?.label ?? status;
}
