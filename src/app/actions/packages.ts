'use server';

import { verifySession } from './auth';
import { createServerClient } from '@/lib/supabase';

export async function createPackage(data: {
  name: string;
  description?: string | null;
  price: number;
  validityDays?: number;
  isActive?: boolean;
  services: unknown;
}) {
  const session = await verifySession();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('packages')
    .insert({
      salon_id: session.salonId,
      name: data.name.trim(),
      description: data.description || null,
      price: data.price,
      validity_days: data.validityDays || 30,
      is_active: data.isActive ?? true,
      services: data.services,
    });

  if (error) return { error: error.message };
  return { error: null };
}

export async function updatePackage(id: string, data: {
  name: string;
  description?: string | null;
  price: number;
  validityDays?: number;
  isActive?: boolean;
  services: unknown;
}) {
  const session = await verifySession();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('packages')
    .update({
      salon_id: session.salonId,
      name: data.name.trim(),
      description: data.description || null,
      price: data.price,
      validity_days: data.validityDays || 30,
      is_active: data.isActive ?? true,
      services: data.services,
    })
    .eq('id', id);

  if (error) return { error: error.message };
  return { error: null };
}

export async function createPromo(data: {
  code: string;
  discountType: string;
  discountValue: number;
  minBillAmount?: number;
  maxUses?: number | null;
  expiryDate?: string | null;
  isActive?: boolean;
}) {
  const session = await verifySession();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('promo_codes')
    .insert({
      salon_id: session.salonId,
      code: data.code.toUpperCase(),
      discount_type: data.discountType,
      discount_value: data.discountValue,
      min_bill_amount: data.minBillAmount || 0,
      max_uses: data.maxUses || null,
      expiry_date: data.expiryDate || null,
      is_active: data.isActive ?? true,
      used_count: 0,
    });

  if (error) return { error: error.message };
  return { error: null };
}

export async function updatePromo(id: string, data: {
  code: string;
  discountType: string;
  discountValue: number;
  minBillAmount?: number;
  maxUses?: number | null;
  expiryDate?: string | null;
  isActive?: boolean;
}) {
  const session = await verifySession();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('promo_codes')
    .update({
      salon_id: session.salonId,
      code: data.code.toUpperCase(),
      discount_type: data.discountType,
      discount_value: data.discountValue,
      min_bill_amount: data.minBillAmount || 0,
      max_uses: data.maxUses || null,
      expiry_date: data.expiryDate || null,
      is_active: data.isActive ?? true,
    })
    .eq('id', id);

  if (error) return { error: error.message };
  return { error: null };
}

export async function saveLoyaltyRules(existingId: string | null, data: {
  pointsPer100Pkr: number;
  pkrPerPointRedemption: number;
  birthdayBonusMultiplier: number;
}) {
  const session = await verifySession();
  const supabase = createServerClient();

  const row = {
    salon_id: session.salonId,
    points_per_100_pkr: data.pointsPer100Pkr,
    pkr_per_point_redemption: data.pkrPerPointRedemption,
    birthday_bonus_multiplier: data.birthdayBonusMultiplier,
  };

  if (existingId) {
    const { error } = await supabase
      .from('loyalty_rules')
      .update(row)
      .eq('id', existingId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from('loyalty_rules')
      .insert(row);
    if (error) return { error: error.message };
  }

  return { error: null };
}
