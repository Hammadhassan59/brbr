'use server';

import { createServerClient } from '@/lib/supabase';
import { checkWriteAccess } from '@/app/actions/auth';
import type { OnboardingStatus } from '@/types/database';

export async function getOnboardingStatus(): Promise<{ data: OnboardingStatus | null; error: string | null }> {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { data: null, error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc('get_onboarding_status', {
    p_salon_id: session.salonId,
  });

  if (error) return { data: null, error: 'Failed to fetch onboarding status' };
  return { data: data as OnboardingStatus, error: null };
}

export async function dismissOnboarding(): Promise<{ error: string | null }> {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  const { error } = await supabase
    .from('salons')
    .update({ onboarding_dismissed: true })
    .eq('id', session.salonId);

  if (error) return { error: 'Failed to dismiss onboarding' };
  return { error: null };
}

export async function markFirstLoginSeen(): Promise<{ error: string | null }> {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  const { error } = await supabase
    .from('staff')
    .update({ first_login_seen: true })
    .eq('id', session.staffId);

  if (error) return { error: 'Failed to mark first login seen' };
  return { error: null };
}
