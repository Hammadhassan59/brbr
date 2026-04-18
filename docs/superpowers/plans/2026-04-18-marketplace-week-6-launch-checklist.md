# iCut Marketplace — Week 6 Launch Checklist

**Date:** 2026-04-18
**Pairs with:** `docs/superpowers/plans/2026-04-18-marketplace-phase-0-1.md`
**Target ship:** End of Week 6 (men-only launch, 3-5 pilot salons live).
**Audience:** this is the operational runbook. Read top-to-bottom; items must
execute in order because each step depends on the previous one working.

---

## TL;DR — Who does what

| Step | Who | Wall-clock | Blocking for launch? |
|---|---|---|---|
| 1. Rotate prod secrets | **User** | 45 min | Yes — rotation is the single biggest unresolved risk from the 2026-04-16 security audit. |
| 2. Mapbox tokens | **User** | 20 min | Yes — address picker + salon maps don't render without them. |
| 3. Resend domain verification | **User** (DNS) + me (test send) | 30 min + DNS propagation | Yes — no booking confirmations without it. |
| 4. Apply migration 041 | Me (staging) → user (prod go-ahead) → me (prod) | 5 min staging + 5 min prod | Yes — nothing runs without the schema. |
| 5. Seed pilot salons | Me (via `npm run seed:marketplace-pilots` on **staging/dev only**) | 10 min | Yes — empty marketplace looks dead. |
| 6. Verify `marketplace_women_enabled=false` | Me | 2 min | Yes — men-only launch gate. |
| 7. Replace PWA icons | User (design) + me (swap) | 30 min | No (shippable with defaults) — but required before app-store submission later. |
| 8. `npm run build` + manual smoke | Me | 30 min | Yes — proves nothing regressed. |
| 9. Submit sitemap | User | 10 min | No — nothing breaks if delayed a day. |
| 10. Monitor for 48h | Both | ongoing | No — post-launch. |

---

## Unresolved items from prior security passes (pulled from CLAUDE.md)

These are **not** new for launch — they're leftover from the 2026-04-16 + -17 passes
and the user should decide whether any of them now block the marketplace launch.

- [ ] **Rotate prod secrets** — SESSION_SECRET, SUPABASE_SERVICE_ROLE_KEY, POSTGRES_PASSWORD, Resend API key, S3 keys. Still sit unencrypted in `~/icut/icut-handoff/*.env` from the dev-laptop era. **This is step 1 of launch.**
- [ ] **Scrub git history of leaked VPS IPs** (`138.199.175.90`, `91.99.117.168`). Requires destructive `filter-repo`. Not a blocker for marketplace launch per se — the VPS is already behind Caddy with port 3000 bound to 127.0.0.1 — but if you're making the repo public at any point this has to happen first.
- [ ] **Impersonation Supabase session redemption** (`enterDashboard` / `exitImpersonation`). Pre-existing bug from `047ef85`. Means superadmin sees zero client-side Supabase-RLS data when impersonating a salon. ~5-line fix. Not launch-blocking for consumer marketplace (consumers never impersonate), but if the user plans to spot-check the pilot salon dashboards via impersonation during the 48h monitor window, fix this first.
- [ ] **Expense visibility UX** (today-filter default) — cosmetic, not launch-blocking.
- [ ] **Daily report cross-branch expenses bug** — `reports/daily/page.tsx:64` does `.eq('salon_id', …)` on a table that has no `salon_id`. Silent empty in cross-branch view. Not launch-blocking.
- [ ] **Per-branch inventory** — design gap from 2026-04-17. User said "tomorrow". Independent of marketplace launch.

> **Re-prioritize call-out:** items 1 and 3 (secrets + impersonation) are the two I'd re-rank. The others can ride.

---

## Step 1 — Rotate prod secrets

**Owner:** user. **Why me-can't:** VPS SSH + Supabase Studio superadmin login are user-only.

**Time:** ~45 min including double-checking `.env.local` syntax and bouncing the container.

**What breaks if you skip this:** every secret in `~/icut/icut-handoff/*.env` is a known-leaked-to-past-dev-laptop value. A past collaborator or an `~/.bash_history` artifact could forge admin JWTs or read the entire Supabase DB. **This is the single highest-risk unresolved item.**

### Rotation list

- [ ] **`SESSION_SECRET`** — used to sign every owner JWT (`jose.jwtVerify` in `src/proxy.ts`). Generate a new 64-byte hex: `openssl rand -hex 64`.
- [ ] **`SUPABASE_SERVICE_ROLE_KEY`** — rotate via Supabase Studio → Settings → API → "Reset service_role key". Copy the new JWT.
- [ ] **`SUPABASE_ANON_KEY`** — rotate same place. Public but best-practice to cycle with service role.
- [ ] **`POSTGRES_PASSWORD`** — for self-hosted Supabase, this is the DB superuser pw. Change in the VPS compose env, then `docker compose restart supabase-db`. Update Supabase Studio connection too.
- [ ] **`RESEND_API_KEY`** — rotate via resend.com dashboard → API Keys → Revoke old + create new.
- [ ] **S3 keys** (if using Supabase Storage's S3 adapter) — rotate access key + secret via the Studio storage panel.
- [ ] **`NEXTSA_KEY`** — server-action encryption key baked in via BuildKit secret. File lives at `/opt/brbr/secrets/nextsa_key.txt` on VPS. Rotate only if compromised (rotating forces a rebuild + all active action chains are invalidated, which logs users out).

### Procedure

1. SSH to VPS (`ssh root@91.99.117.168`).
2. `cp /opt/brbr/.env.local /opt/brbr/.env.local.bak-$(date +%s)` — backup first.
3. Edit `/opt/brbr/.env.local`, paste new values.
4. `cd /opt/brbr && docker compose down && docker compose up -d` (do NOT use `restart` — env is only re-read on `up`).
5. Verify: `docker compose logs -f app` should show a healthy boot, no "SESSION_SECRET too short" or Supabase auth failures.
6. Smoke: open `icut.pk` in incognito, log in as test owner, confirm dashboard loads.
7. Update GitHub Actions secret store: Settings → Secrets → Actions → update the same names so next deploy doesn't clobber.
8. **Revoke old Resend key** in dashboard after 24h grace.

**Rollback:** `cp /opt/brbr/.env.local.bak-<timestamp> /opt/brbr/.env.local && docker compose up -d`. Old secrets still work because we staged rotation (not revoked-immediately).

**Partial-completion footgun:** if you update `.env.local` but the GitHub Actions secret store still holds the old values, the next deploy overwrites your change via the container env. Always update both.

---

## Step 2 — Mapbox provisioning

**Owner:** user (account creation) + me (env wiring).

**Time:** 20 min.

**What breaks if skipped:** `/book/[slug]` address picker is dead; salon profile static map doesn't render; server-side geocoding for `consumer_addresses` fails. Consumer can't complete a home-service booking end to end.

- [ ] Create account at mapbox.com (free tier — 50K map loads + 100K geocoding/mo; more than enough for launch).
- [ ] Generate **public token** `NEXT_PUBLIC_MAPBOX_TOKEN`:
  - Scopes: `styles:read`, `fonts:read` only.
  - URL restriction: `https://icut.pk/*`, `https://www.icut.pk/*`. This is critical — without URL restriction a leaked public token drains the free tier.
- [ ] Generate **server-only geocoding token** `MAPBOX_GEOCODING_TOKEN`:
  - Scopes: `geocoding:read` only.
  - No URL restriction (it's used server-side where Referer isn't sent).
  - **Never** commit to git. Store only in `/opt/brbr/.env.local` + GitHub Actions secret store.
- [ ] Add both to VPS `/opt/brbr/.env.local`.
- [ ] Add both to GitHub Actions → Settings → Secrets → Actions.
- [ ] Bounce app: `docker compose down && docker compose up -d`.
- [ ] Smoke: `curl -I https://icut.pk/book/<a-pilot-salon-slug>` should 200 after login; `src/lib/mapbox.ts::geocode('Clifton Karachi')` should return results in a server action.

**Rollback:** revoke both tokens in Mapbox dashboard. App continues; home-service booking wizard shows a "map unavailable" placeholder.

**Partial-completion footgun:** using the server geocoding token on the client side (it's scope-unrestricted — treat it like a service-role key).

---

## Step 3 — Resend domain verification

**Owner:** user (DNS records) + me (app-side sender config + test).

**Time:** 30 min of work + up to 48h of DNS propagation (usually <1h for Cloudflare).

**What breaks if skipped:** no consumer gets the "we got your request" / "confirmed" email. Booking UX is broken because consumer thinks the request vanished.

- [ ] Resend dashboard → Domains → Add `icut.pk`.
- [ ] Copy the 3 DNS records Resend gives you (SPF TXT, DKIM CNAME, MX if you want inbound).
- [ ] Add to your DNS host (Cloudflare → DNS → Records). Set **Proxied: OFF (DNS only)** for the CNAME — Resend cannot verify through an HTTP proxy.
- [ ] Wait for `Verified` status in Resend dashboard.
- [ ] Update `RESEND_FROM_EMAIL=no-reply@icut.pk` in `/opt/brbr/.env.local`.
- [ ] Send a test: `resend.emails.send({ from: 'no-reply@icut.pk', to: 'your-email', subject: 'test', html: '<p>hi</p>' })`. Check inbox. Check spam too.

**Rollback:** keep using the old `onboarding@resend.dev` sender address — emails still deliver (just with a generic from), so this is recoverable if DNS misbehaves.

**Partial-completion footgun:** verifying only SPF without DKIM still sends, but Gmail silently spam-folders everything. Wait until all three records show `Verified`.

---

## Step 4 — Apply migration 041 (marketplace groundwork)

**Owner:** me, but user green-lights prod timing (per `feedback_deploy_gate.md`).

**Time:** 5 min on staging DB, then 5 min on prod after confirmation.

**What breaks if skipped:** the entire marketplace is dead — `getMarketplaceSettings` falls into the schema-not-ready fallback, pilot-salon seed fails at the first branch INSERT, `/barbers` returns empty.

### Staging first

- [ ] SSH to VPS: `ssh root@91.99.117.168`.
- [ ] `docker exec -i supabase-db psql -U postgres -d postgres < /root/icut/brbr/supabase/migrations/041_marketplace_groundwork.sql`
  - (If staging DB is separate, point at that container instead.)
- [ ] Verify: `docker exec supabase-db psql -U postgres -d postgres -c "SELECT COUNT(*) FROM cities;"` → expect 5.
- [ ] Verify: `docker exec supabase-db psql -U postgres -d postgres -c "SELECT slug FROM marketplace_services ORDER BY display_order;"` → expect 10 rows.
- [ ] Verify: `docker exec supabase-db psql -U postgres -d postgres -c "SELECT column_name FROM information_schema.columns WHERE table_name='branches' AND column_name IN ('lat','lng','slug','photos','listed_on_marketplace','gender_type');"` → expect 6 rows.
- [ ] Run seed script (Step 5) against staging — confirm it completes.
- [ ] `npm run build && npm test` locally — smoke CI.

### Prod apply

- [ ] Ask user: "Migration verified on staging. Ready to apply 041 to prod?" Wait for yes.
- [ ] Back up: `docker exec supabase-db pg_dump -U postgres -d postgres -t salons -t branches -t services > /root/backups/pre-041-$(date +%s).sql`.
- [ ] Apply: `docker exec -i supabase-db psql -U postgres -d postgres < /root/icut/brbr/supabase/migrations/041_marketplace_groundwork.sql`.
- [ ] Same verification commands as staging.
- [ ] Append to `project_deploy_log.md` (per `feedback_append_deploy_log.md`).

**Rollback:** `docker exec -i supabase-db psql -U postgres -d postgres < /root/icut/brbr/supabase/migrations/042_rollback_041.sql`. Additive migration, fully reversible. Any bookings/reviews/settlements created in the window are lost (expected — see 042 header).

**Partial-completion footgun:** 041 runs in a single `BEGIN...COMMIT` block, so partial application is actually safe — either the whole migration applies or none of it does. The real footgun is running it twice without `IF NOT EXISTS` guards: the migration is idempotent (`ON CONFLICT DO NOTHING`, `CREATE ... IF NOT EXISTS` everywhere) so a retry is safe.

---

## Step 5 — Seed pilot salons

**Owner:** me.

**Time:** 10 min (the script itself is fast; the gating checks around it are the slow part).

**What breaks if skipped:** marketplace looks empty. The first 5 consumers who discover `icut.pk` bounce immediately because there's nothing to book. This is the "don't look dead on day one" item.

- [ ] Ensure you're on **dev or staging** DB — the script refuses to run if `NODE_ENV=production` or `DATABASE_URL` contains a known prod hostname (`91.99.117.168`, `icut.pk`, `supabase.icut.pk`).
- [ ] `export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_MAPBOX_TOKEN=<staging>` — the service-role key is what lets the script bypass RLS to insert consumers + bookings.
- [ ] `npm run seed:marketplace-pilots`
- [ ] Script creates 3 salons (Karachi/Lahore/Islamabad), 3 branches, 18 services, 30+ bookings, 30+ reviews, 10-15 consumers. Credentials for consumer accounts land in `.pilot-consumers.txt` at repo root — **gitignored**, do not commit.
- [ ] Verify in Studio: `SELECT slug, name, listed_on_marketplace, gender_type FROM branches WHERE listed_on_marketplace = true;` → expect 3 rows, all `men`, all true.
- [ ] Visit `https://staging.icut.pk/barbers` — should show 3 cards.
- [ ] Click through to `/barber/<one-slug>` — should show 5 photos, 5+ reviews, 6 services with PKR prices.

**Rollback:** the script's pilot salons are tagged with a known UUID prefix (`10000000-0000-...`). To wipe: `DELETE FROM bookings WHERE salon_id::text LIKE '10000000%'; DELETE FROM salons WHERE id::text LIKE '10000000%' CASCADE;` — or just rerun with the `--reset` flag which does the same from Node.

**Partial-completion footgun:** the script is idempotent on slug — if it crashes mid-run and you rerun, it safely skips any salon whose slug already exists, but may double-create consumers/bookings under different UUIDs. If a partial run fails, rollback the UUID-prefix way before retrying.

---

## Step 6 — Verify `marketplace_women_enabled = false`

**Owner:** me. **Time:** 2 min.

**What breaks if skipped:** a pilot salon seeded with `gender_type='men'` doesn't fail open — the filter in `src/lib/marketplace/queries.ts` already gates on men-only when the flag is false — so strictly this is "nothing breaks." But if the flag somehow ended up `true` (e.g. a copy-paste in `platform_settings`), women and mixed salons would appear in the consumer directory on day one. Decision 3 from the plan says **men-only launch**, so this is the verification that the launch matches the decision.

- [ ] `docker exec supabase-db psql -U postgres -d postgres -c "SELECT key, value FROM platform_settings WHERE key='marketplace_women_enabled';"` → expect `value = false`.
- [ ] If somehow `true`: `UPDATE platform_settings SET value='false'::jsonb WHERE key='marketplace_women_enabled';` and rerun the check.

**Rollback:** flip it back to `true`. Zero downtime — next directory query picks up the change.

---

## Step 7 — PWA icons

**Owner:** user (source PNGs from designer) + me (drop into `public/icons/`).

**Time:** 30 min once designer sends the files.

**What breaks if skipped:** `manifest.json` references icons that don't exist → browser console warning → "Add to Home Screen" on iOS shows a default black square instead of the iCut logo. Ugly, not broken. Users can still install the PWA. **Not launch-blocking** — the README placeholder covers the promise that these exist, but prod should replace them before the Week-8 Google Search Console submission.

- [ ] Get from designer: `icon-192.png` (192×192), `icon-512.png` (512×512), `icon-maskable.png` (512×512, 10% safe-zone padding).
- [ ] Drop into `public/icons/`. Delete the `README.md` placeholder.
- [ ] Verify manifest references match: `src/app/(marketplace)/manifest.ts` should list the three files with correct `sizes` + `purpose`.
- [ ] Test: iOS Safari → `Share` → `Add to Home Screen` → confirm branded icon appears on home screen.

**Rollback:** revert the drop — PWA install still works, just with default icon.

**Partial-completion footgun:** uploading only 192 + 512 without the maskable one causes Android to crop the normal icon inside a circle and look weird. All three or none.

---

## Step 8 — `npm run build` + smoke-test 4 public flows

**Owner:** me.

**Time:** 5 min build + 25 min manual smoke.

**What breaks if skipped:** we don't actually know the marketplace pages render.

### Pre-deploy build

- [ ] `cd /Users/alkhatalrafie/icut/brbr && npm run build` — must exit 0. No TypeScript errors, no missing env warnings.
- [ ] `npm test` — all vitest passes.
- [ ] If both pass, push to main via the deploy-gate prompt.

### Post-deploy smoke (on prod)

These are the 4 consumer flows from decisions 5-12 of the plan. Each must be clickable end-to-end against real seeded pilot data.

- [ ] **Flow 1 — Browse home.** Visit `https://icut.pk/`. Mode toggle visible. Shows featured salons from 3 pilot cities.
- [ ] **Flow 2 — Tap salon.** Click a card → lands on `/barber/<slug>`. 5 photos load. About text renders. Services list shows PKR prices. At least one review is visible.
- [ ] **Flow 3 — Reach checkout.** Tap "Book at salon" → registration modal → fill fake email → verify email → return to `/book/<slug>` → see service list with checkboxes and time slot picker.
- [ ] **Flow 4 — End-to-end test booking.** Register a new consumer with your own email + +92 phone. Submit a PENDING booking for tomorrow 3pm. Log into the seeded pilot salon dashboard as owner. See the booking in the Incoming Bookings panel. Tap Confirm. Back on consumer side, refresh `/account/bookings/<id>` → status = CONFIRMED. Both sides got emails.

**Rollback:** if any flow breaks → revert to commit `f23f8d2` (the `project_security_rollback_point.md` anchor) + roll back migration 041 via 042. Full recovery in <10 min.

**Partial-completion footgun:** skipping Flow 4 because "the first 3 passed" is the classic. Flow 4 is the one that proves realtime + email + auth all agree.

---

## Step 9 — Submit sitemap to Google Search Console

**Owner:** user (GSC account access).

**Time:** 10 min.

**What breaks if skipped:** Google discovers pages via organic crawl eventually; submitting accelerates it from ~2 weeks to ~2 days for the programmatic-SEO pages (`/services/<svc>-in-<city>`, `/services/home-<svc>-in-<city>`).

- [ ] GSC → add property → `https://icut.pk` → verify via DNS TXT record.
- [ ] Sitemaps → submit `https://icut.pk/sitemap.xml`.
- [ ] 48h later, check: Pages → Indexed count should climb past 50 (3 salons × programmatic pages).

**Rollback:** N/A — GSC is read-only from our side.

---

## Step 10 — Monitor for 48 hours

**Owner:** both. User watches business metrics, I watch code/error logs.

**What to watch**

- [ ] **VPS logs:** `docker compose logs -f app` for any 500s. Anything logging a stack trace with "TypeError" or "null is not an object" is a bug.
- [ ] **Supabase slow-query log:** anything >500ms on `bookings` or `branches` selects → likely a missing index (the indexes in 041 should cover everything the plan calls for).
- [ ] **Mapbox usage dashboard:** map loads + geocoding requests. Alert if >40K/mo (80% of free tier).
- [ ] **Resend dashboard:** delivery rate should be >95%. Bounces → check SPF/DKIM.
- [ ] **Admin dashboard → Flagged:** new pilot salons should have 0 flags. If one appears, it's a fake-review bug or a bad pilot choice.
- [ ] **Consumer sign-up → booking submit conversion:** should be >30% (the first `pilot-consumer-*` accounts should generate real bookings in the first 48h).
- [ ] **Booking PENDING → CONFIRMED time:** pilot salons should confirm within 1h. If not, the realtime notification isn't firing.

**Rollback criteria**

If any of these trip during the 48h window, roll back to `f23f8d2` + 042:
- Consumer login broken (>5% error rate).
- Booking submission 500s (any).
- Realtime notifications silent for >4h.
- Cross-tenant data leak (anyone reports seeing another salon's data).

---

## Appendix A — Quick-copy commands

```bash
# VPS ssh
ssh root@91.99.117.168

# Apply migration 041 (do on staging first!)
docker exec -i supabase-db psql -U postgres -d postgres < /root/icut/brbr/supabase/migrations/041_marketplace_groundwork.sql

# Rollback 041
docker exec -i supabase-db psql -U postgres -d postgres < /root/icut/brbr/supabase/migrations/042_rollback_041.sql

# Seed pilots (DEV/STAGING ONLY)
npm run seed:marketplace-pilots

# Verify pilot listings
docker exec supabase-db psql -U postgres -d postgres -c "SELECT slug, gender_type, listed_on_marketplace FROM branches WHERE slug LIKE 'pilot-%';"

# Build + test
cd /Users/alkhatalrafie/icut/brbr && npm run build && npm test

# App bounce
cd /opt/brbr && docker compose down && docker compose up -d
docker compose logs -f app
```

---

## Appendix B — Partial-completion risk matrix

The ordering above is safe if you execute sequentially. The dangerous
combinations — what happens if you do some steps out of order:

| If you do… | Without first doing… | You get |
|---|---|---|
| Step 4 (apply 041) | Step 1 (rotate secrets) | Migration succeeds but any leaked SUPABASE_SERVICE_ROLE_KEY attacker now has write access to the new marketplace tables too. Broader blast radius. |
| Step 5 (seed) | Step 4 (apply 041) | `INSERT INTO branches (lat, lng, photos, listed_on_marketplace, gender_type) ...` crashes with "column does not exist". |
| Step 8 (build + smoke) | Step 2 (Mapbox) | Build passes, smoke flow 3 (checkout) fails at the address picker. Looks like a bug; is an env. |
| Step 8 (smoke) | Step 3 (Resend) | Smoke flow 4 fails at "both sides got emails" — user assumes a realtime bug; actually DNS. |
| Prod deploy | Step 5 (seed) | Consumer lands on `/barbers` → empty page → bounces. First impression gone. |
| Step 9 (GSC sitemap) | Step 7 (PWA icons) | GSC gets indexed; some users land on an "install" prompt with default icon. Cosmetic. |

---

## Appendix C — Post-launch Week 7+ (out of scope for this checklist)

Tracked in `project_pending_marketplace.md`. Not blockers for Week-6 ship:
- Capacitor wrapper (Phase 2).
- Payment gateway (Phase 2).
- Multi-city expansion beyond the first 5.
- Review-moderation tooling.

---
