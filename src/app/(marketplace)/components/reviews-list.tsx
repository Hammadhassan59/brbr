/**
 * Reviews list — up to 10 consumer→salon reviews + "See all" link.
 *
 * Server component. The data is fetched by the page (`getBranchReviews`) and
 * passed in; this component is presentational only.
 *
 * Privacy model (decision 30): only `consumer_first_name` is shown. Full
 * names and consumer ratings are not exposed publicly; the query layer
 * enforces this by projecting only the first-name field.
 *
 * "See all" route: `/barber/[slug]/reviews` — stub / not yet implemented.
 * The link is present for design completeness; a TODO in the page file
 * tracks the dedicated reviews route for a later wave.
 */
import Link from 'next/link';
import { Star } from 'lucide-react';

import type { ReviewWithConsumer } from '@/lib/marketplace/queries';

interface ReviewsListProps {
  reviews: ReviewWithConsumer[];
  totalCount: number;
  /** Salon slug for the "See all" link. */
  slug: string;
}

/** Inline star rating (no fancy SVG — five Lucide icons, filled or stroke). */
function StarRow({ rating }: { rating: number }) {
  const clamped = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <div className="flex items-center gap-0.5" aria-label={`${clamped} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          aria-hidden
          className={`h-3.5 w-3.5 ${
            i < clamped
              ? 'fill-amber-500 stroke-amber-500'
              : 'fill-none stroke-[#D4D4D4]'
          }`}
        />
      ))}
    </div>
  );
}

/** Format ISO date as e.g. "Apr 18, 2026". Defensive: returns "" on invalid. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function ReviewsList({
  reviews,
  totalCount,
  slug,
}: ReviewsListProps) {
  if (reviews.length === 0) {
    return (
      <section className="mb-6" aria-labelledby="reviews-heading">
        <h2
          id="reviews-heading"
          className="mb-3 text-[11px] font-bold uppercase tracking-[1.5px] text-gold"
        >
          Reviews
        </h2>
        <div className="rounded-2xl border border-dashed border-[#E8E8E8] bg-white/50 p-6 text-center">
          <p className="text-[13px] text-[#888]">
            No reviews yet. Be the first to book and leave a review.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-6" aria-labelledby="reviews-heading">
      <h2
        id="reviews-heading"
        className="mb-3 flex items-center justify-between text-[11px] font-bold uppercase tracking-[1.5px] text-gold"
      >
        <span>Reviews ({totalCount})</span>
      </h2>
      <ul className="space-y-3">
        {reviews.map((review) => (
          <li
            key={review.id}
            className="rounded-2xl border border-[#E8E8E8] bg-white p-4"
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold text-[#1A1A1A]">
                  {review.consumer_first_name}
                </p>
                <StarRow rating={review.rating} />
              </div>
              <p className="text-[11px] text-[#888]">
                {formatDate(review.created_at)}
              </p>
            </div>
            {review.comment && (
              <p className="whitespace-pre-line text-[13px] leading-relaxed text-[#333]">
                {review.comment}
              </p>
            )}
          </li>
        ))}
      </ul>

      {totalCount > reviews.length && (
        <div className="mt-3 text-right">
          <Link
            href={`/barber/${slug}/reviews`}
            className="inline-flex h-9 items-center rounded-lg px-3 text-[13px] font-semibold text-[#1A1A1A] hover:underline"
          >
            See all {totalCount} reviews →
          </Link>
        </div>
      )}
    </section>
  );
}
