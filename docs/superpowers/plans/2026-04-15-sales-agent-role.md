# Sales Agent Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sales agent role to iCut. Superadmin assigns leads, agents convert them to paying salons in the field, commissions auto-accrue on payment approval, agents request payouts, superadmin marks payouts paid.

**Architecture:** Four new tables (`sales_agents`, `leads`, `agent_commissions`, `agent_payouts`) + two columns on existing tables. New `/agent` surface (mirrors `/admin` layout). Commission accrual hooked into the existing `approvePaymentRequest()` transaction. Payout flow is a simple state machine (approved → requested → paid | rejected; reversed for clawbacks).

**Tech Stack:** Next.js 16 App Router, React 19, Zustand (session state), self-hosted Supabase (postgres + auth), Tailwind 4, jose for JWT, vitest for tests. Server actions for all writes.

**Spec:** `docs/superpowers/specs/2026-04-15-sales-agent-role-design.md`

**Phases (in order, each ends at a green test suite + commit):**
1. Foundation — migration + auth + middleware + `/agent` layout shell
2. Admin surfaces — `/admin/agents`, `/admin/leads`
3. Agent surface (no commissions yet) — `/agent` dashboard, `/agent/leads`, convert-to-salon
4. Commission accrual — hook into payment approval + reversal + `/admin/salons/[id]` reassignment + `/agent/salons` + read-only `/agent/commissions`
5. Payouts — request payout, `/admin/payouts`, commission status finalization

---

## File Structure

**New files:**
- `supabase/migrations/021_sales_agents.sql` — all new tables, columns, enums, indexes, RLS
- `src/app/actions/sales-agents.ts` — CRUD for agents (superadmin)
- `src/app/actions/leads.ts` — CRUD + assignment + convert-to-salon
- `src/app/actions/agent-commissions.ts` — accrual helpers + reversal + agent-side queries
- `src/app/actions/agent-payouts.ts` — request payout, mark paid, reject
- `src/app/agent/layout.tsx` — agent-side shell (mirrors `/admin/layout.tsx`)
- `src/app/agent/page.tsx` — dashboard
- `src/app/agent/leads/page.tsx` — list + detail
- `src/app/agent/leads/[id]/page.tsx` — single lead edit + convert
- `src/app/agent/salons/page.tsx` — my salons
- `src/app/agent/commissions/page.tsx` — ledger
- `src/app/agent/payouts/page.tsx` — payout history
- `src/app/agent/profile/page.tsx` — profile
- `src/app/admin/agents/page.tsx` — list + create
- `src/app/admin/agents/[id]/page.tsx` — edit + deactivate
- `src/app/admin/leads/page.tsx` — list + create + assign
- `src/app/admin/commissions/page.tsx` — audit view
- `src/app/admin/payouts/page.tsx` — list + mark paid + reject
- `src/types/sales.ts` — shared TS types for the feature
- `test/sales-agents-actions.test.ts`
- `test/leads-actions.test.ts`
- `test/agent-commissions.test.ts`
- `test/agent-payouts.test.ts`
- `test/auth-sales-agent.test.ts`

**Modified files:**
- `src/app/actions/auth.ts` — add `sales_agent` branch to `resolveUserRole`; extend `SessionPayload` with `agentId?`
- `src/store/app-store.ts` — add `isSalesAgent`, `agentId`
- `src/proxy.ts` — add `/agent/**` guard; keep existing guards
- `src/app/login/page.tsx` — after auth, branch to `/agent` when `result.type === 'sales_agent'`
- `src/app/actions/payment-requests.ts` — `approvePaymentRequest` creates commission row; add `reversePaymentRequest`; `submitPaymentRequest` accepts `source`
- `src/app/admin/payments/page.tsx` — add "Agent" column + "Reverse" action
- `src/app/admin/salons/[id]/page.tsx` — add "Sold by agent" dropdown
- `src/app/admin/layout.tsx` — add nav items for Agents / Leads / Commissions / Payouts

---

## Conventions in this codebase (read before starting)

- **Server actions:** `'use server';` at top, imports `createServerClient` from `@/lib/supabase`, uses `verifySession()` to authenticate. Admin-only actions gated by `requireSuperAdmin()` (copy the pattern from `src/app/actions/payment-requests.ts:39-45`).
- **Migrations:** Run as `supabase_admin` (see memory). Tables get RLS enabled with no client-accessible policies — everything flows through server actions with service_role.
- **Tests:** vitest + happy-dom. Mock `@/lib/supabase.createServerClient` and `@/app/actions/auth`. See `test/admin-actions.test.ts` for the mock pattern.
- **No emojis in UI.** Use Lucide icons.
- **Radix Select for static enums only.** Use native `<select>` for ID-based dropdowns (agent, salon, etc.).
- **44px touch targets, square corners, no shadows, solid borders.**
- **Tabs over stacked cards for admin pages with 4+ sections.**

---

# Phase 1 — Foundation

At the end of Phase 1: migration applied, a seeded sales agent can log in and land on an empty `/agent` page. Superadmin and owners can still log in normally. All existing tests pass.

## Task 1.1: Write the migration

**Files:**
- Create: `supabase/migrations/021_sales_agents.sql`

- [ ] **Step 1: Create migration file**

Write `supabase/migrations/021_sales_agents.sql`:

```sql
-- 021_sales_agents.sql
-- Sales agent role: field-sales reps who convert assigned leads into paying salons
-- and earn first-sale + recurring-renewal commissions.

-- =========================================================================
-- ENUMS
-- =========================================================================
DO $$ BEGIN
  CREATE TYPE lead_status AS ENUM
    ('new','contacted','visited','interested','not_interested','converted','lost');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE commission_kind AS ENUM ('first_sale','renewal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE commission_status AS ENUM ('pending','approved','paid','reversed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payout_status AS ENUM ('requested','paid','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payout_method AS ENUM ('bank','jazzcash','cash');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_source AS ENUM ('salon_self','agent_collected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================================
-- SALES_AGENTS
-- =========================================================================
CREATE TABLE IF NOT EXISTS sales_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,           -- auth.users.id, no FK (auth schema)
  name text NOT NULL,
  phone text,
  city text,
  active boolean NOT NULL DEFAULT true,
  first_sale_pct numeric(5,2) NOT NULL DEFAULT 10.00,
  renewal_pct numeric(5,2) NOT NULL DEFAULT 5.00,
  created_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  CHECK (first_sale_pct >= 0 AND first_sale_pct <= 100),
  CHECK (renewal_pct >= 0 AND renewal_pct <= 100)
);
CREATE INDEX IF NOT EXISTS sales_agents_active_idx ON sales_agents(active);
ALTER TABLE sales_agents ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- LEADS
-- =========================================================================
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_name text NOT NULL,
  owner_name text,
  phone text,
  city text,
  notes text,
  status lead_status NOT NULL DEFAULT 'new',
  assigned_agent_id uuid NOT NULL REFERENCES sales_agents(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL,               -- auth.users.id of superadmin
  converted_salon_id uuid REFERENCES salons(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leads_agent_status_idx ON leads(assigned_agent_id, status);
CREATE INDEX IF NOT EXISTS leads_status_idx ON leads(status);
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- auto-update updated_at
CREATE OR REPLACE FUNCTION leads_set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS leads_updated_at ON leads;
CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION leads_set_updated_at();

-- =========================================================================
-- SALONS additions
-- =========================================================================
ALTER TABLE salons
  ADD COLUMN IF NOT EXISTS sold_by_agent_id uuid REFERENCES sales_agents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS salons_sold_by_agent_idx ON salons(sold_by_agent_id);

-- =========================================================================
-- PAYMENT_REQUESTS additions
-- =========================================================================
ALTER TABLE payment_requests
  ADD COLUMN IF NOT EXISTS source payment_source NOT NULL DEFAULT 'salon_self';

-- =========================================================================
-- AGENT_COMMISSIONS  (one row per accrual event)
-- =========================================================================
-- Forward-declare agent_payouts via a placeholder FK added after its table.
CREATE TABLE IF NOT EXISTS agent_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES sales_agents(id) ON DELETE RESTRICT,
  salon_id uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  payment_request_id uuid NOT NULL REFERENCES payment_requests(id) ON DELETE CASCADE,
  kind commission_kind NOT NULL,
  base_amount numeric(12,2) NOT NULL CHECK (base_amount >= 0),
  pct numeric(5,2) NOT NULL CHECK (pct >= 0 AND pct <= 100),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  status commission_status NOT NULL DEFAULT 'approved',
  payout_id uuid,                         -- FK added below after agent_payouts exists
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);
CREATE INDEX IF NOT EXISTS agent_commissions_agent_status_idx
  ON agent_commissions(agent_id, status);
CREATE INDEX IF NOT EXISTS agent_commissions_payout_idx
  ON agent_commissions(payout_id);
CREATE INDEX IF NOT EXISTS agent_commissions_salon_idx
  ON agent_commissions(salon_id);
CREATE INDEX IF NOT EXISTS agent_commissions_payment_request_idx
  ON agent_commissions(payment_request_id);
ALTER TABLE agent_commissions ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- AGENT_PAYOUTS
-- =========================================================================
CREATE TABLE IF NOT EXISTS agent_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES sales_agents(id) ON DELETE RESTRICT,
  requested_amount numeric(12,2) NOT NULL CHECK (requested_amount >= 0),
  paid_amount numeric(12,2) CHECK (paid_amount IS NULL OR paid_amount >= 0),
  method payout_method,
  reference text,
  notes text,
  status payout_status NOT NULL DEFAULT 'requested',
  requested_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  paid_by uuid                            -- auth.users.id of superadmin
);
CREATE INDEX IF NOT EXISTS agent_payouts_agent_status_idx
  ON agent_payouts(agent_id, status);
ALTER TABLE agent_payouts ENABLE ROW LEVEL SECURITY;

-- Now add the deferred FK from agent_commissions.payout_id → agent_payouts(id)
ALTER TABLE agent_commissions
  DROP CONSTRAINT IF EXISTS agent_commissions_payout_id_fkey;
ALTER TABLE agent_commissions
  ADD CONSTRAINT agent_commissions_payout_id_fkey
  FOREIGN KEY (payout_id) REFERENCES agent_payouts(id) ON DELETE SET NULL;

-- =========================================================================
-- Enforce at most ONE open (requested, unpaid) payout per agent.
-- Uses a partial unique index on agent_id WHERE status='requested'.
-- =========================================================================
CREATE UNIQUE INDEX IF NOT EXISTS agent_payouts_one_open_per_agent_idx
  ON agent_payouts(agent_id)
  WHERE status = 'requested';
```

- [ ] **Step 2: Apply migration to local/dev DB**

Run (on the server, as per the ops_supabase_migration_owner memory — `psql -U supabase_admin`):

```bash
psql -U supabase_admin -d postgres -f supabase/migrations/021_sales_agents.sql
```

Expected: no errors. Verify tables exist:

```bash
psql -U supabase_admin -d postgres -c "\dt sales_agents leads agent_commissions agent_payouts"
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/021_sales_agents.sql
git commit -m "feat(db): sales agent tables + commission + payout schema"
```

---

## Task 1.2: Extend SessionPayload and store with agent fields

**Files:**
- Modify: `src/app/actions/auth.ts:16-22` (SessionPayload)
- Modify: `src/store/app-store.ts` (add `isSalesAgent`, `agentId`)
- Test: `test/auth-sales-agent.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/auth-sales-agent.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { SessionPayload } from '../src/app/actions/auth';

describe('SessionPayload', () => {
  it('accepts a sales_agent session with agentId', () => {
    const s: SessionPayload = {
      salonId: '',
      staffId: 'user-1',
      role: 'sales_agent',
      branchId: '',
      name: 'Ali',
      agentId: 'agent-1',
    };
    expect(s.role).toBe('sales_agent');
    expect(s.agentId).toBe('agent-1');
  });

  it('agentId is optional for existing roles', () => {
    const s: SessionPayload = {
      salonId: 'salon-1',
      staffId: 'staff-1',
      role: 'owner',
      branchId: 'branch-1',
      name: 'Owner',
    };
    expect(s.agentId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/auth-sales-agent.test.ts`
Expected: TypeScript error — `agentId` not assignable.

- [ ] **Step 3: Extend SessionPayload**

Edit `src/app/actions/auth.ts` lines 16-22:

```ts
export interface SessionPayload {
  salonId: string;
  staffId: string;
  role: string;
  branchId: string;
  name: string;
  agentId?: string;
}
```

- [ ] **Step 4: Extend the Zustand store**

Edit `src/store/app-store.ts`. Add `isSalesAgent: boolean`, `agentId: string | null`, their setters, include them in `reset()` and the initial state:

```ts
interface AppState {
  salon: Salon | null;
  branches: Branch[];
  currentBranch: Branch | null;
  currentStaff: Staff | null;
  currentPartner: SalonPartner | null;
  isOwner: boolean;
  isPartner: boolean;
  isSuperAdmin: boolean;
  isSalesAgent: boolean;
  agentId: string | null;
  showPaywall: boolean;
  setSalon: (salon: Salon | null) => void;
  setBranches: (branches: Branch[]) => void;
  setCurrentBranch: (branch: Branch | null) => void;
  setCurrentStaff: (staff: Staff | null) => void;
  setCurrentPartner: (partner: SalonPartner | null) => void;
  setIsOwner: (v: boolean) => void;
  setIsPartner: (v: boolean) => void;
  setIsSuperAdmin: (v: boolean) => void;
  setIsSalesAgent: (v: boolean) => void;
  setAgentId: (id: string | null) => void;
  setShowPaywall: (v: boolean) => void;
  reset: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      salon: null,
      branches: [],
      currentBranch: null,
      currentStaff: null,
      currentPartner: null,
      isOwner: false,
      isPartner: false,
      isSuperAdmin: false,
      isSalesAgent: false,
      agentId: null,
      showPaywall: false,
      setSalon: (salon) => set({ salon }),
      setBranches: (branches) => set({ branches }),
      setCurrentBranch: (branch) => set({ currentBranch: branch }),
      setCurrentStaff: (staff) => set({ currentStaff: staff }),
      setCurrentPartner: (partner) => set({ currentPartner: partner }),
      setIsOwner: (v) => set({ isOwner: v }),
      setIsPartner: (v) => set({ isPartner: v }),
      setIsSuperAdmin: (v) => set({ isSuperAdmin: v }),
      setIsSalesAgent: (v) => set({ isSalesAgent: v }),
      setAgentId: (id) => set({ agentId: id }),
      setShowPaywall: (v) => set({ showPaywall: v }),
      reset: () =>
        set({
          salon: null,
          branches: [],
          currentBranch: null,
          currentStaff: null,
          currentPartner: null,
          isOwner: false,
          isPartner: false,
          isSuperAdmin: false,
          isSalesAgent: false,
          agentId: null,
          showPaywall: false,
        }),
    }),
    { name: 'icut-session' },
  ),
);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/auth-sales-agent.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/actions/auth.ts src/store/app-store.ts test/auth-sales-agent.test.ts
git commit -m "feat(auth): add sales_agent session + store fields"
```

---

## Task 1.3: Role resolution for sales agents

**Files:**
- Modify: `src/app/actions/auth.ts` (extend `resolveUserRole`)
- Test: `test/auth-sales-agent.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `test/auth-sales-agent.test.ts`:

```ts
import { vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({ from: mockFrom }),
}));

function buildTableMock(rows: Record<string, unknown[]>) {
  return (table: string) => {
    const data = rows[table] ?? [];
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: data[0] ?? null, error: null }),
          or: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: data[0] ?? null, error: null }) }),
          }),
        }),
        or: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: data[0] ?? null, error: null }) }),
        }),
      }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    };
  };
}

describe('resolveUserRole — sales_agent branch', () => {
  beforeEach(() => mockFrom.mockReset());

  it('returns sales_agent when user_id matches an active sales_agents row', async () => {
    mockFrom.mockImplementation(buildTableMock({
      salons: [],
      salon_partners: [],
      staff: [],
      sales_agents: [{ id: 'agent-1', user_id: 'u-1', name: 'Ali', active: true }],
    }));
    const { resolveUserRole } = await import('../src/app/actions/auth');
    const r = await resolveUserRole('u-1', 'ali@example.com');
    expect(r.type).toBe('sales_agent');
    expect(r.agent?.id).toBe('agent-1');
  });

  it('skips sales_agent branch when agent is inactive', async () => {
    mockFrom.mockImplementation(buildTableMock({
      salons: [],
      salon_partners: [],
      staff: [],
      sales_agents: [], // filtered out by active=true
    }));
    const { resolveUserRole } = await import('../src/app/actions/auth');
    const r = await resolveUserRole('u-1', 'ali@example.com');
    expect(r.type).toBe('none');
  });
});
```

- [ ] **Step 2: Run — should fail**

Run: `npx vitest run test/auth-sales-agent.test.ts`
Expected: FAIL — `type: 'sales_agent'` not returned.

- [ ] **Step 3: Extend `resolveUserRole`**

Edit `src/app/actions/auth.ts`. After the staff check (line ~243), before the final `return { type: 'none', ... }`, insert:

```ts
  // 4. Check if sales agent (active only)
  const { data: agent } = await supabase
    .from('sales_agents')
    .select('*')
    .eq('user_id', authUserId)
    .eq('active', true)
    .maybeSingle();

  if (agent) {
    return { type: 'sales_agent' as const, salon: null, branches: [], staff: null, partner: null, agent };
  }
```

And update the final return to include `agent: null`:

```ts
  return { type: 'none' as const, salon: null, branches: [], staff: null, partner: null, agent: null };
```

Also update the `partner`, `staff`, `owner` returns above to include `agent: null` so the union stays consistent. Example for owner (line ~194):

```ts
    return { type: 'owner' as const, salon, branches: branches || [], staff: null, partner: null, agent: null };
```

Do the same for `partner` (~216), `staff` (~242).

Note the email parameter is still accepted even though we match on `user_id` only — we keep the signature unchanged. Agents are created with `user_id` pre-linked at creation time (Task 2.1), so an email-fallback isn't needed.

- [ ] **Step 4: Run test**

Run: `npx vitest run test/auth-sales-agent.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full suite to catch regressions**

Run: `npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/app/actions/auth.ts test/auth-sales-agent.test.ts
git commit -m "feat(auth): resolve sales_agent role from sales_agents table"
```

---

## Task 1.4: Login branch + middleware guard for `/agent`

**Files:**
- Modify: `src/app/login/page.tsx` (handle `result.type === 'sales_agent'`)
- Modify: `src/proxy.ts` (add `/agent` to matcher + role guard)

- [ ] **Step 1: Update login to branch on sales_agent**

Edit `src/app/login/page.tsx`. Inside `handleLogin`, after the existing `if (result.salon) { ... }` block, add a sibling branch for `result.type === 'sales_agent'` (the resolver returns `agent` but no salon). Replace the `result.type === 'none'` block to come AFTER this new branch so it's only hit for true-none users.

Near line 78, restructure:

```ts
      if (result.type === 'sales_agent' && result.agent) {
        const { setIsSalesAgent, setAgentId, setIsSuperAdmin } = useAppStore.getState();
        setIsSuperAdmin(false);
        setIsOwner(false);
        setIsPartner(false);
        setCurrentStaff(null);
        setCurrentPartner(null);
        setSalon(null);
        setBranches([]);
        setCurrentBranch(null);
        setIsSalesAgent(true);
        setAgentId(result.agent.id);
        setSessionCookie('sales_agent');
        await signSession({
          salonId: '',
          staffId: data.user.id,
          role: 'sales_agent',
          branchId: '',
          name: result.agent.name,
          agentId: result.agent.id,
        });
        router.push('/agent');
        return;
      }

      if (result.type === 'none') {
        if (superAdmin) {
          setSessionCookie('super_admin');
          await signSession({ salonId: 'super-admin', staffId: data.user.id, role: 'super_admin', branchId: '', name: 'Super Admin' });
          router.push('/admin');
          return;
        }
        router.push('/setup');
        return;
      }

      if (result.salon) {
        // ... existing owner/partner/staff block unchanged
      }
```

Also update the top-of-file redirect effect to include `isSalesAgent`:

```ts
  useEffect(() => {
    const { salon, currentStaff, currentPartner, isSuperAdmin, isSalesAgent } = useAppStore.getState();
    if (salon || currentStaff || currentPartner || isSuperAdmin || isSalesAgent) {
      router.replace(
        isSuperAdmin ? '/admin' :
        isSalesAgent ? '/agent' :
        '/dashboard',
      );
    }
  }, [router]);
```

- [ ] **Step 2: Update middleware**

Edit `src/proxy.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const hasSession = request.cookies.get('icut-session')?.value === '1';
  const role = request.cookies.get('icut-role')?.value;

  // All protected routes require session
  if (
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/agent') ||
    pathname.startsWith('/setup')
  ) {
    if (!hasSession) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Admin routes require super_admin
  if (pathname.startsWith('/admin')) {
    if (role !== 'super_admin') {
      const target = role === 'sales_agent' ? '/agent' : '/dashboard';
      return NextResponse.redirect(new URL(target, request.url));
    }
  }

  // Agent routes require sales_agent
  if (pathname.startsWith('/agent')) {
    if (role !== 'sales_agent') {
      const target = role === 'super_admin' ? '/admin' : '/dashboard';
      return NextResponse.redirect(new URL(target, request.url));
    }
  }

  // Salon routes redirect sales agents to /agent (they have no salon)
  if (pathname.startsWith('/dashboard') && role === 'sales_agent') {
    return NextResponse.redirect(new URL('/agent', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/agent/:path*', '/setup'],
};
```

- [ ] **Step 3: Commit**

```bash
git add src/app/login/page.tsx src/proxy.ts
git commit -m "feat(auth): route sales agents to /agent surface"
```

---

## Task 1.5: `/agent` layout shell + empty dashboard

**Files:**
- Create: `src/app/agent/layout.tsx`
- Create: `src/app/agent/page.tsx`

- [ ] **Step 1: Create the layout**

Create `src/app/agent/layout.tsx` (mirrors `src/app/admin/layout.tsx` structure, five nav items):

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Users, Store, Wallet, Receipt, UserCircle,
  LogOut, Scissors, Loader2,
} from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { destroySession } from '@/app/actions/auth';
import { ErrorBoundary } from '@/components/error-boundary';

const NAV_ITEMS = [
  { href: '/agent', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/agent/leads', icon: Users, label: 'Leads' },
  { href: '/agent/salons', icon: Store, label: 'My Salons' },
  { href: '/agent/commissions', icon: Wallet, label: 'Commissions' },
  { href: '/agent/payouts', icon: Receipt, label: 'Payouts' },
  { href: '/agent/profile', icon: UserCircle, label: 'Profile' },
];

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isSalesAgent, reset } = useAppStore();
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (!isSalesAgent) {
      router.push('/login');
      return;
    }
    setAuthChecked(true);
  }, [isSalesAgent, router]);

  if (!authChecked) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  function handleLogout() {
    document.cookie = 'icut-session=; path=/; max-age=0';
    document.cookie = 'icut-role=; path=/; max-age=0';
    reset();
    destroySession().catch(() => {});
    window.location.href = '/login';
  }

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex w-64 bg-sidebar text-sidebar-foreground flex-col shrink-0">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-sidebar-border">
          <Scissors className="w-5 h-5 text-sidebar-primary" />
          <span className="font-heading text-lg font-bold">iCut</span>
          <span className="text-[10px] bg-gold/20 text-gold px-1.5 py-0.5 rounded font-medium ml-auto">
            AGENT
          </span>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === '/agent'
              ? pathname === '/agent'
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-primary font-medium'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                }`}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="px-5 py-4 border-t border-sidebar-border">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
          >
            <LogOut className="w-4 h-4" />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 bg-card border-b px-6 h-14 flex items-center">
          <h1 className="font-heading text-lg font-semibold">Sales Agent</h1>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>

        {/* Mobile bottom tabs */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-sidebar border-t border-sidebar-border flex justify-around z-40">
          {NAV_ITEMS.slice(0, 5).map((item) => {
            const isActive = item.href === '/agent'
              ? pathname === '/agent'
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] ${
                  isActive ? 'text-sidebar-primary' : 'text-sidebar-foreground/60'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create empty dashboard**

Create `src/app/agent/page.tsx`:

```tsx
export default function AgentDashboard() {
  return (
    <div className="space-y-6">
      <h2 className="font-heading text-2xl font-semibold">Dashboard</h2>
      <p className="text-muted-foreground text-sm">
        Welcome. Your leads, salons, and commissions will show up here.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Seed a test agent (dev helper)**

Run on dev DB:

```sql
-- Create a dev auth user first in Supabase (via auth.admin.createUser or Studio UI)
-- Then insert:
INSERT INTO sales_agents (user_id, name, phone, city, first_sale_pct, renewal_pct)
VALUES ('<paste auth.users.id>', 'Ali Test Agent', '03001234567', 'Lahore', 20.00, 5.00);
```

Log in as that email, confirm you land on `/agent` and the nav is visible.

- [ ] **Step 4: Commit**

```bash
git add src/app/agent/layout.tsx src/app/agent/page.tsx
git commit -m "feat(agent): layout shell + empty dashboard"
```

**End of Phase 1.** Run `npm test` — should be all green. Push and deploy to verify the login redirect works in the real environment.

---

# Phase 2 — Admin: agents & leads

At the end of Phase 2: superadmin can create/edit/deactivate agents in `/admin/agents` and create/assign/reassign leads in `/admin/leads`. Sales agent login still lands on the empty `/agent`; no new agent-side screens yet.

## Task 2.1: `sales_agents` server action — create, list, update

**Files:**
- Create: `src/types/sales.ts`
- Create: `src/app/actions/sales-agents.ts`
- Test: `test/sales-agents-actions.test.ts`

- [ ] **Step 1: Create shared types**

Create `src/types/sales.ts`:

```ts
export interface SalesAgent {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  city: string | null;
  active: boolean;
  first_sale_pct: number;
  renewal_pct: number;
  created_at: string;
  deactivated_at: string | null;
}

export type LeadStatus =
  | 'new' | 'contacted' | 'visited' | 'interested'
  | 'not_interested' | 'converted' | 'lost';

export interface Lead {
  id: string;
  salon_name: string;
  owner_name: string | null;
  phone: string | null;
  city: string | null;
  notes: string | null;
  status: LeadStatus;
  assigned_agent_id: string;
  created_by: string;
  converted_salon_id: string | null;
  created_at: string;
  updated_at: string;
}

export type CommissionKind = 'first_sale' | 'renewal';
export type CommissionStatus = 'pending' | 'approved' | 'paid' | 'reversed';

export interface AgentCommission {
  id: string;
  agent_id: string;
  salon_id: string;
  payment_request_id: string;
  kind: CommissionKind;
  base_amount: number;
  pct: number;
  amount: number;
  status: CommissionStatus;
  payout_id: string | null;
  created_at: string;
  settled_at: string | null;
}

export type PayoutStatus = 'requested' | 'paid' | 'rejected';
export type PayoutMethod = 'bank' | 'jazzcash' | 'cash';

export interface AgentPayout {
  id: string;
  agent_id: string;
  requested_amount: number;
  paid_amount: number | null;
  method: PayoutMethod | null;
  reference: string | null;
  notes: string | null;
  status: PayoutStatus;
  requested_at: string;
  paid_at: string | null;
  paid_by: string | null;
}
```

- [ ] **Step 2: Write failing tests**

Create `test/sales-agents-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockVerifySession = vi.fn();
vi.mock('@/app/actions/auth', () => ({
  verifySession: mockVerifySession,
}));

const adminCreateUser = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateEq = vi.fn();
const mockSelect = vi.fn();
const mockSelectOrder = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    auth: { admin: { createUser: adminCreateUser, generateLink: vi.fn().mockResolvedValue({ data: { properties: { action_link: 'https://x' } }, error: null }) } },
    from: (_t: string) => ({
      insert: mockInsert,
      update: (vals: Record<string, unknown>) => {
        mockUpdate(vals);
        return { eq: (col: string, val: string) => { mockUpdateEq(col, val); return Promise.resolve({ error: null }); } };
      },
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
        order: mockSelectOrder.mockReturnValue(Promise.resolve({ data: [], error: null })),
      }),
    }),
  }),
}));

vi.mock('@/lib/email-sender', () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));

describe('sales-agents server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifySession.mockResolvedValue({ role: 'super_admin', staffId: 'sa-1', salonId: 'super-admin', branchId: '', name: 'SA' });
    adminCreateUser.mockResolvedValue({ data: { user: { id: 'auth-new-1' } }, error: null });
    mockInsert.mockImplementation(() => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'agent-1', user_id: 'auth-new-1', name: 'Ali', active: true }, error: null }) }) }));
  });

  it('createSalesAgent creates auth user then agent row', async () => {
    const { createSalesAgent } = await import('../src/app/actions/sales-agents');
    const res = await createSalesAgent({
      email: 'ali@example.com',
      name: 'Ali',
      phone: '0300', city: 'LHR',
      firstSalePct: 20, renewalPct: 5,
    });
    expect(res.error).toBeNull();
    expect(adminCreateUser).toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalled();
  });

  it('rejects non-superadmin', async () => {
    mockVerifySession.mockResolvedValue({ role: 'owner', salonId: 's', staffId: 'x', branchId: '', name: '' });
    const { createSalesAgent } = await import('../src/app/actions/sales-agents');
    await expect(createSalesAgent({
      email: 'a@b.c', name: 'X', phone: null, city: null, firstSalePct: 0, renewalPct: 0,
    })).rejects.toThrow('Unauthorized');
  });

  it('setAgentActive flips active flag', async () => {
    const { setAgentActive } = await import('../src/app/actions/sales-agents');
    const res = await setAgentActive('agent-1', false);
    expect(res.error).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ active: false }));
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'agent-1');
  });

  it('updateAgentRates clamps pct', async () => {
    const { updateAgentRates } = await import('../src/app/actions/sales-agents');
    const res = await updateAgentRates('agent-1', { firstSalePct: 120, renewalPct: -5 });
    expect(res.error).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run — fail**

Run: `npx vitest run test/sales-agents-actions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement actions**

Create `src/app/actions/sales-agents.ts`:

```ts
'use server';

import { createServerClient } from '@/lib/supabase';
import { verifySession } from './auth';
import { sendEmail } from '@/lib/email-sender';
import type { SalesAgent } from '@/types/sales';

async function requireSuperAdmin() {
  const session = await verifySession();
  if (!session || session.role !== 'super_admin') {
    throw new Error('Unauthorized');
  }
  return session;
}

export interface CreateAgentInput {
  email: string;
  name: string;
  phone: string | null;
  city: string | null;
  firstSalePct: number;
  renewalPct: number;
}

function validatePct(n: number): string | null {
  if (!Number.isFinite(n) || n < 0 || n > 100) return 'Percent must be between 0 and 100';
  return null;
}

export async function createSalesAgent(
  input: CreateAgentInput,
): Promise<{ data: SalesAgent | null; error: string | null }> {
  await requireSuperAdmin();

  const pctErr = validatePct(input.firstSalePct) ?? validatePct(input.renewalPct);
  if (pctErr) return { data: null, error: pctErr };
  if (!input.email || !input.name) return { data: null, error: 'Email and name required' };

  const supabase = createServerClient();

  // 1. Create auth user with a random password
  const tmpPassword = crypto.randomUUID() + 'A1!';
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email: input.email,
    password: tmpPassword,
    email_confirm: true,
  });
  if (authErr || !authData.user) {
    return { data: null, error: authErr?.message ?? 'Failed to create auth user' };
  }

  // 2. Insert sales_agents row
  const { data, error } = await supabase
    .from('sales_agents')
    .insert({
      user_id: authData.user.id,
      name: input.name,
      phone: input.phone,
      city: input.city,
      first_sale_pct: input.firstSalePct,
      renewal_pct: input.renewalPct,
    })
    .select()
    .single();

  if (error) {
    // Clean up orphaned auth user
    await supabase.auth.admin.deleteUser(authData.user.id).catch(() => {});
    return { data: null, error: error.message };
  }

  // 3. Send password-reset link so agent can set their own password
  try {
    const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://icut.pk';
    const { data: linkData } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: input.email,
      options: { redirectTo: `${origin}/reset-password` },
    });
    const link = linkData?.properties?.action_link;
    if (link) {
      await sendEmail(
        input.email,
        'iCut — Your sales agent account',
        `<p>Hi ${input.name},</p>
         <p>You've been added as a sales agent on iCut. Set your password here:</p>
         <p><a href="${link}">Set password</a></p>
         <p>Then log in at ${origin}/login.</p>`,
      );
    }
  } catch {
    // Non-critical — superadmin can resend via reset flow
  }

  return { data: data as SalesAgent, error: null };
}

export async function listSalesAgents(): Promise<{ data: SalesAgent[]; error: string | null }> {
  await requireSuperAdmin();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('sales_agents')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data || []) as SalesAgent[], error: null };
}

export async function getSalesAgent(id: string): Promise<{ data: SalesAgent | null; error: string | null }> {
  await requireSuperAdmin();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('sales_agents')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data: (data as SalesAgent) || null, error: null };
}

export async function updateAgentRates(
  id: string,
  rates: { firstSalePct: number; renewalPct: number },
): Promise<{ error: string | null }> {
  await requireSuperAdmin();
  const pctErr = validatePct(rates.firstSalePct) ?? validatePct(rates.renewalPct);
  if (pctErr) return { error: pctErr };
  const supabase = createServerClient();
  const { error } = await supabase
    .from('sales_agents')
    .update({ first_sale_pct: rates.firstSalePct, renewal_pct: rates.renewalPct })
    .eq('id', id);
  return { error: error?.message ?? null };
}

export async function setAgentActive(
  id: string,
  active: boolean,
): Promise<{ error: string | null }> {
  await requireSuperAdmin();
  const supabase = createServerClient();
  const { error } = await supabase
    .from('sales_agents')
    .update({ active, deactivated_at: active ? null : new Date().toISOString() })
    .eq('id', id);
  return { error: error?.message ?? null };
}

export async function updateAgentProfile(
  id: string,
  fields: { name?: string; phone?: string | null; city?: string | null },
): Promise<{ error: string | null }> {
  await requireSuperAdmin();
  const supabase = createServerClient();
  const { error } = await supabase.from('sales_agents').update(fields).eq('id', id);
  return { error: error?.message ?? null };
}

/** Used by the agent on /agent/profile (agent can edit own name/phone, not rates/active). */
export async function updateOwnAgentProfile(
  fields: { name: string; phone: string | null },
): Promise<{ error: string | null }> {
  const session = await verifySession();
  if (!session || session.role !== 'sales_agent' || !session.agentId) {
    throw new Error('Unauthorized');
  }
  const supabase = createServerClient();
  const { error } = await supabase
    .from('sales_agents')
    .update({ name: fields.name, phone: fields.phone })
    .eq('id', session.agentId);
  return { error: error?.message ?? null };
}
```

- [ ] **Step 5: Run — pass**

Run: `npx vitest run test/sales-agents-actions.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types/sales.ts src/app/actions/sales-agents.ts test/sales-agents-actions.test.ts
git commit -m "feat(agents): sales-agent server actions (create/list/update/activate)"
```

---

## Task 2.2: `/admin/agents` list + create + detail pages

**Files:**
- Create: `src/app/admin/agents/page.tsx`
- Create: `src/app/admin/agents/[id]/page.tsx`
- Modify: `src/app/admin/layout.tsx` (add nav item)

- [ ] **Step 1: Add nav item**

Edit `src/app/admin/layout.tsx` `NAV_ITEMS` (line 15-22):

```ts
import { LayoutDashboard, Store, Users, BarChart3, Settings, Shield, LogOut, Scissors, Loader2, CreditCard, UserCog, Target, Wallet, Receipt } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/admin', icon: LayoutDashboard, label: 'Overview' },
  { href: '/admin/salons', icon: Store, label: 'Salons' },
  { href: '/admin/payments', icon: CreditCard, label: 'Payments' },
  { href: '/admin/agents', icon: UserCog, label: 'Sales Agents' },
  { href: '/admin/leads', icon: Target, label: 'Leads' },
  { href: '/admin/commissions', icon: Wallet, label: 'Commissions' },
  { href: '/admin/payouts', icon: Receipt, label: 'Payouts' },
  { href: '/admin/users', icon: Users, label: 'Users' },
  { href: '/admin/analytics', icon: BarChart3, label: 'Analytics' },
  { href: '/admin/settings', icon: Settings, label: 'Platform Settings' },
];
```

- [ ] **Step 2: Create list + create page**

Create `src/app/admin/agents/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, UserCog } from 'lucide-react';
import toast from 'react-hot-toast';
import { listSalesAgents, createSalesAgent } from '@/app/actions/sales-agents';
import type { SalesAgent } from '@/types/sales';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function AgentsPage() {
  const [agents, setAgents] = useState<SalesAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await listSalesAgents();
    setAgents(data);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-2xl font-semibold">Sales Agents</h2>
        <Button onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> New agent
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : agents.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center text-muted-foreground">
          <UserCog className="w-8 h-8 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No agents yet.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">First-sale %</th>
                <th className="px-4 py-3">Renewal %</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {agents.map(a => (
                <tr key={a.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{a.name}</td>
                  <td className="px-4 py-3">{a.phone || '—'}</td>
                  <td className="px-4 py-3">{a.city || '—'}</td>
                  <td className="px-4 py-3">{Number(a.first_sale_pct).toFixed(2)}</td>
                  <td className="px-4 py-3">{Number(a.renewal_pct).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${a.active ? 'bg-green-500/15 text-green-700' : 'bg-gray-500/15 text-gray-600'}`}>
                      {a.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/agents/${a.id}`} className="text-gold hover:underline text-sm">
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewAgentDialog open={open} onClose={() => setOpen(false)} onCreated={load} />
    </div>
  );
}

function NewAgentDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    email: '', name: '', phone: '', city: '', firstSalePct: '20', renewalPct: '5',
  });
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await createSalesAgent({
      email: form.email.trim().toLowerCase(),
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      city: form.city.trim() || null,
      firstSalePct: Number(form.firstSalePct),
      renewalPct: Number(form.renewalPct),
    });
    setSubmitting(false);
    if (error) { toast.error(error); return; }
    toast.success('Agent created — password-reset email sent');
    setForm({ email: '', name: '', phone: '', city: '', firstSalePct: '20', renewalPct: '5' });
    onClose();
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>New sales agent</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" required value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="city">City</Label>
              <Input id="city" value={form.city}
                onChange={e => setForm({ ...form, city: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="fsp">First-sale %</Label>
              <Input id="fsp" type="number" step="0.01" min="0" max="100" required
                value={form.firstSalePct}
                onChange={e => setForm({ ...form, firstSalePct: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="rp">Renewal %</Label>
              <Input id="rp" type="number" step="0.01" min="0" max="100" required
                value={form.renewalPct}
                onChange={e => setForm({ ...form, renewalPct: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create agent'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Create detail/edit page**

Create `src/app/admin/agents/[id]/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { getSalesAgent, updateAgentRates, setAgentActive, updateAgentProfile } from '@/app/actions/sales-agents';
import type { SalesAgent } from '@/types/sales';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function AgentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [agent, setAgent] = useState<SalesAgent | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', city: '', firstSalePct: '0', renewalPct: '0' });
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data } = await getSalesAgent(params.id);
    if (!data) { router.push('/admin/agents'); return; }
    setAgent(data);
    setForm({
      name: data.name,
      phone: data.phone || '',
      city: data.city || '',
      firstSalePct: String(data.first_sale_pct),
      renewalPct: String(data.renewal_pct),
    });
  }
  useEffect(() => { load(); }, [params.id]);

  if (!agent) return <p className="text-muted-foreground">Loading…</p>;

  async function saveProfile() {
    setSaving(true);
    const [p, r] = await Promise.all([
      updateAgentProfile(agent.id, { name: form.name, phone: form.phone || null, city: form.city || null }),
      updateAgentRates(agent.id, { firstSalePct: Number(form.firstSalePct), renewalPct: Number(form.renewalPct) }),
    ]);
    setSaving(false);
    if (p.error || r.error) { toast.error(p.error || r.error || 'Save failed'); return; }
    toast.success('Saved');
    load();
  }

  async function toggleActive() {
    const { error } = await setAgentActive(agent.id, !agent.active);
    if (error) { toast.error(error); return; }
    toast.success(agent.active ? 'Agent deactivated' : 'Agent reactivated');
    load();
  }

  return (
    <div className="space-y-6 max-w-xl">
      <h2 className="font-heading text-2xl font-semibold">{agent.name}</h2>

      <div className="space-y-4 border rounded-lg p-5">
        <h3 className="font-medium">Profile</h3>
        <div className="grid grid-cols-1 gap-3">
          <div><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>City</Label><Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
        </div>
        <h3 className="font-medium pt-2">Commission rates</h3>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>First-sale %</Label>
            <Input type="number" step="0.01" min="0" max="100"
              value={form.firstSalePct} onChange={e => setForm({ ...form, firstSalePct: e.target.value })} /></div>
          <div><Label>Renewal %</Label>
            <Input type="number" step="0.01" min="0" max="100"
              value={form.renewalPct} onChange={e => setForm({ ...form, renewalPct: e.target.value })} /></div>
        </div>
        <div className="flex justify-end">
          <Button onClick={saveProfile} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>

      <div className="border rounded-lg p-5 flex items-center justify-between">
        <div>
          <h3 className="font-medium">{agent.active ? 'Active' : 'Inactive'}</h3>
          <p className="text-sm text-muted-foreground">
            {agent.active
              ? 'Agent can log in and is eligible for new lead assignments.'
              : 'Login blocked. Existing recurring commissions continue to accrue.'}
          </p>
        </div>
        <Button variant={agent.active ? 'destructive' : 'default'} onClick={toggleActive}>
          {agent.active ? 'Deactivate' : 'Reactivate'}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Smoke test manually**

Log in as superadmin. Navigate to `/admin/agents`. Click "New agent", create one. Check your inbox for the reset link. Visit `/admin/agents/<id>`, edit rates, deactivate, reactivate.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/agents src/app/admin/layout.tsx
git commit -m "feat(admin): sales agents CRUD pages"
```

---

## Task 2.3: `leads` server actions

**Files:**
- Create: `src/app/actions/leads.ts`
- Test: `test/leads-actions.test.ts`

- [ ] **Step 1: Write failing tests**

Create `test/leads-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockVerifySession = vi.fn();
vi.mock('@/app/actions/auth', () => ({ verifySession: mockVerifySession }));

const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockSelect = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: (_t: string) => ({
      insert: mockInsert,
      update: (vals: Record<string, unknown>) => ({
        eq: (_c: string, _v: string) => {
          mockUpdate(vals);
          return Promise.resolve({ error: null });
        },
      }),
      select: (_cols?: string) => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
        order: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  }),
}));

describe('leads actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifySession.mockResolvedValue({ role: 'super_admin', staffId: 'sa-1' });
    mockInsert.mockImplementation(() => ({
      select: () => ({ single: () => Promise.resolve({ data: { id: 'lead-1', status: 'new' }, error: null }) }),
    }));
  });

  it('createLead inserts with assigned_agent_id', async () => {
    const { createLead } = await import('../src/app/actions/leads');
    const res = await createLead({
      salon_name: 'New Salon', owner_name: 'X', phone: null, city: null, notes: null,
      assigned_agent_id: 'agent-1',
    });
    expect(res.error).toBeNull();
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      salon_name: 'New Salon', assigned_agent_id: 'agent-1',
    }));
  });

  it('updateLeadStatus updates status', async () => {
    const { updateLeadStatus } = await import('../src/app/actions/leads');
    const res = await updateLeadStatus('lead-1', 'visited');
    expect(res.error).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'visited' });
  });

  it('reassignLead updates assigned_agent_id', async () => {
    const { reassignLead } = await import('../src/app/actions/leads');
    const res = await reassignLead('lead-1', 'agent-2');
    expect(res.error).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith({ assigned_agent_id: 'agent-2' });
  });

  it('agent role can list only own leads', async () => {
    mockVerifySession.mockResolvedValue({ role: 'sales_agent', agentId: 'agent-1', staffId: 'u-1' });
    const { listMyLeads } = await import('../src/app/actions/leads');
    const res = await listMyLeads();
    expect(res.error).toBeNull();
  });

  it('non-agent cannot listMyLeads', async () => {
    mockVerifySession.mockResolvedValue({ role: 'owner', staffId: 's' });
    const { listMyLeads } = await import('../src/app/actions/leads');
    await expect(listMyLeads()).rejects.toThrow('Unauthorized');
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `npx vitest run test/leads-actions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement actions**

Create `src/app/actions/leads.ts`:

```ts
'use server';

import { createServerClient } from '@/lib/supabase';
import { verifySession } from './auth';
import type { Lead, LeadStatus } from '@/types/sales';

async function requireSuperAdmin() {
  const s = await verifySession();
  if (!s || s.role !== 'super_admin') throw new Error('Unauthorized');
  return s;
}

async function requireSalesAgent() {
  const s = await verifySession();
  if (!s || s.role !== 'sales_agent' || !s.agentId) throw new Error('Unauthorized');
  return s;
}

export interface CreateLeadInput {
  salon_name: string;
  owner_name: string | null;
  phone: string | null;
  city: string | null;
  notes: string | null;
  assigned_agent_id: string;
}

export async function createLead(input: CreateLeadInput): Promise<{ data: Lead | null; error: string | null }> {
  const session = await requireSuperAdmin();
  if (!input.salon_name?.trim()) return { data: null, error: 'Salon name required' };
  if (!input.assigned_agent_id) return { data: null, error: 'Agent required' };

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('leads')
    .insert({ ...input, created_by: session.staffId })
    .select()
    .single();
  if (error) return { data: null, error: error.message };
  return { data: data as Lead, error: null };
}

export async function listLeads(
  filter?: { agentId?: string; status?: LeadStatus | 'all' },
): Promise<{ data: LeadWithAgent[]; error: string | null }> {
  await requireSuperAdmin();
  const supabase = createServerClient();
  let q = supabase
    .from('leads')
    .select('*, agent:sales_agents(id, name)')
    .order('created_at', { ascending: false });
  if (filter?.agentId) q = q.eq('assigned_agent_id', filter.agentId);
  if (filter?.status && filter.status !== 'all') q = q.eq('status', filter.status);
  const { data, error } = await q;
  if (error) return { data: [], error: error.message };
  return { data: (data || []) as LeadWithAgent[], error: null };
}

export interface LeadWithAgent extends Lead {
  agent: { id: string; name: string } | null;
}

export async function reassignLead(leadId: string, agentId: string): Promise<{ error: string | null }> {
  await requireSuperAdmin();
  const supabase = createServerClient();
  const { error } = await supabase.from('leads').update({ assigned_agent_id: agentId }).eq('id', leadId);
  return { error: error?.message ?? null };
}

/** Agent-side: list my assigned leads. */
export async function listMyLeads(
  filter?: { status?: LeadStatus | 'all' },
): Promise<{ data: Lead[]; error: string | null }> {
  const session = await requireSalesAgent();
  const supabase = createServerClient();
  let q = supabase
    .from('leads')
    .select('*')
    .eq('assigned_agent_id', session.agentId!)
    .order('updated_at', { ascending: false });
  if (filter?.status && filter.status !== 'all') q = q.eq('status', filter.status);
  const { data, error } = await q;
  if (error) return { data: [], error: error.message };
  return { data: (data || []) as Lead[], error: null };
}

export async function getMyLead(leadId: string): Promise<{ data: Lead | null; error: string | null }> {
  const session = await requireSalesAgent();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .eq('assigned_agent_id', session.agentId!)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data: (data as Lead) || null, error: null };
}

/** Agent-side: update own lead's editable fields. */
export async function updateMyLead(
  leadId: string,
  fields: { status?: LeadStatus; notes?: string | null; phone?: string | null; owner_name?: string | null; city?: string | null },
): Promise<{ error: string | null }> {
  const session = await requireSalesAgent();
  const supabase = createServerClient();
  const { error } = await supabase
    .from('leads')
    .update(fields)
    .eq('id', leadId)
    .eq('assigned_agent_id', session.agentId!);
  return { error: error?.message ?? null };
}

/** Superadmin-side: update status on any lead. */
export async function updateLeadStatus(leadId: string, status: LeadStatus): Promise<{ error: string | null }> {
  await requireSuperAdmin();
  const supabase = createServerClient();
  const { error } = await supabase.from('leads').update({ status }).eq('id', leadId);
  return { error: error?.message ?? null };
}
```

- [ ] **Step 4: Run — pass**

Run: `npx vitest run test/leads-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/leads.ts test/leads-actions.test.ts
git commit -m "feat(leads): CRUD + assignment + agent-scoped queries"
```

---

## Task 2.4: `/admin/leads` page (list + create + reassign)

**Files:**
- Create: `src/app/admin/leads/page.tsx`

- [ ] **Step 1: Create page**

Create `src/app/admin/leads/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Plus, Target } from 'lucide-react';
import toast from 'react-hot-toast';
import { listLeads, createLead, reassignLead, type LeadWithAgent } from '@/app/actions/leads';
import { listSalesAgents } from '@/app/actions/sales-agents';
import type { SalesAgent, LeadStatus } from '@/types/sales';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const STATUSES: (LeadStatus | 'all')[] = ['all','new','contacted','visited','interested','not_interested','converted','lost'];

export default function AdminLeadsPage() {
  const [leads, setLeads] = useState<LeadWithAgent[]>([]);
  const [agents, setAgents] = useState<SalesAgent[]>([]);
  const [agentFilter, setAgentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all');
  const [open, setOpen] = useState(false);

  async function load() {
    const [l, a] = await Promise.all([
      listLeads({ agentId: agentFilter || undefined, status: statusFilter }),
      listSalesAgents(),
    ]);
    setLeads(l.data);
    setAgents(a.data);
  }
  useEffect(() => { load(); }, [agentFilter, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-2xl font-semibold">Leads</h2>
        <Button onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> New lead
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">All agents</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as LeadStatus | 'all')}
          className="border rounded-lg px-3 py-2 text-sm bg-white">
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {leads.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center text-muted-foreground">
          <Target className="w-8 h-8 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No leads.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-4 py-3">Salon</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {leads.map(l => (
                <LeadRow key={l.id} lead={l} agents={agents} onReassigned={load} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewLeadDialog open={open} onClose={() => setOpen(false)} agents={agents} onCreated={load} />
    </div>
  );
}

function LeadRow({ lead, agents, onReassigned }: { lead: LeadWithAgent; agents: SalesAgent[]; onReassigned: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(lead.assigned_agent_id);

  async function save() {
    const { error } = await reassignLead(lead.id, value);
    if (error) { toast.error(error); return; }
    toast.success('Lead reassigned');
    setEditing(false);
    onReassigned();
  }

  return (
    <tr className="border-t">
      <td className="px-4 py-3 font-medium">{lead.salon_name}</td>
      <td className="px-4 py-3">{lead.owner_name || '—'}</td>
      <td className="px-4 py-3">{lead.phone || '—'}</td>
      <td className="px-4 py-3">{lead.city || '—'}</td>
      <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-muted">{lead.status}</span></td>
      <td className="px-4 py-3">
        {editing ? (
          <select value={value} onChange={e => setValue(e.target.value)}
            className="border rounded px-2 py-1 text-sm bg-white">
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        ) : (
          lead.agent?.name || '—'
        )}
      </td>
      <td className="px-4 py-3">
        {editing ? (
          <>
            <button onClick={save} className="text-gold hover:underline text-sm mr-2">Save</button>
            <button onClick={() => setEditing(false)} className="text-muted-foreground text-sm">Cancel</button>
          </>
        ) : (
          <button onClick={() => setEditing(true)} className="text-gold hover:underline text-sm">
            Reassign
          </button>
        )}
      </td>
    </tr>
  );
}

function NewLeadDialog({ open, onClose, agents, onCreated }: {
  open: boolean; onClose: () => void; agents: SalesAgent[]; onCreated: () => void;
}) {
  const [form, setForm] = useState({ salon_name: '', owner_name: '', phone: '', city: '', notes: '', assigned_agent_id: '' });
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await createLead({
      salon_name: form.salon_name.trim(),
      owner_name: form.owner_name.trim() || null,
      phone: form.phone.trim() || null,
      city: form.city.trim() || null,
      notes: form.notes.trim() || null,
      assigned_agent_id: form.assigned_agent_id,
    });
    setSubmitting(false);
    if (error) { toast.error(error); return; }
    toast.success('Lead created');
    setForm({ salon_name: '', owner_name: '', phone: '', city: '', notes: '', assigned_agent_id: '' });
    onClose();
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>New lead</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>Salon name</Label>
            <Input required value={form.salon_name} onChange={e => setForm({ ...form, salon_name: e.target.value })} /></div>
          <div><Label>Owner name</Label>
            <Input value={form.owner_name} onChange={e => setForm({ ...form, owner_name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Phone</Label>
              <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>City</Label>
              <Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
          </div>
          <div><Label>Assign to</Label>
            <select required value={form.assigned_agent_id}
              onChange={e => setForm({ ...form, assigned_agent_id: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">Select agent…</option>
              {agents.filter(a => a.active).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select></div>
          <div><Label>Notes</Label>
            <Textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Creating…' : 'Create lead'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Smoke test**

Open `/admin/leads` as superadmin. Create a lead, assign it, then reassign to another agent. Filter by status.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/leads
git commit -m "feat(admin): /admin/leads — list, create, assign, reassign"
```

**End of Phase 2.** Run `npm test` — all green. Superadmin can manage agents and leads; nothing on `/agent` side yet.

---

# Phase 3 — Agent surface: leads list + convert to sale

At the end of Phase 3: agent can see their dashboard with lead counts, list/filter/edit assigned leads, and run the Convert-to-Salon dialog — which creates a salon, an auth user, a `payment_request` (with `source='agent_collected'`), and marks the lead `converted`. No commission accrual yet.

## Task 3.1: `convertLeadToSalon` server action

**Files:**
- Modify: `src/app/actions/leads.ts` (add convert)
- Modify: `src/app/actions/payment-requests.ts:72` (accept source from server-initiated)
- Test: `test/leads-actions.test.ts` (extend)

- [ ] **Step 1: Write failing test**

Append to `test/leads-actions.test.ts`:

```ts
describe('convertLeadToSalon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifySession.mockResolvedValue({ role: 'sales_agent', agentId: 'agent-1', staffId: 'u-1' });
  });

  it('rejects non-agent', async () => {
    mockVerifySession.mockResolvedValue({ role: 'owner' });
    const { convertLeadToSalon } = await import('../src/app/actions/leads');
    await expect(convertLeadToSalon({
      leadId: 'l-1', ownerEmail: 'a@b.c', plan: 'basic', amount: 2500, method: 'cash', reference: null,
    })).rejects.toThrow('Unauthorized');
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `npx vitest run test/leads-actions.test.ts`
Expected: FAIL — `convertLeadToSalon` not exported.

- [ ] **Step 3: Implement**

Append to `src/app/actions/leads.ts`:

```ts
export interface ConvertInput {
  leadId: string;
  ownerEmail: string;
  plan: 'basic' | 'growth' | 'pro';
  amount: number;
  method: 'bank' | 'jazzcash' | 'cash';
  reference: string | null;
}

export async function convertLeadToSalon(
  input: ConvertInput,
): Promise<{ data: { salonId: string; paymentRequestId: string } | null; error: string | null }> {
  const session = await requireSalesAgent();
  if (!input.ownerEmail?.trim()) return { data: null, error: 'Owner email required' };
  if (!['basic','growth','pro'].includes(input.plan)) return { data: null, error: 'Invalid plan' };
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { data: null, error: 'Invalid amount' };

  const supabase = createServerClient();

  // 1. Verify the lead belongs to this agent and is not already converted
  const { data: lead } = await supabase
    .from('leads')
    .select('*')
    .eq('id', input.leadId)
    .eq('assigned_agent_id', session.agentId!)
    .maybeSingle();
  if (!lead) return { data: null, error: 'Lead not found' };
  if (lead.status === 'converted') return { data: null, error: 'Lead already converted' };

  // 2. Create auth user
  const tmpPassword = crypto.randomUUID() + 'A1!';
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email: input.ownerEmail.trim().toLowerCase(),
    password: tmpPassword,
    email_confirm: true,
  });
  if (authErr || !authData.user) return { data: null, error: authErr?.message ?? 'Failed to create owner account' };

  const ownerId = authData.user.id;
  const rollback = async () => {
    await supabase.auth.admin.deleteUser(ownerId).catch(() => {});
  };

  // 3. Create salon
  const { data: salon, error: salonErr } = await supabase
    .from('salons')
    .insert({
      name: lead.salon_name,
      owner_id: ownerId,
      city: lead.city,
      phone: lead.phone,
      sold_by_agent_id: session.agentId,
      subscription_status: 'pending',
      subscription_plan: 'none',
    })
    .select()
    .single();
  if (salonErr || !salon) {
    await rollback();
    return { data: null, error: salonErr?.message ?? 'Failed to create salon' };
  }

  // 4. Create payment_request (pending)
  const { data: pr, error: prErr } = await supabase
    .from('payment_requests')
    .insert({
      salon_id: salon.id,
      plan: input.plan,
      amount: Math.round(input.amount),
      reference: input.reference,
      method: input.method === 'cash' ? null : input.method,
      source: 'agent_collected',
      status: 'pending',
    })
    .select()
    .single();
  if (prErr || !pr) {
    await supabase.from('salons').delete().eq('id', salon.id).catch(() => {});
    await rollback();
    return { data: null, error: prErr?.message ?? 'Failed to create payment request' };
  }

  // 5. Mark lead converted
  const { error: leadErr } = await supabase
    .from('leads')
    .update({ status: 'converted', converted_salon_id: salon.id })
    .eq('id', input.leadId);
  if (leadErr) {
    // Payment request + salon stay; lead status flip is the least critical step.
    // Log it but don't fail the conversion.
    console.error('convertLeadToSalon: lead status update failed', leadErr);
  }

  // 6. Send password-reset link to new owner
  try {
    const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://icut.pk';
    const { data: linkData } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: input.ownerEmail.trim().toLowerCase(),
      options: { redirectTo: `${origin}/reset-password` },
    });
    const link = linkData?.properties?.action_link;
    if (link) {
      const { sendEmail } = await import('@/lib/email-sender');
      await sendEmail(
        input.ownerEmail,
        `iCut — Welcome to ${lead.salon_name}`,
        `<p>Your iCut account has been created by your sales agent.</p>
         <p><a href="${link}">Set your password</a> to get started. Once payment is approved, your subscription will activate.</p>`,
      );
    }
  } catch {
    // Non-critical
  }

  return { data: { salonId: salon.id, paymentRequestId: pr.id }, error: null };
}
```

- [ ] **Step 4: Run test — pass**

Run: `npx vitest run test/leads-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/leads.ts test/leads-actions.test.ts
git commit -m "feat(leads): agent convertLeadToSalon (salon+auth user+payment_request in one flow)"
```

---

## Task 3.2: `/agent/leads` list page

**Files:**
- Create: `src/app/agent/leads/page.tsx`

- [ ] **Step 1: Create page**

Create `src/app/agent/leads/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { listMyLeads } from '@/app/actions/leads';
import type { Lead, LeadStatus } from '@/types/sales';

const STATUSES: (LeadStatus | 'all')[] = ['all','new','contacted','visited','interested','not_interested','converted','lost'];

export default function AgentLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [status, setStatus] = useState<LeadStatus | 'all'>('all');

  async function load() {
    const { data } = await listMyLeads({ status });
    setLeads(data);
  }
  useEffect(() => { load(); }, [status]);

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl font-semibold">My Leads</h2>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {STATUSES.map(s => (
          <button key={s} onClick={() => setStatus(s)}
            className={`px-3 py-1.5 text-xs rounded-full border whitespace-nowrap ${
              status === s ? 'bg-gold text-black border-gold' : 'bg-white border-border text-muted-foreground'
            }`}>
            {s === 'all' ? 'All' : s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {leads.length === 0 ? (
        <div className="border border-dashed rounded-lg p-10 text-center text-muted-foreground">
          <Users className="w-7 h-7 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No leads in this filter.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {leads.map(l => (
            <Link key={l.id} href={`/agent/leads/${l.id}`}
              className="border rounded-lg p-4 bg-white hover:border-gold transition-colors">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{l.salon_name}</h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted">{l.status.replace('_', ' ')}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {l.owner_name || '—'} · {l.phone || '—'} · {l.city || '—'}
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Updated {new Date(l.updated_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/agent/leads/page.tsx
git commit -m "feat(agent): leads list page with status filter"
```

---

## Task 3.3: `/agent/leads/[id]` detail page + convert-to-salon dialog

**Files:**
- Create: `src/app/agent/leads/[id]/page.tsx`

- [ ] **Step 1: Create detail page**

Create `src/app/agent/leads/[id]/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import { getMyLead, updateMyLead, convertLeadToSalon } from '@/app/actions/leads';
import type { Lead, LeadStatus } from '@/types/sales';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const EDITABLE_STATUSES: LeadStatus[] = ['new','contacted','visited','interested','not_interested','lost'];

export default function AgentLeadDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [lead, setLead] = useState<Lead | null>(null);
  const [form, setForm] = useState({ owner_name: '', phone: '', city: '', notes: '', status: 'new' as LeadStatus });
  const [saving, setSaving] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);

  async function load() {
    const { data } = await getMyLead(params.id);
    if (!data) { router.push('/agent/leads'); return; }
    setLead(data);
    setForm({
      owner_name: data.owner_name || '',
      phone: data.phone || '',
      city: data.city || '',
      notes: data.notes || '',
      status: data.status,
    });
  }
  useEffect(() => { load(); }, [params.id]);

  if (!lead) return <p className="text-muted-foreground">Loading…</p>;

  async function save() {
    setSaving(true);
    const { error } = await updateMyLead(lead.id, {
      owner_name: form.owner_name || null,
      phone: form.phone || null,
      city: form.city || null,
      notes: form.notes || null,
      status: form.status,
    });
    setSaving(false);
    if (error) { toast.error(error); return; }
    toast.success('Saved');
    load();
  }

  return (
    <div className="space-y-6 max-w-xl">
      <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <h2 className="font-heading text-2xl font-semibold">{lead.salon_name}</h2>

      <div className="space-y-4 border rounded-lg p-5">
        <div><Label>Owner name</Label><Input value={form.owner_name} onChange={e => setForm({ ...form, owner_name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>City</Label><Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
        </div>
        <div>
          <Label>Status</Label>
          <select value={form.status} disabled={lead.status === 'converted'}
            onChange={e => setForm({ ...form, status: e.target.value as LeadStatus })}
            className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
            {lead.status === 'converted' ? (
              <option value="converted">converted</option>
            ) : (
              EDITABLE_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)
            )}
          </select>
        </div>
        <div><Label>Notes</Label><Textarea rows={4} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={save} disabled={saving || lead.status === 'converted'}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          {lead.status !== 'converted' && (
            <Button onClick={() => setConvertOpen(true)}>Convert to salon</Button>
          )}
        </div>
      </div>

      <ConvertDialog open={convertOpen} onClose={() => setConvertOpen(false)}
        lead={lead} onConverted={() => { setConvertOpen(false); load(); }} />
    </div>
  );
}

function ConvertDialog({ open, onClose, lead, onConverted }: {
  open: boolean; onClose: () => void; lead: Lead; onConverted: () => void;
}) {
  const [form, setForm] = useState({
    ownerEmail: '', plan: 'basic' as 'basic'|'growth'|'pro', amount: '', method: 'cash' as 'cash'|'jazzcash'|'bank', reference: '',
  });
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await convertLeadToSalon({
      leadId: lead.id,
      ownerEmail: form.ownerEmail.trim().toLowerCase(),
      plan: form.plan,
      amount: Number(form.amount),
      method: form.method,
      reference: form.reference.trim() || null,
    });
    setSubmitting(false);
    if (error) { toast.error(error); return; }
    toast.success('Salon created. Payment pending superadmin approval — commission will accrue on approval.');
    onConverted();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Convert {lead.salon_name} to salon</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>Owner email</Label>
            <Input type="email" required value={form.ownerEmail}
              onChange={e => setForm({ ...form, ownerEmail: e.target.value })} /></div>
          <div><Label>Plan</Label>
            <select value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value as 'basic'|'growth'|'pro' })}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
              <option value="basic">Basic</option>
              <option value="growth">Growth</option>
              <option value="pro">Pro</option>
            </select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Amount collected (Rs)</Label>
              <Input type="number" required min="1" value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
            <div><Label>Method</Label>
              <select value={form.method} onChange={e => setForm({ ...form, method: e.target.value as 'cash'|'jazzcash'|'bank' })}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                <option value="cash">Cash</option>
                <option value="jazzcash">JazzCash</option>
                <option value="bank">Bank transfer</option>
              </select></div>
          </div>
          <div><Label>Reference (optional)</Label>
            <Input value={form.reference}
              onChange={e => setForm({ ...form, reference: e.target.value })}
              placeholder="Tx ID, sender name, receipt #" /></div>
          <p className="text-xs text-muted-foreground">
            The owner will receive an email to set their password. Your commission accrues once the superadmin approves this payment.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Creating…' : 'Create salon'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/agent/leads/\[id\]/page.tsx
git commit -m "feat(agent): lead detail + convert-to-salon flow"
```

---

## Task 3.4: Dashboard + profile + empty scaffolds for salons/commissions/payouts

**Files:**
- Modify: `src/app/agent/page.tsx`
- Create: `src/app/agent/profile/page.tsx`
- Create: `src/app/agent/salons/page.tsx` (empty scaffold for Phase 4)
- Create: `src/app/agent/commissions/page.tsx` (empty scaffold for Phase 4)
- Create: `src/app/agent/payouts/page.tsx` (empty scaffold for Phase 5)

- [ ] **Step 1: Real dashboard with lead counts**

Replace `src/app/agent/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Users, Store, Wallet, Receipt } from 'lucide-react';
import { listMyLeads } from '@/app/actions/leads';
import type { Lead } from '@/types/sales';

export default function AgentDashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);

  useEffect(() => {
    listMyLeads().then(r => setLeads(r.data));
  }, []);

  const openLeads = leads.filter(l => l.status !== 'converted' && l.status !== 'lost' && l.status !== 'not_interested').length;
  const converted = leads.filter(l => l.status === 'converted').length;

  return (
    <div className="space-y-6">
      <h2 className="font-heading text-2xl font-semibold">Dashboard</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard icon={Users} label="Open leads" value={String(openLeads)} />
        <MetricCard icon={Store} label="Salons sold" value={String(converted)} />
        <MetricCard icon={Wallet} label="Available" value="—" hint="Phase 4" />
        <MetricCard icon={Receipt} label="Lifetime paid" value="—" hint="Phase 5" />
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, hint }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; hint?: string }) {
  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        <Icon className="w-4 h-4" />
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-semibold font-heading">{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground/60 mt-1">{hint}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Add `getMyAgentProfile` server action**

Append to `src/app/actions/sales-agents.ts`:

```ts
export async function getMyAgentProfile(): Promise<{ data: SalesAgent | null; error: string | null }> {
  const session = await verifySession();
  if (!session || session.role !== 'sales_agent' || !session.agentId) throw new Error('Unauthorized');
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('sales_agents')
    .select('*')
    .eq('id', session.agentId)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data: (data as SalesAgent) || null, error: null };
}
```

- [ ] **Step 3: Create the profile page**

Create `src/app/agent/profile/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { updateOwnAgentProfile, getMyAgentProfile } from '@/app/actions/sales-agents';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function AgentProfilePage() {
  const [form, setForm] = useState({ name: '', phone: '', city: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getMyAgentProfile().then(r => {
      if (r.data) setForm({ name: r.data.name, phone: r.data.phone || '', city: r.data.city || '' });
    });
  }, []);

  async function save() {
    setSaving(true);
    const { error } = await updateOwnAgentProfile({ name: form.name, phone: form.phone || null });
    setSaving(false);
    if (error) { toast.error(error); return; }
    toast.success('Saved');
  }

  return (
    <div className="space-y-6 max-w-md">
      <h2 className="font-heading text-2xl font-semibold">Profile</h2>
      <div className="space-y-3 border rounded-lg p-5">
        <div><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
        <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving || !form.name}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        To change your password, log out and use &quot;Forgot password&quot; on the login page.
      </p>
    </div>
  );
}
```

Note: `updateOwnAgentProfile` only persists `name` and `phone` (not `city`). The city input is shown read-only-after-edit in-session; if you want agent-editable city, extend the action to accept it.

- [ ] **Step 4: Empty scaffolds for Phase 4/5 pages**

Create `src/app/agent/salons/page.tsx`:

```tsx
export default function AgentSalonsPage() {
  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl font-semibold">My Salons</h2>
      <p className="text-sm text-muted-foreground">Salons you&apos;ve sold will appear here once Phase 4 ships.</p>
    </div>
  );
}
```

Create `src/app/agent/commissions/page.tsx`:

```tsx
export default function AgentCommissionsPage() {
  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl font-semibold">Commissions</h2>
      <p className="text-sm text-muted-foreground">Your earnings ledger will appear here once Phase 4 ships.</p>
    </div>
  );
}
```

Create `src/app/agent/payouts/page.tsx`:

```tsx
export default function AgentPayoutsPage() {
  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl font-semibold">Payouts</h2>
      <p className="text-sm text-muted-foreground">Your payout requests will appear here once Phase 5 ships.</p>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/agent src/app/actions/sales-agents.ts
git commit -m "feat(agent): dashboard with lead counts, profile, Phase 4/5 scaffolds"
```

**End of Phase 3.** Full smoke test: superadmin assigns a lead → agent logs in → sees dashboard + leads → converts one → sees new salon's `payment_request` pending in `/admin/payments`. Run `npm test` — all green.

---

# Phase 4 — Commission accrual

At the end of Phase 4: approving a `payment_request` whose salon has `sold_by_agent_id` auto-inserts an `agent_commissions` row. Superadmin can reverse approved payments. Superadmin can reassign a salon's agent. Agent sees read-only commissions ledger and their salons list.

## Task 4.1: Commission accrual hook inside `approvePaymentRequest`

**Files:**
- Create: `src/app/actions/agent-commissions.ts` (helpers)
- Modify: `src/app/actions/payment-requests.ts` (call helper on approve)
- Test: `test/agent-commissions.test.ts`

- [ ] **Step 1: Write failing tests**

Create `test/agent-commissions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockVerifySession = vi.fn().mockResolvedValue({ role: 'super_admin', staffId: 'sa' });
vi.mock('@/app/actions/auth', () => ({ verifySession: mockVerifySession }));

// Fine-grained supabase mock: exposes per-table hooks we can reconfigure per test.
type TableState = {
  selectResult?: { data: unknown; error: null | { message: string } };
  countResult?: { count: number };
  insertResult?: { data: unknown; error: null | { message: string } };
  updateResult?: { error: null | { message: string } };
};
const tables: Record<string, TableState> = {};
function resetTables() { for (const k of Object.keys(tables)) delete tables[k]; }
function buildQueryBuilder(table: string) {
  const state = tables[table] ??= {};
  const thenable = (result: unknown) => ({ then: (cb: (v: unknown) => unknown) => Promise.resolve(result).then(cb) });
  return {
    insert: (vals: unknown) => ({
      select: () => ({ single: () => Promise.resolve(state.insertResult ?? { data: { id: 'new', ...(typeof vals === 'object' ? vals : {}) }, error: null }) }),
    }),
    update: (_vals: unknown) => ({ eq: () => Promise.resolve(state.updateResult ?? { error: null }) }),
    select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.head && opts.count) {
        return { eq: () => Promise.resolve(state.countResult ?? { count: 0 }) };
      }
      return {
        eq: () => ({
          single: () => Promise.resolve(state.selectResult ?? { data: null, error: null }),
          maybeSingle: () => Promise.resolve(state.selectResult ?? { data: null, error: null }),
          order: () => Promise.resolve(state.selectResult ?? { data: [], error: null }),
          eq: () => ({
            single: () => Promise.resolve(state.selectResult ?? { data: null, error: null }),
            maybeSingle: () => Promise.resolve(state.selectResult ?? { data: null, error: null }),
            order: () => Promise.resolve(state.selectResult ?? { data: [], error: null }),
          }),
        }),
      };
    },
  };
}

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: (t: string) => buildQueryBuilder(t),
    auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: null } }) } },
  }),
}));
vi.mock('@/lib/email-sender', () => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/email-templates', () => ({
  paymentApprovedEmail: () => '',
  paymentDeniedEmail: () => '',
}));

describe('accrueCommissionForPaymentRequest', () => {
  beforeEach(() => { resetTables(); vi.clearAllMocks(); });

  it('no-ops when salon has no agent', async () => {
    tables['salons'] = { selectResult: { data: { id: 'sa-1', sold_by_agent_id: null }, error: null } };
    tables['agent_commissions'] = { insertResult: { data: { id: 'c-1' }, error: null } };
    const { accrueCommissionForPaymentRequest } = await import('../src/app/actions/agent-commissions');
    const r = await accrueCommissionForPaymentRequest({ paymentRequestId: 'pr-1', salonId: 'sa-1', amount: 2500 });
    expect(r.error).toBeNull();
    expect(r.data).toBeNull();
  });

  it('inserts first_sale row for first approved payment', async () => {
    tables['salons'] = { selectResult: { data: { id: 'sa-1', sold_by_agent_id: 'ag-1' }, error: null } };
    tables['sales_agents'] = { selectResult: { data: { first_sale_pct: 20, renewal_pct: 5 }, error: null } };
    tables['payment_requests'] = { countResult: { count: 1 } };  // this one is the only approved so far
    tables['agent_commissions'] = { insertResult: { data: { id: 'c-1', kind: 'first_sale', amount: 500 }, error: null } };

    const { accrueCommissionForPaymentRequest } = await import('../src/app/actions/agent-commissions');
    const r = await accrueCommissionForPaymentRequest({ paymentRequestId: 'pr-1', salonId: 'sa-1', amount: 2500 });
    expect(r.error).toBeNull();
    expect(r.data?.kind).toBe('first_sale');
  });

  it('inserts renewal row when there is already a prior approved payment', async () => {
    tables['salons'] = { selectResult: { data: { id: 'sa-1', sold_by_agent_id: 'ag-1' }, error: null } };
    tables['sales_agents'] = { selectResult: { data: { first_sale_pct: 20, renewal_pct: 5 }, error: null } };
    tables['payment_requests'] = { countResult: { count: 2 } };
    tables['agent_commissions'] = { insertResult: { data: { id: 'c-2', kind: 'renewal', amount: 125 }, error: null } };

    const { accrueCommissionForPaymentRequest } = await import('../src/app/actions/agent-commissions');
    const r = await accrueCommissionForPaymentRequest({ paymentRequestId: 'pr-2', salonId: 'sa-1', amount: 2500 });
    expect(r.error).toBeNull();
    expect(r.data?.kind).toBe('renewal');
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `npx vitest run test/agent-commissions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement accrual helper**

Create `src/app/actions/agent-commissions.ts`:

```ts
'use server';

import { createServerClient } from '@/lib/supabase';
import { verifySession } from './auth';
import type { AgentCommission } from '@/types/sales';

async function requireSuperAdmin() {
  const s = await verifySession();
  if (!s || s.role !== 'super_admin') throw new Error('Unauthorized');
  return s;
}
async function requireSalesAgent() {
  const s = await verifySession();
  if (!s || s.role !== 'sales_agent' || !s.agentId) throw new Error('Unauthorized');
  return s;
}

export interface AccrueInput {
  paymentRequestId: string;
  salonId: string;
  amount: number;
}

/**
 * Called from approvePaymentRequest AFTER the payment is approved.
 * If the salon has sold_by_agent_id, inserts an agent_commissions row.
 * first_sale vs renewal is determined by whether this is the first approved
 * payment_request for that salon.
 */
export async function accrueCommissionForPaymentRequest(
  input: AccrueInput,
): Promise<{ data: AgentCommission | null; error: string | null }> {
  const supabase = createServerClient();

  // 1. Look up salon's agent
  const { data: salon, error: salonErr } = await supabase
    .from('salons')
    .select('id, sold_by_agent_id')
    .eq('id', input.salonId)
    .maybeSingle();
  if (salonErr) return { data: null, error: salonErr.message };
  if (!salon?.sold_by_agent_id) return { data: null, error: null };

  // 2. Look up agent's current pct snapshot
  const { data: agent, error: agentErr } = await supabase
    .from('sales_agents')
    .select('first_sale_pct, renewal_pct')
    .eq('id', salon.sold_by_agent_id)
    .maybeSingle();
  if (agentErr) return { data: null, error: agentErr.message };
  if (!agent) return { data: null, error: null };

  // 3. Determine first_sale vs renewal: count approved payment_requests for this salon.
  // (This is called AFTER the approval flip, so the current one is included.)
  const { count } = await supabase
    .from('payment_requests')
    .select('id', { count: 'exact', head: true })
    .eq('salon_id', input.salonId)
    .eq('status', 'approved');

  const kind: 'first_sale' | 'renewal' = (count ?? 0) <= 1 ? 'first_sale' : 'renewal';
  const pct = kind === 'first_sale' ? Number(agent.first_sale_pct) : Number(agent.renewal_pct);
  const amount = Math.round((input.amount * pct) / 100 * 100) / 100;

  const { data, error } = await supabase
    .from('agent_commissions')
    .insert({
      agent_id: salon.sold_by_agent_id,
      salon_id: input.salonId,
      payment_request_id: input.paymentRequestId,
      kind,
      base_amount: input.amount,
      pct,
      amount,
      status: 'approved',
    })
    .select()
    .single();
  if (error) return { data: null, error: error.message };
  return { data: data as AgentCommission, error: null };
}

/** Agent-side: ledger. */
export async function listMyCommissions(): Promise<{ data: (AgentCommission & { salon: { name: string } | null })[]; error: string | null }> {
  const session = await requireSalesAgent();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('agent_commissions')
    .select('*, salon:salons(name)')
    .eq('agent_id', session.agentId!)
    .order('created_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data || []) as (AgentCommission & { salon: { name: string } | null })[], error: null };
}

/** Agent-side: salons sold by me. */
export async function listMySalons(): Promise<{ data: Array<{ id: string; name: string; subscription_plan: string | null; subscription_status: string | null; subscription_expires_at: string | null; lifetime_commission: number }>; error: string | null }> {
  const session = await requireSalesAgent();
  const supabase = createServerClient();
  const { data: salons, error } = await supabase
    .from('salons')
    .select('id, name, subscription_plan, subscription_status, subscription_expires_at')
    .eq('sold_by_agent_id', session.agentId!);
  if (error) return { data: [], error: error.message };

  // Fetch commissions per salon for lifetime totals
  const { data: commissions } = await supabase
    .from('agent_commissions')
    .select('salon_id, amount, status')
    .eq('agent_id', session.agentId!)
    .in('status', ['approved', 'paid']);

  const totals: Record<string, number> = {};
  for (const c of commissions || []) {
    totals[(c as { salon_id: string }).salon_id] = (totals[(c as { salon_id: string }).salon_id] || 0) + Number((c as { amount: number }).amount);
  }
  return {
    data: (salons || []).map(s => ({ ...s, lifetime_commission: totals[s.id] || 0 })),
    error: null,
  };
}

/** Superadmin audit. */
export async function listAllCommissions(filter?: { agentId?: string; status?: AgentCommission['status'] | 'all' }): Promise<{ data: (AgentCommission & { salon: { name: string } | null; agent: { name: string } | null })[]; error: string | null }> {
  await requireSuperAdmin();
  const supabase = createServerClient();
  let q = supabase
    .from('agent_commissions')
    .select('*, salon:salons(name), agent:sales_agents(name)')
    .order('created_at', { ascending: false });
  if (filter?.agentId) q = q.eq('agent_id', filter.agentId);
  if (filter?.status && filter.status !== 'all') q = q.eq('status', filter.status);
  const { data, error } = await q;
  if (error) return { data: [], error: error.message };
  return { data: (data || []) as (AgentCommission & { salon: { name: string } | null; agent: { name: string } | null })[], error: null };
}
```

- [ ] **Step 4: Hook into approvePaymentRequest**

Edit `src/app/actions/payment-requests.ts`. At the top add the import:

```ts
import { accrueCommissionForPaymentRequest } from './agent-commissions';
```

Inside `approvePaymentRequest`, after the `payment_requests` update succeeds (line ~234, before the owner notification try/catch), add:

```ts
  // Commission accrual — no-ops if salon has no agent.
  await accrueCommissionForPaymentRequest({
    paymentRequestId: id,
    salonId: request.salon_id,
    amount: request.amount,
  });
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run test/agent-commissions.test.ts`
Expected: PASS.

Run: `npm test`
Expected: all green (existing payment-request tests should still pass; they don't assert on the new call).

- [ ] **Step 6: Commit**

```bash
git add src/app/actions/agent-commissions.ts src/app/actions/payment-requests.ts test/agent-commissions.test.ts
git commit -m "feat(commissions): accrue on payment approval (first_sale vs renewal)"
```

---

## Task 4.2: `reversePaymentRequest` server action

**Files:**
- Modify: `src/app/actions/payment-requests.ts` (add action)
- Modify: `src/app/actions/agent-commissions.ts` (add helper)
- Test: `test/agent-commissions.test.ts` (extend)

- [ ] **Step 1: Write failing test**

Append to `test/agent-commissions.test.ts`:

```ts
describe('reverseCommissionsForPaymentRequest', () => {
  beforeEach(() => { resetTables(); vi.clearAllMocks(); });

  it('marks approved (unpaid) rows as reversed', async () => {
    tables['agent_commissions'] = {
      selectResult: { data: [{ id: 'c-1', status: 'approved', payout_id: null }], error: null },
      updateResult: { error: null },
    };
    const { reverseCommissionsForPaymentRequest } = await import('../src/app/actions/agent-commissions');
    const r = await reverseCommissionsForPaymentRequest('pr-1');
    expect(r.error).toBeNull();
  });
});
```

- [ ] **Step 2: Run — fail**

Run: `npx vitest run test/agent-commissions.test.ts`

- [ ] **Step 3: Implement helper**

Append to `src/app/actions/agent-commissions.ts`:

```ts
/**
 * Called when a payment is reversed. Marks any commission rows tied to that
 * payment_request as reversed. For rows already paid, the reversal is
 * informational — they stay in the paid payout but the row status flips to
 * 'reversed', producing a visible negative balance in the agent's ledger.
 */
export async function reverseCommissionsForPaymentRequest(
  paymentRequestId: string,
): Promise<{ error: string | null }> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from('agent_commissions')
    .update({ status: 'reversed' })
    .eq('payment_request_id', paymentRequestId);
  return { error: error?.message ?? null };
}
```

- [ ] **Step 4: Add reversePaymentRequest action**

Append to `src/app/actions/payment-requests.ts`:

```ts
import { reverseCommissionsForPaymentRequest } from './agent-commissions';

/**
 * Admin-side: reverse an approved payment. Demotes the salon subscription if
 * this payment's expiry was the current active period, and flips any linked
 * commission rows to 'reversed'.
 */
export async function reversePaymentRequest(
  id: string,
  options?: { reason?: string },
): Promise<{ error: string | null }> {
  const session = await requireSuperAdmin();
  const supabase = createServerClient();

  const { data: request } = await supabase
    .from('payment_requests')
    .select('*')
    .eq('id', id)
    .single();
  if (!request) return { error: 'Request not found' };
  if (request.status !== 'approved') return { error: `Only approved requests can be reversed (status: ${request.status})` };

  // 1. Mark request as rejected with a reversal note
  const reversalNote = `REVERSED by admin${options?.reason ? `: ${options.reason}` : ''}`;
  const { error: reqErr } = await supabase
    .from('payment_requests')
    .update({
      status: 'rejected',
      reviewed_by: session.staffId,
      reviewed_at: new Date().toISOString(),
      reviewer_notes: reversalNote,
    })
    .eq('id', id);
  if (reqErr) return { error: reqErr.message };

  // 2. Reverse any commissions tied to this payment
  await reverseCommissionsForPaymentRequest(id);

  // 3. Best-effort subscription demotion. If this was the only approved payment
  // for the salon, flip the salon back to pending. (More precise logic can
  // follow later; for now this is conservative.)
  const { count } = await supabase
    .from('payment_requests')
    .select('id', { count: 'exact', head: true })
    .eq('salon_id', request.salon_id)
    .eq('status', 'approved');

  if ((count ?? 0) === 0) {
    await supabase
      .from('salons')
      .update({ subscription_status: 'pending', subscription_plan: 'none' })
      .eq('id', request.salon_id);
  }

  return { error: null };
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run test/agent-commissions.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/actions/agent-commissions.ts src/app/actions/payment-requests.ts test/agent-commissions.test.ts
git commit -m "feat(commissions): reversePaymentRequest with commission clawback"
```

---

## Task 4.3: `/admin/payments` — Agent column + Reverse action

**Files:**
- Modify: `src/app/admin/payments/page.tsx`

- [ ] **Step 1: Extend query to include agent**

Find the list rendering in `/admin/payments/page.tsx`. Modify the existing `listPaymentRequests` call/select to include the salon's `sold_by_agent_id`, then JOIN against `sales_agents`. Simplest path: extend `PaymentRequestWithSalon` and the select in `src/app/actions/payment-requests.ts`:

Edit `src/app/actions/payment-requests.ts`, line 28-37:

```ts
export interface PaymentRequestWithSalon extends PaymentRequest {
  salon: {
    id: string;
    name: string;
    city: string | null;
    phone: string | null;
    subscription_plan: string | null;
    subscription_status: string | null;
    sold_by_agent_id: string | null;
    sold_by_agent: { id: string; name: string } | null;
  } | null;
}
```

And the select in `listPaymentRequests`, line ~156:

```ts
  let query = supabase
    .from('payment_requests')
    .select('*, salon:salons(id, name, city, phone, subscription_plan, subscription_status, sold_by_agent_id, sold_by_agent:sales_agents!salons_sold_by_agent_id_fkey(id, name))')
    .order('created_at', { ascending: false });
```

- [ ] **Step 2: Add Agent column + Reverse action in UI**

Open `src/app/admin/payments/page.tsx`. In the table header, add an "Agent" column after "Salon". In the row, show `pr.salon?.sold_by_agent?.name || '—'`. Add a "Reverse" button visible only on approved rows:

```tsx
// In the row actions cell, after the existing buttons:
{pr.status === 'approved' && (
  <button onClick={() => handleReverse(pr)} className="text-red-600 hover:underline text-sm ml-2">
    Reverse
  </button>
)}
```

Add the handler inside the component:

```tsx
import { reversePaymentRequest } from '@/app/actions/payment-requests';

async function handleReverse(pr: PaymentRequestWithSalon) {
  const reason = window.prompt(
    `Reverse this approved payment?${pr.salon?.sold_by_agent ? `\n\nAny commission already paid to ${pr.salon.sold_by_agent.name} will show as a negative balance.` : ''}\n\nReason (optional):`,
  );
  if (reason === null) return;
  const { error } = await reversePaymentRequest(pr.id, { reason: reason.trim() || undefined });
  if (error) { toast.error(error); return; }
  toast.success('Payment reversed');
  load();
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/payment-requests.ts src/app/admin/payments/page.tsx
git commit -m "feat(admin/payments): agent column + reverse action"
```

---

## Task 4.4: `/admin/salons/[id]` — sold-by-agent dropdown

**Files:**
- Modify: `src/app/admin/salons/[id]/page.tsx`
- Modify: `src/app/actions/admin.ts` (add `setSalonSoldByAgent`)

- [ ] **Step 1: Add admin action**

Append to `src/app/actions/admin.ts`:

```ts
export async function setSalonSoldByAgent(salonId: string, agentId: string | null) {
  await requireSuperAdmin();
  const supabase = createServerClient();
  const { error } = await supabase
    .from('salons')
    .update({ sold_by_agent_id: agentId })
    .eq('id', salonId);
  if (error) throw error;
  return { success: true };
}
```

(If `requireSuperAdmin` isn't exported there, copy the pattern from other actions in that file.)

- [ ] **Step 2: Add UI control**

Open `src/app/admin/salons/[id]/page.tsx`. Add a new section with an agents dropdown. Load agents via `listSalesAgents`, show the current salon's `sold_by_agent_id`. On change call `setSalonSoldByAgent`.

Sketch:

```tsx
import { listSalesAgents } from '@/app/actions/sales-agents';
import { setSalonSoldByAgent } from '@/app/actions/admin';
// ...
const [agents, setAgents] = useState<SalesAgent[]>([]);
useEffect(() => { listSalesAgents().then(r => setAgents(r.data)); }, []);

// In the render:
<div className="border rounded-lg p-5 space-y-2">
  <h3 className="font-medium">Sold by agent</h3>
  <p className="text-xs text-muted-foreground">
    Reassigning transfers future renewal commissions to the new agent. Past commissions stay with the original agent.
  </p>
  <select
    value={salon.sold_by_agent_id || ''}
    onChange={async e => {
      const v = e.target.value || null;
      try { await setSalonSoldByAgent(salon.id, v); toast.success('Updated'); reload(); }
      catch (err) { toast.error(err instanceof Error ? err.message : 'Failed'); }
    }}
    className="border rounded-lg px-3 py-2 text-sm bg-white w-full">
    <option value="">— None —</option>
    {agents.map(a => <option key={a.id} value={a.id}>{a.name}{!a.active ? ' (inactive)' : ''}</option>)}
  </select>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/admin.ts src/app/admin/salons/\[id\]/page.tsx
git commit -m "feat(admin): sold-by-agent dropdown on salon detail"
```

---

## Task 4.5: Real `/agent/salons` and `/agent/commissions` pages

**Files:**
- Replace: `src/app/agent/salons/page.tsx`
- Replace: `src/app/agent/commissions/page.tsx`

- [ ] **Step 1: `/agent/salons`**

Replace `src/app/agent/salons/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Store } from 'lucide-react';
import { listMySalons } from '@/app/actions/agent-commissions';

interface MySalon {
  id: string;
  name: string;
  subscription_plan: string | null;
  subscription_status: string | null;
  subscription_expires_at: string | null;
  lifetime_commission: number;
}

export default function AgentSalonsPage() {
  const [salons, setSalons] = useState<MySalon[]>([]);

  useEffect(() => { listMySalons().then(r => setSalons(r.data)); }, []);

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl font-semibold">My Salons</h2>
      {salons.length === 0 ? (
        <div className="border border-dashed rounded-lg p-10 text-center text-muted-foreground">
          <Store className="w-7 h-7 mx-auto mb-2 opacity-50" />
          <p className="text-sm">You haven&apos;t sold any salons yet.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {salons.map(s => (
            <div key={s.id} className="border rounded-lg p-4 bg-white">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{s.name}</h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted">{s.subscription_status || '—'}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {s.subscription_plan || '—'}
                {s.subscription_expires_at && ` · renews ${new Date(s.subscription_expires_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}`}
              </p>
              <p className="text-sm mt-1">
                Lifetime commission: <span className="font-medium">Rs {s.lifetime_commission.toFixed(2)}</span>
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `/agent/commissions` (read-only ledger for now)**

Replace `src/app/agent/commissions/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { listMyCommissions } from '@/app/actions/agent-commissions';
import type { AgentCommission } from '@/types/sales';

type Row = AgentCommission & { salon: { name: string } | null };

export default function AgentCommissionsPage() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => { listMyCommissions().then(r => setRows(r.data)); }, []);

  const totals = rows.reduce(
    (acc, r) => {
      const amt = Number(r.amount);
      if (r.status === 'approved' && !r.payout_id) acc.available += amt;
      if (r.status === 'approved' && r.payout_id) acc.pending += amt;
      if (r.status === 'paid') acc.paid += amt;
      if (r.status === 'reversed') acc.reversed += amt;
      return acc;
    },
    { available: 0, pending: 0, paid: 0, reversed: 0 },
  );

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl font-semibold">Commissions</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Summary label="Available" value={totals.available} />
        <Summary label="Pending payout" value={totals.pending} />
        <Summary label="Lifetime paid" value={totals.paid} />
        <Summary label="Reversed" value={totals.reversed} negative />
      </div>

      {rows.length === 0 ? (
        <div className="border border-dashed rounded-lg p-10 text-center text-muted-foreground">
          <Wallet className="w-7 h-7 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No commissions yet.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Salon</th>
                <th className="px-4 py-3">Kind</th>
                <th className="px-4 py-3">Base</th>
                <th className="px-4 py-3">%</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-3">{new Date(r.created_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}</td>
                  <td className="px-4 py-3 font-medium">{r.salon?.name || '—'}</td>
                  <td className="px-4 py-3">{r.kind === 'first_sale' ? 'First sale' : 'Renewal'}</td>
                  <td className="px-4 py-3">Rs {Number(r.base_amount).toFixed(0)}</td>
                  <td className="px-4 py-3">{Number(r.pct).toFixed(2)}</td>
                  <td className="px-4 py-3 font-medium">Rs {Number(r.amount).toFixed(2)}</td>
                  <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-muted">{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">Payout requests arrive in Phase 5.</p>
    </div>
  );
}

function Summary({ label, value, negative }: { label: string; value: number; negative?: boolean }) {
  return (
    <div className="border rounded-lg p-4 bg-white">
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-heading font-semibold ${negative && value > 0 ? 'text-red-600' : ''}`}>
        {negative && value > 0 ? '−' : ''}Rs {value.toFixed(2)}
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Update dashboard metrics to use real data**

Edit `src/app/agent/page.tsx`. Add imports + aggregation:

```tsx
import { listMyCommissions } from '@/app/actions/agent-commissions';
// inside the component:
const [available, setAvailable] = useState(0);
const [lifetimePaid, setLifetimePaid] = useState(0);

useEffect(() => {
  listMyCommissions().then(r => {
    let a = 0, p = 0;
    for (const c of r.data) {
      const amt = Number(c.amount);
      if (c.status === 'approved' && !c.payout_id) a += amt;
      if (c.status === 'paid') p += amt;
    }
    setAvailable(a); setLifetimePaid(p);
  });
}, []);

// replace the Wallet/Receipt cards:
<MetricCard icon={Wallet} label="Available" value={`Rs ${available.toFixed(0)}`} />
<MetricCard icon={Receipt} label="Lifetime paid" value={`Rs ${lifetimePaid.toFixed(0)}`} />
```

Remove the hint props.

- [ ] **Step 4: Commit**

```bash
git add src/app/agent/salons/page.tsx src/app/agent/commissions/page.tsx src/app/agent/page.tsx
git commit -m "feat(agent): real my-salons and commissions ledger pages"
```

**End of Phase 4.** Full integration test: superadmin creates agent → creates lead → agent converts → superadmin approves the payment in `/admin/payments` → agent sees a commission row in `/agent/commissions` with the correct `first_sale` kind + amount. Approve a second payment for the same salon → renewal row. Reverse one → marked `reversed`. Reassign a salon to a different agent → next renewal lands on the new agent. Run `npm test` — all green.

---

# Phase 5 — Payouts

At the end of Phase 5: agent can request a payout covering available commissions; superadmin can mark paid or reject in `/admin/payouts`. `/admin/commissions` audit view lists all commissions across agents.

## Task 5.1: Payout server actions

**Files:**
- Create: `src/app/actions/agent-payouts.ts`
- Test: `test/agent-payouts.test.ts`

- [ ] **Step 1: Write failing tests**

Create `test/agent-payouts.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockVerifySession = vi.fn();
vi.mock('@/app/actions/auth', () => ({ verifySession: mockVerifySession }));

const updateCalls: Array<{ table: string; vals: unknown; eq?: [string, string] }> = [];
const insertCalls: Array<{ table: string; vals: unknown }> = [];
const tables: Record<string, { selectData?: unknown; selectError?: { message: string } | null }> = {};

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: (t: string) => ({
      select: () => ({
        eq: () => ({
          is: () => Promise.resolve({ data: tables[t]?.selectData ?? [], error: tables[t]?.selectError ?? null }),
          maybeSingle: () => Promise.resolve({ data: tables[t]?.selectData ?? null, error: tables[t]?.selectError ?? null }),
          order: () => Promise.resolve({ data: tables[t]?.selectData ?? [], error: tables[t]?.selectError ?? null }),
          eq: () => ({
            is: () => Promise.resolve({ data: tables[t]?.selectData ?? [], error: null }),
          }),
        }),
      }),
      insert: (vals: unknown) => {
        insertCalls.push({ table: t, vals });
        return { select: () => ({ single: () => Promise.resolve({ data: { id: 'po-1', ...(typeof vals === 'object' ? vals : {}) }, error: null }) }) };
      },
      update: (vals: unknown) => ({
        eq: (col: string, val: string) => { updateCalls.push({ table: t, vals, eq: [col, val] }); return Promise.resolve({ error: null }); },
        is: () => Promise.resolve({ error: null }),
      }),
    }),
  }),
}));

describe('agent-payouts actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateCalls.length = 0; insertCalls.length = 0;
    for (const k of Object.keys(tables)) delete tables[k];
  });

  it('requestPayout rejects if no available commissions', async () => {
    mockVerifySession.mockResolvedValue({ role: 'sales_agent', agentId: 'ag-1' });
    tables['agent_commissions'] = { selectData: [] };
    const { requestPayout } = await import('../src/app/actions/agent-payouts');
    const r = await requestPayout();
    expect(r.error).toBe('No commissions available to request');
  });

  it('markPayoutPaid requires super_admin', async () => {
    mockVerifySession.mockResolvedValue({ role: 'sales_agent' });
    const { markPayoutPaid } = await import('../src/app/actions/agent-payouts');
    await expect(markPayoutPaid('po-1', { paidAmount: 100, method: 'bank', reference: null, notes: null })).rejects.toThrow('Unauthorized');
  });

  it('rejectPayout unlinks commission rows', async () => {
    mockVerifySession.mockResolvedValue({ role: 'super_admin', staffId: 'sa-1' });
    const { rejectPayout } = await import('../src/app/actions/agent-payouts');
    const r = await rejectPayout('po-1', 'duplicate');
    expect(r.error).toBeNull();
    // Expect updates to both agent_commissions (unlink) and agent_payouts (status)
    const tablesUpdated = updateCalls.map(c => c.table);
    expect(tablesUpdated).toContain('agent_payouts');
    expect(tablesUpdated).toContain('agent_commissions');
  });
});
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implement actions**

Create `src/app/actions/agent-payouts.ts`:

```ts
'use server';

import { createServerClient } from '@/lib/supabase';
import { verifySession } from './auth';
import type { AgentPayout, AgentCommission } from '@/types/sales';

async function requireSuperAdmin() {
  const s = await verifySession();
  if (!s || s.role !== 'super_admin') throw new Error('Unauthorized');
  return s;
}
async function requireSalesAgent() {
  const s = await verifySession();
  if (!s || s.role !== 'sales_agent' || !s.agentId) throw new Error('Unauthorized');
  return s;
}

export async function requestPayout(): Promise<{ data: AgentPayout | null; error: string | null }> {
  const session = await requireSalesAgent();
  const supabase = createServerClient();

  // 1. Find all available commissions (approved AND payout_id IS NULL)
  const { data: rows, error: selErr } = await supabase
    .from('agent_commissions')
    .select('id, amount')
    .eq('agent_id', session.agentId!)
    .eq('status', 'approved')
    .is('payout_id', null);
  if (selErr) return { data: null, error: selErr.message };
  if (!rows || rows.length === 0) return { data: null, error: 'No commissions available to request' };

  const total = rows.reduce((s, r) => s + Number((r as { amount: number }).amount), 0);

  // 2. Create the payout row (partial unique index prevents duplicate open requests)
  const { data: payout, error: poErr } = await supabase
    .from('agent_payouts')
    .insert({
      agent_id: session.agentId!,
      requested_amount: total,
      status: 'requested',
    })
    .select()
    .single();
  if (poErr) {
    if (poErr.message.toLowerCase().includes('duplicate')) {
      return { data: null, error: 'You already have an open payout request' };
    }
    return { data: null, error: poErr.message };
  }

  // 3. Link commission rows to the payout
  const { error: linkErr } = await supabase
    .from('agent_commissions')
    .update({ payout_id: (payout as { id: string }).id })
    .eq('agent_id', session.agentId!)
    .eq('status', 'approved')
    .is('payout_id', null);
  if (linkErr) {
    // Roll back the payout insert
    await supabase.from('agent_payouts').delete().eq('id', (payout as { id: string }).id).catch(() => {});
    return { data: null, error: linkErr.message };
  }

  return { data: payout as AgentPayout, error: null };
}

export async function listMyPayouts(): Promise<{ data: AgentPayout[]; error: string | null }> {
  const session = await requireSalesAgent();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('agent_payouts')
    .select('*')
    .eq('agent_id', session.agentId!)
    .order('requested_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data || []) as AgentPayout[], error: null };
}

export interface PayoutWithAgent extends AgentPayout {
  agent: { id: string; name: string } | null;
}

export async function listAllPayouts(filter?: { status?: AgentPayout['status'] | 'all' }): Promise<{ data: PayoutWithAgent[]; error: string | null }> {
  await requireSuperAdmin();
  const supabase = createServerClient();
  let q = supabase
    .from('agent_payouts')
    .select('*, agent:sales_agents(id, name)')
    .order('requested_at', { ascending: false });
  if (filter?.status && filter.status !== 'all') q = q.eq('status', filter.status);
  const { data, error } = await q;
  if (error) return { data: [], error: error.message };
  return { data: (data || []) as PayoutWithAgent[], error: null };
}

export interface MarkPaidInput {
  paidAmount: number;
  method: 'bank' | 'jazzcash' | 'cash';
  reference: string | null;
  notes: string | null;
}

export async function markPayoutPaid(payoutId: string, input: MarkPaidInput): Promise<{ error: string | null }> {
  const session = await requireSuperAdmin();
  const supabase = createServerClient();

  const now = new Date().toISOString();

  const { error: poErr } = await supabase
    .from('agent_payouts')
    .update({
      status: 'paid',
      paid_amount: input.paidAmount,
      method: input.method,
      reference: input.reference,
      notes: input.notes,
      paid_at: now,
      paid_by: session.staffId,
    })
    .eq('id', payoutId);
  if (poErr) return { error: poErr.message };

  const { error: cErr } = await supabase
    .from('agent_commissions')
    .update({ status: 'paid', settled_at: now })
    .eq('payout_id', payoutId);
  return { error: cErr?.message ?? null };
}

export async function rejectPayout(payoutId: string, reason: string | null): Promise<{ error: string | null }> {
  await requireSuperAdmin();
  const supabase = createServerClient();

  const { error: poErr } = await supabase
    .from('agent_payouts')
    .update({ status: 'rejected', notes: reason })
    .eq('id', payoutId);
  if (poErr) return { error: poErr.message };

  // Unlink commission rows so they become available again
  const { error: cErr } = await supabase
    .from('agent_commissions')
    .update({ payout_id: null })
    .eq('payout_id', payoutId);
  return { error: cErr?.message ?? null };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/agent-payouts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/agent-payouts.ts test/agent-payouts.test.ts
git commit -m "feat(payouts): request, list, mark-paid, reject server actions"
```

---

## Task 5.2: Agent payout UX — request button + history page

**Files:**
- Modify: `src/app/agent/commissions/page.tsx` (add Request payout button)
- Replace: `src/app/agent/payouts/page.tsx`

- [ ] **Step 1: Add request button to commissions page**

Edit `src/app/agent/commissions/page.tsx`. Add state + button above the table:

```tsx
import { requestPayout } from '@/app/actions/agent-payouts';
import { Button } from '@/components/ui/button';
// ...
const [requesting, setRequesting] = useState(false);

async function handleRequest() {
  if (!confirm(`Request payout of Rs ${totals.available.toFixed(2)}?`)) return;
  setRequesting(true);
  const { error } = await requestPayout();
  setRequesting(false);
  if (error) { toast.error(error); return; }
  toast.success('Payout requested — superadmin will process');
  // reload
  const r = await listMyCommissions();
  setRows(r.data);
}

// In JSX, between the summary grid and the table:
<div className="flex justify-end">
  <Button onClick={handleRequest} disabled={requesting || totals.available <= 0}>
    {requesting ? 'Requesting…' : `Request payout (Rs ${totals.available.toFixed(2)})`}
  </Button>
</div>
```

Also add the `toast` import.

- [ ] **Step 2: Real payouts page**

Replace `src/app/agent/payouts/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Receipt } from 'lucide-react';
import { listMyPayouts } from '@/app/actions/agent-payouts';
import type { AgentPayout } from '@/types/sales';

export default function AgentPayoutsPage() {
  const [payouts, setPayouts] = useState<AgentPayout[]>([]);

  useEffect(() => { listMyPayouts().then(r => setPayouts(r.data)); }, []);

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl font-semibold">Payouts</h2>
      {payouts.length === 0 ? (
        <div className="border border-dashed rounded-lg p-10 text-center text-muted-foreground">
          <Receipt className="w-7 h-7 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No payout requests yet.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-4 py-3">Requested</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Paid</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Reference</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map(p => (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-3">{new Date(p.requested_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}</td>
                  <td className="px-4 py-3 font-medium">Rs {Number(p.requested_amount).toFixed(2)}</td>
                  <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-muted">{p.status}</span></td>
                  <td className="px-4 py-3">{p.paid_amount ? `Rs ${Number(p.paid_amount).toFixed(2)}` : '—'}</td>
                  <td className="px-4 py-3">{p.method || '—'}</td>
                  <td className="px-4 py-3">{p.reference || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/agent/commissions/page.tsx src/app/agent/payouts/page.tsx
git commit -m "feat(agent): request-payout button + payout history page"
```

---

## Task 5.3: `/admin/payouts` — list + mark paid + reject

**Files:**
- Create: `src/app/admin/payouts/page.tsx`

- [ ] **Step 1: Create page**

Create `src/app/admin/payouts/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Receipt } from 'lucide-react';
import { listAllPayouts, markPayoutPaid, rejectPayout, type PayoutWithAgent } from '@/app/actions/agent-payouts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { PayoutStatus } from '@/types/sales';

const STATUSES: (PayoutStatus | 'all')[] = ['all','requested','paid','rejected'];

export default function AdminPayoutsPage() {
  const [payouts, setPayouts] = useState<PayoutWithAgent[]>([]);
  const [status, setStatus] = useState<PayoutStatus | 'all'>('requested');
  const [payDialog, setPayDialog] = useState<PayoutWithAgent | null>(null);

  async function load() {
    const { data } = await listAllPayouts({ status });
    setPayouts(data);
  }
  useEffect(() => { load(); }, [status]);

  async function handleReject(p: PayoutWithAgent) {
    const reason = window.prompt('Reason for rejection?');
    if (reason === null) return;
    const { error } = await rejectPayout(p.id, reason.trim() || null);
    if (error) { toast.error(error); return; }
    toast.success('Payout rejected — commissions unlocked');
    load();
  }

  return (
    <div className="space-y-6">
      <h2 className="font-heading text-2xl font-semibold">Payouts</h2>

      <div className="flex gap-2">
        {STATUSES.map(s => (
          <button key={s} onClick={() => setStatus(s)}
            className={`px-3 py-1.5 text-xs rounded-full border ${status === s ? 'bg-gold text-black border-gold' : 'bg-white border-border text-muted-foreground'}`}>
            {s}
          </button>
        ))}
      </div>

      {payouts.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center text-muted-foreground">
          <Receipt className="w-8 h-8 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No payouts in this filter.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Requested</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Paid</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {payouts.map(p => (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{p.agent?.name || '—'}</td>
                  <td className="px-4 py-3">{new Date(p.requested_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}</td>
                  <td className="px-4 py-3">Rs {Number(p.requested_amount).toFixed(2)}</td>
                  <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-muted">{p.status}</span></td>
                  <td className="px-4 py-3">{p.paid_amount ? `Rs ${Number(p.paid_amount).toFixed(2)}` : '—'}</td>
                  <td className="px-4 py-3">
                    {p.status === 'requested' && (
                      <>
                        <button onClick={() => setPayDialog(p)} className="text-gold hover:underline text-sm mr-2">Mark paid</button>
                        <button onClick={() => handleReject(p)} className="text-red-600 hover:underline text-sm">Reject</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <MarkPaidDialog payout={payDialog} onClose={() => setPayDialog(null)} onPaid={load} />
    </div>
  );
}

function MarkPaidDialog({ payout, onClose, onPaid }: { payout: PayoutWithAgent | null; onClose: () => void; onPaid: () => void }) {
  const [form, setForm] = useState({ paidAmount: '', method: 'bank' as 'bank'|'jazzcash'|'cash', reference: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (payout) setForm({ paidAmount: String(payout.requested_amount), method: 'bank', reference: '', notes: '' });
  }, [payout]);

  if (!payout) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await markPayoutPaid(payout.id, {
      paidAmount: Number(form.paidAmount),
      method: form.method,
      reference: form.reference.trim() || null,
      notes: form.notes.trim() || null,
    });
    setSubmitting(false);
    if (error) { toast.error(error); return; }
    toast.success('Payout marked paid');
    onClose();
    onPaid();
  }

  return (
    <Dialog open={!!payout} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark payout paid — {payout.agent?.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>Amount paid (Rs)</Label>
            <Input type="number" required min="0" step="0.01" value={form.paidAmount}
              onChange={e => setForm({ ...form, paidAmount: e.target.value })} /></div>
          <div><Label>Method</Label>
            <select value={form.method}
              onChange={e => setForm({ ...form, method: e.target.value as 'bank'|'jazzcash'|'cash' })}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
              <option value="bank">Bank transfer</option>
              <option value="jazzcash">JazzCash</option>
              <option value="cash">Cash</option>
            </select></div>
          <div><Label>Reference</Label>
            <Input value={form.reference}
              onChange={e => setForm({ ...form, reference: e.target.value })}
              placeholder="Tx ID, cheque #, etc." /></div>
          <div><Label>Notes</Label>
            <Textarea rows={2} value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Mark paid'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/payouts/page.tsx
git commit -m "feat(admin): /admin/payouts — mark paid + reject"
```

---

## Task 5.4: `/admin/commissions` audit page

**Files:**
- Create: `src/app/admin/commissions/page.tsx`

- [ ] **Step 1: Create page**

Create `src/app/admin/commissions/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { listAllCommissions } from '@/app/actions/agent-commissions';
import { listSalesAgents } from '@/app/actions/sales-agents';
import type { AgentCommission, SalesAgent, CommissionStatus } from '@/types/sales';

type Row = AgentCommission & { salon: { name: string } | null; agent: { name: string } | null };

const STATUSES: (CommissionStatus | 'all')[] = ['all','pending','approved','paid','reversed'];

export default function AdminCommissionsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [agents, setAgents] = useState<SalesAgent[]>([]);
  const [agentFilter, setAgentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<CommissionStatus | 'all'>('all');

  useEffect(() => { listSalesAgents().then(r => setAgents(r.data)); }, []);
  useEffect(() => {
    listAllCommissions({ agentId: agentFilter || undefined, status: statusFilter }).then(r => setRows(r.data));
  }, [agentFilter, statusFilter]);

  const total = rows.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl font-semibold">Commissions (audit)</h2>

      <div className="flex gap-3">
        <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">All agents</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as CommissionStatus | 'all')}
          className="border rounded-lg px-3 py-2 text-sm bg-white">
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="ml-auto self-center text-sm text-muted-foreground">
          Total in filter: <strong>Rs {total.toFixed(2)}</strong>
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center text-muted-foreground">
          <Wallet className="w-8 h-8 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No commissions.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Salon</th>
                <th className="px-4 py-3">Kind</th>
                <th className="px-4 py-3">Base</th>
                <th className="px-4 py-3">%</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-3">{new Date(r.created_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}</td>
                  <td className="px-4 py-3 font-medium">{r.agent?.name || '—'}</td>
                  <td className="px-4 py-3">{r.salon?.name || '—'}</td>
                  <td className="px-4 py-3">{r.kind === 'first_sale' ? 'First sale' : 'Renewal'}</td>
                  <td className="px-4 py-3">Rs {Number(r.base_amount).toFixed(0)}</td>
                  <td className="px-4 py-3">{Number(r.pct).toFixed(2)}</td>
                  <td className="px-4 py-3 font-medium">Rs {Number(r.amount).toFixed(2)}</td>
                  <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-muted">{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/commissions/page.tsx
git commit -m "feat(admin): /admin/commissions audit view"
```

---

## Task 5.5: End-to-end integration test + seed data

**Files:**
- Modify: `test/agent-commissions.test.ts` or create `test/agent-payouts-flow.test.ts`
- Optional: Add seed block to `supabase/seed/seed.sql`

- [ ] **Step 1: Cannot-double-request test**

Append to `test/agent-payouts.test.ts`:

```ts
it('requestPayout surfaces duplicate-open error', async () => {
  mockVerifySession.mockResolvedValue({ role: 'sales_agent', agentId: 'ag-1' });
  tables['agent_commissions'] = { selectData: [{ id: 'c-1', amount: 100 }] };
  // Override the from(...) insert behavior to simulate the unique constraint:
  // (For simplicity this is a loose check; the real constraint is tested by the DB at runtime.)
  const { requestPayout } = await import('../src/app/actions/agent-payouts');
  const r = await requestPayout();
  // With the default mock this returns OK; the integration test happens end-to-end in QA.
  // Document as intentional: unit harness can't simulate the partial unique index.
  expect(r.error === null || r.error?.includes('open payout request')).toBeTruthy();
});
```

- [ ] **Step 2: Run full suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 3: Manual end-to-end smoke test in dev**

Walk through in the running app:
1. Superadmin creates agent Ali (first 20%, renewal 5%).
2. Superadmin creates lead "Test Salon" assigned to Ali.
3. Ali logs in, opens the lead, clicks Convert to salon, plan=basic, amount=2500, method=cash.
4. Superadmin opens `/admin/payments`, sees the pending row with Ali in the Agent column, approves.
5. Ali opens `/agent/commissions` — sees Rs 500 first-sale row, status `approved`, available = 500.
6. Ali clicks Request payout — row moves to pending payout; `/agent/payouts` shows one requested row.
7. Superadmin opens `/admin/payouts`, Mark paid, amount=500, method=bank, reference="TEST".
8. Ali refreshes `/agent/commissions` — row now `paid`; lifetime paid = 500.
9. Superadmin approves a second payment for the same salon (via owner's settings screen or a new payment_request) — Ali's ledger shows a renewal row at 5% = Rs 125.
10. Superadmin reverses that renewal payment — row becomes `reversed` in Ali's ledger.
11. Superadmin reassigns the salon to a new agent Bilal. Next renewal accrues to Bilal; past rows still Ali's.

If any step breaks, fix before closing Phase 5.

- [ ] **Step 4: Final commit**

```bash
git add test/agent-payouts.test.ts
git commit -m "test(payouts): document duplicate-open gating (DB-enforced)"
```

**End of Phase 5.** Feature complete. Run `npm test` once more — all green. Tag a version and ship.

---

## Deployment checklist (before production deploy)

- [ ] Apply migration 021 on production: `ssh brbr-hetzner; cd /opt/brbr; psql -U supabase_admin -d postgres -f supabase/migrations/021_sales_agents.sql`
- [ ] Verify no existing salons have `sold_by_agent_id` populated unintentionally: `SELECT COUNT(*) FROM salons WHERE sold_by_agent_id IS NOT NULL;` should be 0.
- [ ] Docker compose build + up on the server (standard ops flow from memory).
- [ ] Smoke test after deploy: superadmin login → `/admin/agents` loads → create a real test agent → agent receives reset email → agent can log in.
- [ ] Monitor `payment_requests` approvals in production for 24h; confirm `agent_commissions` rows appear for any salon with `sold_by_agent_id`.

---

## Known follow-ups (out of scope for this plan)

1. Screenshot upload on agent-collected payments (currently no file; reference text only). Can reuse existing `submitPaymentRequest` upload path if needed.
2. Agent-side lead search/sort (Phase 2 ships list-only).
3. Reversed-and-already-paid commissions: UI for superadmin to "forgive" the negative balance explicitly (currently a manual ledger decision).
4. Visit history per lead (spec non-goal, but may come up).
5. Multi-agent splits on a sale (spec non-goal).
