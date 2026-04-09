# Server Actions Security Refactor

**Date:** 2026-04-09
**Status:** Approved
**Scope:** Move all database writes from client-side Supabase calls to Next.js Server Actions with session verification.

## Problem

The app uses the Supabase anon key in the browser with `USING (true)` RLS policies. Anyone who extracts the anon key from DevTools can read/write any salon's data. This is a critical security hole for multi-tenant production use.

## Architecture

**Current:** Browser → Supabase (anon key, no row isolation)
**New:** Browser → Server Action (verifies session JWT) → Supabase (service role key)

Reads (SELECT) stay client-side with anon key for now. Only writes (INSERT/UPDATE/DELETE) move to Server Actions. Phase 2 can lock down reads later.

## Session Token

Replace plain `brbr-session=1` cookie with a signed JWT:

- Created on login (both owner and staff/partner flows)
- Payload: `{ salonId: string, staffId: string, role: string, branchId: string }`
- Signed with `SUPABASE_JWT_SECRET` or a dedicated `SESSION_SECRET` env var
- Stored as HttpOnly, Secure, SameSite=Strict cookie named `brbr-token`
- 24-hour expiry
- Server Actions call `verifySession()` which decodes the JWT and returns the payload, or throws

## Server Action Files

```
src/app/actions/
  auth.ts            — signSession(), verifySession(), destroySession()
  appointments.ts    — createAppointment(), updateAppointmentStatus(), cancelAppointment()
  clients.ts         — createClient(), updateClient()
  bills.ts           — createBill(), updateBill(), voidBill()
  staff.ts           — createStaff(), updateStaff(), recordAttendance(), recordAdvance()
  inventory.ts       — createProduct(), updateProduct(), adjustStock(), createOrder(), updateOrderStatus()
  expenses.ts        — createExpense(), updateExpense(), deleteExpense()
  settings.ts        — updateSalon(), updateServices(), updateWorkingHours()
  packages.ts        — createPackage(), updatePackage(), createPromo(), updatePromo()
  suppliers.ts       — createSupplier(), updateSupplier(), recordPayment()
  udhaar.ts          — recordUdhaarPayment()
```

Each file:
- Starts with `'use server'`
- Calls `verifySession()` as first line
- Uses `createServerClient()` from `src/lib/supabase.ts` (service role)
- Returns `{ data, error }` shape matching current supabase pattern
- Validates `salonId` matches the session before any write

## Page Component Changes

25 page components currently do direct `supabase.from().insert/update/delete()` calls.

Each write call changes from:
```tsx
const { error } = await supabase.from('clients').insert({ salon_id: salon.id, name, phone })
```
To:
```tsx
import { createClient } from '@/app/actions/clients'
const { error } = await createClient({ name, phone })
// salon_id injected by server action from session — never trust client
```

Key principle: the client never sends `salon_id`. The server action reads it from the verified JWT. This prevents a client from writing to another salon's data.

Reads stay as-is:
```tsx
// This is fine — anon SELECT policies stay
const { data } = await supabase.from('clients').select('*').eq('salon_id', salon.id)
```

## Login Flow Changes

### Owner login (Supabase Auth)
After `supabase.auth.signInWithPassword()` succeeds:
1. Query salon by owner_id
2. Call `signSession({ salonId, staffId: owner.id, role: 'owner', branchId })`
3. This sets the HttpOnly JWT cookie

### Staff/Partner login (phone+PIN)
After API route verifies PIN:
1. Response includes staff/partner data
2. Call `signSession(...)` with staff data
3. Sets the HttpOnly JWT cookie

### Logout
Call `destroySession()` which clears the cookie.

## RLS Policy Migration (006)

After all writes go through server actions (service role), run migration:

```sql
-- Drop all anon write policies (keep SELECT ones)
-- For each table: drop "Anon can manage X" policy
-- Keep "Anon can view X" policies for client-side reads
```

This removes the 22 `rls_policy_always_true` warnings from Supabase linter.

## Files Modified

- **New:** ~12 server action files in `src/app/actions/`
- **New:** 1 migration file `supabase/migrations/006_remove_anon_write_policies.sql`
- **Modified:** `src/app/login/page.tsx` — set JWT cookie on login
- **Modified:** `src/app/dashboard/layout.tsx` — clear JWT on logout
- **Modified:** 25 page components — swap write calls to server actions
- **Modified:** `src/lib/supabase.ts` — ensure `createServerClient()` works in server actions
- **Modified:** `.env.local` / `.env.production` — add `SESSION_SECRET`

## Out of Scope

- PIN hashing (separate task)
- Read-side lockdown (phase 2 — scope anon SELECT to salon_id)
- Middleware-based auth (not needed — server actions verify per-call)
- Supabase Auth for staff (they stay on phone+PIN)

## Testing

- Existing 20 vitest tests should still pass (they test utility functions, not DB)
- Manual QA: login as demo owner, perform writes on each page, verify they work
- Security check: open DevTools, extract anon key, try direct write via curl — should fail after RLS migration
