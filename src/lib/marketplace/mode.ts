/**
 * Shared constants + types for the consumer marketplace home-first mode
 * toggle (`At salon` vs `At home`). Pulled out of
 * `src/app/actions/marketplace-mode.ts` because Next 16 server-action files
 * ('use server') may only export async functions — mixing in types/constants
 * strips all exports at the client/ssr boundary.
 *
 * Cookie shape (decision 13 from 2026-04-18-marketplace-phase-0-1.md):
 *   - name:      `icut-mode`
 *   - value:     `'at_salon' | 'at_home'`
 *   - httpOnly:  false (JS read is safe — no auth data in it)
 *   - sameSite:  'lax'
 *   - path:      '/'
 *   - maxAge:    30 days
 */

export type MarketplaceMode = 'at_salon' | 'at_home';

export const MARKETPLACE_MODE_COOKIE = 'icut-mode';
export const MARKETPLACE_MODE_DEFAULT: MarketplaceMode = 'at_salon';
export const MARKETPLACE_MODE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function isMarketplaceMode(v: unknown): v is MarketplaceMode {
  return v === 'at_salon' || v === 'at_home';
}
