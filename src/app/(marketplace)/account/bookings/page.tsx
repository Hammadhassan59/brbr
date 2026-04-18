/**
 * `/account/bookings` — the consumer's "My Bookings" list.
 *
 * Sections:
 *   - Upcoming: `PENDING`, `CONFIRMED`, `IN_PROGRESS` — sorted asc by slot.
 *   - Past: `COMPLETED`, `DECLINED`, `CANCELLED_BY_*`, `NO_SHOW` — sorted
 *     desc by slot, capped at 20 rows to keep the initial paint snappy.
 *
 * Each row links to the detail page; the salon name is a separate link to
 * the branch profile. The detail page is where the consumer can cancel or
 * rebook — the list page's only interactive element is the status-tinted
 * row itself.
 *
 * Empty state (no bookings across either bucket) nudges the consumer back
 * to `/barbers` to browse. We intentionally do NOT show an empty-state per
 * section when the other has rows — mixing "no upcoming bookings" and a
 * list of past ones is normal and doesn't need an explanation card.
 *
 * Session gate: enforced by the parent `/account/layout.tsx`. We still
 * re-fetch session here for typing convenience; if it's null we render
 * nothing (the layout will redirect before we get here in practice).
 */
import Link from 'next/link';
import type { Metadata } from 'next';

import {
  listBookingsForConsumer,
  type ConsumerBookingListItem,
} from '@/app/actions/bookings';

import { BookingStatusBadge } from '../components/booking-status-badge';

export const metadata: Metadata = {
  title: 'My bookings',
  robots: { index: false, follow: false },
};

function formatSlot(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString('en-PK', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const time = d.toLocaleTimeString('en-PK', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${date} · ${time}`;
}

function formatPrice(rupees: number): string {
  return new Intl.NumberFormat('en-PK').format(Math.round(rupees));
}

function BookingRow({ booking }: { booking: ConsumerBookingListItem }) {
  return (
    <li className="border-b border-[#F0F0F0] last:border-b-0">
      <div className="flex items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {booking.branch.slug ? (
              <Link
                href={`/barber/${booking.branch.slug}`}
                className="truncate text-[14px] font-semibold text-[#1A1A1A] hover:text-gold"
              >
                {booking.branch.name || 'Salon'}
              </Link>
            ) : (
              <span className="truncate text-[14px] font-semibold text-[#1A1A1A]">
                {booking.branch.name || 'Salon'}
              </span>
            )}
            <BookingStatusBadge status={booking.status} compact />
          </div>
          <p className="mt-1 text-[12px] text-[#666]">
            {formatSlot(booking.requested_slot_start)}
          </p>
          <p className="mt-0.5 text-[12px] text-[#888]">
            {booking.location_type === 'home' ? 'Home service' : 'At salon'} ·
            {' '}Rs {formatPrice(booking.consumer_total)}
          </p>
        </div>
        <Link
          href={`/account/bookings/${booking.id}`}
          className="shrink-0 text-[12px] font-semibold text-gold hover:underline"
          aria-label={`View booking ${booking.id.slice(0, 8)}`}
        >
          View →
        </Link>
      </div>
    </li>
  );
}

function Section({
  title,
  bookings,
  emptyHint,
}: {
  title: string;
  bookings: ConsumerBookingListItem[];
  emptyHint?: string;
}) {
  if (bookings.length === 0 && !emptyHint) return null;
  return (
    <section className="mt-6">
      <h2 className="font-heading text-lg font-bold text-[#1A1A1A]">{title}</h2>
      {bookings.length === 0 ? (
        <p className="mt-2 text-[13px] text-[#888]">{emptyHint}</p>
      ) : (
        <ul className="mt-3 overflow-hidden rounded-2xl border border-[#E8E8E8] bg-white">
          {bookings.map((b) => (
            <BookingRow key={b.id} booking={b} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function BookingsListPage() {
  // Two calls — one per bucket — so each list sorts independently and the
  // status filters stay explicit. The `listBookingsForConsumer` action caps
  // at 50 rows per call; we ask for 20 past and 50 upcoming (upcoming is
  // unlikely to exceed 10 in practice).
  const [upcomingRes, pastRes] = await Promise.all([
    listBookingsForConsumer({ bucket: 'upcoming', limit: 50 }),
    listBookingsForConsumer({ bucket: 'past', limit: 20 }),
  ]);

  const upcoming = upcomingRes.ok ? upcomingRes.data : [];
  const past = pastRes.ok ? pastRes.data : [];
  const total = upcoming.length + past.length;

  return (
    <div>
      <header className="mb-3">
        <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-gold">
          Account
        </p>
        <h1 className="mt-1 font-heading text-2xl font-bold text-[#1A1A1A]">
          My bookings
        </h1>
      </header>

      {total === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[#E8E8E8] bg-white/50 p-8 text-center">
          <p className="text-[14px] font-semibold text-[#1A1A1A]">
            No bookings yet
          </p>
          <p className="mt-1 text-[13px] text-[#888]">
            Explore salons near you and book your first visit.
          </p>
          <Link
            href="/barbers"
            className="mt-4 inline-flex h-10 items-center rounded-lg bg-[#1A1A1A] px-4 text-[13px] font-bold text-white hover:bg-[#1A1A1A]/90"
          >
            Browse salons
          </Link>
        </div>
      ) : (
        <>
          <Section
            title="Upcoming"
            bookings={upcoming}
            emptyHint="No upcoming bookings."
          />
          <Section
            title="Past"
            bookings={past}
            emptyHint={past.length === 0 && upcoming.length === 0 ? 'No past bookings.' : undefined}
          />
        </>
      )}
    </div>
  );
}
