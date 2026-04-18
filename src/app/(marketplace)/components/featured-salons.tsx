/**
 * Featured salons strip — server component.
 *
 * Renders up to 6 branches ordered by `rating_avg desc` (nulls last) for
 * the consumer home. Filtering and caching are fully delegated to
 * `getFeaturedBranches()` in `src/lib/marketplace/queries.ts`, which
 * already enforces:
 *
 *   - `listed_on_marketplace = true`
 *   - `marketplace_admin_blocked_at IS NULL` (branch + salon)
 *   - `marketplace_payable_blocked_at IS NULL` (salon)
 *   - `gender_type` gate vs. `platform_settings.marketplace_women_enabled`
 *   - `offers_home_service = true` when mode is `at_home`
 *   - `ORDER BY rating_avg DESC NULLS LAST, rating_count DESC LIMIT 6`
 *
 * Keeping the filter logic in the query layer means any future change to
 * the visibility rules propagates to every surface (home, `/barbers`,
 * `/barbers/[city]`) from one place.
 */

import SalonCard from './salon-card';
import {
  getFeaturedBranches,
  type MarketplaceMode,
} from '@/lib/marketplace/queries';
import { getConsumerSession } from '@/lib/consumer-session';
import { getFavoriteBranchIds } from '@/app/actions/consumer-favorites';

interface FeaturedSalonsProps {
  mode: MarketplaceMode;
}

export default async function FeaturedSalons({ mode }: FeaturedSalonsProps) {
  const [branches, session, favoriteIds] = await Promise.all([
    getFeaturedBranches(mode),
    getConsumerSession(),
    getFavoriteBranchIds(),
  ]);
  const isAuthenticated = session !== null;

  if (branches.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#E8E8E8] bg-white/50 p-6 text-center">
        <p className="text-[13px] text-[#888]">
          {mode === 'at_home'
            ? 'No home-service salons featured yet. Try At salon, or pick a city below.'
            : 'Featured salons coming soon. Pick a city below to browse.'}
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-[11px] font-bold text-gold uppercase tracking-[1.5px] mb-3">
        Featured salons
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {branches.map((branch) => (
          <SalonCard
            key={branch.id}
            branch={branch}
            isAuthenticated={isAuthenticated}
            initialFavorited={favoriteIds.has(branch.id)}
          />
        ))}
      </div>
    </div>
  );
}
