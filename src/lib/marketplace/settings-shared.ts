/**
 * Shared types + pure helpers for the salon-side marketplace settings page.
 *
 * These live outside `src/app/actions/marketplace-settings.ts` because any
 * file annotated with the `'use server'` directive may only export async
 * functions — Next.js treats every export as an RPC callable from the
 * client. Types and sync helpers would refuse to load there.
 *
 * Callers:
 *   - `src/app/actions/marketplace-settings.ts` — builds the
 *     MarketplaceSettingsData, calls `allRequirementsMet` as a server-side
 *     authoritative check.
 *   - `src/app/dashboard/settings/marketplace/page.tsx` — mirrors the
 *     requirements live from the edit buffer to disable the toggle until
 *     every box is checked.
 */

export interface BranchPhoto {
  path: string;
  url: string;
  uploaded_at: string;
}

/**
 * Salon gender classification, mirrored from the `salon_gender_type` Postgres
 * enum defined in migration 041 (`'men' | 'women' | 'mixed'`). Required on
 * every branch listed on the marketplace — superadmin controls whether
 * women/mixed salons are surfaced on the consumer side via the
 * `marketplace_women_enabled` flag in `platform_settings`. The column itself
 * must be truthful regardless of the platform flag, so owners pick the
 * real classification at opt-in time.
 */
export type SalonGenderType = 'men' | 'women' | 'mixed';

export interface ListingRequirements {
  hasThreePhotos: boolean;
  hasAbout: boolean;
  hasPin: boolean;
  hasCity: boolean;
  hasActiveService: boolean;
  hasGenderType: boolean;
}

export interface MarketplaceBranchState {
  id: string;
  name: string;
  listed_on_marketplace: boolean;
  offers_home_service: boolean;
  home_service_radius_km: number | null;
  about: string | null;
  city_id: string | null;
  lat: number | null;
  lng: number | null;
  photos: BranchPhoto[];
  gender_type: SalonGenderType | null;
}

export interface MarketplaceCity {
  id: string;
  slug: string;
  name: string;
}

export interface MarketplaceSettingsData {
  branch: MarketplaceBranchState;
  cities: MarketplaceCity[];
  requirements: ListingRequirements;
  /**
   * True when the DB schema for marketplace opt-in is live (migration 041
   * applied). If false the page should show a "coming soon" banner and
   * disable the save buttons rather than let the user hit a cryptic
   * "column does not exist" error.
   */
  schemaReady: boolean;
}

export function allRequirementsMet(r: ListingRequirements): boolean {
  return (
    r.hasThreePhotos &&
    r.hasAbout &&
    r.hasPin &&
    r.hasCity &&
    r.hasActiveService &&
    r.hasGenderType
  );
}

/** Minimum character count for the about text before a branch can be listed. */
export const ABOUT_MIN_CHARS = 100;

/** Maximum stored about length — also enforced by the zod schema on the action. */
export const ABOUT_MAX_CHARS = 4000;

/** Photo size + mime limits, shared between client + server so errors match. */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const PHOTO_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type PhotoMime = (typeof PHOTO_MIMES)[number];
