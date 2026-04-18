/**
 * Consumer review submission page — target of the "How was your service?"
 * email prompt sent from `markBookingComplete` after a booking flips to
 * COMPLETED.
 *
 * Guards (in order — fail fast with friendly copy, not a notFound):
 *   1. Consumer session required → redirect to sign-in with `next=…`.
 *   2. Booking must belong to this consumer (`getBookingForConsumer` returns
 *      NOT_FOUND/NOT_ALLOWED otherwise).
 *   3. Status must be COMPLETED.
 *   4. `review_window_closes_at > now()`.
 *   5. Consumer must not have already reviewed this booking.
 *
 * Each failure renders a friendly card so the consumer understands why they
 * can't review — a 404 would be confusing when they followed an email link.
 *
 * The form itself is a tiny client component (`<ReviewForm>`) so we keep the
 * page as a server component and pre-render the booking summary. The client
 * component only handles rating selection + submit.
 */
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';

import { getConsumerSession } from '@/lib/consumer-session';
import { getBookingForConsumer } from '@/app/actions/bookings';
import { getReviewStatusForBooking } from '@/app/actions/marketplace-reviews';
import { ReviewForm } from './review-form';

// Always session-gated + booking-specific; never prerenderable. Opting into
// dynamic rendering avoids the "Failed to collect page data" build error
// caused by redirect() firing during Next's static-collection phase.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Leave a review',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BookingReviewPage({ params }: PageProps) {
  const { id } = await params;

  const session = await getConsumerSession();
  if (!session) {
    redirect(`/sign-in?next=/account/bookings/${id}/review`);
  }

  const bookingRes = await getBookingForConsumer(id);
  if (!bookingRes.ok) {
    return <NotAvailableCard bookingId={id} title="Booking not found" body="We couldn't find this booking." />;
  }
  const booking = bookingRes.data;

  if (booking.status !== 'COMPLETED') {
    return (
      <NotAvailableCard
        bookingId={id}
        title="Not ready for review"
        body="You'll be able to leave a review once the salon marks this booking as completed."
      />
    );
  }

  const statusRes = await getReviewStatusForBooking(id);
  if (!statusRes.ok) {
    return (
      <NotAvailableCard
        bookingId={id}
        title="Review unavailable"
        body={statusRes.error}
      />
    );
  }

  if (!statusRes.data.windowOpen) {
    return (
      <NotAvailableCard
        bookingId={id}
        title="Review window closed"
        body="The 7-day window for leaving a review on this booking has ended."
      />
    );
  }

  if (statusRes.data.consumerHasReviewed) {
    return (
      <NotAvailableCard
        bookingId={id}
        title="Review already submitted"
        body="Thanks — you've already reviewed this booking."
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-md px-5 py-6 pb-24 md:max-w-2xl md:py-10">
      <Link
        href={`/account/bookings/${id}`}
        className="inline-block text-[12px] font-semibold text-[#888] hover:text-[#1A1A1A]"
      >
        ← Back to booking
      </Link>

      <header className="mt-4 mb-5">
        <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-gold">
          Leave a review
        </p>
        <h1 className="mt-1 font-heading text-2xl font-bold text-[#1A1A1A]">
          How was your service?
        </h1>
        <p className="mt-2 text-[13px] text-[#666]">
          Your review helps other customers pick the right salon.
        </p>
      </header>

      <ReviewForm
        bookingId={id}
        salonName={booking.branch.name || 'the salon'}
        defaultRating={5}
      />
    </div>
  );
}

function NotAvailableCard({
  bookingId,
  title,
  body,
}: {
  bookingId: string;
  title: string;
  body: string;
}) {
  return (
    <div className="mx-auto w-full max-w-md px-5 py-6 pb-24 md:max-w-2xl md:py-10">
      <Link
        href={`/account/bookings/${bookingId}`}
        className="inline-block text-[12px] font-semibold text-[#888] hover:text-[#1A1A1A]"
      >
        ← Back to booking
      </Link>
      <div
        role="status"
        className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900"
      >
        <p className="text-[14px] font-bold">{title}</p>
        <p className="mt-1 text-[13px]">{body}</p>
      </div>
    </div>
  );
}
