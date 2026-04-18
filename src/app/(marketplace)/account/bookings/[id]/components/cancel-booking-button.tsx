'use client';

/**
 * "Cancel booking" button for the consumer detail page.
 *
 * Two-step interaction:
 *   1. Tap [Cancel booking] — inline confirm card appears with destructive
 *      red framing and a "Keep booking" escape hatch.
 *   2. Tap [Yes, cancel] — invokes `cancelBookingByConsumer`. On success we
 *      `router.refresh()` so the server component re-reads the booking and
 *      re-renders with the new status badge + without the button.
 *
 * Inline confirm beats a modal here: the action is one tap away, the page
 * is narrow, and modals require extra focus-trap logic. A small transient
 * panel inside the CTA row is honest about what's about to happen.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

import { cancelBookingByConsumer } from '@/app/actions/bookings';

interface Props {
  bookingId: string;
}

export function CancelBookingButton({ bookingId }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleTrigger() {
    setConfirming(true);
  }

  function handleBackOut() {
    setConfirming(false);
  }

  function handleConfirm() {
    if (pending) return;
    startTransition(async () => {
      const res = await cancelBookingByConsumer(bookingId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('Booking cancelled');
      setConfirming(false);
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={handleTrigger}
        data-testid="cancel-booking-trigger"
        className="inline-flex h-11 items-center rounded-lg border border-rose-200 bg-white px-4 text-[13px] font-bold text-rose-700 hover:bg-rose-50"
      >
        Cancel booking
      </button>
    );
  }

  return (
    <div
      role="alertdialog"
      aria-label="Confirm cancellation"
      className="flex w-full flex-col gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 md:w-auto md:flex-row md:items-center"
      data-testid="cancel-booking-confirm"
    >
      <p className="text-[13px] font-semibold text-rose-900">
        Cancel this booking? This can&apos;t be undone.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleBackOut}
          disabled={pending}
          className="inline-flex h-9 items-center rounded-lg border border-[#E8E8E8] bg-white px-3 text-[12px] font-bold text-[#1A1A1A] hover:bg-[#F5F5F5] disabled:opacity-50"
        >
          Keep booking
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={pending}
          data-testid="cancel-booking-confirm-yes"
          className="inline-flex h-9 items-center rounded-lg bg-rose-600 px-3 text-[12px] font-bold text-white hover:bg-rose-700 disabled:opacity-50"
        >
          {pending ? 'Cancelling…' : 'Yes, cancel'}
        </button>
      </div>
    </div>
  );
}
