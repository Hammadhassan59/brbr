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

export interface PublicPlan {
  price: number;
  branches: number;
  staff: number;
  // Marketing fields — homepage uses all of these. Paywall only reads price/branches/staff.
  displayName: string;
  originalPrice: number;
  pitch: string;
  limits: string;
  popular: boolean;
  features: Array<{ text: string; ok: boolean }>;
}

/**
 * Defaults for the marketing copy on each plan. These match what the homepage
 * previously had hardcoded, so behavior is unchanged when the admin hasn't
 * customized anything yet.
 */
const PLAN_MARKETING_DEFAULTS: Record<'basic' | 'growth' | 'pro', Omit<PublicPlan, 'price' | 'branches' | 'staff'>> = {
  basic: {
    displayName: 'Starter',
    originalPrice: 5000,
    pitch: 'For new and small salons',
    limits: '1 branch · up to 10 staff',
    popular: false,
    features: [
      { text: 'POS + billing', ok: true },
      { text: 'Bookings + walk-in queue', ok: true },
      { text: 'Cash, mobile, card payments', ok: true },
      { text: 'Basic daily report', ok: true },
      { text: 'Commission tracking', ok: true },
      { text: 'Inventory', ok: false },
      { text: 'Payroll', ok: false },
    ],
  },
  growth: {
    displayName: 'Business',
    originalPrice: 12000,
    pitch: 'For growing salons and small chains',
    limits: '3 branches · 10 staff each',
    popular: true,
    features: [
      { text: 'POS + billing', ok: true },
      { text: 'Bookings + walk-in queue', ok: true },
      { text: 'Cash, mobile, card payments', ok: true },
      { text: 'Full daily reports', ok: true },
      { text: 'Commission tracking', ok: true },
      { text: 'Inventory', ok: true },
      { text: 'Payroll + attendance', ok: true },
    ],
  },
  pro: {
    displayName: 'Enterprise',
    originalPrice: 20000,
    pitch: 'For salon chains',
    limits: '10 branches · 100 staff',
    popular: false,
    features: [
      { text: 'Everything in Business', ok: true },
      { text: 'Cross-branch reports', ok: true },
      { text: 'Partner/co-owner logins', ok: true },
      { text: 'Priority support', ok: true },
    ],
  },
};

const PLAN_PRICE_DEFAULTS: Record<'basic' | 'growth' | 'pro', { price: number; branches: number; staff: number }> = {
  basic: { price: 2500, branches: 1, staff: 3 },
  growth: { price: 5000, branches: 1, staff: 0 },
  pro: { price: 9000, branches: 3, staff: 0 },
};

function coerceFeatures(raw: unknown): Array<{ text: string; ok: boolean }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((f) => {
      if (f && typeof f === 'object') {
        const obj = f as Record<string, unknown>;
        return { text: String(obj.text ?? ''), ok: obj.ok !== false };
      }
      if (typeof f === 'string') {
        const trimmed = f.trim();
        if (trimmed.startsWith('~')) return { text: trimmed.slice(1).trim(), ok: false };
        return { text: trimmed, ok: true };
      }
      return { text: '', ok: true };
    })
    .filter((f) => f.text.length > 0);
}

/**
 * Public-read of the plans + payment + support config.
 * No auth required — anyone hitting the paywall or homepage needs to see prices,
 * plan marketing copy, and bank details. Never expose Resend API keys or other
 * sensitive admin keys here.
 */
export async function getPublicPlatformConfig(): Promise<{
  plans: Record<string, PublicPlan>;
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

  const rawPlans = (map.plans ?? {}) as Record<string, Partial<PublicPlan> & Record<string, unknown>>;
  const plans: Record<string, PublicPlan> = {};
  for (const key of ['basic', 'growth', 'pro'] as const) {
    const p = (rawPlans[key] ?? {}) as Partial<PublicPlan> & Record<string, unknown>;
    const priceDefaults = PLAN_PRICE_DEFAULTS[key];
    const mkt = PLAN_MARKETING_DEFAULTS[key];
    const features = p.features !== undefined ? coerceFeatures(p.features) : mkt.features;
    plans[key] = {
      price: Number(p.price) || priceDefaults.price,
      branches: Number(p.branches) || priceDefaults.branches,
      staff: Number(p.staff) || priceDefaults.staff,
      displayName: typeof p.displayName === 'string' && p.displayName ? p.displayName : mkt.displayName,
      originalPrice: Number(p.originalPrice) || mkt.originalPrice,
      pitch: typeof p.pitch === 'string' && p.pitch ? p.pitch : mkt.pitch,
      limits: typeof p.limits === 'string' && p.limits ? p.limits : mkt.limits,
      popular: typeof p.popular === 'boolean' ? p.popular : mkt.popular,
      features: features.length > 0 ? features : mkt.features,
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
