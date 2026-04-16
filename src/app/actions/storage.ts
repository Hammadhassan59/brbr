'use server';

import { createServerClient } from '@/lib/supabase';
import { verifySession } from './auth';
import { getSignedStorageUrl } from '@/lib/storage-url';

/**
 * Mint a short-lived signed URL for a payment-request screenshot.
 *
 * Authorization: only super admins, the salon's owner, or any session scoped
 * to the same salon can view a given payment's screenshot. Everyone else
 * gets null (never the raw path, never a public URL).
 *
 * The row's `screenshot_path` column is the source of truth for the
 * object path. If it's null we fall back to `screenshot_url` so rows created
 * before migration 030/029 (pre-private-bucket era) keep rendering.
 * TODO: drop the fallback after backfilling screenshot_path from screenshot_url.
 */
export async function getPaymentScreenshotUrl(
  paymentRequestId: string,
): Promise<string | null> {
  let session;
  try {
    session = await verifySession();
  } catch {
    return null;
  }
  if (!paymentRequestId) return null;

  const supabase = createServerClient();
  const { data: row } = await supabase
    .from('payment_requests')
    .select('salon_id, screenshot_path, screenshot_url')
    .eq('id', paymentRequestId)
    .maybeSingle();

  if (!row) return null;

  // Role gating: super admin sees everything. Owners/staff see their own
  // salon's payments. Anyone else (sales agent, another salon, no salon) is
  // denied — the screenshot may contain bank/card info.
  const isSuperAdmin = session.role === 'super_admin';
  const isOwnSalon = !!session.salonId
    && session.salonId !== 'super-admin'
    && session.salonId === row.salon_id;
  if (!isSuperAdmin && !isOwnSalon) return null;

  const path = (row as { screenshot_path?: string | null }).screenshot_path;
  if (path) {
    return getSignedStorageUrl('payment-screenshots', path);
  }

  // Legacy fallback: pre-migration-030 rows stored a full public URL. Return
  // as-is so old screenshots keep rendering until they're backfilled.
  // TODO: drop after backfill.
  const legacyUrl = (row as { screenshot_url?: string | null }).screenshot_url;
  return legacyUrl || null;
}

/**
 * Mint a short-lived signed URL for a lead's salon-storefront photo.
 *
 * Authorization: super admins see any lead. Sales agents only see leads
 * assigned to them. Anyone else is denied.
 *
 * Same legacy-fallback story as payment screenshots.
 */
export async function getLeadPhotoUrl(leadId: string): Promise<string | null> {
  let session;
  try {
    session = await verifySession();
  } catch {
    return null;
  }
  if (!leadId) return null;

  const supabase = createServerClient();
  const { data: row } = await supabase
    .from('leads')
    .select('assigned_agent_id, photo_path, photo_url')
    .eq('id', leadId)
    .maybeSingle();

  if (!row) return null;

  const isSuperAdmin = session.role === 'super_admin';
  const isAssignedAgent =
    session.role === 'sales_agent' &&
    !!session.agentId &&
    session.agentId === row.assigned_agent_id;
  if (!isSuperAdmin && !isAssignedAgent) return null;

  const path = (row as { photo_path?: string | null }).photo_path;
  if (path) {
    return getSignedStorageUrl('lead-photos', path);
  }

  // Legacy fallback.
  // TODO: drop after backfill.
  const legacyUrl = (row as { photo_url?: string | null }).photo_url;
  return legacyUrl || null;
}
