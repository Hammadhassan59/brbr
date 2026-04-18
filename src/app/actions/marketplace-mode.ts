'use server';

/**
 * Server action for writing the `icut-mode` cookie. Shared type + constants
 * live in `src/lib/marketplace/mode.ts` because Next 16 's use server' files
 * may only export async functions.
 */

import { cookies } from 'next/headers';
import {
  MARKETPLACE_MODE_COOKIE,
  MARKETPLACE_MODE_COOKIE_MAX_AGE_SECONDS,
  isMarketplaceMode,
  type MarketplaceMode,
} from '@/lib/marketplace/mode';

export async function setMarketplaceMode(
  mode: MarketplaceMode,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isMarketplaceMode(mode)) {
    return { ok: false, error: 'Invalid mode' };
  }

  const cookieStore = await cookies();
  cookieStore.set({
    name: MARKETPLACE_MODE_COOKIE,
    value: mode,
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: MARKETPLACE_MODE_COOKIE_MAX_AGE_SECONDS,
  });

  return { ok: true };
}
