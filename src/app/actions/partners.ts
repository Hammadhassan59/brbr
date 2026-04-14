'use server';

import { checkWriteAccess } from './auth';
import { createServerClient } from '@/lib/supabase';

/**
 * Update a partner's profit-share percentage. Accepts 0-100; clamps in bounds.
 * Only owners or super admins should be able to call this — checkWriteAccess
 * already scopes by salon, and we verify salon_id matches the session below.
 */
export async function updatePartnerProfitShare(partnerId: string, percentage: number) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  const clamped = Math.max(0, Math.min(100, Number(percentage) || 0));

  const { error } = await supabase
    .from('salon_partners')
    .update({ profit_share_percentage: clamped })
    .eq('id', partnerId)
    .eq('salon_id', session.salonId);

  if (error) return { error: error.message };
  return { error: null };
}
