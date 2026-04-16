# Superadmin Panel — Full Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the read-only admin panel into a full management console with salon editing, subscription management, user management, and DB-persisted platform settings.

**Architecture:** Four server actions files handle all admin writes (admin.ts for salon/subscription ops, admin-users.ts for user management, admin-settings.ts for platform config). New DB migration adds subscription fields to `salons` and a `platform_settings` key-value table. New salon detail page at `/admin/salons/[id]` with tabs for profile, subscription, staff, and metrics. All writes go through server actions with `requireSuperAdmin()` gate using the service role key to bypass RLS.

**Tech Stack:** Next.js 16, React 19, Supabase (service role key), Zustand, Tailwind 4, Lucide icons, shadcn/ui components (Card, Table, Dialog, Badge, Button, Input, Label, Switch, Tabs, Select).

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/011_subscriptions_and_settings.sql` | DB migration: add subscription columns to salons, create platform_settings table |
| `src/app/admin/salons/[id]/page.tsx` | Salon detail + edit page with tabs (profile, subscription, staff, metrics) |
| `src/app/actions/admin-users.ts` | Server actions for user management (deactivate, reset password) |
| `src/app/actions/admin-settings.ts` | Server actions for platform settings CRUD (DB-backed) |
| `test/admin-actions.test.ts` | Tests for all admin server actions |

### Modified Files
| File | Changes |
|------|---------|
| `src/app/actions/admin.ts` | Add write actions: updateSalon, updateSubscription, getAdminSalonMetrics |
| `src/app/admin/salons/page.tsx` | Add per-salon revenue + staff count, link to detail page |
| `src/app/admin/users/page.tsx` | Add deactivate/reactivate buttons, last login column, filter by salon |
| `src/app/admin/settings/page.tsx` | Replace localStorage with DB-backed server actions |
| `src/app/admin/page.tsx` | Fix subscription cards to use real subscription_status data |
| `src/types/database.ts` | Add SubscriptionStatus type, subscription fields to Salon, PlatformSettings interface |

---

### Task 1: Database Migration — Subscription Fields + Platform Settings Table

**Files:**
- Create: `supabase/migrations/011_subscriptions_and_settings.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 011_subscriptions_and_settings.sql
-- Adds subscription management to salons and platform-level settings table

-- Subscription fields on salons
ALTER TABLE salons ADD COLUMN IF NOT EXISTS subscription_plan text CHECK (subscription_plan IN ('trial','basic','growth','pro')) DEFAULT 'trial';
ALTER TABLE salons ADD COLUMN IF NOT EXISTS subscription_status text CHECK (subscription_status IN ('trial','active','expired','suspended')) DEFAULT 'trial';
ALTER TABLE salons ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz;
ALTER TABLE salons ADD COLUMN IF NOT EXISTS subscription_started_at timestamptz DEFAULT now();
ALTER TABLE salons ADD COLUMN IF NOT EXISTS admin_notes text;

-- Platform settings (key-value, superadmin only)
CREATE TABLE IF NOT EXISTS platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- RLS: only service_role can access platform_settings (no anon/authenticated access)
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
-- No policies = only service_role key can read/write (which is what admin server actions use)

-- Seed default settings
INSERT INTO platform_settings (key, value) VALUES
  ('general', '{"platformName":"iCut","platformDomain":"icut.pk","supportWhatsApp":"","supportEmail":"support@icut.pk"}'::jsonb),
  ('email', '{"enabled":false,"fromEmail":"notifications@icut.pk","fromName":"iCut","sendgridKey":"","enabledTemplates":{"winback":true,"udhaar_reminder":true,"low_stock_alert":true,"daily_summary":true}}'::jsonb),
  ('plans', '{"basic":{"price":2500,"branches":1,"staff":3},"growth":{"price":5000,"branches":1,"staff":0},"pro":{"price":9000,"branches":3,"staff":0}}'::jsonb),
  ('trial', '{"durationDays":14,"graceDays":3,"requirePayment":false}'::jsonb),
  ('payment', '{"jazzcashAccount":"","bankAccount":""}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Set existing salons that completed setup to 'active' subscription
UPDATE salons SET subscription_status = 'active', subscription_plan = 'growth' WHERE setup_complete = true AND subscription_status IS NULL;
UPDATE salons SET subscription_status = 'trial' WHERE setup_complete = false AND subscription_status IS NULL;
```

- [ ] **Step 2: Run the migration on the production Supabase**

> IP addresses redacted — see ops runbook in password manager. `icut-vps` is
> a `~/.ssh/config` alias that resolves to the current VPS host/user/key.

```bash
ssh icut-vps "docker exec -i supabase-db psql -U postgres -d postgres" < supabase/migrations/011_subscriptions_and_settings.sql
```

Expected: No errors. Tables altered, settings seeded.

- [ ] **Step 3: Update TypeScript types**

Modify: `src/types/database.ts`

Add the new type and update the Salon interface:

```typescript
// After the existing type declarations at the top:
export type SubscriptionPlan = 'trial' | 'basic' | 'growth' | 'pro';
export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'suspended';
```

Add to the `Salon` interface (after `created_at`):

```typescript
  subscription_plan: SubscriptionPlan;
  subscription_status: SubscriptionStatus;
  subscription_expires_at: string | null;
  subscription_started_at: string | null;
  admin_notes: string | null;
```

Add new interface:

```typescript
export interface PlatformSetting {
  key: string;
  value: Record<string, unknown>;
  updated_at: string;
}
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/011_subscriptions_and_settings.sql src/types/database.ts
git commit -m "feat(admin): add subscription fields + platform_settings table"
```

---

### Task 2: Admin Server Actions — Salon Write Operations

**Files:**
- Modify: `src/app/actions/admin.ts`
- Test: `test/admin-actions.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// test/admin-actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockUpsert = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockOrder = vi.fn();
const mockGte = vi.fn();
const mockHead = vi.fn();

function buildChain() {
  const chain: Record<string, unknown> = {};
  chain.select = mockSelect.mockReturnValue(chain);
  chain.update = mockUpdate.mockReturnValue(chain);
  chain.insert = mockInsert.mockReturnValue(chain);
  chain.upsert = mockUpsert.mockReturnValue(chain);
  chain.eq = mockEq.mockReturnValue(chain);
  chain.single = mockSingle.mockReturnValue({ data: { id: 'salon-1', name: 'Test Salon', subscription_plan: 'growth', subscription_status: 'active' }, error: null });
  chain.order = mockOrder.mockReturnValue(chain);
  chain.gte = mockGte.mockReturnValue(chain);
  chain.head = mockHead;
  // Default terminal values
  Object.assign(chain, { data: [], error: null, count: 0 });
  return chain;
}

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: () => buildChain(),
  }),
}));

vi.mock('@/app/actions/auth', () => ({
  verifySession: vi.fn().mockResolvedValue({ salonId: 'super-admin', staffId: 'admin-1', role: 'super_admin' }),
}));

describe('admin salon actions', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('updateSalon calls update on salons table', async () => {
    const { updateSalon } = await import('../src/app/actions/admin');
    const result = await updateSalon('salon-1', { name: 'New Name', city: 'Lahore' });
    expect(result).toHaveProperty('success', true);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('updateSubscription calls update with subscription fields', async () => {
    const { updateSubscription } = await import('../src/app/actions/admin');
    const result = await updateSubscription('salon-1', {
      subscription_plan: 'pro',
      subscription_status: 'active',
      subscription_expires_at: '2027-01-01T00:00:00Z',
    });
    expect(result).toHaveProperty('success', true);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('updateSalon rejects non-superadmin', async () => {
    const { verifySession } = await import('@/app/actions/auth');
    (verifySession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ salonId: 'salon-1', staffId: 'staff-1', role: 'owner' });
    const { updateSalon } = await import('../src/app/actions/admin');
    await expect(updateSalon('salon-1', { name: 'Hacked' })).rejects.toThrow('Unauthorized');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- test/admin-actions.test.ts
```

Expected: FAIL — `updateSalon` and `updateSubscription` not exported from admin.ts.

- [ ] **Step 3: Add write actions to admin.ts**

Add at the end of `src/app/actions/admin.ts`:

```typescript
export async function updateSalon(salonId: string, updates: {
  name?: string;
  city?: string;
  phone?: string;
  address?: string;
  type?: string;
  admin_notes?: string;
}) {
  await requireSuperAdmin();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('salons')
    .update(updates)
    .eq('id', salonId);

  if (error) throw error;
  return { success: true };
}

export async function updateSubscription(salonId: string, updates: {
  subscription_plan?: string;
  subscription_status?: string;
  subscription_expires_at?: string | null;
}) {
  await requireSuperAdmin();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('salons')
    .update(updates)
    .eq('id', salonId);

  if (error) throw error;
  return { success: true };
}

export async function getAdminSalonMetrics(salonId: string) {
  await requireSuperAdmin();
  const supabase = createServerClient();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    { count: staffCount },
    { count: clientCount },
    { data: monthBills },
    { data: allBills },
  ] = await Promise.all([
    supabase.from('staff').select('*', { count: 'exact', head: true }).eq('salon_id', salonId),
    supabase.from('clients').select('*', { count: 'exact', head: true }).eq('salon_id', salonId),
    supabase.from('bills').select('total_amount, payment_method').eq('salon_id', salonId).gte('created_at', monthStart.toISOString()),
    supabase.from('bills').select('total_amount, created_at').eq('salon_id', salonId).order('created_at', { ascending: false }).limit(100),
  ]);

  const monthlyRevenue = (monthBills || []).reduce((sum: number, b: { total_amount: number }) => sum + (b.total_amount || 0), 0);
  const monthlyBillCount = (monthBills || []).length;
  const totalRevenue = (allBills || []).reduce((sum: number, b: { total_amount: number }) => sum + (b.total_amount || 0), 0);

  // Payment method breakdown
  const paymentBreakdown: Record<string, number> = {};
  (monthBills || []).forEach((b: { payment_method: string; total_amount: number }) => {
    const method = b.payment_method || 'unknown';
    paymentBreakdown[method] = (paymentBreakdown[method] || 0) + (b.total_amount || 0);
  });

  return {
    staffCount: staffCount ?? 0,
    clientCount: clientCount ?? 0,
    monthlyRevenue,
    monthlyBillCount,
    totalRevenue,
    paymentBreakdown,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- test/admin-actions.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/admin.ts test/admin-actions.test.ts
git commit -m "feat(admin): add updateSalon, updateSubscription, getAdminSalonMetrics actions"
```

---

### Task 3: Salon Detail Page — `/admin/salons/[id]`

**Files:**
- Create: `src/app/admin/salons/[id]/page.tsx`
- Modify: `src/app/admin/salons/page.tsx` (link to detail page)

- [ ] **Step 1: Create the salon detail page**

Create `src/app/admin/salons/[id]/page.tsx`:

```tsx
'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Store, Users, CreditCard, TrendingUp,
  Save, Loader2, Eye, Ban, CheckCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppStore } from '@/store/app-store';
import { formatPKR } from '@/lib/utils/currency';
import { formatPKDate } from '@/lib/utils/dates';
import {
  getAdminSalonDetail, getAdminSalonMetrics,
  updateSalon, updateSubscription, getAdminBranchForSalon,
} from '@/app/actions/admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Salon, Branch, Staff, Client, SubscriptionPlan, SubscriptionStatus } from '@/types/database';

const PLAN_OPTIONS: { value: SubscriptionPlan; label: string }[] = [
  { value: 'trial', label: 'Trial' },
  { value: 'basic', label: 'Basic — Rs 2,500/mo' },
  { value: 'growth', label: 'Growth — Rs 5,000/mo' },
  { value: 'pro', label: 'Pro — Rs 9,000/mo' },
];

const STATUS_OPTIONS: { value: SubscriptionStatus; label: string; color: string }[] = [
  { value: 'trial', label: 'Trial', color: 'text-amber-600 bg-amber-500/10 border-amber-500/25' },
  { value: 'active', label: 'Active', color: 'text-green-600 bg-green-500/10 border-green-500/25' },
  { value: 'expired', label: 'Expired', color: 'text-red-600 bg-red-500/10 border-red-500/25' },
  { value: 'suspended', label: 'Suspended', color: 'text-gray-600 bg-gray-500/10 border-gray-500/25' },
];

const TYPE_OPTIONS = ['gents', 'ladies', 'unisex'];

interface Metrics {
  staffCount: number;
  clientCount: number;
  monthlyRevenue: number;
  monthlyBillCount: number;
  totalRevenue: number;
  paymentBreakdown: Record<string, number>;
}

export default function AdminSalonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { setSalon, setCurrentBranch, setCurrentStaff } = useAppStore();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [salon, setSalonData] = useState<Salon | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  // Editable fields
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [type, setType] = useState('unisex');
  const [adminNotes, setAdminNotes] = useState('');
  const [plan, setPlan] = useState<SubscriptionPlan>('trial');
  const [status, setStatus] = useState<SubscriptionStatus>('trial');
  const [expiresAt, setExpiresAt] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [detail, met] = await Promise.all([
          getAdminSalonDetail(id),
          getAdminSalonMetrics(id),
        ]);

        if (!detail.salon) { toast.error('Salon not found'); router.push('/admin/salons'); return; }

        const s = detail.salon as Salon;
        setSalonData(s);
        setBranches(detail.branches as Branch[]);
        setStaff(detail.staff as Staff[]);
        setClients(detail.clients as Client[]);
        setMetrics(met);

        // Populate form
        setName(s.name);
        setCity(s.city || '');
        setPhone(s.phone || '');
        setAddress(s.address || '');
        setType(s.type);
        setAdminNotes(s.admin_notes || '');
        setPlan(s.subscription_plan || 'trial');
        setStatus(s.subscription_status || 'trial');
        setExpiresAt(s.subscription_expires_at ? s.subscription_expires_at.split('T')[0] : '');
      } catch {
        toast.error('Could not load salon');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, router]);

  async function handleSave() {
    setSaving(true);
    try {
      await Promise.all([
        updateSalon(id, { name, city, phone, address, type, admin_notes: adminNotes }),
        updateSubscription(id, {
          subscription_plan: plan,
          subscription_status: status,
          subscription_expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        }),
      ]);
      toast.success('Salon updated');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function enterSalon() {
    if (!salon) return;
    setSalon(salon);
    setCurrentStaff(null);
    try {
      const branch = await getAdminBranchForSalon(salon.id);
      if (branch) setCurrentBranch(branch as Branch);
    } catch { /* */ }
    router.push('/dashboard');
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!salon) return null;

  const statusOption = STATUS_OPTIONS.find((o) => o.value === status) || STATUS_OPTIONS[0];

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin/salons')} className="gap-1">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <div className="flex-1">
          <h2 className="font-heading text-xl font-bold">{salon.name}</h2>
          <p className="text-sm text-muted-foreground">{salon.city} -- Joined {formatPKDate(salon.created_at)}</p>
        </div>
        <Badge variant="outline" className={`text-xs ${statusOption.color}`}>{statusOption.label}</Badge>
        <Button variant="outline" size="sm" className="gap-1" onClick={enterSalon}>
          <Eye className="w-3 h-3" /> Enter Dashboard
        </Button>
      </div>

      {/* Metrics Row */}
      {metrics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Monthly Revenue</p><p className="text-2xl font-bold">{formatPKR(metrics.monthlyRevenue)}</p><p className="text-[10px] text-muted-foreground">{metrics.monthlyBillCount} bills this month</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Revenue</p><p className="text-2xl font-bold">{formatPKR(metrics.totalRevenue)}</p><p className="text-[10px] text-muted-foreground">All time</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Staff</p><p className="text-2xl font-bold">{metrics.staffCount}</p><p className="text-[10px] text-muted-foreground">{staff.filter((s) => s.is_active).length} active</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Clients</p><p className="text-2xl font-bold">{metrics.clientCount}</p><p className="text-[10px] text-muted-foreground">{clients.filter((c) => c.is_vip).length} VIP</p></CardContent></Card>
        </div>
      )}

      {/* Salon Profile Edit */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Store className="w-4 h-4" /> Salon Profile</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label className="text-xs">Salon Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" /></div>
            <div><Label className="text-xs">City</Label><Input value={city} onChange={(e) => setCity(e.target.value)} className="mt-1" /></div>
            <div><Label className="text-xs">Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" /></div>
            <div>
              <Label className="text-xs">Type</Label>
              <select value={type} onChange={(e) => setType(e.target.value)} className="mt-1 w-full h-9 rounded-md border border-border bg-white px-3 text-sm">
                {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div><Label className="text-xs">Address</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1" /></div>
          <div><Label className="text-xs">Admin Notes (internal)</Label><Textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} className="mt-1" rows={2} placeholder="Internal notes about this salon..." /></div>
        </CardContent>
      </Card>

      {/* Subscription Management */}
      <Card className="border-gold/30">
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CreditCard className="w-4 h-4 text-gold" /> Subscription</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">Plan</Label>
              <select value={plan} onChange={(e) => setPlan(e.target.value as SubscriptionPlan)} className="mt-1 w-full h-9 rounded-md border border-border bg-white px-3 text-sm">
                {PLAN_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <select value={status} onChange={(e) => setStatus(e.target.value as SubscriptionStatus)} className="mt-1 w-full h-9 rounded-md border border-border bg-white px-3 text-sm">
                {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Expires At</Label>
              <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="mt-1" />
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" className="text-xs gap-1 text-green-600" onClick={() => { setStatus('active'); setPlan(plan === 'trial' ? 'growth' : plan); }}>
              <CheckCircle className="w-3 h-3" /> Activate
            </Button>
            <Button variant="outline" size="sm" className="text-xs gap-1 text-red-600" onClick={() => setStatus('suspended')}>
              <Ban className="w-3 h-3" /> Suspend
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Payment Breakdown */}
      {metrics && Object.keys(metrics.paymentBreakdown).length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Payment Methods (This Month)</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(metrics.paymentBreakdown).map(([method, amount]) => (
                <div key={method} className="p-3 bg-secondary/50 rounded-lg">
                  <p className="text-xs text-muted-foreground capitalize">{method.replace('_', ' ')}</p>
                  <p className="text-sm font-bold">{formatPKR(amount)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Staff Table */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4" /> Staff ({staff.length})</CardTitle></CardHeader>
        <CardContent className="px-0">
          {staff.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No staff added yet.</p>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead className="pl-4">Name</TableHead><TableHead>Role</TableHead><TableHead>Email</TableHead><TableHead>Phone</TableHead><TableHead className="text-center pr-4">Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {staff.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="pl-4 font-medium text-sm">{s.name}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-[10px]">{s.role.replace('_', ' ')}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.email || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.phone || '—'}</TableCell>
                    <TableCell className="text-center pr-4">
                      <Badge variant="outline" className={`text-[10px] ${s.is_active ? 'text-green-600 border-green-500/25 bg-green-500/10' : 'text-red-600 border-red-500/25 bg-red-500/10'}`}>
                        {s.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Branches */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Branches ({branches.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {branches.map((b) => (
              <div key={b.id} className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                <div>
                  <p className="text-sm font-medium">{b.name}</p>
                  <p className="text-xs text-muted-foreground">{b.address || 'No address'} {b.phone ? `-- ${b.phone}` : ''}</p>
                </div>
                {b.is_main && <Badge variant="outline" className="text-[10px]">Main</Badge>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end pb-6">
        <Button onClick={handleSave} disabled={saving} className="bg-gold text-black border border-gold gap-1">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update salons list page to link to detail**

In `src/app/admin/salons/page.tsx`, replace the `enterSalon` button with a link to the detail page. Change the `<Button>` at the bottom of each card:

Replace:
```tsx
<Button variant="outline" size="sm" className="w-full text-xs gap-1" onClick={() => enterSalon(salon)}>
  <Eye className="w-3 h-3" /> Enter Salon Dashboard
</Button>
```

With:
```tsx
<div className="flex gap-2">
  <Button variant="outline" size="sm" className="flex-1 text-xs gap-1" onClick={() => router.push(`/admin/salons/${salon.id}`)}>
    <Eye className="w-3 h-3" /> Manage
  </Button>
  <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => enterSalon(salon)}>
    Enter
  </Button>
</div>
```

Also add `import Link from 'next/link';` at the top if not already present.

- [ ] **Step 3: Verify build passes**

```bash
npx tsc --noEmit 2>&1 | grep -v test/
```

Expected: No new errors from admin code.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/salons/\[id\]/page.tsx src/app/admin/salons/page.tsx
git commit -m "feat(admin): salon detail page with edit, subscription, metrics"
```

---

### Task 4: User Management Actions

**Files:**
- Create: `src/app/actions/admin-users.ts`
- Modify: `src/app/admin/users/page.tsx`

- [ ] **Step 1: Create admin-users.ts server actions**

```typescript
// src/app/actions/admin-users.ts
'use server';

import { createServerClient } from '@/lib/supabase';
import { verifySession } from './auth';

async function requireSuperAdmin() {
  const session = await verifySession();
  if (!session || session.role !== 'super_admin') {
    throw new Error('Unauthorized');
  }
  return session;
}

export async function toggleStaffActive(staffId: string, isActive: boolean) {
  await requireSuperAdmin();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('staff')
    .update({ is_active: isActive })
    .eq('id', staffId);

  if (error) throw error;
  return { success: true };
}

export async function resetUserPassword(email: string, newPassword: string) {
  await requireSuperAdmin();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // Find user by email
  const listRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'apikey': anonKey,
    },
  });
  const listData = await listRes.json();
  const users = listData.users || listData || [];
  const user = users.find((u: { email: string }) => u.email === email);
  if (!user) throw new Error('User not found in auth system');

  // Update password
  const updateRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.id}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'apikey': anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password: newPassword }),
  });

  if (!updateRes.ok) {
    const err = await updateRes.json();
    throw new Error(err.message || 'Failed to reset password');
  }

  return { success: true };
}
```

- [ ] **Step 2: Update the users page with actions**

Rewrite `src/app/admin/users/page.tsx` to add:
- Deactivate/reactivate toggle button per user
- Reset Password dialog (using prompt for simplicity)
- Last login column
- Filter by salon dropdown

Replace the imports and add the action imports:

```tsx
import { getAdminUsers } from '@/app/actions/admin';
import { toggleStaffActive, resetUserPassword } from '@/app/actions/admin-users';
```

Add to each user row in the table — a new "Actions" column after Status:

```tsx
<TableHead className="text-center pr-4">Actions</TableHead>
```

And in the body for each staff user, add action buttons:

```tsx
<TableCell className="text-center pr-4">
  <div className="flex items-center justify-center gap-1">
    <Button
      variant="ghost"
      size="sm"
      className={`h-7 text-xs ${u.isActive ? 'text-red-600' : 'text-green-600'}`}
      onClick={async () => {
        try {
          await toggleStaffActive(u.id, !u.isActive);
          toast.success(u.isActive ? 'Deactivated' : 'Reactivated');
          // Refresh
          window.location.reload();
        } catch { toast.error('Failed'); }
      }}
    >
      {u.isActive ? 'Deactivate' : 'Activate'}
    </Button>
    {u.email && (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs"
        onClick={async () => {
          const pw = window.prompt(`New password for ${u.email}:`);
          if (!pw) return;
          try {
            await resetUserPassword(u.email, pw);
            toast.success('Password reset');
          } catch { toast.error('Failed to reset password'); }
        }}
      >
        Reset PW
      </Button>
    )}
  </div>
</TableCell>
```

Note: The `StaffUser` interface needs `id` and `isActive` fields added to support the actions:

```typescript
interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: string;
  salon: string;
  status: string;
  isActive: boolean;
  lastLogin: string | null;
}
```

Update the mapping in `fetchUsers` to include `id`, `isActive`, and `lastLogin`:

```typescript
const mapped: StaffUser[] = staff.map((s: { id: string; name: string; email?: string; role: string; salon?: { name: string }; is_active?: boolean; last_login_at?: string }) => ({
  id: s.id,
  name: s.name,
  email: s.email || '',
  role: ROLE_LABELS[s.role] || s.role,
  salon: s.salon?.name || '—',
  status: s.is_active !== false ? 'Active' : 'Inactive',
  isActive: s.is_active !== false,
  lastLogin: s.last_login_at || null,
}));
```

Add a "Last Login" column between "Salon" and "Status":

```tsx
<TableHead>Last Login</TableHead>
```

```tsx
<TableCell className="text-sm text-muted-foreground">{u.lastLogin ? formatPKDate(u.lastLogin) : 'Never'}</TableCell>
```

Add the import: `import { formatPKDate } from '@/lib/utils/dates';`

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit 2>&1 | grep -v test/
```

- [ ] **Step 4: Commit**

```bash
git add src/app/actions/admin-users.ts src/app/admin/users/page.tsx
git commit -m "feat(admin): user management — deactivate, reset password, last login"
```

---

### Task 5: Platform Settings — DB-Backed Persistence

**Files:**
- Create: `src/app/actions/admin-settings.ts`
- Modify: `src/app/admin/settings/page.tsx`

- [ ] **Step 1: Create admin-settings.ts**

```typescript
// src/app/actions/admin-settings.ts
'use server';

import { createServerClient } from '@/lib/supabase';
import { verifySession } from './auth';

async function requireSuperAdmin() {
  const session = await verifySession();
  if (!session || session.role !== 'super_admin') {
    throw new Error('Unauthorized');
  }
  return session;
}

export async function getPlatformSettings() {
  await requireSuperAdmin();
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('platform_settings')
    .select('key, value');

  if (error) throw error;

  const settings: Record<string, Record<string, unknown>> = {};
  (data || []).forEach((row: { key: string; value: Record<string, unknown> }) => {
    settings[row.key] = row.value;
  });

  return settings;
}

export async function savePlatformSetting(key: string, value: Record<string, unknown>) {
  await requireSuperAdmin();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('platform_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });

  if (error) throw error;
  return { success: true };
}
```

- [ ] **Step 2: Update settings page to use DB**

In `src/app/admin/settings/page.tsx`:

1. Remove `const STORAGE_KEY = 'icut_platform_settings';` 
2. Add imports: `import { getPlatformSettings, savePlatformSetting } from '@/app/actions/admin-settings';`
3. Replace the `useEffect` that reads from localStorage:

```typescript
useEffect(() => {
  async function loadSettings() {
    try {
      const data = await getPlatformSettings();
      const general = data.general || {};
      const email = data.email || {};
      const plans = data.plans || {};
      const trial = data.trial || {};
      const payment = data.payment || {};

      setSettings({
        platformName: (general.platformName as string) || DEFAULT_SETTINGS.platformName,
        platformDomain: (general.platformDomain as string) || DEFAULT_SETTINGS.platformDomain,
        supportWhatsApp: (general.supportWhatsApp as string) || '',
        supportEmail: (general.supportEmail as string) || DEFAULT_SETTINGS.supportEmail,
        sendgridKey: (email.sendgridKey as string) || '',
        fromEmail: (email.fromEmail as string) || DEFAULT_SETTINGS.fromEmail,
        fromName: (email.fromName as string) || DEFAULT_SETTINGS.fromName,
        emailEnabled: (email.enabled as boolean) || false,
        enabledTemplates: (email.enabledTemplates as Record<string, boolean>) || DEFAULT_SETTINGS.enabledTemplates,
        plans: {
          Basic: plans.basic ? { price: String((plans.basic as Record<string, unknown>).price || '2500'), branches: String((plans.basic as Record<string, unknown>).branches || '1'), staff: String((plans.basic as Record<string, unknown>).staff || '3') } : DEFAULT_SETTINGS.plans.Basic,
          Growth: plans.growth ? { price: String((plans.growth as Record<string, unknown>).price || '5000'), branches: String((plans.growth as Record<string, unknown>).branches || '1'), staff: String((plans.growth as Record<string, unknown>).staff || '0') } : DEFAULT_SETTINGS.plans.Growth,
          Pro: plans.pro ? { price: String((plans.pro as Record<string, unknown>).price || '9000'), branches: String((plans.pro as Record<string, unknown>).branches || '3'), staff: String((plans.pro as Record<string, unknown>).staff || '0') } : DEFAULT_SETTINGS.plans.Pro,
        },
        trialDuration: String((trial.durationDays as number) || 14),
        gracePeriod: String((trial.graceDays as number) || 3),
        requirePaymentOnSignup: (trial.requirePayment as boolean) || false,
        jazzcashAccount: (payment.jazzcashAccount as string) || '',
        bankAccount: (payment.bankAccount as string) || '',
      });
    } catch {
      toast.error('Could not load settings from server');
    }
  }
  loadSettings();
}, []);
```

4. Replace the `saveSettings` function:

```typescript
async function saveSettings() {
  try {
    await Promise.all([
      savePlatformSetting('general', {
        platformName: settings.platformName,
        platformDomain: settings.platformDomain,
        supportWhatsApp: settings.supportWhatsApp,
        supportEmail: settings.supportEmail,
      }),
      savePlatformSetting('email', {
        enabled: settings.emailEnabled,
        fromEmail: settings.fromEmail,
        fromName: settings.fromName,
        sendgridKey: settings.sendgridKey,
        enabledTemplates: settings.enabledTemplates,
      }),
      savePlatformSetting('plans', {
        basic: { price: Number(settings.plans.Basic.price), branches: Number(settings.plans.Basic.branches), staff: settings.plans.Basic.staff === 'Unlimited' ? 0 : Number(settings.plans.Basic.staff) },
        growth: { price: Number(settings.plans.Growth.price), branches: Number(settings.plans.Growth.branches), staff: settings.plans.Growth.staff === 'Unlimited' ? 0 : Number(settings.plans.Growth.staff) },
        pro: { price: Number(settings.plans.Pro.price), branches: Number(settings.plans.Pro.branches), staff: settings.plans.Pro.staff === 'Unlimited' ? 0 : Number(settings.plans.Pro.staff) },
      }),
      savePlatformSetting('trial', {
        durationDays: Number(settings.trialDuration),
        graceDays: Number(settings.gracePeriod),
        requirePayment: settings.requirePaymentOnSignup,
      }),
      savePlatformSetting('payment', {
        jazzcashAccount: settings.jazzcashAccount,
        bankAccount: settings.bankAccount,
      }),
    ]);
    toast.success('Platform settings saved to database');
  } catch {
    toast.error('Failed to save settings');
  }
}
```

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit 2>&1 | grep -v test/
```

- [ ] **Step 4: Commit**

```bash
git add src/app/actions/admin-settings.ts src/app/admin/settings/page.tsx
git commit -m "feat(admin): persist platform settings to database instead of localStorage"
```

---

### Task 6: Dashboard — Fix Subscription Cards with Real Data

**Files:**
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Update the dashboard to use real subscription data**

The dashboard currently approximates "Paid" = setup_complete and "Trial" = not setup_complete. Now we have real `subscription_status` fields. Update `getAdminDashboardData` in `src/app/actions/admin.ts`:

Replace the stats calculation section:

```typescript
  const activeSalons = liveSalons.filter((s) => s.subscription_status === 'active').length;
  const trialSalons = liveSalons.filter((s) => s.subscription_status === 'trial').length;
  const expiredSalons = liveSalons.filter((s) => s.subscription_status === 'expired' || s.subscription_status === 'suspended').length;
  const pendingSetup = liveSalons.filter((s) => !s.setup_complete).length;
```

And update the return stats:

```typescript
    stats: {
      totalSalons: liveSalons.length,
      activeSalons,
      pendingSetup,
      totalStaff: staffCount ?? 0,
      totalClients: clientCount ?? 0,
      monthlyRevenue,
      monthlyBills,
      trialSalons,
      paidSalons: activeSalons,
      churnedSalons: expiredSalons,
      topCity,
    },
```

Then in `src/app/admin/page.tsx`, change the third subscription card from "Pending Setup" to "Expired/Suspended":

```tsx
<Card className="border-orange-500/20 bg-orange-500/10">
  <CardContent className="p-4 text-center">
    <AlertTriangle className="w-5 h-5 text-orange-600 mx-auto mb-1" />
    <p className="text-2xl font-bold text-orange-600">{platformStats.churnedSalons}</p>
    <p className="text-xs text-orange-600">Expired / Suspended</p>
  </CardContent>
</Card>
```

Also add a subscription status badge to each salon row in the table. In the `Status` column, replace the simple setup_complete check:

```tsx
<TableCell>
  {(() => {
    const sub = salon.subscription_status || (salon.setup_complete ? 'active' : 'trial');
    const colors: Record<string, string> = {
      active: 'text-green-600 border-green-500/25 bg-green-500/10',
      trial: 'text-amber-600 border-amber-500/25 bg-amber-500/10',
      expired: 'text-red-600 border-red-500/25 bg-red-500/10',
      suspended: 'text-gray-600 border-gray-500/25 bg-gray-500/10',
    };
    return <Badge variant="outline" className={`text-[10px] ${colors[sub] || colors.trial}`}>{sub.charAt(0).toUpperCase() + sub.slice(1)}</Badge>;
  })()}
</TableCell>
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit 2>&1 | grep -v test/
```

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/admin.ts src/app/admin/page.tsx
git commit -m "feat(admin): dashboard shows real subscription status instead of setup_complete proxy"
```

---

### Task 7: Run Tests + Deploy

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: All existing tests pass, new admin-actions tests pass.

- [ ] **Step 2: Deploy**

> IP addresses redacted — see ops runbook in password manager. `icut-vps` is
> a `~/.ssh/config` alias that resolves to the current VPS host/user/key.

```bash
git push origin main
ssh icut-vps "cd \"$VPS_APP_PATH\" && git pull origin main && docker compose up -d --build app"
```

- [ ] **Step 3: Verify in production**

1. Log in as superadmin at icut.pk/login
2. Check /admin — subscription cards show real data
3. Click a salon — detail page loads with metrics, profile edit, subscription controls
4. Edit salon name, save — verify it persists
5. Change subscription to "Pro" + "Active", save — verify it persists
6. Go to /admin/users — deactivate a staff member, verify it works
7. Go to /admin/settings — save settings, refresh, verify they persist (not localStorage)
