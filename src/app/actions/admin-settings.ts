'use server';

import { createServerClient } from '@/lib/supabase';
import { verifySession } from './auth';

async function requireSuperAdmin() {
  const session = await verifySession();
  if (!session || session.role !== 'super_admin') {
    throw new Error('Unauthorized');
  }
  return session;
}

export async function getPlatformSettings(): Promise<Record<string, Record<string, unknown>>> {
  await requireSuperAdmin();
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('platform_settings')
    .select('key, value');

  if (error) throw error;

  const map: Record<string, Record<string, unknown>> = {};
  for (const row of data || []) {
    map[row.key] = row.value as Record<string, unknown>;
  }
  return map;
}

/**
 * Public-read of the plans + payment + support config.
 * No auth required — anyone hitting the paywall needs to see prices and bank
 * details. Never expose Resend API keys or other sensitive admin keys here.
 */
export async function getPublicPlatformConfig(): Promise<{
  plans: Record<string, { price: number; branches: number; staff: number }>;
  payment: { jazzcashAccount: string; bankAccount: string };
  supportWhatsApp: string;
}> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('platform_settings')
    .select('key, value')
    .in('key', ['plans', 'payment', 'general']);

  const map: Record<string, Record<string, unknown>> = {};
  for (const row of data || []) {
    map[row.key] = row.value as Record<string, unknown>;
  }

  const rawPlans = (map.plans ?? {}) as Record<string, { price?: number; branches?: number; staff?: number }>;
  const plans: Record<string, { price: number; branches: number; staff: number }> = {};
  for (const key of ['basic', 'growth', 'pro']) {
    const p = rawPlans[key] || {};
    plans[key] = {
      price: Number(p.price) || 0,
      branches: Number(p.branches) || 1,
      staff: Number(p.staff) || 0,
    };
  }

  const pay = (map.payment ?? {}) as Record<string, unknown>;
  const gen = (map.general ?? {}) as Record<string, unknown>;

  return {
    plans,
    payment: {
      jazzcashAccount: String(pay.jazzcashAccount ?? ''),
      bankAccount: String(pay.bankAccount ?? ''),
    },
    supportWhatsApp: String(gen.supportWhatsApp ?? ''),
  };
}

export async function savePlatformSetting(
  key: string,
  value: Record<string, unknown>,
): Promise<{ success: true }> {
  await requireSuperAdmin();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('platform_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });

  if (error) throw error;
  return { success: true };
}
