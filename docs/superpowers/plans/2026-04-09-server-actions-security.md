# Server Actions Security Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all database writes from client-side anon key to Next.js Server Actions with JWT session verification, eliminating the security hole where the browser-exposed anon key can write to any salon's data.

**Architecture:** Create a JWT-based session system (HttpOnly cookie). Build Server Action files per domain (appointments, clients, bills, etc.) that verify the session before executing writes via service role. Update 25 page components to call Server Actions instead of direct `supabase.from().insert/update/delete()`. Finally, drop the permissive anon write RLS policies.

**Tech Stack:** Next.js 16 Server Actions, `jose` (JWT signing/verification), Supabase service role client, HttpOnly cookies via `next/headers`

---

### Task 1: Install jose and add SESSION_SECRET

**Files:**
- Modify: `package.json`
- Modify: `.env.local`
- Modify: `.env.production`

- [ ] **Step 1: Install jose**

```bash
npm install jose
```

- [ ] **Step 2: Add SESSION_SECRET to .env.local**

Generate a random secret and add to `.env.local`:

```bash
echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env.local
```

- [ ] **Step 3: Add SESSION_SECRET to .env.production**

```bash
echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env.production
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(security): install jose for JWT session tokens"
```

---

### Task 2: Create auth Server Actions (signSession, verifySession, destroySession)

**Files:**
- Create: `src/app/actions/auth.ts`
- Modify: `src/lib/supabase.ts`

- [ ] **Step 1: Update supabase.ts to support service role client**

In `src/lib/supabase.ts`, update `createServerClient()` to use the service role key:

```typescript
// Add at the top, after existing constants:
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Replace existing createServerClient:
export function createServerClient() {
  if (isDemoMode) return createDemoClient();
  const key = supabaseServiceKey || supabaseAnonKey;
  return createClient(supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
```

- [ ] **Step 2: Create src/app/actions/auth.ts**

```typescript
'use server';

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const SECRET = new TextEncoder().encode(process.env.SESSION_SECRET || 'dev-secret-change-me');
const COOKIE_NAME = 'brbr-token';

export interface SessionPayload {
  salonId: string;
  staffId: string;
  role: string;
  branchId: string;
  name: string;
}

export async function signSession(payload: SessionPayload) {
  const token = await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(SECRET);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24, // 24 hours
    path: '/',
  });

  return { success: true };
}

export async function verifySession(): Promise<SessionPayload> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    throw new Error('Not authenticated');
  }

  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    throw new Error('Invalid or expired session');
  }
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  return { success: true };
}
```

- [ ] **Step 3: Write test for auth actions**

Create `test/actions-auth.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
// Test the JWT signing/verification logic directly
// Server Actions can't be tested directly in vitest, but we can test the JWT logic

import { SignJWT, jwtVerify } from 'jose';

const SECRET = new TextEncoder().encode('test-secret');

describe('JWT session tokens', () => {
  it('should sign and verify a session payload', async () => {
    const payload = { salonId: '123', staffId: '456', role: 'owner', branchId: '789', name: 'Test' };

    const token = await new SignJWT(payload as unknown as Record<string, unknown>)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(SECRET);

    const { payload: decoded } = await jwtVerify(token, SECRET);
    expect(decoded.salonId).toBe('123');
    expect(decoded.staffId).toBe('456');
    expect(decoded.role).toBe('owner');
  });

  it('should reject tampered tokens', async () => {
    const token = 'invalid.token.here';
    await expect(jwtVerify(token, SECRET)).rejects.toThrow();
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: All tests pass including the new JWT tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/auth.ts src/lib/supabase.ts test/actions-auth.test.ts
git commit -m "feat(security): add JWT session auth actions (sign, verify, destroy)"
```

---

### Task 3: Create domain Server Actions (appointments, clients, bills)

**Files:**
- Create: `src/app/actions/appointments.ts`
- Create: `src/app/actions/clients.ts`
- Create: `src/app/actions/bills.ts`

- [ ] **Step 1: Create src/app/actions/appointments.ts**

```typescript
'use server';

import { verifySession } from './auth';
import { createServerClient } from '@/lib/supabase';

export async function createAppointment(data: {
  branchId: string;
  clientId?: string | null;
  staffId: string;
  date: string;
  startTime: string;
  endTime: string;
  isWalkin?: boolean;
  notes?: string | null;
}) {
  const session = await verifySession();
  const supabase = createServerClient();

  const { data: result, error } = await supabase
    .from('appointments')
    .insert({
      salon_id: session.salonId,
      branch_id: data.branchId,
      client_id: data.clientId || null,
      staff_id: data.staffId,
      appointment_date: data.date,
      start_time: data.startTime,
      end_time: data.endTime,
      status: 'booked',
      is_walkin: data.isWalkin || false,
      notes: data.notes || null,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: result, error: null };
}

export async function updateAppointmentStatus(id: string, status: string) {
  const session = await verifySession();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('appointments')
    .update({ status })
    .eq('id', id)
    .eq('salon_id', session.salonId);

  if (error) return { error: error.message };
  return { error: null };
}

export async function createAppointmentServices(appointmentId: string, services: Array<{
  serviceId: string;
  serviceName: string;
  price: number;
  durationMinutes: number;
}>) {
  await verifySession();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('appointment_services')
    .insert(services.map(s => ({
      appointment_id: appointmentId,
      service_id: s.serviceId,
      service_name: s.serviceName,
      price: s.price,
      duration_minutes: s.durationMinutes,
    })));

  if (error) return { error: error.message };
  return { error: null };
}
```

- [ ] **Step 2: Create src/app/actions/clients.ts**

```typescript
'use server';

import { verifySession } from './auth';
import { createServerClient } from '@/lib/supabase';

export async function createClient(data: {
  name: string;
  phone?: string | null;
  whatsapp?: string | null;
  gender?: string | null;
  notes?: string | null;
  allergyNotes?: string | null;
}) {
  const session = await verifySession();
  const supabase = createServerClient();

  const { data: result, error } = await supabase
    .from('clients')
    .insert({
      salon_id: session.salonId,
      name: data.name,
      phone: data.phone || null,
      whatsapp: data.whatsapp || null,
      gender: data.gender || null,
      notes: data.notes || null,
      allergy_notes: data.allergyNotes || null,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: result, error: null };
}

export async function updateClient(id: string, data: Record<string, unknown>) {
  const session = await verifySession();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('clients')
    .update(data)
    .eq('id', id)
    .eq('salon_id', session.salonId);

  if (error) return { error: error.message };
  return { error: null };
}
```

- [ ] **Step 3: Create src/app/actions/bills.ts**

```typescript
'use server';

import { verifySession } from './auth';
import { createServerClient } from '@/lib/supabase';

export async function createBill(data: {
  branchId: string;
  billNumber: string;
  appointmentId?: string | null;
  clientId?: string | null;
  staffId: string;
  subtotal: number;
  discountAmount?: number;
  discountType?: string | null;
  taxAmount?: number;
  tipAmount?: number;
  totalAmount: number;
  paidAmount?: number;
  paymentMethod: string;
  paymentDetails?: unknown;
  udhaarAdded?: number;
  loyaltyPointsUsed?: number;
  loyaltyPointsEarned?: number;
  promoCode?: string | null;
  notes?: string | null;
}) {
  const session = await verifySession();
  const supabase = createServerClient();

  const { data: result, error } = await supabase
    .from('bills')
    .insert({
      salon_id: session.salonId,
      branch_id: data.branchId,
      bill_number: data.billNumber,
      appointment_id: data.appointmentId || null,
      client_id: data.clientId || null,
      staff_id: data.staffId,
      subtotal: data.subtotal,
      discount_amount: data.discountAmount || 0,
      discount_type: data.discountType || null,
      tax_amount: data.taxAmount || 0,
      tip_amount: data.tipAmount || 0,
      total_amount: data.totalAmount,
      paid_amount: data.paidAmount || 0,
      payment_method: data.paymentMethod,
      payment_details: data.paymentDetails || null,
      udhaar_added: data.udhaarAdded || 0,
      loyalty_points_used: data.loyaltyPointsUsed || 0,
      loyalty_points_earned: data.loyaltyPointsEarned || 0,
      promo_code: data.promoCode || null,
      status: 'paid',
      notes: data.notes || null,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: result, error: null };
}

export async function createBillItems(billId: string, items: Array<{
  type: string;
  serviceId?: string | null;
  productId?: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}>) {
  await verifySession();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('bill_items')
    .insert(items.map(i => ({
      bill_id: billId,
      item_type: i.type,
      service_id: i.serviceId || null,
      product_id: i.productId || null,
      name: i.name,
      quantity: i.quantity,
      unit_price: i.unitPrice,
      total_price: i.totalPrice,
    })));

  if (error) return { error: error.message };
  return { error: null };
}
```

- [ ] **Step 4: Verify build**

```bash
npx next build 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/appointments.ts src/app/actions/clients.ts src/app/actions/bills.ts
git commit -m "feat(security): add server actions for appointments, clients, bills"
```

---

### Task 4: Create remaining domain Server Actions

**Files:**
- Create: `src/app/actions/staff.ts`
- Create: `src/app/actions/inventory.ts`
- Create: `src/app/actions/expenses.ts`
- Create: `src/app/actions/settings.ts`
- Create: `src/app/actions/packages.ts`

- [ ] **Step 1: Create src/app/actions/staff.ts**

Read `src/app/dashboard/staff/components/staff-form.tsx`, `src/app/dashboard/staff/[id]/page.tsx`, and `src/app/dashboard/staff/payroll/page.tsx` to find all write operations (insert/update on staff, attendance, advances tables). Create server actions for each: `createStaff`, `updateStaff`, `recordAttendance`, `recordAdvance`, `markAdvanceDeducted`.

Each action must call `verifySession()` first, use `createServerClient()`, and inject `session.salonId` instead of trusting the client.

- [ ] **Step 2: Create src/app/actions/inventory.ts**

Read `src/app/dashboard/inventory/products/page.tsx`, `src/app/dashboard/inventory/orders/page.tsx`, `src/app/dashboard/inventory/suppliers/page.tsx`. Create server actions: `createProduct`, `updateProduct`, `adjustStock`, `createPurchaseOrder`, `updateOrderStatus`, `createSupplier`, `updateSupplier`, `recordSupplierPayment`.

- [ ] **Step 3: Create src/app/actions/expenses.ts**

Read `src/app/dashboard/expenses/page.tsx`. Create: `createExpense`, `updateExpense`, `deleteExpense`.

- [ ] **Step 4: Create src/app/actions/settings.ts**

Read `src/app/dashboard/settings/page.tsx`. Create: `updateSalon`, `createService`, `updateService`, `deleteService`, `updateWorkingHours`, `updatePaymentSettings`, `updateTaxSettings`.

- [ ] **Step 5: Create src/app/actions/packages.ts**

Read `src/app/dashboard/packages/page.tsx`, `packages/loyalty/page.tsx`, `packages/promos/page.tsx`. Create: `createPackage`, `updatePackage`, `createPromo`, `updatePromo`, `updateLoyaltyRules`.

- [ ] **Step 6: Verify build**

```bash
npx next build 2>&1 | tail -5
```

- [ ] **Step 7: Commit**

```bash
git add src/app/actions/staff.ts src/app/actions/inventory.ts src/app/actions/expenses.ts src/app/actions/settings.ts src/app/actions/packages.ts
git commit -m "feat(security): add server actions for staff, inventory, expenses, settings, packages"
```

---

### Task 5: Wire login to set JWT session cookie

**Files:**
- Modify: `src/app/login/page.tsx`

- [ ] **Step 1: Import signSession and update login flows**

In `src/app/login/page.tsx`:

1. Add import: `import { signSession } from '@/app/actions/auth'`

2. In `handleOwnerLogin()`, after setting Zustand state and before `router.push('/dashboard')`, add:
```typescript
await signSession({
  salonId: salon.id,
  staffId: data.user.id,
  role: 'owner',
  branchId: mainBranch?.id || '',
  name: 'Owner',
});
```

3. In the staff/partner login success handler (after setting Zustand state from the API response), add similar `signSession()` call with the staff/partner data.

4. Keep the old `setSessionCookie()` calls for backward compatibility with the Zustand-based auth check in the layout.

- [ ] **Step 2: Wire logout to destroy session**

In `src/app/dashboard/layout.tsx`, in the logout button onClick handler, add:
```typescript
import { destroySession } from '@/app/actions/auth';
// In the onClick:
await destroySession();
```

- [ ] **Step 3: Verify build and test login manually**

```bash
npx next build 2>&1 | tail -5
```

Test: login as demo owner, check browser DevTools → Application → Cookies. Should see `brbr-token` as HttpOnly.

- [ ] **Step 4: Commit**

```bash
git add src/app/login/page.tsx src/app/dashboard/layout.tsx
git commit -m "feat(security): set JWT session cookie on login, clear on logout"
```

---

### Task 6: Migrate page components to use Server Actions (batch 1 — core pages)

**Files:**
- Modify: `src/app/dashboard/appointments/components/new-appointment-modal.tsx`
- Modify: `src/app/dashboard/clients/new/page.tsx`
- Modify: `src/app/dashboard/clients/[id]/edit/page.tsx`
- Modify: `src/app/dashboard/pos/page.tsx`

- [ ] **Step 1: Migrate new-appointment-modal.tsx writes**

Find all `supabase.from('appointments').insert(...)` and `supabase.from('appointment_services').insert(...)` calls. Replace with imports from `@/app/actions/appointments`:

```typescript
import { createAppointment, createAppointmentServices } from '@/app/actions/appointments';
import { createClient as createNewClient } from '@/app/actions/clients';
```

Replace the insert calls. Keep all SELECT/read queries using the existing `supabase` client. Only change INSERT/UPDATE/DELETE operations.

- [ ] **Step 2: Migrate client create/edit pages**

Replace `supabase.from('clients').insert(...)` and `.update(...)` with server action calls.

- [ ] **Step 3: Migrate POS page writes**

Replace bill creation, bill items, stock movements, client updates (udhaar, loyalty) with server action calls. This is the most complex page — read carefully and replace each write individually.

- [ ] **Step 4: Verify build**

```bash
npx next build 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/appointments/components/new-appointment-modal.tsx src/app/dashboard/clients/new/page.tsx src/app/dashboard/clients/[id]/edit/page.tsx src/app/dashboard/pos/page.tsx
git commit -m "feat(security): migrate core page writes to server actions (appointments, clients, POS)"
```

---

### Task 7: Migrate page components (batch 2 — staff, inventory, expenses)

**Files:**
- Modify: `src/app/dashboard/staff/components/staff-form.tsx`
- Modify: `src/app/dashboard/staff/[id]/page.tsx`
- Modify: `src/app/dashboard/staff/payroll/page.tsx`
- Modify: `src/app/dashboard/inventory/products/page.tsx`
- Modify: `src/app/dashboard/inventory/orders/page.tsx`
- Modify: `src/app/dashboard/inventory/suppliers/page.tsx`
- Modify: `src/app/dashboard/expenses/page.tsx`

- [ ] **Step 1: Migrate staff writes**

In staff-form.tsx: replace `supabase.from('staff').insert/update(...)` with server actions.
In staff/[id]/page.tsx: replace attendance, advance writes.
In payroll: replace any write operations.

- [ ] **Step 2: Migrate inventory writes**

In products/page.tsx: replace product create/update, stock adjustment, product-service-link writes.
In orders/page.tsx: replace order create, status update.
In suppliers/page.tsx: replace supplier create/update, payment recording.

- [ ] **Step 3: Migrate expenses writes**

Replace expense create/update/delete with server actions.

- [ ] **Step 4: Verify build**

```bash
npx next build 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/staff/ src/app/dashboard/inventory/ src/app/dashboard/expenses/page.tsx
git commit -m "feat(security): migrate staff, inventory, expenses writes to server actions"
```

---

### Task 8: Migrate page components (batch 3 — settings, packages, remaining)

**Files:**
- Modify: `src/app/dashboard/settings/page.tsx`
- Modify: `src/app/dashboard/packages/page.tsx`
- Modify: `src/app/dashboard/packages/loyalty/page.tsx`
- Modify: `src/app/dashboard/packages/promos/page.tsx`
- Modify: `src/app/dashboard/clients/[id]/page.tsx`
- Modify: `src/app/dashboard/appointments/page.tsx`
- Modify: `src/app/setup/page.tsx`

- [ ] **Step 1: Migrate settings writes**

Replace all salon update, service CRUD, working hours update, payment settings, tax settings writes.

- [ ] **Step 2: Migrate packages/promos/loyalty writes**

Replace package create/update, promo create/update, loyalty rules update.

- [ ] **Step 3: Migrate remaining writes**

Client detail page (udhaar payments, notes), appointments page (status updates, walk-in queue), setup wizard (salon creation).

- [ ] **Step 4: Verify build**

```bash
npx next build 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/settings/ src/app/dashboard/packages/ src/app/dashboard/clients/ src/app/dashboard/appointments/ src/app/setup/
git commit -m "feat(security): migrate settings, packages, remaining pages to server actions"
```

---

### Task 9: Drop anon write RLS policies

**Files:**
- Create: `supabase/migrations/006_remove_anon_write_policies.sql`

- [ ] **Step 1: Create migration**

```sql
-- ═══════════════════════════════════════
-- BrBr Migration 006: Remove anon write policies
-- Writes now go through server actions using service role.
-- Keep SELECT policies for client-side reads.
-- ═══════════════════════════════════════

DROP POLICY IF EXISTS "Anon can manage branches by salon" ON branches;
DROP POLICY IF EXISTS "Anon can manage staff by salon" ON staff;
DROP POLICY IF EXISTS "Anon can manage services by salon" ON services;
DROP POLICY IF EXISTS "Anon can manage pricing" ON service_staff_pricing;
DROP POLICY IF EXISTS "Anon can manage clients by salon" ON clients;
DROP POLICY IF EXISTS "Anon can manage appointments by salon" ON appointments;
DROP POLICY IF EXISTS "Anon can manage appointment services" ON appointment_services;
DROP POLICY IF EXISTS "Anon can manage bills by salon" ON bills;
DROP POLICY IF EXISTS "Anon can manage bill items" ON bill_items;
DROP POLICY IF EXISTS "Anon can manage attendance" ON attendance;
DROP POLICY IF EXISTS "Anon can manage advances" ON advances;
DROP POLICY IF EXISTS "Anon can manage tips" ON tips;
DROP POLICY IF EXISTS "Anon can manage products by salon" ON products;
DROP POLICY IF EXISTS "Anon can manage product service links" ON product_service_links;
DROP POLICY IF EXISTS "Anon can manage stock movements" ON stock_movements;
DROP POLICY IF EXISTS "Anon can manage suppliers by salon" ON suppliers;
DROP POLICY IF EXISTS "Anon can manage purchase orders" ON purchase_orders;
DROP POLICY IF EXISTS "Anon can manage packages by salon" ON packages;
DROP POLICY IF EXISTS "Anon can manage client packages" ON client_packages;
DROP POLICY IF EXISTS "Anon can manage promo codes by salon" ON promo_codes;
DROP POLICY IF EXISTS "Anon can manage loyalty rules by salon" ON loyalty_rules;
DROP POLICY IF EXISTS "Anon can manage cash drawers" ON cash_drawers;
DROP POLICY IF EXISTS "Anon can manage expenses" ON expenses;
DROP POLICY IF EXISTS "Anon can manage udhaar payments" ON udhaar_payments;
DROP POLICY IF EXISTS "Anon can view salon partners" ON salon_partners;
```

- [ ] **Step 2: Apply migration to Supabase**

Execute via the pg/query endpoint using the service role key (same method used for migrations 001-005).

- [ ] **Step 3: Verify the warnings are gone**

Check Supabase linter — the 22 `rls_policy_always_true` warnings should be resolved.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/006_remove_anon_write_policies.sql
git commit -m "feat(security): drop anon write RLS policies — writes now via service role"
```

---

### Task 10: Fix function search_path warnings

**Files:**
- Create: `supabase/migrations/007_fix_function_search_path.sql`

- [ ] **Step 1: Create migration**

```sql
-- Fix function search_path security warnings
ALTER FUNCTION public.get_user_salon_id() SET search_path = public;
ALTER FUNCTION public.get_daily_summary(uuid, date) SET search_path = public;
ALTER FUNCTION public.get_staff_monthly_commission(uuid, int, int) SET search_path = public;
ALTER FUNCTION public.get_udhaar_report(uuid) SET search_path = public;
ALTER FUNCTION public.get_client_stats(uuid) SET search_path = public;
```

- [ ] **Step 2: Apply migration**

Execute via pg/query endpoint. (Already done earlier in the session, but include in migration file for future deploys.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/007_fix_function_search_path.sql
git commit -m "feat(security): fix function search_path for all RPC functions"
```

---

### Task 11: Full verification

- [ ] **Step 1: Build check**

```bash
npx next build 2>&1 | tail -10
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

- [ ] **Step 3: Manual QA**

Login as demo owner on localhost:3000. Test these write flows:
- Create appointment → should work via server action
- Add client → should work
- Create bill in POS → should work
- Add staff → should work
- Add product → should work
- Record expense → should work
- Update settings → should work

- [ ] **Step 4: Security verification**

Open browser DevTools → Network tab. Verify write requests go to server actions (POST to the page URL), NOT directly to Supabase REST API.

Extract the anon key from the page source. Try a direct curl write:
```bash
curl -X POST "https://brbr.whitedraft.com/rest/v1/clients" \
  -H "apikey: <anon-key>" \
  -H "Content-Type: application/json" \
  -d '{"salon_id":"test","name":"hacker"}'
```

Expected: 403 or empty result (RLS blocks the write).

- [ ] **Step 5: Deploy to server**

```bash
rsync -azP --delete --exclude node_modules --exclude .git --exclude '.next/cache' --exclude .env.local \
  -e "ssh -i ~/.ssh/brbr-hetzner" \
  /Users/user1/brbr/ root@138.199.175.90:/opt/brbr-app/

ssh -i ~/.ssh/brbr-hetzner root@138.199.175.90 "cd /opt/brbr-app && npm install && npx next build && systemctl restart brbr-app"
```
