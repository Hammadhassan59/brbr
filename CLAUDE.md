@AGENTS.md

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review

## Testing

- Run: `npm test` (vitest, test directory: `test/`)
- See TESTING.md for conventions
- 100% test coverage is the goal
- When writing new functions, write a corresponding test
- When fixing a bug, write a regression test
- When adding error handling, write a test that triggers the error
- When adding a conditional, write tests for both paths
- Never commit code that makes existing tests fail

## Security hardening pass — 2026-04-16

Landed C1–C13 + most High-severity findings from the full-surface audit. Summary of what's live in prod now:

**Tenant isolation.** Every server-action that writes to per-salon tables now uses `requireAdminRole([...])` / `verifySession()` + explicit `.eq('salon_id', session.salonId)` filter + zod allow-lists (`src/lib/schemas.ts`, `src/lib/tenant-guard.ts`). Closed cross-tenant IDOR and mass-assignment on staff, clients, bills, tips, promos, packages, inventory, expenses, cash-drawer, settings, setup. `setupSalon` now requires a real auth session and derives `ownerId` from the verified JWT — no longer accepts client-supplied ownership.

**Auth architecture.** `src/proxy.ts` rewritten to `jose.jwtVerify` the HttpOnly `icut-token` cookie and derive role/sub_active from the payload; every `document.cookie = 'icut-role=...'` write killed. JWT now carries `iss/aud/kid/jti/sub_active`; `SESSION_SECRET` length floor enforced. `resolveUserRole` PostgREST `.or()` filter-injection closed; email-hijack path gated on `email_confirmed_at`. `changeAccountEmail` no longer uses `email_confirm: true` (verification link required). Admin impersonation re-verifies the super admin via `admin_users` OR `SUPERADMIN_EMAILS` env on exit.

**SECURITY DEFINER RPCs.** Migration 029 — `get_daily_summary`, `get_staff_monthly_commission`, `get_udhaar_report`, `get_client_stats` all now require `p_salon_id`, assert ownership, `EXECUTE` revoked from anon+authenticated, granted to service_role only. Callers moved into `src/app/actions/dashboard.ts`. New tables `admin_impersonation_sessions`, `admin_audit_log` added.

**Storage.** Migration 030 — `payment-screenshots` and `lead-photos` buckets flipped to private. Migration 031 — added `screenshot_path` and `photo_path` columns. `listPaymentRequests` and `listMyLeads` mint 15-min signed URLs server-side; admin payments page renders inline thumbnails; `getPaymentScreenshotUrl` and `getLeadPhotoUrl` in `src/app/actions/storage.ts` handle on-click full views.

**Rate limiting + validation.** `src/lib/rate-limit-buckets.ts` + `with-rate-limit.ts` wired into login, password-reset, signup, email-availability, payment-submit, admin-invite, agent-code-lookup, change-password. `src/lib/schemas/common.ts` has `PasswordSchema` (min 10), email/phone/UUID/amount/date/percent primitives. `MIN_PASSWORD_LENGTH` bumped to 10 for new signups/changes; existing logins keep 6 for transition. `safeError` adopted on high-value action returns.

**Infra.** `next.config.ts` CSP dropped `'unsafe-eval'`, added COOP/CORP; Caddyfile adds HSTS/nosniff/Referrer-Policy/Permissions-Policy. Dockerfile uses BuildKit `--mount=type=secret,id=nextsa_key` so the server-actions encryption key never lands in image layers (file on VPS: `/opt/brbr/secrets/nextsa_key.txt`). `docker-compose.yml` binds port 3000 to 127.0.0.1 (Caddy-only ingress). `deploy.yml` changed from `workflow_run` auto-deploy to `workflow_dispatch` + required reviewers under `environment: production` — honors the deploy-gate rule. CI actions pinned to SHAs.

**Admin sub-roles.** `requireAdminRole([...])` wired across 9 admin-action files so `customer_support`, `technical_support`, and `leads_team` can actually reach the pages `ADMIN_ROUTE_ACCESS` permits. Previously every admin action had a hard-coded `requireSuperAdmin()` that crashed the page as a "Server Components render error."

**Known unresolved (from the audit):**
- **Rotate `SESSION_SECRET` / `SUPABASE_SERVICE_ROLE_KEY` / `POSTGRES_PASSWORD` / Resend / S3 keys.** They still sit unencrypted in `~/icut/icut-handoff/*.env` from the dev-laptop era. Code is ready; user must rotate via Supabase Studio and update VPS `.env.local`.
- **Scrub git history of leaked VPS IPs** (`138.199.175.90`, `91.99.117.168`). Redacted in plan docs on-disk but still in history — requires `filter-repo`, destructive, pending user go-ahead.
- **Impersonation Supabase session redemption.** `enterDashboard` in `/admin/salons/[id]` and `exitImpersonation` callers never redeem the `supabaseAuth.tokenHash` returned by the server action, so the browser's Supabase session stays as the super-admin while the iCut JWT flips. Client-side `.from('appointments').select()` etc. hit RLS with the wrong auth-uid and return zero rows. Pre-existing bug (exists in `047ef85`), not caused by the security pass. Fix is ~5 lines: call `supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })` before the redirect.

## Post-security-pass work — 2026-04-16 evening

Five ship-and-fix cycles after the security pass, all in prod now. The rollback anchor in `~/.claude/projects/-Users-alkhatalrafie-icut/memory/project_security_rollback_point.md` moved to **`9b030b8`**.

**Admin password reset for salon owners** (`54b9b13`) — `/admin/salons/[id]` has a "Reset Owner Password" button. Generates a 16-char password server-side via `crypto.randomBytes` (unambiguous alphabet, ~93 bits of entropy), resets via Supabase Admin API, reveals the password once in a modal with copy + WhatsApp share. Server action `generateSalonOwnerPassword(salonId)` in `admin-users.ts` — super_admin + technical_support only, rate-limited 5/5min per admin+salon.

**DB-backed demo salon with 10-min reset** (`c1ec8c4` + `038aafa`) — migration 032 adds `salons.is_demo` and seeds a single shared demo salon (id `9907628b-...`) with 7 staff, 10 services, 15 products, 30 clients. Every sales-agent paired demo identity logs in as a synthetic owner of this salon (`signSession` flips to `role:'owner'`, `salonId=DEMO_SALON_ID`, `isDemo:true`). Dashboard shows an amber "DEMO MODE — resets every 10 min · [Exit to Agent Panel]" banner. `/api/cron/reset-demo` now also runs `resetDemoSalon()` each tick, wiping+reseeding appointments (30 across yesterday/today/tomorrow), bills (20), cash drawer, attendance, expenses. Catalog rows (salon/branch/staff/clients/services/products) are NOT touched — stability across resets. Admin analytics + commission queries filter out `is_demo=true` so demo data doesn't pollute real MRR, agent commissions, top-city rollups. **Known bug at ship**: initial reset seeded 0 appointments because the `appointments_no_overlap` GIST uses `COALESCE(end_time, '23:59')` — NULL end-time made every stylist's day fully booked, rejecting all but the first. `038aafa` set `end_time = start + service.duration` and all 30 land clean.

**Demo agents see POS catalog; product sales no longer pay staff commission** (`f5bd6c5`, `9b030b8`) — migration 033 extends `get_user_salon_id()` with a 4th branch that resolves active `sales_agents.is_demo=true` → the demo salon, so RLS permits reads/writes when the agent is signed in under their own Supabase auth. Without this, the POS page rendered empty for demo agents. Same migration rewrites `get_staff_monthly_commission` to pull commission basis from `bill_items` where `item_type='service'` — retail product sales no longer earn stylists a cut. Migration 034 applies the same correction to `get_daily_summary.staff_performance` (revenue + services_done become service-only) and the P&L report's client-side calc in `profit-loss/page.tsx` was rewritten to match. All three commission paths now agree: products are never a commission basis.

**Admin sub-role permissions wired** (`d7bf2f0` — during the security pass but worth recording) — every admin action had a local `requireSuperAdmin()` throwing for non-super_admin, even on pages `ADMIN_ROUTE_ACCESS` opened to sub-roles. Customer_support/technical_support/leads_team clicks caused "Server Components render error." All 9 admin action files now use `requireAdminRole([...])` from `auth.ts:622` with the correct per-page allow-lists. Write ops like `impersonateSalon`/`hardDeleteTenant` stay super_admin-only. `getPaymentScreenshotUrl` and `getLeadPhotoUrl` in `storage.ts` also opened for the appropriate sub-roles.

**Investigation findings still unfixed** (documented for future):
- **Expense visibility UX** — `expenses/page.tsx` defaults to `today` filter, so expenses added at PKT midnight boundary appear missing until the user widens the filter. Fix: 48h window default or empty-today fallback to 7d.
- **Daily report "all branches" expenses query bug** — `reports/daily/page.tsx:64` does `.eq('salon_id', …)` on `expenses` which has no `salon_id` column. Silent empty in cross-branch view.
- **Impersonation Supabase session not switched** — `enterDashboard` never redeems the `supabaseAuth.tokenHash` that `impersonateSalon()` returns. Same issue exists for the demo-agent exit flow. Means client-side `.from('appointments').select()` etc. return nothing for the impersonator — pre-existing from `047ef85`. Fix is `supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })` before the redirect.
- **Rotate `SESSION_SECRET` / `SUPABASE_SERVICE_ROLE_KEY` / other prod secrets** in `~/icut/icut-handoff/*.env` — still unrotated from the dev-laptop era.
- **Scrub git history of leaked VPS IPs** — redacted from on-disk docs but still in history.
- **`created_by` on owner-created expenses is NULL** — owners aren't `staff` rows so the FK can't resolve. Cosmetic for now.

**Known design gap (pending user decision)**:
- **Per-branch inventory** — `products.current_stock` is a single salon-level number today. Every branch shares one stock pool. User wants per-branch stock with a shared product catalog. Build scoped in conversation: new `branch_products(branch_id, product_id, current_stock, low_stock_threshold)` table; ~3 hours with 3 parallel agents, transfers-between-branches included. User said "tomorrow" — not started.

**Current prod commit: `9b030b8`** — see `~/.claude/projects/-Users-alkhatalrafie-icut/memory/project_security_rollback_point.md` for the full rollback recipe including migration reversals.
