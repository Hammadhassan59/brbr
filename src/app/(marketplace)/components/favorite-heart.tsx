'use client';

/**
 * `<FavoriteHeart />` — heart-icon toggle for saving a salon to favorites.
 *
 * Props:
 *   - `branchId` (required): target branch UUID.
 *   - `initialFavorited` (optional, default `false`): pre-filled state —
 *      server components pass `isFavorite(branchId)` so the initial paint
 *      matches reality. Nothing happens if missing; the first tap flips
 *      the state and subsequent taps stay consistent.
 *   - `isAuthenticated` (optional, default `false`): when false, the
 *      component renders as a link to `/sign-in?next=...` and never
 *      attempts the server action. Keeps anonymous browsing fast (zero
 *      network roundtrip) and routes the user to register when they tap.
 *   - `size` (optional, default `'md'`): `'sm'` for salon-card overlays,
 *     `'md'` for the profile-page pill.
 *   - `variant` (optional, default `'overlay'`): `'overlay'` renders a
 *     white circle with drop-shadow (for image corners); `'inline'` is a
 *     plain square chip (for header placements like the salon profile).
 *
 * Toggle state optimism: we flip local state immediately, then call
 * `toggleFavorite`. On server error we revert and show a toast — reverting
 * beats leaving the heart in a lying state. `startTransition` is used so
 * React doesn't block the toggle while the action is in-flight.
 */

import { useState, useTransition, type MouseEvent } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Heart } from 'lucide-react';
import toast from 'react-hot-toast';

import { toggleFavorite } from '@/app/actions/consumer-favorites';

interface Props {
  branchId: string;
  initialFavorited?: boolean;
  isAuthenticated?: boolean;
  size?: 'sm' | 'md';
  variant?: 'overlay' | 'inline';
}

export function FavoriteHeart({
  branchId,
  initialFavorited = false,
  isAuthenticated = false,
  size = 'md',
  variant = 'overlay',
}: Props) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';

  const [favorited, setFavorited] = useState<boolean>(initialFavorited);
  const [pending, startTransition] = useTransition();

  const sizeClasses =
    size === 'sm'
      ? variant === 'overlay'
        ? 'h-8 w-8'
        : 'h-8 w-8 rounded-lg'
      : variant === 'overlay'
        ? 'h-10 w-10'
        : 'h-10 w-10 rounded-lg';

  const iconSizeClass = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';

  const baseClasses =
    variant === 'overlay'
      ? 'rounded-full bg-white/95 shadow-md ring-1 ring-black/5 backdrop-blur-sm'
      : 'rounded-lg border border-[#E8E8E8] bg-white';

  const commonClasses = `inline-flex items-center justify-center transition-transform hover:scale-[1.06] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 ${sizeClasses} ${baseClasses}`;

  // Logged-out path: render a plain link to sign-in preserving the current
  // location so the consumer lands back exactly where they tapped.
  if (!isAuthenticated) {
    const next = encodeURIComponent(pathname);
    return (
      <a
        href={`/sign-in?next=${next}`}
        aria-label="Sign in to save this salon"
        title="Sign in to save"
        className={commonClasses}
        onClick={(e: MouseEvent<HTMLAnchorElement>) => {
          // Prevent the card's wrapping <Link> from swallowing the click.
          e.stopPropagation();
        }}
      >
        <Heart
          className={`${iconSizeClass} stroke-[#1A1A1A]`}
          aria-hidden
        />
      </a>
    );
  }

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    // Cards wrap the whole tile in a <Link>; clicking the heart must not
    // navigate away. This applies even inside a card, which is why the
    // handler calls stopPropagation + preventDefault unconditionally.
    e.stopPropagation();
    e.preventDefault();
    if (pending) return;

    const nextState = !favorited;
    setFavorited(nextState);

    startTransition(async () => {
      const res = await toggleFavorite({ branchId });
      if (!res.ok) {
        // Revert optimistic state.
        setFavorited(!nextState);
        toast.error(res.error);
        return;
      }
      // Server may disagree with local — trust the server.
      setFavorited(res.data.favorited);
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-pressed={favorited}
      aria-label={favorited ? 'Remove from favorites' : 'Save to favorites'}
      title={favorited ? 'Remove from favorites' : 'Save to favorites'}
      className={commonClasses}
    >
      <Heart
        className={`${iconSizeClass} transition-colors ${
          favorited
            ? 'fill-[#E11D48] stroke-[#E11D48]'
            : 'stroke-[#1A1A1A]'
        }`}
        aria-hidden
      />
    </button>
  );
}
