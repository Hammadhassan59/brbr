'use client';

/**
 * ReviewForm — client component used by the consumer review page.
 *
 * Shape:
 *   - 5-star rating selector (radio group; keyboard-accessible via arrow keys).
 *   - Optional textarea for a comment (capped at 2000 chars to match the zod
 *     validator on the server; character counter visible at 80%+).
 *   - Submit → `submitConsumerReview` server action → toast + redirect back to
 *     the booking detail page. Failure stays on the form with a toast error.
 *
 * Accessibility:
 *   - Radio group has role="radiogroup" + aria-label.
 *   - Each star is a real `<input type="radio">` for native focus management.
 *   - Disabled state during submission uses `aria-busy`.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Star } from 'lucide-react';

import { submitConsumerReview } from '@/app/actions/marketplace-reviews';

const MAX_COMMENT = 2000;

interface ReviewFormProps {
  bookingId: string;
  salonName: string;
  defaultRating?: 1 | 2 | 3 | 4 | 5;
}

export function ReviewForm({ bookingId, salonName, defaultRating = 5 }: ReviewFormProps) {
  const router = useRouter();
  const [rating, setRating] = useState<number>(defaultRating);
  const [comment, setComment] = useState('');
  const [pending, startTransition] = useTransition();

  const commentLen = comment.length;
  const counterTone =
    commentLen > MAX_COMMENT * 0.95
      ? 'text-rose-600'
      : commentLen > MAX_COMMENT * 0.8
        ? 'text-amber-700'
        : 'text-[#888]';

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await submitConsumerReview({
        bookingId,
        rating,
        comment: comment.trim().length > 0 ? comment.trim() : undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('Thanks for your review!');
      router.replace(`/account/bookings/${bookingId}`);
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5"
      aria-busy={pending}
      noValidate
    >
      <fieldset className="rounded-2xl border border-[#E8E8E8] bg-white p-5">
        <legend className="px-1 text-[11px] font-bold uppercase tracking-[1.5px] text-[#888]">
          Your rating of {salonName}
        </legend>
        <div
          role="radiogroup"
          aria-label="Rating (1 to 5 stars)"
          className="mt-2 flex items-center gap-2"
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              className="cursor-pointer p-1"
              aria-label={`${n} star${n === 1 ? '' : 's'}`}
            >
              <input
                type="radio"
                name="rating"
                value={n}
                checked={rating === n}
                onChange={() => setRating(n)}
                className="sr-only"
                disabled={pending}
              />
              <Star
                className={`h-8 w-8 transition-colors ${
                  n <= rating
                    ? 'fill-amber-500 stroke-amber-500'
                    : 'fill-none stroke-[#D4D4D4]'
                }`}
                aria-hidden
              />
            </label>
          ))}
          <span className="ml-3 text-[14px] font-semibold text-[#1A1A1A]">
            {rating} / 5
          </span>
        </div>
      </fieldset>

      <fieldset className="rounded-2xl border border-[#E8E8E8] bg-white p-5">
        <legend className="px-1 text-[11px] font-bold uppercase tracking-[1.5px] text-[#888]">
          Comment (optional)
        </legend>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, MAX_COMMENT))}
          disabled={pending}
          maxLength={MAX_COMMENT}
          placeholder="Tell other customers what the experience was like"
          rows={5}
          className="mt-2 w-full resize-y rounded-lg border border-[#E8E8E8] bg-[#FAFAF8] p-3 text-[14px] text-[#1A1A1A] placeholder:text-[#BBB] focus:border-gold focus:outline-none disabled:opacity-50"
        />
        <p className={`mt-1 text-right text-[11px] ${counterTone}`}>
          {commentLen} / {MAX_COMMENT}
        </p>
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        className="flex h-12 w-full items-center justify-center rounded-xl bg-[#1A1A1A] text-[14px] font-bold text-white transition-colors hover:bg-[#333] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Submitting…' : 'Submit review'}
      </button>
    </form>
  );
}
