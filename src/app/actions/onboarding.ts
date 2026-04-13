'use server';

import { createServerClient } from '@/lib/supabase';
import { verifySession } from '@/app/actions/auth';
import type { OnboardingStatus } from '@/types/database';

export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  const session = await verifySession();
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc('get_onboarding_status', {
    p_salon_id: session.salonId,
  });

  if (error) throw new Error('Failed to fetch onboarding status');
  return data as OnboardingStatus;
}

export async function dismissOnboarding(): Promise<{ success: true }> {
  const session = await verifySession();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('salons')
    .update({ onboarding_dismissed: true })
    .eq('id', session.salonId);

  if (error) throw new Error('Failed to dismiss onboarding');
  return { success: true };
}

export async function markFirstLoginSeen(): Promise<{ success: true }> {
  const session = await verifySession();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('staff')
    .update({ first_login_seen: true })
    .eq('id', session.staffId);

  if (error) throw new Error('Failed to mark first login seen');
  return { success: true };
}
