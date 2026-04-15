# Sales Agent Role — Design Spec

**Date:** 2026-04-15
**Status:** Approved, ready for implementation plan

## Summary

Introduce a **sales agent** role. Sales agents visit salons in the field, pitch iCut, and close sales. Superadmin assigns leads to agents, sets each agent's first-sale and recurring-renewal commission percentages, and approves payouts. Agents see their assigned leads, convert them to salon accounts on the spot, collect payment, and track their commissions and payouts in a dedicated `/agent` surface.

## Goals

- Give superadmin a way to distribute field-sales work across multiple agents with transparent commission tracking.
- Give agents a mobile-friendly surface to manage assigned leads, convert them to paying salons, and see what they've earned.
- Automate commission accrual so the commercial state (owed / paid / reversed) is always derivable from approved payments.

## Non-goals

- No lead self-sourcing by agents (superadmin assigns all leads).
- No visit/activity history per lead (single status field, no audit log of visits).
- No automated payout disbursement (superadmin records payouts manually).
- No commission splits between multiple agents per salon.

---

## Decisions log

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Leads are created by superadmin and **assigned** to a specific agent. | Centralized lead distribution; agents don't self-prospect. |
| 2 | Superadmin creates agents in `/admin/users`. Agents log in via email+password to `/agent`. | Reuses existing auth; dedicated surface keeps concerns separate. |
| 3 | Per-agent **first-sale %** and **renewal %**, flat across all plans. | Two numbers per agent — enough flexibility without per-plan complexity. |
| 4 | Recurring commission continues **forever** as long as the salon keeps renewing. | Long-term incentive alignment; simplest mental model. |
| 5 | Single `status` field per lead (no visit history). | Keeps the model simple; matches the user's stated preference. |
| 6 | Agent converts a lead by creating the salon account AND submitting the first payment_request (cash/JazzCash collected in-person) on the salon's behalf. Attribution locks at salon creation. | Combines A + D from brainstorming — agent owns the conversion moment end-to-end. |
| 7 | Full payout workflow: commissions auto-accrue → agent requests payout → superadmin marks paid. | Level-C tracking — complete commercial ledger. |
| 8 | Agent sees: Dashboard, Leads, My Salons, Commissions, Payouts, Profile. | All six screens approved. |
| 9 | Superadmin surfaces: Agents, Leads, Commissions, Payouts, enhanced Payments. | All five admin surfaces approved. |
| 10a | Salon reassignment to a different agent is **allowed**. Past commissions stay with original agent; future renewals go to new agent. | Reality requires reassignment (agents quit, territories change). |
| 10b | Deactivating an agent only blocks login and new lead assignment. Recurring commissions continue to accrue to the deactivated agent's ledger. | Avoids perverse incentive to fire productive agents; respects "recurring forever" rule. |
| 10c | Commission clawback: if commission is still `approved` (not yet paid), reversal voids it. If already `paid`, it's marked `reversed` and shows as negative balance — superadmin decides manually whether to recover or forgive. | Protects against fraud without ugly post-paid recovery automation. |

---

## Data model

Four new tables plus additions to `salons` and `payment_requests`.

### `sales_agents`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid pk | |
| `user_id` | uuid fk → auth.users | Email login, password set via reset link |
| `name` | text | |
| `phone` | text | |
| `city` | text | |
| `active` | boolean | default true |
| `first_sale_pct` | numeric(5,2) | e.g. 20.00 = 20% |
| `renewal_pct` | numeric(5,2) | e.g. 5.00 = 5% |
| `created_at` | timestamptz | |
| `deactivated_at` | timestamptz | nullable |

### `leads`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid pk | |
| `salon_name` | text | |
| `owner_name` | text | |
| `phone` | text | |
| `city` | text | |
| `notes` | text | |
| `status` | enum | `new | contacted | visited | interested | not_interested | converted | lost` |
| `assigned_agent_id` | uuid fk → sales_agents | |
| `created_by` | uuid | superadmin user id |
| `converted_salon_id` | uuid fk → salons | nullable, set on conversion |
| `created_at`, `updated_at` | timestamptz | |

### `agent_commissions`

One row per commission event (first sale or renewal). Pct is snapshotted at accrual time so historical rows stay correct when agent rates change.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid pk | |
| `agent_id` | uuid fk → sales_agents | |
| `salon_id` | uuid fk → salons | |
| `payment_request_id` | uuid fk → payment_requests | |
| `kind` | enum | `first_sale | renewal` |
| `base_amount` | numeric | the approved payment amount |
| `pct` | numeric(5,2) | snapshot of agent's pct at accrual |
| `amount` | numeric | base × pct / 100 |
| `status` | enum | `pending | approved | paid | reversed` |
| `payout_id` | uuid fk → agent_payouts | nullable |
| `created_at` | timestamptz | |
| `settled_at` | timestamptz | nullable; set when status = paid |

### `agent_payouts`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid pk | |
| `agent_id` | uuid fk → sales_agents | |
| `requested_amount` | numeric | sum at time of request |
| `paid_amount` | numeric | nullable, set on payment |
| `method` | enum | `bank | jazzcash | cash` |
| `reference` | text | transfer reference, cheque number, etc. |
| `notes` | text | |
| `status` | enum | `requested | paid | rejected` |
| `requested_at` | timestamptz | |
| `paid_at` | timestamptz | nullable |
| `paid_by` | uuid | superadmin user id |

### Additions to existing tables

- `salons.sold_by_agent_id` — uuid fk → sales_agents, nullable. Set at salon creation; editable by superadmin (supports 10a reassignment).
- `payment_requests.source` — enum `salon_self | agent_collected`. Distinguishes owner-submitted from agent-collected payments.

### Indexes

- `agent_commissions(agent_id, status)`
- `agent_commissions(payout_id)`
- `leads(assigned_agent_id, status)`
- `salons(sold_by_agent_id)`

### RLS

All four new tables are server-action-only (restricted to `supabase_admin`), matching the existing pattern from migration 012.

---

## Auth, roles, routing

### Role resolution (`src/app/actions/auth.ts`)

Order of checks at login:

1. Email in `SUPERADMIN_EMAILS` → `role = super_admin`.
2. Email matches `sales_agents.user_id → auth.users.email` with `active = true` → `role = sales_agent`, `agentId = sales_agents.id`, `salonId = null`.
3. Otherwise → existing staff/owner/partner resolution.

Session payload adds `agentId?: string`. Zustand store gets `isSalesAgent: boolean` and `agentId`.

### Middleware (`src/proxy.ts`)

- `/agent/**` — requires `role === 'sales_agent'`. Superadmins → `/admin`. Owners/staff → `/dashboard`.
- `/admin/**` — unchanged; sales agents → `/agent`.
- `/dashboard`, salon routes — unchanged; sales agents → `/agent`.

### Post-login redirect

- super_admin → `/admin`
- sales_agent → `/agent`
- owner/staff/partner → `/dashboard` (unchanged)

### Deactivation

- `active = false` blocks login (resolution returns "inactive agent").
- Does **not** touch `agent_commissions` — renewals keep accruing into the deactivated agent's ledger.
- Reactivation flips the flag back; everything resumes.

### Agent creation flow

Superadmin form in `/admin/agents` takes email, name, phone, city, first_sale_pct, renewal_pct. Server action:

1. Creates `auth.users` with a random password.
2. Creates `sales_agents` row.
3. Emails password-reset link (same mechanic used for salon owner onboarding).

### Reassignment

Single update on `salons.sold_by_agent_id`, editable from `/admin/salons/[id]`.

---

## Commission accrual logic

### On payment approval (`approvePaymentRequest()`)

Inside the same transaction that activates the salon subscription:

1. Read `salon.sold_by_agent_id`. If null → no commission row. Done.
2. Determine `kind`:
   - Is this the **first** approved `payment_request` for this salon? → `kind = first_sale`.
   - Otherwise → `kind = renewal`.
3. Read `sales_agents.first_sale_pct` or `renewal_pct` (current value; snapshotted in step 4).
4. Insert `agent_commissions` row with `status = approved`, snapshotted `pct`, computed `amount`, `payout_id = null`.

**First-sale detection:** `count(approved payment_requests for salon_id) == 1` at the moment of this approval. No flag needed.

### Reassignment (10a)

`sold_by_agent_id` is read at approval time. Past rows already inserted carry the old agent_id. Next approved renewal after reassignment inserts with the new agent_id. Split happens naturally.

### Payment reversal (10c)

New superadmin action on approved payments. Finds `agent_commissions` rows by `payment_request_id`:

- `status = approved` → set `status = reversed`; excluded from owed totals.
- `status = paid` → set `status = reversed` (still linked to payout). Shows as negative balance on agent's ledger. Superadmin decides manually whether to recover on next payout.

Also demotes the salon subscription if the reversed payment was the current active period.

### Payout request flow

**Agent side** (`/agent/commissions`):

- "Request payout" button shows sum of `status = approved AND payout_id IS NULL` rows.
- On submit: create `agent_payouts` row (`status = requested`, `requested_amount = sum`); set `payout_id` on all selected commission rows (still `status = approved`, now locked).
- One open payout request at a time per agent — button disabled if an open one exists.

**Superadmin side** (`/admin/payouts`):

- "Mark paid" dialog: enter `paid_amount`, `method`, `reference`, `notes`. Sets payout `status = paid`, `paid_at`, `paid_by`. All linked commissions → `status = paid`, `settled_at = now`.
- "Reject" option: payout `status = rejected`; unlink commissions (`payout_id = null`, `status = approved`), agent can re-request.

### Commission status machine

```
[inserted at payment approval] ──▶ approved
        │
        ├── request payout ──▶ approved (payout_id set, locked)
        │        │
        │        ├── mark paid ──▶ paid
        │        └── reject ──▶ approved (payout_id cleared)
        │
        └── payment reversed ──▶ reversed
```

`pending` remains in the enum for future use but is unused today.

### Ledger totals (computed, not stored)

- **Lifetime earned:** `SUM(amount) WHERE status IN (approved, paid)`
- **Paid out:** `SUM(amount) WHERE status = paid`
- **Available to request:** `SUM(amount) WHERE status = approved AND payout_id IS NULL`
- **Pending payout:** `SUM(amount) WHERE status = approved AND payout_id IS NOT NULL`
- **Reversed (negative):** `SUM(amount) WHERE status = reversed`

---

## UI screens

### `/agent` surface

Dedicated layout at `src/app/agent/layout.tsx`. Matches iCut's design system (sidebar on desktop, bottom tabs on mobile, 44px touch targets, square corners, no shadows).

#### `/agent` (Dashboard)

Four metric cards: *This month earned*, *Available to request*, *Leads assigned* (open), *Salons sold* (all-time). Recent activity: last 10 commission rows + last 5 lead status changes.

#### `/agent/leads`

- Filter tabs: `All | New | Contacted | Visited | Interested | Converted | Lost`.
- Card/list view toggle (preference in localStorage, matching project convention).
- Lead card: salon name, phone, city, status pill, last-updated.
- Click → detail: all fields editable; primary CTA **"Convert to salon"** (hidden once status is `converted`).

#### Convert-to-salon dialog

Pre-fills salon name + owner name. Inputs: owner email, plan (from `platform_settings.plans`), amount collected, method (cash/JazzCash/bank), reference, optional screenshot. Single server action, single transaction:

1. Creates `auth.users` (random password) + `salons` row with `sold_by_agent_id`.
2. Inserts `payment_requests` with `source = agent_collected`, status `pending`.
3. Updates `leads.status = converted`, `converted_salon_id = <new>`.
4. Emails owner a password-reset link.

Toast on success: "Salon created. Payment pending superadmin approval — commission will accrue on approval."

#### `/agent/salons`

List of salons where `sold_by_agent_id = me`. Per row: salon name, plan, subscription status, renewal date, lifetime commission. Click → read-only detail with subscription history and all commission rows for that salon.

#### `/agent/commissions`

Summary bar: Available / Pending payout / Lifetime paid / Reversed. Ledger table: date, salon, kind, base, pct, amount, status. Primary: **"Request payout"** (disabled if Available = 0).

#### `/agent/payouts`

History of payout requests: requested date, amount, status, paid amount, method, reference.

#### `/agent/profile`

Edit name, phone. Change password (shared component).

### Superadmin additions

#### `/admin/agents` (new)

Table: name, email, city, first_sale_pct, renewal_pct, active, lifetime earned, outstanding. "New agent" dialog; row detail edits pcts, deactivate/reactivate, links to that agent's leads/salons/commissions.

#### `/admin/leads` (new)

All leads across all agents. Filters: agent, status, city. "New lead" dialog: salon name, owner name, phone, city, notes, assign to agent. Reassign action per row.

#### `/admin/commissions` (new)

Read-only audit view of `agent_commissions` across all agents. Filters: agent, status, date range, kind. No direct edits (they happen via payment approval/reversal and payout flows).

#### `/admin/payouts` (new)

List of `agent_payouts` grouped by status. "Mark paid" and "Reject" actions as described above.

#### `/admin/payments` (enhanced)

- New column: **Agent** (from `sold_by_agent_id`).
- Approval flow unchanged from user perspective; commission accrual happens in-transaction.
- New action on approved payments: **"Reverse payment"** with confirmation (warns if commission is already paid).

#### `/admin/salons/[id]` (enhanced)

New field: **Sold by agent** — dropdown of active agents, editable by superadmin (reassignment).

---

## Implementation phases

Each phase is independently deployable and testable.

**Phase 1 — Foundation.** Migration 021 + role resolution + middleware + `/agent` layout shell.

**Phase 2 — Superadmin: agents & leads.** `/admin/agents` CRUD, `/admin/leads` CRUD + assignment. New server actions `sales-agents.ts`, `leads.ts`.

**Phase 3 — Agent surface: leads + convert-to-sale.** `/agent` dashboard, `/agent/leads`, convert dialog. `payment_requests.source` set correctly. No commissions accrue yet.

**Phase 4 — Commission accrual.** Hook into `approvePaymentRequest()`, reverse-payment action, `/admin/payments` column + reverse action, `/admin/salons/[id]` reassignment, `/agent/salons`, `/agent/commissions` (read-only ledger).

**Phase 5 — Payouts.** `/agent/commissions` "Request payout" + `/agent/payouts`. `/admin/payouts` (list + mark paid + reject). `/admin/commissions` audit view.

---

## Testing plan

Vitest in `test/`, aligned with project's 100% coverage goal.

- **`test/agent-commissions.test.ts`**
  - First approved payment with agent → `kind = first_sale`, correct amount, pct snapshotted.
  - Second approved payment → `kind = renewal`, uses `renewal_pct`.
  - Salon with null `sold_by_agent_id` → no commission row.
  - Reassign after first sale → next renewal row has new agent_id; first row unchanged.
  - Reverse approved-not-paid → status `reversed`; reverse paid → `reversed` linked to payout.
  - Change agent pct after accrual → historical rows unchanged.
- **`test/agent-payouts.test.ts`**
  - Request payout → sums correctly, links rows, sets `payout_id`.
  - Mark paid → all linked rows → `paid`, `settled_at` set.
  - Reject payout → rows unlinked and requestable again.
  - Cannot request the same commission row twice.
  - Cannot open a second payout request while one is open.
- **`test/leads.test.ts`**
  - Convert-to-salon is transactional: salon + payment_request + lead update succeed together or roll back together.
  - On rollback, the `auth.users` row is cleaned up (no orphan).
- **`test/auth-sales-agent.test.ts`**
  - Login redirects by role.
  - `/agent` guard: agent allowed, others blocked.
  - Deactivated agent cannot log in.
  - Active agent cannot access `/admin` or `/dashboard`.

### Seed data (dev/demo)

One sales agent, three leads in varying statuses, one converted salon with two renewal payments → two commission rows, one payout request.

---

## Risks / sharp edges

1. **Orphan auth users.** Convert-to-salon creates an `auth.users` row; must be cleaned up on any rollback or the email becomes unusable.
2. **Paid clawback.** Reversing a payment whose commission is already `paid` is display-only (negative balance). Superadmin decides manually whether to deduct from next payout. The UI must make this obvious in both the reverse-payment confirmation and on the agent ledger.
3. **Nullable attribution.** Every salon created before this feature (and any future non-agent sign-ups) has `sold_by_agent_id = null`. All new flows must handle null gracefully — no commission row is the correct behavior.
4. **Single open payout.** Only one `status = requested` payout per agent at a time. Simpler state machine, avoids dual-locking commission rows.
