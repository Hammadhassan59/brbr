'use server';

import { checkWriteAccess } from './auth';
import { createServerClient } from '@/lib/supabase';
import { packageUpdateSchema, promoUpdateSchema } from '@/lib/schemas';
import {
  assertBranchMembership,
  assertBranchOwned,
  assertOwnsBy,
  tenantErrorMessage,
} from '@/lib/tenant-guard';

export async function createPackage(data: {
  branchId: string;
  name: string;
  description?: string | null;
  price: number;
  validityDays?: number;
  isActive?: boolean;
  services: unknown;
}) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  try {
    await assertBranchOwned(data.branchId, session.salonId);
    assertBranchMembership(session, data.branchId);
  } catch (e) {
    return { error: tenantErrorMessage(e) };
  }

  const { error } = await supabase
    .from('packages')
    .insert({
      salon_id: session.salonId,
      branch_id: data.branchId,
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

export async function updatePackage(id: string, branchId: string, data: unknown) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  try {
    assertBranchMembership(session, branchId);
  } catch (e) {
    return { error: tenantErrorMessage(e) };
  }

  // Accept both the old camelCase shape (name, validityDays, isActive) and
  // the raw snake_case shape the schema accepts. Normalize to snake_case
  // first, then whitelist.
  const normalized = normalizePackagePayload(data);
  const parsed = packageUpdateSchema.safeParse(normalized);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Invalid input' };
  }

  try {
    await assertOwnsBy('packages', id, session.salonId);
  } catch (e) {
    return { error: tenantErrorMessage(e) };
  }

  const update: Record<string, unknown> = { ...parsed.data };
  if (typeof update.name === 'string') update.name = update.name.trim();

  const { error } = await supabase
    .from('packages')
    .update(update)
    .eq('id', id)
    .eq('salon_id', session.salonId)
    .eq('branch_id', branchId);

  if (error) return { error: error.message };
  return { error: null };
}

export async function createPromo(data: {
  branchId: string;
  code: string;
  discountType: string;
  discountValue: number;
  minBillAmount?: number;
  maxUses?: number | null;
  expiryDate?: string | null;
  isActive?: boolean;
}) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  try {
    await assertBranchOwned(data.branchId, session.salonId);
    assertBranchMembership(session, data.branchId);
  } catch (e) {
    return { error: tenantErrorMessage(e) };
  }

  const { error } = await supabase
    .from('promo_codes')
    .insert({
      salon_id: session.salonId,
      branch_id: data.branchId,
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

export async function updatePromo(id: string, branchId: string, data: unknown) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  try {
    assertBranchMembership(session, branchId);
  } catch (e) {
    return { error: tenantErrorMessage(e) };
  }

  const normalized = normalizePromoPayload(data);
  const parsed = promoUpdateSchema.safeParse(normalized);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Invalid input' };
  }

  try {
    await assertOwnsBy('promo_codes', id, session.salonId);
  } catch (e) {
    return { error: tenantErrorMessage(e) };
  }

  const update: Record<string, unknown> = { ...parsed.data };
  if (typeof update.code === 'string') update.code = update.code.toUpperCase();

  const { error } = await supabase
    .from('promo_codes')
    .update(update)
    .eq('id', id)
    .eq('salon_id', session.salonId)
    .eq('branch_id', branchId);

  if (error) return { error: error.message };
  return { error: null };
}

export async function saveLoyaltyRules(existingId: string | null, data: {
  pointsPer100Pkr: number;
  pkrPerPointRedemption: number;
  birthdayBonusMultiplier: number;
}) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;
  const supabase = createServerClient();

  const row = {
    salon_id: session.salonId,
    points_per_100_pkr: data.pointsPer100Pkr,
    pkr_per_point_redemption: data.pkrPerPointRedemption,
    birthday_bonus_multiplier: data.birthdayBonusMultiplier,
  };

  if (existingId) {
    // Verify the existing rules row is ours before updating.
    try {
      await assertOwnsBy('loyalty_rules', existingId, session.salonId);
    } catch (e) {
      return { error: tenantErrorMessage(e) };
    }
    const { error } = await supabase
      .from('loyalty_rules')
      .update(row)
      .eq('id', existingId)
      .eq('salon_id', session.salonId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from('loyalty_rules')
      .insert(row);
    if (error) return { error: error.message };
  }

  return { error: null };
}

// ───────────────────────────────────────
// Payload normalizers — callers pass camelCase; schemas use snake_case.
// ───────────────────────────────────────
function normalizePackagePayload(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {};
  const d = data as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if ('name' in d) out.name = d.name;
  if ('description' in d) out.description = d.description;
  if ('price' in d) out.price = d.price;
  if ('validity_days' in d) out.validity_days = d.validity_days;
  else if ('validityDays' in d) out.validity_days = d.validityDays;
  if ('is_active' in d) out.is_active = d.is_active;
  else if ('isActive' in d) out.is_active = d.isActive;
  if ('services' in d) out.services = d.services;
  return out;
}

function normalizePromoPayload(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {};
  const d = data as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if ('code' in d) out.code = d.code;
  if ('discount_type' in d) out.discount_type = d.discount_type;
  else if ('discountType' in d) out.discount_type = d.discountType;
  if ('discount_value' in d) out.discount_value = d.discount_value;
  else if ('discountValue' in d) out.discount_value = d.discountValue;
  if ('min_bill_amount' in d) out.min_bill_amount = d.min_bill_amount;
  else if ('minBillAmount' in d) out.min_bill_amount = d.minBillAmount;
  if ('max_uses' in d) out.max_uses = d.max_uses;
  else if ('maxUses' in d) out.max_uses = d.maxUses;
  if ('expiry_date' in d) out.expiry_date = d.expiry_date;
  else if ('expiryDate' in d) out.expiry_date = d.expiryDate;
  if ('is_active' in d) out.is_active = d.is_active;
  else if ('isActive' in d) out.is_active = d.isActive;
  return out;
}
