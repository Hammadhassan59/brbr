/**
 * `/account/bookings/[id]` — consumer booking detail page.
 *
 * Server component. The page renders the full booking card: status timeline,
 * salon info block, services, total breakdown. Based on the current status we
 * surface one of three CTAs:
 *
 *   - `PENDING` or `CONFIRMED` → `[Cancel booking]` (delegated to the client
 *     `<CancelBookingButton />` wrapper, which confirms + calls
 *     `cancelBookingByConsumer`).
 *   - `COMPLETED` + review window still open + not yet reviewed →
 *     `[Leave a review]` → `/account/bookings/[id]/review`.
 *   - `COMPLETED` → `[Book again]` → `/book/{slug}?rebook={id}`.
 *
 * The per-status status copy, tone palette, and "Home service charge" line
 * carry over from the v1 stub. What's new here vs. the stub:
 *   1. Status timeline (requested → confirmed/declined → in-progress → done).
 *   2. Salon info block (phone link + address + notes passthrough).
 *   3. Action CTAs gated on status.
 */
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, Clock, Phone, MapPin as MapPinIcon } from 'lucide-react';

import { getConsumerSession } from '@/lib/consumer-session';
import {
  getBookingForConsumer,
  type BookingStatus,
} from '@/app/actions/bookings';
import { getReviewStatusForBooking } from '@/app/actions/marketplace-reviews';

import { BookingStatusBadge } from '../../components/booking-status-badge';
import { CancelBookingButton } from './components/cancel-booking-button';

export const metadata: Metadata = {
  title: 'Your booking',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

const STATUS_COPY: Record<BookingStatus, { title: string; body: string; tone: 'info' | 'success' | 'warning' | 'neutral' }> = {
  PENDING: {
    title: 'Waiting for salon to confirm…',
    body: "We've sent your request. The salon usually replies within a few hours — they may also call or WhatsApp you from their own number.",
    tone: 'info',
  },
  CONFIRMED: {
    title: 'Confirmed!',
    body: "You're all set. See you at your appointment.",
    tone: 'success',
  },
  DECLINED: {
    title: 'Request declined',
    body: 'The salon could not take this booking. Try another time or another salon — no charge.',
    tone: 'warning',
  },
  CANCELLED_BY_CONSUMER: {
    title: 'Cancelled',
    body: 'You cancelled this booking.',
    tone: 'neutral',
  },
  CANCELLED_BY_SALON: {
    title: 'Cancelled by salon',
    body: 'The salon cancelled this booking. No charge.',
    tone: 'warning',
  },
  IN_PROGRESS: {
    title: 'Service in progress',
    body: 'Enjoy your visit!',
    tone: 'info',
  },
  COMPLETED: {
    title: 'Completed',
    body: "Thanks for booking with iCut. We'd love your review.",
    tone: 'success',
  },
  NO_SHOW: {
    title: 'Marked as no-show',
    body: 'The salon reports you did not show up. If this is a mistake, contact support.',
    tone: 'warning',
  },
};

const TONE_STYLES: Record<'info' | 'success' | 'warning' | 'neutral', string> = {
  info: 'border-blue-200 bg-blue-50 text-blue-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  neutral: 'border-[#E8E8E8] bg-[#FAFAF8] text-[#1A1A1A]',
};

function formatPrice(rupees: number): string {
  return new Intl.NumberFormat('en-PK').format(Math.round(rupees));
}

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

function formatTimestamp(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-PK', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

interface TimelineStep {
  label: string;
  reached: boolean;
  at: string | null;
  tone: 'done' | 'current' | 'future' | 'skipped';
}

function buildTimeline(b: {
  status: BookingStatus;
  created_at: string;
  confirmed_at: string | null;
  declined_at: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
}): TimelineStep[] {
  const requested: TimelineStep = {
    label: 'Requested',
    reached: true,
    at: b.created_at,
    tone: 'done',
  };

  // Terminal-by-salon: declined / cancelled-by-salon — the rest of the
  // timeline is irrelevant.
  if (b.status === 'DECLINED') {
    return [
      requested,
      { label: 'Declined by salon', reached: true, at: b.declined_at, tone: 'done' },
    ];
  }
  if (b.status === 'CANCELLED_BY_SALON') {
    return [
      requested,
      { label: 'Confirmed', reached: Boolean(b.confirmed_at), at: b.confirmed_at, tone: b.confirmed_at ? 'done' : 'skipped' },
      { label: 'Cancelled by salon', reached: true, at: b.cancelled_at, tone: 'done' },
    ];
  }
  if (b.status === 'CANCELLED_BY_CONSUMER') {
    return [
      requested,
      { label: 'Confirmed', reached: Boolean(b.confirmed_at), at: b.confirmed_at, tone: b.confirmed_at ? 'done' : 'skipped' },
      { label: 'Cancelled by you', reached: true, at: b.cancelled_at, tone: 'done' },
    ];
  }

  const confirmed: TimelineStep = {
    label: 'Confirmed',
    reached: Boolean(b.confirmed_at) || b.status === 'CONFIRMED' || b.status === 'IN_PROGRESS' || b.status === 'COMPLETED' || b.status === 'NO_SHOW',
    at: b.confirmed_at,
    tone: b.status === 'PENDING' ? 'future' : (b.confirmed_at ? 'done' : 'future'),
  };
  if (b.status === 'CONFIRMED') confirmed.tone = 'done';
  if (b.status === 'PENDING') confirmed.tone = 'current';

  const inProgress: TimelineStep = {
    label: 'In progress',
    reached: b.status === 'IN_PROGRESS' || b.status === 'COMPLETED' || b.status === 'NO_SHOW',
    at: null,
    tone:
      b.status === 'IN_PROGRESS'
        ? 'current'
        : b.status === 'COMPLETED' || b.status === 'NO_SHOW'
          ? 'done'
          : 'future',
  };

  if (b.status === 'NO_SHOW') {
    return [
      requested,
      confirmed,
      { label: 'No-show', reached: true, at: null, tone: 'done' },
    ];
  }

  const completed: TimelineStep = {
    label: 'Completed',
    reached: b.status === 'COMPLETED',
    at: b.completed_at,
    tone: b.status === 'COMPLETED' ? 'done' : 'future',
  };

  return [requested, confirmed, inProgress, completed];
}

export default async function BookingDetailPage({ params }: PageProps) {
  const { id } = await params;

  // The /account layout enforces the session redirect, but re-resolve here
  // for type narrowing (and to keep this page standalone-testable).
  const session = await getConsumerSession();
  if (!session) {
    redirect(`/sign-in?next=/account/bookings/${id}`);
  }

  const res = await getBookingForConsumer(id);
  if (!res.ok) notFound();
  const b = res.data;

  const statusCopy = STATUS_COPY[b.status] ?? STATUS_COPY.PENDING;
  const timeline = buildTimeline(b);

  // Review-window + already-reviewed flags. Only relevant for COMPLETED.
  let canLeaveReview = false;
  if (b.status === 'COMPLETED') {
    const reviewRes = await getReviewStatusForBooking(b.id);
    if (reviewRes.ok) {
      canLeaveReview = reviewRes.data.windowOpen && !reviewRes.data.consumerHasReviewed;
    }
  }

  const cancellable = b.status === 'PENDING' || b.status === 'CONFIRMED';
  const rebookable = b.status === 'COMPLETED' && Boolean(b.branch.slug);

  return (
    <div>
      <Link
        href="/account/bookings"
        className="inline-block text-[12px] font-semibold text-[#888] hover:text-[#1A1A1A]"
      >
        ← My bookings
      </Link>

      <header className="mt-4 mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-gold">
            Booking #{b.id.slice(0, 8)}
          </p>
          <BookingStatusBadge status={b.status} compact />
        </div>
        <h1 className="mt-1 font-heading text-2xl font-bold text-[#1A1A1A]">
          {b.branch.name || 'Salon'}
        </h1>
      </header>

      <div
        role="status"
        className={`rounded-2xl border p-4 ${TONE_STYLES[statusCopy.tone]}`}
      >
        <p className="text-[14px] font-bold">{statusCopy.title}</p>
        <p className="mt-1 text-[13px]">{statusCopy.body}</p>
      </div>

      {/* Status timeline */}
      <section
        className="mt-5 rounded-2xl border border-[#E8E8E8] bg-white p-4"
        aria-label="Booking progress"
      >
        <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-[#888]">
          Progress
        </p>
        <ol className="mt-3 space-y-3">
          {timeline.map((step, i) => (
            <li key={i} className="flex items-start gap-3" data-testid="timeline-step" data-tone={step.tone}>
              <span
                aria-hidden="true"
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                  step.tone === 'done'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : step.tone === 'current'
                      ? 'border-blue-200 bg-blue-50 text-blue-900'
                      : step.tone === 'skipped'
                        ? 'border-[#E8E8E8] bg-[#F5F5F5] text-[#BBB]'
                        : 'border-[#E8E8E8] bg-white text-[#BBB]'
                }`}
              >
                {step.tone === 'done' ? <Check className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-[13px] font-semibold ${
                    step.tone === 'done' || step.tone === 'current' ? 'text-[#1A1A1A]' : 'text-[#999]'
                  }`}
                >
                  {step.label}
                </p>
                {step.at && (
                  <p className="text-[11px] text-[#888]">{formatTimestamp(step.at)}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* When / Where / Notes */}
      <section className="mt-5 rounded-2xl border border-[#E8E8E8] bg-white p-4">
        <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-[#888]">
          When
        </p>
        <p className="mt-1 text-[14px] font-semibold text-[#1A1A1A]">
          {formatSlot(b.requested_slot_start)}
        </p>

        {b.address_street && (
          <>
            <p className="mt-4 text-[11px] font-bold uppercase tracking-[1.5px] text-[#888]">
              Your address (home service)
            </p>
            <p className="mt-1 text-[14px] text-[#1A1A1A]">{b.address_street}</p>
          </>
        )}

        {b.consumer_notes && (
          <>
            <p className="mt-4 text-[11px] font-bold uppercase tracking-[1.5px] text-[#888]">
              Notes for salon
            </p>
            <p className="mt-1 text-[13px] text-[#1A1A1A]">{b.consumer_notes}</p>
          </>
        )}
      </section>

      {/* Salon info block */}
      <section className="mt-4 rounded-2xl border border-[#E8E8E8] bg-white p-4">
        <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-[#888]">
          Salon
        </p>
        <p className="mt-1 text-[14px] font-semibold text-[#1A1A1A]">
          {b.branch.slug ? (
            <Link href={`/barber/${b.branch.slug}`} className="hover:text-gold">
              {b.branch.name || 'Salon'}
            </Link>
          ) : (
            b.branch.name || 'Salon'
          )}
        </p>
        {b.branch.address && (
          <p className="mt-2 flex items-start gap-2 text-[13px] text-[#555]">
            <MapPinIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#888]" aria-hidden="true" />
            <span>{b.branch.address}</span>
          </p>
        )}
        {b.branch.phone && (
          <p className="mt-1 flex items-center gap-2 text-[13px]">
            <Phone className="h-3.5 w-3.5 shrink-0 text-[#888]" aria-hidden="true" />
            <a href={`tel:${b.branch.phone}`} className="font-semibold text-[#1A1A1A] hover:text-gold">
              {b.branch.phone}
            </a>
          </p>
        )}
        {b.branch.lat != null && b.branch.lng != null && (
          <a
            href={`https://maps.google.com/?q=${b.branch.lat},${b.branch.lng}`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block text-[12px] font-semibold text-gold hover:underline"
          >
            Open in Maps →
          </a>
        )}
      </section>

      {/* Services + price breakdown */}
      <section className="mt-4 overflow-hidden rounded-2xl border border-[#E8E8E8] bg-white">
        <div className="border-b border-[#F0F0F0] bg-[#FAFAF8] px-4 py-2">
          <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-[#888]">
            Services
          </p>
        </div>
        <ul>
          {b.items.map((item, i) => (
            <li
              key={item.id}
              className={`flex items-center justify-between px-4 py-3 ${
                i === b.items.length - 1 ? '' : 'border-b border-[#F5F5F5]'
              }`}
            >
              <span className="text-[14px] text-[#1A1A1A]">
                {item.service_name}
              </span>
              <span className="text-[14px] font-semibold text-[#1A1A1A]">
                Rs {formatPrice(Number(item.display_price))}
              </span>
            </li>
          ))}
          {b.service_charge > 0 && (
            <li className="flex items-center justify-between border-t border-[#F0F0F0] bg-[#FAFAF8] px-4 py-3">
              <span className="text-[13px] text-[#1A1A1A]">
                Home service charge
              </span>
              <span className="text-[14px] font-semibold text-[#1A1A1A]">
                Rs {formatPrice(Number(b.service_charge))}
              </span>
            </li>
          )}
          <li className="flex items-center justify-between border-t border-[#1A1A1A]/10 bg-[#FAFAF8] px-4 py-3">
            <span className="text-[13px] font-bold text-[#1A1A1A]">
              Total (cash on service)
            </span>
            <span className="text-lg font-bold text-[#1A1A1A]">
              Rs {formatPrice(Number(b.consumer_total))}
            </span>
          </li>
        </ul>
      </section>

      {/* Action CTAs */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {canLeaveReview && (
          <Link
            href={`/account/bookings/${b.id}/review`}
            className="inline-flex h-11 items-center rounded-lg bg-[#1A1A1A] px-4 text-[13px] font-bold text-white hover:bg-[#1A1A1A]/90"
          >
            Leave a review
          </Link>
        )}
        {rebookable && b.branch.slug && (
          <Link
            href={`/book/${b.branch.slug}?rebook=${b.id}`}
            className="inline-flex h-11 items-center rounded-lg border border-[#1A1A1A] bg-white px-4 text-[13px] font-bold text-[#1A1A1A] hover:bg-[#F5F5F5]"
          >
            Book again
          </Link>
        )}
        {cancellable && <CancelBookingButton bookingId={b.id} />}
      </div>
    </div>
  );
}
