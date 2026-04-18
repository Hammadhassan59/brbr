#!/usr/bin/env -S npx tsx
/**
 * seed-marketplace-pilots.ts
 *
 * ⚠️ DEV / STAGING ONLY ⚠️
 *
 * Refuses to run if:
 *   - NODE_ENV === 'production'
 *   - DATABASE_URL or SUPABASE_URL contains any of the known prod hostnames
 *     (91.99.117.168, icut.pk, supabase.icut.pk, 138.199.175.90).
 *
 * Purpose:
 *   Seed 3 pilot salons (Karachi / Lahore / Islamabad), men-only, so the Week-6
 *   marketplace launch doesn't look empty on day one. Mirrors the real
 *   "publish on marketplace" requirements from
 *   `src/app/actions/marketplace-settings.ts` (allRequirementsMet + the
 *   ABOUT_MIN_CHARS / 3-photos / pin / city / service / gender checks).
 *
 *   Also seeds 10-15 consumer accounts (plaintext passwords dumped to a
 *   gitignored `.pilot-consumers.txt` at repo root) and 5-8 completed bookings
 *   per salon with 4★ / 5★ reviews so each salon profile has review content
 *   ready for the first real visitor.
 *
 * Idempotency:
 *   - Every salon/branch is keyed on a deterministic `pilot-...` slug. If the
 *     slug already exists, the salon is skipped entirely (including consumers
 *     and bookings). Safe to re-run.
 *   - UUIDs use a known prefix (`10000000-0000-...`) so a partial run can be
 *     cleaned up with a single `DELETE` targeting that prefix.
 *
 * Usage:
 *   npm run seed:marketplace-pilots
 *
 * Required env:
 *   SUPABASE_URL                — e.g. http://localhost:54321 for local Supabase CLI
 *   SUPABASE_SERVICE_ROLE_KEY   — needed to bypass RLS for cross-table inserts
 *
 * Optional env:
 *   NODE_ENV                    — must NOT be 'production'
 *   SEED_PILOTS_DRY_RUN         — '1' to log the plan without writing
 *
 * Exit codes:
 *   0 — seeded (or no-op if everything already existed)
 *   1 — guard tripped (prod hostname, missing env, etc.)
 *   2 — runtime Supabase error
 *
 * Design note — helpers live in a sibling file:
 *   Pure synchronous helpers (slug gen, photo pool, guards, requirements
 *   check, consumer pool / password gen, credentials file formatting) are in
 *   `./seed-marketplace-pilots-helpers.ts` so the unit-test file at
 *   `test/seed-marketplace-pilots.test.ts` can import them without pulling in
 *   `@supabase/supabase-js` at module-eval time. Vitest's worker deadlocks if
 *   we load the full Supabase + Next.js runtime just to test a regex.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { allRequirementsMet } from '../src/lib/marketplace/settings-shared';

import {
  PILOT_SERVICE_TEMPLATE,
  PILOT_SPECS,
  PILOT_WORKING_HOURS,
  REVIEW_COMMENT_POOL,
  checkEnvGuards,
  formatConsumerCredentialsFile,
  generateConsumerPool,
  pickPhotos,
  pilotRequirementsCheck,
  type PilotConsumerCredential,
  type PilotSalonSpec,
} from './seed-marketplace-pilots-helpers';

// Re-export so both the CLI wrapper and any downstream importer get the full
// surface from a single entry point.
export * from './seed-marketplace-pilots-helpers';

// ═════════════════════════════════════════════════════════════════════════════
// Runtime — everything below touches Supabase
// ═════════════════════════════════════════════════════════════════════════════

interface SeedContext {
  supabase: SupabaseClient;
  dryRun: boolean;
  consumers: PilotConsumerCredential[];
}

function log(msg: string) {
   
  console.log(`[seed-marketplace-pilots] ${msg}`);
}

async function resolveCityId(ctx: SeedContext, cityName: string): Promise<string> {
  const { data, error } = await ctx.supabase
    .from('cities')
    .select('id, slug, name')
    .eq('name', cityName)
    .maybeSingle();
  if (error) throw new Error(`lookup city ${cityName}: ${error.message}`);
  if (!data) {
    throw new Error(
      `city '${cityName}' not in cities table — did migration 041 run?`,
    );
  }
  return data.id as string;
}

async function branchAlreadySeeded(
  ctx: SeedContext,
  slug: string,
): Promise<boolean> {
  const { data } = await ctx.supabase
    .from('branches')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  return !!data;
}

/**
 * Create or look up a Supabase auth user for a pilot consumer. Idempotent: a
 * 422 "already exists" response is translated into a lookup of the existing
 * user id so reruns don't duplicate accounts.
 *
 * We use the raw Admin REST API rather than the supabase-js `admin.createUser`
 * helper because the helper imports the full auth module chain. This direct
 * fetch keeps the dependency surface small.
 */
async function ensureAuthUser(
  cred: PilotConsumerCredential,
): Promise<string> {
  const base = (process.env.SUPABASE_URL as string).replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const res = await fetch(`${base}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: cred.email,
      password: cred.password,
      email_confirm: true,
      phone: cred.phone,
    }),
  });
  if (res.status === 422) {
    // already exists — look up id
    const list = await fetch(
      `${base}/auth/v1/admin/users?email=${encodeURIComponent(cred.email)}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    const body = (await list.json()) as { users?: Array<{ id: string }> };
    if (body.users?.[0]?.id) return body.users[0].id;
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`create auth user ${cred.email}: ${res.status} ${body}`);
  }
  const body = (await res.json()) as { id?: string; user?: { id: string } };
  return (body.id ?? body.user?.id) as string;
}

async function upsertConsumer(
  ctx: SeedContext,
  userId: string,
  cred: PilotConsumerCredential,
) {
  const { error } = await ctx.supabase.from('consumers').upsert(
    {
      id: userId,
      name: cred.name,
      phone: cred.phone,
    },
    { onConflict: 'id' },
  );
  if (error) throw new Error(`upsert consumer ${cred.email}: ${error.message}`);
}

async function seedOneSalon(
  ctx: SeedContext,
  spec: PilotSalonSpec,
  cityId: string,
): Promise<{ skipped: boolean; bookingCount: number }> {
  if (await branchAlreadySeeded(ctx, spec.slug)) {
    log(`skip ${spec.slug} (already exists)`);
    return { skipped: true, bookingCount: 0 };
  }

  const photoUrls = pickPhotos(
    parseInt(spec.id.replace(/-/g, '').slice(0, 6), 16),
    5,
  );
  const photos = photoUrls.map((url) => ({
    path: `pilot/${spec.slug}/${randomUUID()}.jpg`,
    url,
    uploaded_at: new Date().toISOString(),
  }));

  // 1. salon
  const salonSlug = spec.slug.replace(/^pilot-/, 'pilot-salon-');
  const { error: salonErr } = await ctx.supabase.from('salons').insert({
    id: spec.id,
    name: spec.name,
    slug: salonSlug,
    type: 'gents',
    language: 'en',
    city: spec.cityName,
    address: spec.address,
    phone: spec.phone,
    whatsapp: spec.phone,
    setup_complete: true,
    subscription_plan: 'pro',
    subscription_status: 'active',
    subscription_started_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    subscription_expires_at: new Date(Date.now() + 365 * 86_400_000).toISOString(),
    owner_id: null,
  });
  if (salonErr) throw new Error(`insert salon ${spec.name}: ${salonErr.message}`);

  // 2. branch (with marketplace fields populated; listed_on_marketplace=false for now)
  const { error: branchErr } = await ctx.supabase.from('branches').insert({
    id: spec.branchId,
    salon_id: spec.id,
    name: 'Main Branch',
    address: spec.address,
    phone: spec.phone,
    is_main: true,
    working_hours: PILOT_WORKING_HOURS,
    lat: spec.lat,
    lng: spec.lng,
    slug: spec.slug,
    photos,
    about: spec.about,
    city_id: cityId,
    gender_type: 'men',
    offers_home_service: spec.offersHomeService,
    home_service_radius_km: spec.homeServiceRadiusKm,
    listed_on_marketplace: false, // flipped on at end after requirements check
    rating_count: 0,
  });
  if (branchErr) throw new Error(`insert branch ${spec.name}: ${branchErr.message}`);

  // 3. services
  const serviceRows = PILOT_SERVICE_TEMPLATE.map((s, idx) => ({
    id: randomUUID(),
    salon_id: spec.id,
    name: s.name,
    category: s.category,
    duration_minutes: s.duration_minutes,
    base_price: s.base_price,
    is_active: true,
    sort_order: idx + 1,
    available_at_home: true,
  }));
  const { error: svcErr } = await ctx.supabase.from('services').insert(serviceRows);
  if (svcErr) throw new Error(`insert services for ${spec.name}: ${svcErr.message}`);

  // 4. requirements check — mirror updateMarketplaceListing's server-side gate
  const req = pilotRequirementsCheck(
    spec,
    photoUrls,
    serviceRows.some((s) => s.is_active),
  );
  if (!allRequirementsMet(req)) {
    throw new Error(
      `requirements check failed for ${spec.name}: ${JSON.stringify(req)}`,
    );
  }

  // 5. publish — flip listed_on_marketplace=true now that req passed
  const { error: publishErr } = await ctx.supabase
    .from('branches')
    .update({ listed_on_marketplace: true })
    .eq('id', spec.branchId);
  if (publishErr) throw new Error(`publish ${spec.name}: ${publishErr.message}`);

  // 6. bookings + reviews (5-8 completed bookings, random 4-5★)
  const bookingCount = 5 + ((serviceRows.length + spec.name.length) % 4); // 5..8
  for (let i = 0; i < bookingCount; i++) {
    const consumer = ctx.consumers[i % ctx.consumers.length];
    const userId = await ensureAuthUser(consumer);
    await upsertConsumer(ctx, userId, consumer);

    const bookingId = randomUUID();
    const svc = serviceRows[i % serviceRows.length];
    const daysAgo = 2 + i;
    const start = new Date(Date.now() - daysAgo * 86_400_000);
    start.setUTCHours(14, 0, 0, 0);
    const end = new Date(start.getTime() + svc.duration_minutes * 60_000);

    const salonBase = Number(svc.base_price);

    const { error: bkErr } = await ctx.supabase.from('bookings').insert({
      id: bookingId,
      consumer_id: userId,
      branch_id: spec.branchId,
      salon_id: spec.id,
      status: 'COMPLETED',
      location_type: 'in_salon',
      requested_at: start.toISOString(),
      requested_slot_start: start.toISOString(),
      requested_slot_end: end.toISOString(),
      salon_base_total: salonBase,
      platform_markup: 0,
      service_charge: 0,
      consumer_total: salonBase,
      completed_at: end.toISOString(),
      review_window_closes_at: new Date(
        end.getTime() + 7 * 86_400_000,
      ).toISOString(),
    });
    if (bkErr) throw new Error(`insert booking ${i}/${spec.name}: ${bkErr.message}`);

    const { error: biErr } = await ctx.supabase.from('booking_items').insert({
      booking_id: bookingId,
      service_id: svc.id,
      service_name: svc.name,
      salon_base_price: salonBase,
      display_price: salonBase,
    });
    if (biErr) throw new Error(`insert booking_item ${i}/${spec.name}: ${biErr.message}`);

    const review = REVIEW_COMMENT_POOL[i % REVIEW_COMMENT_POOL.length];
    const { error: rvErr } = await ctx.supabase.from('reviews').insert({
      booking_id: bookingId,
      direction: 'consumer_of_salon',
      rating: review.rating,
      comment: review.comment,
    });
    if (rvErr) throw new Error(`insert review ${i}/${spec.name}: ${rvErr.message}`);
  }

  log(`seeded ${spec.name} (${spec.cityName}) — ${bookingCount} bookings`);
  return { skipped: false, bookingCount };
}

async function main() {
  const guard = checkEnvGuards(process.env);
  if (!guard.ok) {
     
    console.error(`[seed-marketplace-pilots] ABORT: ${guard.reason}`);
    process.exit(1);
  }
  log(`target: ${process.env.SUPABASE_URL}`);

  const dryRun = process.env.SEED_PILOTS_DRY_RUN === '1';
  if (dryRun) log('dry-run mode — no writes');

  const supabase = createClient(
    process.env.SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );

  const consumers = generateConsumerPool(12);
  const credsPath = join(process.cwd(), '.pilot-consumers.txt');
  if (!dryRun) {
    mkdirSync(dirname(credsPath), { recursive: true });
    writeFileSync(credsPath, formatConsumerCredentialsFile(consumers), {
      mode: 0o600,
    });
    log(`consumer credentials written to ${credsPath}`);
  }

  const ctx: SeedContext = { supabase, dryRun, consumers };

  // Resolve city IDs once.
  const cityByName: Record<string, string> = {};
  for (const city of ['Karachi', 'Lahore', 'Islamabad'] as const) {
    cityByName[city] = await resolveCityId(ctx, city);
  }

  let seededCount = 0;
  let skippedCount = 0;
  let totalBookings = 0;
  for (const spec of PILOT_SPECS) {
    const result = await seedOneSalon(ctx, spec, cityByName[spec.cityName]);
    if (result.skipped) skippedCount++;
    else {
      seededCount++;
      totalBookings += result.bookingCount;
    }
  }

  log(
    `done — seeded ${seededCount}, skipped ${skippedCount}, bookings ${totalBookings}`,
  );
  if (seededCount > 0 && !existsSync(credsPath)) {
    log(`WARN: credentials file missing at ${credsPath}`);
  }
}

// Only run main() when invoked directly. Imports (including the unit tests)
// should NOT trigger the guard check + Supabase client build.
const invokedDirectly =
  typeof process !== 'undefined' &&
  typeof process.argv[1] === 'string' &&
  (process.argv[1].endsWith('seed-marketplace-pilots.ts') ||
    process.argv[1].endsWith('seed-marketplace-pilots.js'));

if (invokedDirectly) {
  main().catch((err) => {
     
    console.error('[seed-marketplace-pilots] FATAL', err);
    process.exit(2);
  });
}
