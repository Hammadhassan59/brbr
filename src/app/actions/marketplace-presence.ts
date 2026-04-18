'use server';

/**
 * Marketplace presence heartbeat.
 *
 * The consumer directory (`/barbers`, `/barbers/[city]`, `/`) only shows
 * salons with `last_active_at > now() - 3 minutes`. While an owner /
 * manager is logged into the dashboard, a client effect pings this server
 * action every 60 seconds to keep the salon visible. Two missed pings of
 * slack before the salon disappears.
 *
 * Log-out (and salon-side block actions) clear `last_active_at` explicitly
 * via `clearPresence` so the salon vanishes from the directory immediately
 * rather than waiting out the 3-minute window.
 *
 * No rate limit — the heartbeat is a no-op update (same salon_id every
 * ping). The expensive path (directory query) is cached separately.
 */

import { verifySession } from './auth';
import { createServerClient } from '@/lib/supabase';
import { updateTag } from 'next/cache';
import { MARKETPLACE_BRANCHES_TAG } from '@/lib/marketplace/queries';

export async function heartbeatMarketplacePresence(): Promise<{
  ok: true;
} | { ok: false; error: string }> {
  const session = await verifySession();
  if (!session.salonId || session.salonId === 'super-admin') {
    return { ok: false, error: 'No salon context' };
  }

  const supabase = createServerClient();
  const nowIso = new Date().toISOString();

  // Read current value so we only fire revalidation on transitions from
  // offline → online (avoids spamming updateTag every 60 seconds).
  const { data: prev } = await supabase
    .from('salons')
    .select('last_active_at')
    .eq('id', session.salonId)
    .maybeSingle();
  const wasOffline =
    !prev?.last_active_at ||
    Date.now() - new Date(prev.last_active_at).getTime() > 3 * 60_000;

  const { error } = await supabase
    .from('salons')
    .update({ last_active_at: nowIso })
    .eq('id', session.salonId);

  if (error) return { ok: false, error: error.message };

  if (wasOffline) {
    // Salon just came online — bust the directory cache so they appear.
    updateTag(MARKETPLACE_BRANCHES_TAG);
  }

  return { ok: true };
}

/**
 * Explicitly clear presence — called from log-out and from admin-block
 * actions so the salon disappears from the directory immediately instead
 * of taking up to 3 minutes to time out.
 */
export async function clearMarketplacePresence(): Promise<{
  ok: true;
} | { ok: false; error: string }> {
  const session = await verifySession();
  if (!session.salonId || session.salonId === 'super-admin') {
    return { ok: false, error: 'No salon context' };
  }

  const supabase = createServerClient();
  const { error } = await supabase
    .from('salons')
    .update({ last_active_at: null })
    .eq('id', session.salonId);

  if (error) return { ok: false, error: error.message };

  updateTag(MARKETPLACE_BRANCHES_TAG);
  return { ok: true };
}
