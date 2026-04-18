/**
 * `/account/favorites` — consumer's saved salons.
 *
 * Server component. Reuses the shared `<SalonCard />` so the grid looks
 * identical to the directory. Each card is overlaid with a heart toggle
 * (`<FavoriteHeart />`) in the top-right; tapping removes from favorites
 * and `router.refresh()`es this page so the card disappears.
 *
 * `listFavorites` already applies the marketplace visibility filters so
 * blocked/unlisted favorites silently drop from the list without being
 * removed from the DB — if the salon re-lists, the favorite returns.
 */
import Link from 'next/link';
import type { Metadata } from 'next';
import { HeartCrack } from 'lucide-react';

import SalonCard from '../../components/salon-card';
import { FavoriteHeart } from '../../components/favorite-heart';
import { listFavorites } from '@/app/actions/consumer-favorites';

export const metadata: Metadata = {
  title: 'Favorites',
  robots: { index: false, follow: false },
};

export default async function FavoritesPage() {
  const res = await listFavorites();
  const branches = res.ok ? res.data : [];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-heading text-2xl font-bold text-[#1A1A1A]">
          Favorites
        </h1>
        <p className="mt-1 text-[13px] text-[#888]">
          Salons you&rsquo;ve saved. Tap the heart to remove.
        </p>
      </header>

      {branches.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#E8E8E8] bg-white p-8 text-center">
          <HeartCrack className="mx-auto h-6 w-6 text-[#CCC]" aria-hidden />
          <p className="mt-3 text-[14px] font-semibold text-[#1A1A1A]">
            No favorites yet
          </p>
          <p className="mt-1 text-[12px] text-[#888]">
            Tap the heart on any salon to save it for quick access later.
          </p>
          <Link
            href="/barbers"
            className="mt-4 inline-flex items-center rounded-lg bg-[#1A1A1A] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#1A1A1A]/90"
          >
            Browse salons
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {branches.map((branch) => (
            <div key={branch.id} className="relative">
              <SalonCard branch={branch} />
              <div className="absolute right-3 top-3 z-10">
                <FavoriteHeart
                  branchId={branch.id}
                  initialFavorited={true}
                  isAuthenticated={true}
                  size="sm"
                  variant="overlay"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
