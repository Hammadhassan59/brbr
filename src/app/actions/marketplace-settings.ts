'use server';

import { z } from 'zod';
import { updateTag } from 'next/cache';
import { checkWriteAccess, verifySession } from './auth';
import { createServerClient } from '@/lib/supabase';
import {
  MARKETPLACE_BRANCHES_TAG,
  branchTag,
} from '@/lib/marketplace/queries';
import {
  assertBranchOwned,
  requirePermission,
  tenantErrorMessage,
} from '@/lib/tenant-guard';
import {
  allRequirementsMet,
  type BranchPhoto,
  type ListingRequirements,
  type MarketplaceSettingsData,
  type SalonGenderType,
  PHOTO_MAX_BYTES,
  PHOTO_MIMES,
  ABOUT_MIN_CHARS,
  ABOUT_MAX_CHARS,
} from '@/lib/marketplace/settings-shared';
import { GenderTypeSchema } from '@/lib/schemas/common';

// ═══════════════════════════════════════
// Salon-side marketplace settings
//
// All writes are gated through `checkWriteAccess()` + `requirePermission(
// 'manage_salon')` + `assertBranchOwned(branchId, session.salonId)`. This
// mirrors the tenant-guard pattern used by settings.ts — every update also
// tacks on `.eq('salon_id', session.salonId)` as belt-and-suspenders so a
// compromised service-role request can't hop tenants.
//
// Schema note: the columns this file touches
// (branches.listed_on_marketplace, .lat/.lng, .photos, .about, .city_id,
// .offers_home_service, .home_service_radius_km, and the `cities` +
// `services.available_at_home` rows) are introduced by migration 041. Until
// 041 lands the Supabase queries here return "column does not exist" errors
// — the UI surfaces those via `showActionError`. A schema probe is included
// in `getMarketplaceSettings` so the page can tell the user the backend
// isn't ready yet.
// ═══════════════════════════════════════

// ---- Zod schemas -----------------------------------------------------

const updateListingSchema = z
  .object({
    branchId: z.string().uuid(),
    listed_on_marketplace: z.boolean().optional(),
    about: z.string().max(ABOUT_MAX_CHARS).optional().nullable(),
    city_id: z.string().uuid().optional().nullable(),
    lat: z.number().gte(-90).lte(90).optional().nullable(),
    lng: z.number().gte(-180).lte(180).optional().nullable(),
    // `salon_gender_type` Postgres enum from migration 041. Nullable so
    // owners can leave it blank pre-publish, but `allRequirementsMet`
    // gates the publish toggle until it's set.
    gender_type: GenderTypeSchema.optional().nullable(),
  })
  .strip();

const updateHomeServiceSchema = z
  .object({
    branchId: z.string().uuid(),
    offers_home_service: z.boolean().optional(),
    home_service_radius_km: z.number().positive().max(50).optional().nullable(),
  })
  .strip();

const deletePhotoSchema = z.object({
  branchId: z.string().uuid(),
  path: z.string().min(1).max(500),
});

const BRANCH_PHOTOS_BUCKET = 'branch-photos';
const PHOTO_MIME_SET = new Set<string>(PHOTO_MIMES);

// ---- Bootstrap for the settings page --------------------------------

export async function getMarketplaceSettings(
  branchId: string,
): Promise<{ data: MarketplaceSettingsData | null; error: string | null }> {
  const session = await verifySession();
  if (!session.salonId || session.salonId === 'super-admin') {
    return { data: null, error: 'No salon context' };
  }

  try {
    await assertBranchOwned(branchId, session.salonId);
  } catch (e) {
    return { data: null, error: tenantErrorMessage(e) };
  }

  const supabase = createServerClient();

  // Probe the branches row. If migration 041 hasn't run yet, the select on
  // the new columns will fail — we catch and retry with a minimal select so
  // the page still loads.
  let schemaReady = true;
  let branchRow: Record<string, unknown> | null = null;

  const fullRes = await supabase
    .from('branches')
    .select(
      'id, name, listed_on_marketplace, offers_home_service, home_service_radius_km, about, city_id, lat, lng, photos, gender_type',
    )
    .eq('id', branchId)
    .eq('salon_id', session.salonId)
    .maybeSingle();

  if (fullRes.error) {
    schemaReady = false;
    const minRes = await supabase
      .from('branches')
      .select('id, name')
      .eq('id', branchId)
      .eq('salon_id', session.salonId)
      .maybeSingle();
    if (minRes.error) return { data: null, error: minRes.error.message };
    if (!minRes.data) return { data: null, error: 'Branch not found' };
    branchRow = minRes.data as Record<string, unknown>;
  } else {
    if (!fullRes.data) return { data: null, error: 'Branch not found' };
    branchRow = fullRes.data as Record<string, unknown>;
  }

  // Cities list (from migration 041).
  let cities: Array<{ id: string; slug: string; name: string }> = [];
  if (schemaReady) {
    const cityRes = await supabase
      .from('cities')
      .select('id, slug, name')
      .eq('is_active', true)
      .order('display_order');
    if (cityRes.error) {
      schemaReady = false;
    } else {
      cities = (cityRes.data ?? []) as Array<{ id: string; slug: string; name: string }>;
    }
  }

  // Active-service requirement: at least one active service exists for this
  // branch. We always filter by salon_id too as belt-and-suspenders.
  const svcRes = await supabase
    .from('services')
    .select('id', { count: 'exact', head: true })
    .eq('salon_id', session.salonId)
    .eq('branch_id', branchId)
    .eq('is_active', true);
  const hasActiveService = (svcRes.count ?? 0) >= 1;

  const photos = Array.isArray(branchRow?.photos)
    ? (branchRow!.photos as BranchPhoto[])
    : [];
  const about = (branchRow?.about as string | null) ?? null;
  const cityId = (branchRow?.city_id as string | null) ?? null;
  const lat = (branchRow?.lat as number | null) ?? null;
  const lng = (branchRow?.lng as number | null) ?? null;
  const rawGender = branchRow?.gender_type as string | null | undefined;
  const genderType: SalonGenderType | null =
    rawGender === 'men' || rawGender === 'women' || rawGender === 'mixed'
      ? rawGender
      : null;

  const requirements: ListingRequirements = {
    hasThreePhotos: photos.length >= 3,
    hasAbout:
      typeof about === 'string' && about.trim().length >= ABOUT_MIN_CHARS,
    hasPin: lat != null && lng != null,
    hasCity: cityId != null,
    hasActiveService,
    hasGenderType: genderType != null,
  };

  return {
    data: {
      branch: {
        id: branchId,
        name: (branchRow?.name as string) ?? '',
        listed_on_marketplace:
          (branchRow?.listed_on_marketplace as boolean) ?? false,
        offers_home_service:
          (branchRow?.offers_home_service as boolean) ?? false,
        home_service_radius_km:
          (branchRow?.home_service_radius_km as number | null) ?? null,
        about,
        city_id: cityId,
        lat,
        lng,
        photos,
        gender_type: genderType,
      },
      cities,
      requirements,
      schemaReady,
    },
    error: null,
  };
}

// ---- Update listing (at-salon) --------------------------------------

export async function updateMarketplaceListing(data: unknown) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { data: null, error: writeCheck.error };
  const session = writeCheck.session;

  try {
    requirePermission(session, 'manage_salon');
  } catch {
    return {
      data: null,
      error: 'You do not have permission to update marketplace settings',
    };
  }

  const parsed = updateListingSchema.safeParse(data);
  if (!parsed.success) {
    return {
      data: null,
      error: parsed.error.issues[0]?.message || 'Invalid input',
    };
  }
  const { branchId, ...updateFields } = parsed.data;

  try {
    await assertBranchOwned(branchId, session.salonId);
  } catch (e) {
    return { data: null, error: tenantErrorMessage(e) };
  }

  // If flipping `listed_on_marketplace` → true, re-validate requirements
  // server-side. The UI disables the toggle but the server is the
  // authoritative gate — a crafted POST to the action can't enable listing
  // without the required fields in place.
  if (updateFields.listed_on_marketplace === true) {
    const precheck = await getMarketplaceSettings(branchId);
    if (precheck.error) return { data: null, error: precheck.error };
    if (!precheck.data?.schemaReady) {
      return {
        data: null,
        error:
          'Marketplace schema is not live yet — migration 041 must run first',
      };
    }
    // Apply pending updates in-memory before we check requirements so a
    // single save can both set the fields and flip the toggle.
    const pending = { ...precheck.data.branch, ...updateFields };
    const req: ListingRequirements = {
      hasThreePhotos: (pending.photos || []).length >= 3,
      hasAbout:
        typeof pending.about === 'string' &&
        pending.about.trim().length >= ABOUT_MIN_CHARS,
      hasPin: pending.lat != null && pending.lng != null,
      hasCity: pending.city_id != null,
      hasActiveService: precheck.data.requirements.hasActiveService,
      hasGenderType: pending.gender_type != null,
    };
    if (!allRequirementsMet(req)) {
      return {
        data: null,
        error:
          'Cannot publish: complete the requirements checklist (3+ photos, 100+ char about, map pin, city, salon type, 1+ active service).',
      };
    }
  }

  const supabase = createServerClient();
  const { data: result, error } = await supabase
    .from('branches')
    .update(updateFields)
    .eq('id', branchId)
    .eq('salon_id', session.salonId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  // Invalidate directory + profile caches so the salon appears / disappears
  // on icut.pk immediately instead of waiting for the 6-hour ISR window.
  updateTag(MARKETPLACE_BRANCHES_TAG);
  updateTag(branchTag(branchId));

  return { data: result, error: null };
}

// ---- Update home-service --------------------------------------------

export async function updateHomeServiceSettings(data: unknown) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { data: null, error: writeCheck.error };
  const session = writeCheck.session;

  try {
    requirePermission(session, 'manage_salon');
  } catch {
    return {
      data: null,
      error: 'You do not have permission to update marketplace settings',
    };
  }

  const parsed = updateHomeServiceSchema.safeParse(data);
  if (!parsed.success) {
    return {
      data: null,
      error: parsed.error.issues[0]?.message || 'Invalid input',
    };
  }
  const { branchId, ...updateFields } = parsed.data;

  try {
    await assertBranchOwned(branchId, session.salonId);
  } catch (e) {
    return { data: null, error: tenantErrorMessage(e) };
  }

  // If enabling home service, require a radius > 0.
  if (
    updateFields.offers_home_service === true &&
    (updateFields.home_service_radius_km == null ||
      updateFields.home_service_radius_km <= 0)
  ) {
    // The UI prefills to 8 km so this only fires on a malformed client POST,
    // but we still want a clear error rather than a DB-side check-constraint
    // violation.
    return {
      data: null,
      error: 'Home-service radius (km) is required when the toggle is on',
    };
  }

  const supabase = createServerClient();
  const { data: result, error } = await supabase
    .from('branches')
    .update(updateFields)
    .eq('id', branchId)
    .eq('salon_id', session.salonId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  // Invalidate directory + profile caches so the salon appears / disappears
  // on icut.pk immediately instead of waiting for the 6-hour ISR window.
  updateTag(MARKETPLACE_BRANCHES_TAG);
  updateTag(branchTag(branchId));

  return { data: result, error: null };
}

// ---- Upload / delete photos ----------------------------------------

export async function uploadBranchPhoto(
  formData: FormData,
): Promise<{ data: BranchPhoto | null; error: string | null }> {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { data: null, error: writeCheck.error };
  const session = writeCheck.session;

  try {
    requirePermission(session, 'manage_salon');
  } catch {
    return {
      data: null,
      error: 'You do not have permission to update marketplace settings',
    };
  }

  const branchId = String(formData.get('branchId') ?? '');
  const file = formData.get('file');

  if (!branchId) return { data: null, error: 'branchId is required' };
  if (!(file instanceof File) || file.size === 0) {
    return { data: null, error: 'No file uploaded' };
  }
  if (!PHOTO_MIME_SET.has(file.type)) {
    return {
      data: null,
      error: 'Photo must be JPEG, PNG, or WebP',
    };
  }
  if (file.size > PHOTO_MAX_BYTES) {
    return { data: null, error: 'Photo must be 5MB or smaller' };
  }

  try {
    await assertBranchOwned(branchId, session.salonId);
  } catch (e) {
    return { data: null, error: tenantErrorMessage(e) };
  }

  const supabase = createServerClient();

  // Path shape: salon_id/branch_id/uuid.ext — namespaced so a brute-force
  // enumeration can't pull photos from a sibling salon. The bucket is public
  // per migration 041 (branch photos are a public-marketplace asset).
  const ext =
    (file.name.split('.').pop() || 'jpg')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '') || 'jpg';
  const uuid = crypto.randomUUID();
  const path = `${session.salonId}/${branchId}/${uuid}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from(BRANCH_PHOTOS_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadErr) {
    return { data: null, error: `Upload failed: ${uploadErr.message}` };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BRANCH_PHOTOS_BUCKET).getPublicUrl(path);

  const photo: BranchPhoto = {
    path,
    url: publicUrl,
    uploaded_at: new Date().toISOString(),
  };

  // Append to branches.photos jsonb. We fetch the current array, push the
  // new entry, then write it back. Not strictly atomic — two concurrent
  // uploads could race — but 5 MB client uploads are slow enough that in
  // practice the UI lets one finish before starting another.
  const current = await supabase
    .from('branches')
    .select('photos')
    .eq('id', branchId)
    .eq('salon_id', session.salonId)
    .maybeSingle();

  if (current.error) {
    await supabase.storage
      .from(BRANCH_PHOTOS_BUCKET)
      .remove([path])
      .catch(() => {});
    return { data: null, error: current.error.message };
  }

  const existing = Array.isArray(
    (current.data as { photos?: unknown })?.photos,
  )
    ? ((current.data as { photos: BranchPhoto[] }).photos as BranchPhoto[])
    : [];
  const next = [...existing, photo];

  const { error: updErr } = await supabase
    .from('branches')
    .update({ photos: next })
    .eq('id', branchId)
    .eq('salon_id', session.salonId);

  if (updErr) {
    // Roll back the storage object so we don't leak orphaned files.
    await supabase.storage
      .from(BRANCH_PHOTOS_BUCKET)
      .remove([path])
      .catch(() => {});
    return { data: null, error: updErr.message };
  }

  updateTag(MARKETPLACE_BRANCHES_TAG);
  updateTag(branchTag(branchId));
  return { data: photo, error: null };
}

export async function deleteBranchPhoto(input: unknown) {
  const writeCheck = await checkWriteAccess();
  if (writeCheck.error !== null) return { error: writeCheck.error };
  const session = writeCheck.session;

  try {
    requirePermission(session, 'manage_salon');
  } catch {
    return { error: 'You do not have permission to update marketplace settings' };
  }

  const parsed = deletePhotoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Invalid input' };
  }
  const { branchId, path } = parsed.data;

  try {
    await assertBranchOwned(branchId, session.salonId);
  } catch (e) {
    return { error: tenantErrorMessage(e) };
  }

  const supabase = createServerClient();

  // Defensive check: the `path` must be namespaced under this salon+branch.
  // Prevents a crafted payload from deleting photos belonging to a sibling
  // branch (service-role bypasses storage RLS).
  const expectedPrefix = `${session.salonId}/${branchId}/`;
  if (!path.startsWith(expectedPrefix)) {
    return { error: 'Not allowed' };
  }

  const current = await supabase
    .from('branches')
    .select('photos')
    .eq('id', branchId)
    .eq('salon_id', session.salonId)
    .maybeSingle();
  if (current.error) return { error: current.error.message };

  const existing = Array.isArray(
    (current.data as { photos?: unknown })?.photos,
  )
    ? ((current.data as { photos: BranchPhoto[] }).photos as BranchPhoto[])
    : [];
  const next = existing.filter((p) => p.path !== path);

  const { error: updErr } = await supabase
    .from('branches')
    .update({ photos: next })
    .eq('id', branchId)
    .eq('salon_id', session.salonId);
  if (updErr) return { error: updErr.message };

  // Best-effort storage cleanup. If the object doesn't exist (say it was
  // already GC'd), continue — we've already removed the DB reference.
  await supabase.storage
    .from(BRANCH_PHOTOS_BUCKET)
    .remove([path])
    .catch(() => {});

  updateTag(MARKETPLACE_BRANCHES_TAG);
  updateTag(branchTag(branchId));
  return { error: null };
}
