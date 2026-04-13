# Onboarding Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a three-part onboarding system — owner post-setup checklist banner, staff first-login welcome screen, and empty states across all data sections.

**Architecture:** Hybrid approach — derive 4 of 5 checklist items from existing data (clients, appointments, bills, salon payment fields), add `last_login_at` and `first_login_seen` columns to `staff`, and `onboarding_dismissed` to `salons`. One new RPC fetches all onboarding state in a single query. Three new components: `OnboardingBanner`, `StaffWelcome`, `EmptyState`.

**Tech Stack:** Next.js 16, React 19, Supabase (Postgres), Zustand, Tailwind 4, Vitest + React Testing Library

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `supabase/migrations/009_onboarding.sql` | Schema: 3 new columns + 1 RPC |
| Modify | `src/types/database.ts:55-108` | Add new fields to Salon and Staff interfaces |
| Modify | `src/app/api/auth/staff-login/route.ts:114,156` | Set `last_login_at` on successful login |
| Create | `src/app/actions/onboarding.ts` | Server actions: dismiss onboarding, mark first login seen |
| Create | `src/components/empty-state.tsx` | Reusable empty state component |
| Create | `src/app/dashboard/components/onboarding-banner.tsx` | Owner checklist banner |
| Create | `src/app/dashboard/components/staff-welcome.tsx` | Staff first-login welcome screen |
| Modify | `src/app/dashboard/page.tsx:1-19,396-493` | Integrate banner + welcome into dashboard |
| Modify | `src/lib/i18n/translations.ts:88-99,185-197` | Add onboarding + empty state translation keys |
| Create | `test/onboarding.test.tsx` | Tests for all three components |
| Create | `test/onboarding-actions.test.ts` | Tests for server actions |

---

### Task 1: Migration — Schema Changes

**Files:**
- Create: `supabase/migrations/009_onboarding.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- 009_onboarding.sql
-- Onboarding support: track staff logins, first-login-seen, owner checklist dismissal

-- Track when staff last logged in (for "invite staff" checklist item)
ALTER TABLE staff ADD COLUMN last_login_at timestamptz;

-- Track whether staff has seen the first-login welcome screen
ALTER TABLE staff ADD COLUMN first_login_seen boolean NOT NULL DEFAULT false;

-- Track whether owner has dismissed the onboarding checklist
ALTER TABLE salons ADD COLUMN onboarding_dismissed boolean NOT NULL DEFAULT false;

-- Single RPC to fetch all onboarding checklist state
CREATE OR REPLACE FUNCTION get_onboarding_status(p_salon_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT json_build_object(
    'has_clients', (SELECT count(*) > 0 FROM clients WHERE salon_id = p_salon_id),
    'has_appointments', (SELECT count(*) > 0 FROM appointments WHERE salon_id = p_salon_id),
    'has_sale', (SELECT count(*) > 0 FROM bills WHERE salon_id = p_salon_id AND status = 'paid'),
    'has_payment_methods', (
      SELECT jazzcash_number IS NOT NULL OR easypaisa_number IS NOT NULL OR bank_account IS NOT NULL
      FROM salons WHERE id = p_salon_id
    ),
    'staff_logged_in', (
      SELECT count(*) > 0 FROM staff
      WHERE salon_id = p_salon_id AND role != 'owner' AND last_login_at IS NOT NULL
    ),
    'onboarding_dismissed', (
      SELECT onboarding_dismissed FROM salons WHERE id = p_salon_id
    )
  );
$$;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push` (or apply manually against the Hetzner-hosted Supabase)
Expected: Migration applies without errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/009_onboarding.sql
git commit -m "feat(db): migration 009 — onboarding columns and RPC"
```

---

### Task 2: Update TypeScript Types

**Files:**
- Modify: `src/types/database.ts:76-78,105-107`

- [ ] **Step 1: Add `onboarding_dismissed` to Salon interface**

In `src/types/database.ts`, inside the `Salon` interface, add after `setup_complete: boolean;` (line 76):

```typescript
  onboarding_dismissed: boolean;
```

- [ ] **Step 2: Add `last_login_at` and `first_login_seen` to Staff interface**

In `src/types/database.ts`, inside the `Staff` interface, add after `is_active: boolean;` (line 106):

```typescript
  last_login_at: string | null;
  first_login_seen: boolean;
```

- [ ] **Step 3: Add OnboardingStatus type**

In `src/types/database.ts`, add after the `Staff` interface (after line 108):

```typescript
export interface OnboardingStatus {
  has_clients: boolean;
  has_appointments: boolean;
  has_sale: boolean;
  has_payment_methods: boolean;
  staff_logged_in: boolean;
  onboarding_dismissed: boolean;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(types): add onboarding fields to Salon, Staff, and OnboardingStatus"
```

---

### Task 3: Update Staff Login API

**Files:**
- Modify: `src/app/api/auth/staff-login/route.ts`

- [ ] **Step 1: Add `last_login_at` update after staff PIN verification**

In `src/app/api/auth/staff-login/route.ts`, after the lazy PIN rehash block (after the `if (!isHashedPin(storedPin))` block, around line 114), add:

```typescript
    // Track login time for onboarding checklist
    await supabase.from('staff').update({ last_login_at: new Date().toISOString() }).eq('id', staffRow.id);
```

- [ ] **Step 2: Add `last_login_at` for partner login path**

In the same file, in the partner login success block (after partner PIN rehash, around line 156), add:

```typescript
    // Track login time for partner
    await supabase.from('salon_partners').update({ last_login_at: new Date().toISOString() }).eq('id', partnerRow.id);
```

Note: The `salon_partners` table does NOT have `last_login_at` — skip this step entirely. The onboarding checklist only checks `staff.last_login_at`, not partners.

- [ ] **Step 3: Include `first_login_seen` in the staff response**

In the `stripStaff` function or the staff response object, ensure `first_login_seen` is included in the returned staff data. Find where `staffRow` is stripped/returned and include `first_login_seen`:

```typescript
    staff: {
      ...stripStaff(staffRow),
      first_login_seen: staffRow.first_login_seen,
    },
```

If `stripStaff` already passes through all fields, verify `first_login_seen` is not excluded.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/auth/staff-login/route.ts
git commit -m "feat(auth): track last_login_at and return first_login_seen on staff login"
```

---

### Task 4: Server Actions for Onboarding

**Files:**
- Create: `src/app/actions/onboarding.ts`

- [ ] **Step 1: Write the test file**

Create `test/onboarding-actions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase
const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ error: null }) })
const mockRpc = vi.fn().mockResolvedValue({ data: {
  has_clients: false,
  has_appointments: false,
  has_sale: false,
  has_payment_methods: false,
  staff_logged_in: false,
  onboarding_dismissed: false,
}, error: null })

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: (table: string) => ({ update: (data: Record<string, unknown>) => ({ eq: (_col: string, _val: string) => ({ error: null }) }) }),
    rpc: mockRpc,
  }),
}))

vi.mock('@/app/actions/auth', () => ({
  verifySession: vi.fn().mockResolvedValue({ salonId: 'salon-1', staffId: 'staff-1', role: 'owner' }),
}))

describe('onboarding actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getOnboardingStatus returns status object', async () => {
    const { getOnboardingStatus } = await import('../src/app/actions/onboarding')
    const result = await getOnboardingStatus()
    expect(result).toHaveProperty('has_clients')
    expect(result).toHaveProperty('onboarding_dismissed')
  })

  it('dismissOnboarding calls update on salons table', async () => {
    const { dismissOnboarding } = await import('../src/app/actions/onboarding')
    const result = await dismissOnboarding()
    expect(result).toEqual({ success: true })
  })

  it('markFirstLoginSeen calls update on staff table', async () => {
    const { markFirstLoginSeen } = await import('../src/app/actions/onboarding')
    const result = await markFirstLoginSeen()
    expect(result).toEqual({ success: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/onboarding-actions.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the server actions**

Create `src/app/actions/onboarding.ts`:

```typescript
'use server';

import { createServerClient } from '@/lib/supabase';
import { verifySession } from '@/app/actions/auth';
import type { OnboardingStatus } from '@/types/database';

export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  const session = await verifySession();
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc('get_onboarding_status', {
    p_salon_id: session.salonId,
  });

  if (error) throw new Error('Failed to fetch onboarding status');
  return data as OnboardingStatus;
}

export async function dismissOnboarding(): Promise<{ success: true }> {
  const session = await verifySession();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('salons')
    .update({ onboarding_dismissed: true })
    .eq('id', session.salonId);

  if (error) throw new Error('Failed to dismiss onboarding');
  return { success: true };
}

export async function markFirstLoginSeen(): Promise<{ success: true }> {
  const session = await verifySession();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('staff')
    .update({ first_login_seen: true })
    .eq('id', session.staffId);

  if (error) throw new Error('Failed to mark first login seen');
  return { success: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/onboarding-actions.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/onboarding.ts test/onboarding-actions.test.ts
git commit -m "feat(actions): onboarding server actions — get status, dismiss, mark seen"
```

---

### Task 5: i18n Translation Keys

**Files:**
- Modify: `src/lib/i18n/translations.ts`

- [ ] **Step 1: Add English onboarding keys**

In `src/lib/i18n/translations.ts`, add after the `yesterday: 'Yesterday',` line (line 98) and before the closing `},` of the `en` section (line 99):

```typescript

    // Onboarding
    gettingStarted: 'Getting Started',
    complete: 'complete',
    dismiss: 'Dismiss',
    allSet: "You're all set!",
    addFirstClient: 'Add first client',
    bookAppointment: 'Book appointment',
    completeSale: 'Complete a sale',
    paymentMethods: 'Payment methods',
    inviteStaff: 'Invite staff',

    // Staff Welcome
    welcomeGreeting: 'Welcome, {name}!',
    roleAt: "You're logged in as {role} at {salon}",
    letsGo: "Got it, let's go",

    // Empty States
    noClientsYet: 'No clients yet',
    noAppointmentsYet: 'No appointments yet',
    noProductsYet: 'No products yet',
    noExpensesYet: 'No expenses yet',
    noStaffYet: 'No staff yet',
    noPackagesYet: 'No packages yet',
    noDataYet: 'No data yet',
    addClient: 'Add Client',
    bookAppointmentCta: 'Book Appointment',
    addProduct: 'Add Product',
    addExpense: 'Add Expense',
    addStaff: 'Add Staff',
    addPackage: 'Add Package',
```

- [ ] **Step 2: Add Urdu onboarding keys**

In the same file, add after `yesterday: 'کل',` (line 196) and before the closing `},` of the `ur` section (line 197):

```typescript

    // Onboarding
    gettingStarted: 'شروع کریں',
    complete: 'مکمل',
    dismiss: 'ہٹائیں',
    allSet: 'سب تیار ہے!',
    addFirstClient: 'پہلا کلائنٹ شامل کریں',
    bookAppointment: 'اپائنٹمنٹ بک کریں',
    completeSale: 'سیل مکمل کریں',
    paymentMethods: 'ادائیگی کے طریقے',
    inviteStaff: 'سٹاف کو مدعو کریں',

    // Staff Welcome
    welcomeGreeting: '!خوش آمدید، {name}',
    roleAt: '{salon} میں {role} کے طور پر لاگ ان ہیں',
    letsGo: 'چلیں شروع کرتے ہیں',

    // Empty States
    noClientsYet: 'ابھی کوئی کلائنٹ نہیں',
    noAppointmentsYet: 'ابھی کوئی اپائنٹمنٹ نہیں',
    noProductsYet: 'ابھی کوئی پروڈکٹ نہیں',
    noExpensesYet: 'ابھی کوئی اخراجات نہیں',
    noStaffYet: 'ابھی کوئی سٹاف نہیں',
    noPackagesYet: 'ابھی کوئی پیکیج نہیں',
    noDataYet: 'ابھی کوئی ڈیٹا نہیں',
    addClient: 'کلائنٹ شامل کریں',
    bookAppointmentCta: 'اپائنٹمنٹ بک کریں',
    addProduct: 'پروڈکٹ شامل کریں',
    addExpense: 'اخراجات شامل کریں',
    addStaff: 'سٹاف شامل کریں',
    addPackage: 'پیکیج شامل کریں',
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/i18n/translations.ts
git commit -m "feat(i18n): add onboarding, staff welcome, and empty state translations"
```

---

### Task 6: EmptyState Component

**Files:**
- Create: `src/components/empty-state.tsx`
- Create: test in `test/onboarding.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `test/onboarding.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/components/providers/language-provider', () => ({
  useLanguage: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        noClientsYet: 'No clients yet',
        addClient: 'Add Client',
        noAppointmentsYet: 'No appointments yet',
        noDataYet: 'No data yet',
        gettingStarted: 'Getting Started',
        complete: 'complete',
        dismiss: 'Dismiss',
        allSet: "You're all set!",
        addFirstClient: 'Add first client',
        bookAppointment: 'Book appointment',
        completeSale: 'Complete a sale',
        paymentMethods: 'Payment methods',
        inviteStaff: 'Invite staff',
        letsGo: "Got it, let's go",
        welcomeGreeting: 'Welcome, {name}!',
        roleAt: "You're logged in as {role} at {salon}",
      }
      return translations[key] || key
    },
    language: 'en' as const,
    isUrdu: false,
    setLanguage: vi.fn(),
  }),
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

// ═══════════════════════════════════════
// EmptyState
// ═══════════════════════════════════════

describe('EmptyState', () => {
  let EmptyState: typeof import('../src/components/empty-state').EmptyState

  beforeEach(async () => {
    const mod = await import('../src/components/empty-state')
    EmptyState = mod.EmptyState
  })

  it('renders icon and text', () => {
    render(<EmptyState icon="👤" text="noClientsYet" />)
    expect(screen.getByText('👤')).toBeDefined()
    expect(screen.getByText('No clients yet')).toBeDefined()
  })

  it('renders CTA button with link when provided', () => {
    render(<EmptyState icon="👤" text="noClientsYet" ctaLabel="addClient" ctaHref="/dashboard/clients?action=new" />)
    const link = screen.getByText('Add Client')
    expect(link.closest('a')).toBeDefined()
    expect(link.closest('a')?.getAttribute('href')).toBe('/dashboard/clients?action=new')
  })

  it('renders without CTA when no ctaLabel provided', () => {
    render(<EmptyState icon="📊" text="noDataYet" />)
    expect(screen.getByText('No data yet')).toBeDefined()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/onboarding.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the EmptyState component**

Create `src/components/empty-state.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useLanguage } from '@/components/providers/language-provider';
import type { TranslationKey } from '@/lib/i18n/translations';

interface EmptyStateProps {
  icon: string;
  text: TranslationKey;
  ctaLabel?: TranslationKey;
  ctaHref?: string;
}

export function EmptyState({ icon, text, ctaLabel, ctaHref }: EmptyStateProps) {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center border-2 border-muted-foreground/30 text-xl">
        {icon}
      </div>
      <p className="mt-3 font-bold text-sm">{t(text)}</p>
      {ctaLabel && ctaHref && (
        <Link
          href={ctaHref}
          className="mt-4 bg-[#C8A028] px-5 py-2.5 text-xs font-bold text-black min-h-[44px] flex items-center"
        >
          {t(ctaLabel)}
        </Link>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/onboarding.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/empty-state.tsx test/onboarding.test.tsx
git commit -m "feat(ui): add reusable EmptyState component"
```

---

### Task 7: OnboardingBanner Component

**Files:**
- Create: `src/app/dashboard/components/onboarding-banner.tsx`
- Modify: `test/onboarding.test.tsx`

- [ ] **Step 1: Add OnboardingBanner tests**

Append to `test/onboarding.test.tsx`:

```typescript
// ═══════════════════════════════════════
// OnboardingBanner
// ═══════════════════════════════════════

vi.mock('@/app/actions/onboarding', () => ({
  getOnboardingStatus: vi.fn().mockResolvedValue({
    has_clients: false,
    has_appointments: false,
    has_sale: false,
    has_payment_methods: false,
    staff_logged_in: false,
    onboarding_dismissed: false,
  }),
  dismissOnboarding: vi.fn().mockResolvedValue({ success: true }),
  markFirstLoginSeen: vi.fn().mockResolvedValue({ success: true }),
}))

describe('OnboardingBanner', () => {
  let OnboardingBanner: typeof import('../src/app/dashboard/components/onboarding-banner').OnboardingBanner

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../src/app/dashboard/components/onboarding-banner')
    OnboardingBanner = mod.OnboardingBanner
  })

  it('renders the getting started title', async () => {
    render(<OnboardingBanner salonId="salon-1" />)
    // Wait for async state to resolve
    await vi.waitFor(() => {
      expect(screen.getByText('Getting Started')).toBeDefined()
    })
  })

  it('renders all 5 checklist items', async () => {
    render(<OnboardingBanner salonId="salon-1" />)
    await vi.waitFor(() => {
      expect(screen.getByText('Add first client')).toBeDefined()
      expect(screen.getByText('Book appointment')).toBeDefined()
      expect(screen.getByText('Complete a sale')).toBeDefined()
      expect(screen.getByText('Payment methods')).toBeDefined()
      expect(screen.getByText('Invite staff')).toBeDefined()
    })
  })

  it('shows progress count', async () => {
    render(<OnboardingBanner salonId="salon-1" />)
    await vi.waitFor(() => {
      expect(screen.getByText(/0\/5/)).toBeDefined()
    })
  })

  it('renders dismiss button', async () => {
    render(<OnboardingBanner salonId="salon-1" />)
    await vi.waitFor(() => {
      expect(screen.getByText('Dismiss')).toBeDefined()
    })
  })

  it('does not render when dismissed', () => {
    // Override mock for this test
    const { getOnboardingStatus } = require('../src/app/actions/onboarding')
    getOnboardingStatus.mockResolvedValueOnce({
      has_clients: false,
      has_appointments: false,
      has_sale: false,
      has_payment_methods: false,
      staff_logged_in: false,
      onboarding_dismissed: true,
    })
    render(<OnboardingBanner salonId="salon-1" />)
    expect(screen.queryByText('Getting Started')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/onboarding.test.tsx`
Expected: FAIL — OnboardingBanner module not found

- [ ] **Step 3: Write the OnboardingBanner component**

Create `src/app/dashboard/components/onboarding-banner.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/components/providers/language-provider';
import { getOnboardingStatus, dismissOnboarding } from '@/app/actions/onboarding';
import type { OnboardingStatus } from '@/types/database';
import type { TranslationKey } from '@/lib/i18n/translations';

interface ChecklistItem {
  key: keyof OnboardingStatus;
  label: TranslationKey;
  href: string;
}

const CHECKLIST: ChecklistItem[] = [
  { key: 'has_clients', label: 'addFirstClient', href: '/dashboard/clients?action=new' },
  { key: 'has_appointments', label: 'bookAppointment', href: '/dashboard/appointments?action=new' },
  { key: 'has_sale', label: 'completeSale', href: '/dashboard/pos' },
  { key: 'has_payment_methods', label: 'paymentMethods', href: '/dashboard/settings' },
  { key: 'staff_logged_in', label: 'inviteStaff', href: '/dashboard/staff' },
];

interface OnboardingBannerProps {
  salonId: string;
}

export function OnboardingBanner({ salonId }: OnboardingBannerProps) {
  const { t } = useLanguage();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [celebrating, setCelebrating] = useState(false);

  useEffect(() => {
    getOnboardingStatus().then(setStatus).catch(() => {});
  }, [salonId]);

  if (!status || status.onboarding_dismissed || dismissed) return null;

  const completed = CHECKLIST.filter((item) => status[item.key] === true).length;
  const allDone = completed === CHECKLIST.length;

  if (allDone && !celebrating) {
    setCelebrating(true);
    setTimeout(() => {
      dismissOnboarding().catch(() => {});
      setDismissed(true);
    }, 3000);
  }

  if (celebrating) {
    return (
      <div className="bg-[#C8A028] px-5 py-4 text-center">
        <p className="text-base font-bold text-black">{t('allSet')}</p>
      </div>
    );
  }

  async function handleDismiss() {
    await dismissOnboarding().catch(() => {});
    setDismissed(true);
  }

  return (
    <div className="bg-[#C8A028] px-5 py-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold text-black">
          {t('gettingStarted')} — {completed}/5 {t('complete')}
        </span>
        <button
          onClick={handleDismiss}
          className="text-xs text-black/60 hover:text-black min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          {t('dismiss')}
        </button>
      </div>
      <div className="flex gap-2 flex-wrap">
        {CHECKLIST.map((item) => {
          const done = status[item.key] === true;
          return done ? (
            <span
              key={item.key}
              className="bg-black/20 px-3 py-1.5 text-xs text-black/50 line-through"
            >
              {t(item.label)}
            </span>
          ) : (
            <Link
              key={item.key}
              href={item.href}
              className="bg-black px-3 py-1.5 text-xs font-bold text-[#C8A028] min-h-[44px] flex items-center"
            >
              {t(item.label)}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/onboarding.test.tsx`
Expected: PASS (all EmptyState + OnboardingBanner tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/components/onboarding-banner.tsx test/onboarding.test.tsx
git commit -m "feat(dashboard): add OnboardingBanner component with checklist"
```

---

### Task 8: StaffWelcome Component

**Files:**
- Create: `src/app/dashboard/components/staff-welcome.tsx`
- Modify: `test/onboarding.test.tsx`

- [ ] **Step 1: Add StaffWelcome tests**

Append to `test/onboarding.test.tsx`:

```typescript
// ═══════════════════════════════════════
// StaffWelcome
// ═══════════════════════════════════════

describe('StaffWelcome', () => {
  let StaffWelcome: typeof import('../src/app/dashboard/components/staff-welcome').StaffWelcome

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../src/app/dashboard/components/staff-welcome')
    StaffWelcome = mod.StaffWelcome
  })

  it('renders welcome greeting with name', () => {
    render(<StaffWelcome name="Sadia" role="senior_stylist" salonName="Glamour Studio" />)
    expect(screen.getByText(/Welcome, Sadia!/)).toBeDefined()
  })

  it('renders role and salon name', () => {
    render(<StaffWelcome name="Sadia" role="senior_stylist" salonName="Glamour Studio" />)
    expect(screen.getByText(/Senior Stylist/)).toBeDefined()
    expect(screen.getByText(/Glamour Studio/)).toBeDefined()
  })

  it('renders the CTA button', () => {
    render(<StaffWelcome name="Sadia" role="senior_stylist" salonName="Glamour Studio" />)
    expect(screen.getByText("Got it, let's go")).toBeDefined()
  })

  it('shows 3 capabilities for stylist role', () => {
    render(<StaffWelcome name="Sadia" role="senior_stylist" salonName="Glamour Studio" />)
    expect(screen.getByText('Your appointments')).toBeDefined()
    expect(screen.getByText('Your earnings & commissions')).toBeDefined()
    expect(screen.getByText('Your daily schedule')).toBeDefined()
  })

  it('shows manager capabilities for manager role', () => {
    render(<StaffWelcome name="Fatima" role="manager" salonName="Glamour Studio" />)
    expect(screen.getByText('Full dashboard & reports')).toBeDefined()
    expect(screen.getByText('Staff & client management')).toBeDefined()
    expect(screen.getByText('POS & appointments')).toBeDefined()
  })

  it('shows receptionist capabilities', () => {
    render(<StaffWelcome name="Zainab" role="receptionist" salonName="Glamour Studio" />)
    expect(screen.getByText('Appointments & walk-ins')).toBeDefined()
    expect(screen.getByText('Client management')).toBeDefined()
    expect(screen.getByText('POS & checkout')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/onboarding.test.tsx`
Expected: FAIL — StaffWelcome module not found

- [ ] **Step 3: Write the StaffWelcome component**

Create `src/app/dashboard/components/staff-welcome.tsx`:

```tsx
'use client';

import { useLanguage } from '@/components/providers/language-provider';
import { markFirstLoginSeen } from '@/app/actions/onboarding';
import type { StaffRole } from '@/types/database';

const ROLE_LABELS: Record<StaffRole, string> = {
  owner: 'Owner',
  manager: 'Manager',
  receptionist: 'Receptionist',
  senior_stylist: 'Senior Stylist',
  junior_stylist: 'Junior Stylist',
  helper: 'Helper',
};

const ROLE_CAPABILITIES: Record<string, string[]> = {
  full: ['Full dashboard & reports', 'Staff & client management', 'POS & appointments'],
  front_desk: ['Appointments & walk-ins', 'Client management', 'POS & checkout'],
  stylist: ['Your appointments', 'Your earnings & commissions', 'Your daily schedule'],
  minimal: ['Your dashboard overview', 'Your daily schedule', 'Your attendance'],
};

function getAccessLevel(role: StaffRole): string {
  if (role === 'owner' || role === 'manager') return 'full';
  if (role === 'receptionist') return 'front_desk';
  if (role === 'senior_stylist' || role === 'junior_stylist') return 'stylist';
  return 'minimal';
}

interface StaffWelcomeProps {
  name: string;
  role: StaffRole;
  salonName: string;
  onDismiss?: () => void;
}

export function StaffWelcome({ name, role, salonName, onDismiss }: StaffWelcomeProps) {
  const { t } = useLanguage();
  const accessLevel = getAccessLevel(role);
  const capabilities = ROLE_CAPABILITIES[accessLevel];
  const roleLabel = ROLE_LABELS[role];

  async function handleDismiss() {
    await markFirstLoginSeen().catch(() => {});
    onDismiss?.();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95">
      <div className="flex flex-col items-center text-center px-6 max-w-sm">
        <p className="text-2xl font-bold text-[#C8A028] mb-1">
          Welcome, {name}!
        </p>
        <p className="text-sm text-muted-foreground mb-6">
          You&apos;re logged in as {roleLabel} at {salonName}
        </p>

        <div className="text-left w-full space-y-4 mb-8">
          {capabilities.map((cap, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center border border-[#C8A028] text-xs text-[#C8A028]">
                {i + 1}
              </div>
              <p className="text-sm">{cap}</p>
            </div>
          ))}
        </div>

        <button
          onClick={handleDismiss}
          className="bg-[#C8A028] px-8 py-3 text-sm font-bold text-black min-h-[44px]"
        >
          {t('letsGo')}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/onboarding.test.tsx`
Expected: PASS (all EmptyState + OnboardingBanner + StaffWelcome tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/components/staff-welcome.tsx test/onboarding.test.tsx
git commit -m "feat(dashboard): add StaffWelcome full-screen component"
```

---

### Task 9: Integrate into Dashboard

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Add imports to dashboard page**

In `src/app/dashboard/page.tsx`, add these imports alongside the existing component imports (around line 11):

```typescript
import { OnboardingBanner } from './components/onboarding-banner';
import { StaffWelcome } from './components/staff-welcome';
```

- [ ] **Step 2: Add StaffWelcome state and rendering**

In the `DashboardPage` component, add state for the staff welcome. After the existing state declarations, add:

```typescript
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    if (currentStaff && !currentStaff.first_login_seen && currentStaff.role !== 'owner') {
      setShowWelcome(true);
    }
  }, [currentStaff]);
```

At the very top of the return JSX (before the outer `<div>`), add:

```tsx
    {showWelcome && currentStaff && salon && (
      <StaffWelcome
        name={currentStaff.name}
        role={currentStaff.role}
        salonName={salon.name}
        onDismiss={() => setShowWelcome(false)}
      />
    )}
```

- [ ] **Step 3: Add OnboardingBanner to dashboard layout**

In the return JSX, add the `OnboardingBanner` right after the header section (the date filter row) and before `<KPICards>`. Only show for owner role:

```tsx
    {currentStaff?.role === 'owner' && salon && (
      <OnboardingBanner salonId={salon.id} />
    )}

    <KPICards {...props} />
```

- [ ] **Step 4: Verify in browser**

Run: Open `http://localhost:3000` and log in as an owner from demo mode.
Expected: Gold onboarding banner appears above KPI cards with 5 checklist items.

Run: Log in as a staff member who hasn't logged in before.
Expected: Full-screen welcome overlay appears with role-based capabilities.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat(dashboard): integrate OnboardingBanner and StaffWelcome"
```

---

### Task 10: Add Empty States to Existing Pages

**Files:**
- Modify: Pages that show lists (clients, appointments, inventory, expenses, staff, packages)

This task requires reading each page to find where to insert the `EmptyState` component. The pattern is the same for each:

- [ ] **Step 1: Add EmptyState import to each list page**

For each page file that shows a data list, add:

```typescript
import { EmptyState } from '@/components/empty-state';
```

- [ ] **Step 2: Wrap existing list rendering with empty check**

In each page, find where the data array is mapped/rendered and wrap it:

```tsx
{items.length === 0 && !loading ? (
  <EmptyState icon="👤" text="noClientsYet" ctaLabel="addClient" ctaHref="/dashboard/clients?action=new" />
) : (
  /* existing list rendering */
)}
```

Apply this pattern to each page with the appropriate icon, text, ctaLabel, and ctaHref from the spec:

| Page file | icon | text | ctaLabel | ctaHref |
|-----------|------|------|----------|---------|
| `src/app/dashboard/clients/page.tsx` | 👤 | noClientsYet | addClient | /dashboard/clients?action=new |
| `src/app/dashboard/appointments/page.tsx` | 📅 | noAppointmentsYet | bookAppointmentCta | /dashboard/appointments?action=new |
| `src/app/dashboard/inventory/products/page.tsx` | 📦 | noProductsYet | addProduct | /dashboard/inventory/products?action=new |
| `src/app/dashboard/expenses/page.tsx` | 💰 | noExpensesYet | addExpense | /dashboard/expenses?action=new |
| `src/app/dashboard/staff/page.tsx` | 👥 | noStaffYet | addStaff | /dashboard/staff?action=new |
| `src/app/dashboard/packages/page.tsx` | 🎁 | noPackagesYet | addPackage | /dashboard/packages?action=new |
| `src/app/dashboard/reports/page.tsx` | 📊 | noDataYet | (none) | (none) |

- [ ] **Step 3: Verify each empty state in browser**

Open each section in the browser with an empty salon. Each should show the centered icon + text + gold CTA button pattern.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/clients/page.tsx src/app/dashboard/appointments/page.tsx \
  src/app/dashboard/inventory/products/page.tsx src/app/dashboard/expenses/page.tsx \
  src/app/dashboard/staff/page.tsx src/app/dashboard/packages/page.tsx \
  src/app/dashboard/reports/page.tsx
git commit -m "feat(ui): add empty states across all dashboard sections"
```

---

### Task 11: Run Full Test Suite

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass, including new onboarding tests.

- [ ] **Step 2: Fix any failures**

If any existing tests break due to the type changes (new fields on Staff/Salon), update the test fixtures to include the new fields:

```typescript
// In test fixtures, add to Staff objects:
last_login_at: null,
first_login_seen: false,

// In test fixtures, add to Salon objects:
onboarding_dismissed: false,
```

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "test: fix existing test fixtures for new onboarding fields"
```
