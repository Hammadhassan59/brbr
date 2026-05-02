'use client';

import { use, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, Save, Users, UserCheck, DollarSign, TrendingUp,
  CreditCard, Zap, Ban, Building2, MapPin, Key, Copy, Check, AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppStore } from '@/store/app-store';
import { formatPKR } from '@/lib/utils/currency';
import { formatPKDate } from '@/lib/utils/dates';
import {
  getAdminSalonDetail,
  getAdminSalonMetrics,
  getAdminBranchForSalon,
  updateSalon,
  updateSubscription,
  setSalonSoldByAgent,
  impersonateSalon,
  deleteSalonAndAllData,
  activateSalonManually,
} from '@/app/actions/admin';
import { listSalesAgents } from '@/app/actions/sales-agents';
import { generateSalonOwnerPassword } from '@/app/actions/admin-users';
import { getPublicPlatformConfig } from '@/app/actions/admin-settings';
import type { SalesAgent } from '@/types/sales';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import type {
  Salon, Branch, Staff, Client,
  SalonType, SubscriptionPlan, SubscriptionStatus,
} from '@/types/database';

const STATUS_BADGE: Record<SubscriptionStatus, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-orange-500/15 text-orange-600 border-orange-500/25' },
  active: { label: 'Active', cls: 'bg-green-500/15 text-green-600 border-green-500/25' },
  expired: { label: 'Expired', cls: 'bg-red-500/15 text-red-600 border-red-500/25' },
  suspended: { label: 'Suspended', cls: 'bg-red-500/15 text-red-600 border-red-500/25' },
};

// Fallback labels — only used until the live platform_settings load resolves.
// Real labels come from getPublicPlatformConfig and reflect what super admin
// has configured in /admin/settings (and shown on /paywall + /dashboard/billing).
const PLAN_PRICES_FALLBACK: Record<SubscriptionPlan, string> = {
  none: 'No Plan',
  basic: 'Basic — Rs 2,500/mo',
  growth: 'Growth — Rs 5,000/mo',
  pro: 'Pro — Rs 9,000/mo',
};

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  receptionist: 'Receptionist',
  senior_stylist: 'Sr. Stylist',
  junior_stylist: 'Jr. Stylist',
  helper: 'Helper',
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  jazzcash: 'JazzCash',
  easypaisa: 'Easypaisa',
  bank_transfer: 'Bank Transfer',
  card: 'Card',
  udhaar: 'Udhaar',
  split: 'Split',
  unknown: 'Unknown',
};

interface Metrics {
  staffCount: number;
  clientCount: number;
  monthlyRevenue: number;
  monthlyBillCount: number;
  totalRevenue: number;
  paymentBreakdown: Record<string, number>;
}

export default function AdminSalonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { setSalon, setBranches: setStoreBranches, setCurrentBranch, setIsOwner, setIsPartner, setIsSuperAdmin, setCurrentStaff, setCurrentPartner } = useAppStore();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Password reset modal state. Holds the generated password only for the
  // duration of the modal — cleared on close so it's never in component
  // memory after the admin has copied + shared it.
  const [pwOpen, setPwOpen] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwResult, setPwResult] = useState<{ email: string; password: string } | null>(null);
  const [pwCopied, setPwCopied] = useState(false);

  // Detail data
  const [salon, setSalonData] = useState<Salon | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  // Editable salon fields
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [salonType, setSalonType] = useState<SalonType>('gents');
  const [adminNotes, setAdminNotes] = useState('');

  // Editable subscription fields
  const [plan, setPlan] = useState<SubscriptionPlan>('none');
  const [status, setStatus] = useState<SubscriptionStatus>('pending');
  const [expiresAt, setExpiresAt] = useState('');

  // Live plan price labels from platform_settings, so the dropdown reflects
  // what the super admin set in /admin/settings (and what the tenant sees
  // on /paywall + /dashboard/billing). Falls back to the constant above.
  const [planPrices, setPlanPrices] = useState<Record<SubscriptionPlan, string>>(PLAN_PRICES_FALLBACK);

  useEffect(() => {
    let cancelled = false;
    getPublicPlatformConfig()
      .then((cfg) => {
        if (cancelled) return;
        setPlanPrices({
          none: 'No Plan',
          basic: `${cfg.plans.basic.displayName || 'Basic'} — Rs ${cfg.plans.basic.price.toLocaleString()}/mo`,
          growth: `${cfg.plans.growth.displayName || 'Growth'} — Rs ${cfg.plans.growth.price.toLocaleString()}/mo`,
          pro: `${cfg.plans.pro.displayName || 'Pro'} — Rs ${cfg.plans.pro.price.toLocaleString()}/mo`,
        });
      })
      .catch(() => { /* keep fallback */ });
    return () => { cancelled = true; };
  }, []);

  // Sales agents
  const [agents, setAgents] = useState<SalesAgent[]>([]);

  const load = useCallback(async () => {
    try {
      const [detail, metricsData] = await Promise.all([
        getAdminSalonDetail(id),
        getAdminSalonMetrics(id),
      ]);

      const s = detail.salon as Salon;
      setSalonData(s);
      setBranches(detail.branches as Branch[]);
      setStaff(detail.staff as Staff[]);
      setClients(detail.clients as Client[]);
      setMetrics(metricsData as Metrics);

      // Populate editable fields
      setName(s.name);
      setCity(s.city || '');
      setPhone(s.phone || '');
      setAddress(s.address || '');
      setSalonType(s.type);
      setAdminNotes(s.admin_notes || '');
      setPlan(s.subscription_plan);
      setStatus(s.subscription_status);
      setExpiresAt(s.subscription_expires_at ? s.subscription_expires_at.split('T')[0] : '');
    } catch {
      toast.error('Failed to load salon details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    listSalesAgents().then((r) => setAgents(r.data));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await Promise.all([
        updateSalon(id, {
          name,
          city,
          phone,
          address,
          type: salonType,
          admin_notes: adminNotes,
        }),
        updateSubscription(id, {
          subscription_plan: plan,
          subscription_status: status,
          subscription_expires_at: expiresAt || null,
        }),
      ]);
      toast.success('Salon updated');
    } catch {
      toast.error('Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  async function handleActivate() {
    const activePlan = plan === 'none' ? 'basic' : plan;
    const confirmed = window.confirm(
      `Activate "${salon?.name ?? 'this salon'}" on the ${activePlan.toUpperCase()} plan for 30 days without a payment?\n\n` +
        `This will be recorded in admin_audit_log and as an approved payment_requests row marked admin_override.`,
    );
    if (!confirmed) return;
    setPlan(activePlan);
    setStatus('active');
    setSaving(true);
    try {
      const { error } = await activateSalonManually(id, { plan: activePlan });
      if (error) {
        toast.error(error);
        return;
      }
      // Refresh expires_at display on the form.
      const newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      setExpiresAt(newExpiry);
      toast.success(`Activated on ${activePlan} plan until ${newExpiry}`);
    } catch {
      toast.error('Failed to activate');
    } finally {
      setSaving(false);
    }
  }

  async function handleSuspend() {
    setStatus('suspended');
    setSaving(true);
    try {
      await updateSubscription(id, { subscription_status: 'suspended' });
      toast.success('Subscription suspended');
    } catch {
      toast.error('Failed to suspend');
    } finally {
      setSaving(false);
    }
  }

  async function handleGeneratePassword() {
    if (!salon) return;
    setPwLoading(true);
    setPwCopied(false);
    try {
      const res = await generateSalonOwnerPassword(salon.id);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setPwResult({ email: res.email, password: res.password });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate password');
    } finally {
      setPwLoading(false);
    }
  }

  async function copyGeneratedPassword() {
    if (!pwResult) return;
    try {
      await navigator.clipboard.writeText(pwResult.password);
      setPwCopied(true);
      toast.success('Password copied');
      window.setTimeout(() => setPwCopied(false), 2500);
    } catch {
      toast.error('Copy failed — select and copy manually');
    }
  }

  function closePwModal() {
    // Always clear the password from state when the modal closes so it
    // doesn't linger in memory after the admin has already shared it.
    setPwOpen(false);
    setPwResult(null);
    setPwCopied(false);
  }

  async function enterDashboard() {
    if (!salon) return;
    const { data, error } = await impersonateSalon(salon.id);
    if (error || !data) {
      toast.error(error || 'Could not start impersonation');
      return;
    }
    // The iCut JWT swap (signSession) already happened server-side inside
    // impersonateSalon(). Proxy verifies the new icut-token on next nav.
    // Mirror a normal owner login into Zustand so every {isOwner && ...} gate opens.
    setSalon(data.salon as unknown as Salon);
    setStoreBranches((data.branches as unknown) as Branch[]);
    setCurrentBranch(data.mainBranch as unknown as Branch);
    setIsOwner(true);
    setIsPartner(false);
    setIsSuperAdmin(false);
    setCurrentStaff(null);
    setCurrentPartner(null);
    window.location.href = '/dashboard';
  }

  async function deleteTenant() {
    if (!salon) return;
    const typed = window.prompt(
      `DANGER — this permanently deletes "${salon.name}" and ALL of its data.\n\nType the salon name exactly to confirm:`,
    );
    if (typed === null) return;
    if (typed.trim() !== salon.name.trim()) {
      toast.error('Salon name did not match — deletion cancelled');
      return;
    }
    const { success, deletedAuthUsers, error } = await deleteSalonAndAllData(salon.id, typed.trim());
    if (!success) {
      toast.error(error || 'Delete failed');
      return;
    }
    toast.success(`${salon.name} deleted — ${deletedAuthUsers} login accounts removed`);
    router.push('/admin/salons');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!salon) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        Salon not found
      </div>
    );
  }

  const activeStaff = staff.filter((s) => s.is_active).length;
  const vipClients = clients.filter((c) => c.is_vip).length;
  const statusBadge = STATUS_BADGE[salon.subscription_status];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <Button
            variant="outline"
            size="sm"
            className="h-9 w-9 p-0 shrink-0"
            onClick={() => router.push('/admin/salons')}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-heading text-lg sm:text-xl font-bold break-words">{salon.name}</h2>
              <Badge variant="outline" className={`text-[10px] ${statusBadge.cls}`}>
                {statusBadge.label}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {salon.city} — Joined {formatPKDate(salon.created_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          <Button size="sm" variant="outline" className="flex-1 sm:flex-initial h-10 sm:h-9" onClick={() => { setPwOpen(true); setPwResult(null); }}>
            <Key className="w-4 h-4 mr-1.5" /> Reset Owner Password
          </Button>
          <Button size="sm" variant="outline" className="flex-1 sm:flex-initial h-10 sm:h-9 text-destructive border-destructive/40 hover:bg-destructive/10" onClick={deleteTenant}>
            Delete Tenant
          </Button>
          <Button size="sm" className="flex-1 sm:flex-initial h-10 sm:h-9 bg-gold text-black border border-gold" onClick={enterDashboard}>
            Enter Dashboard
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <Card size="sm">
            <CardContent className="pt-0">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-gold" />
                <span className="text-xs text-muted-foreground">Monthly Revenue</span>
              </div>
              <p className="font-heading text-base sm:text-lg font-bold break-all">{formatPKR(metrics.monthlyRevenue)}</p>
              <p className="text-[10px] text-muted-foreground">{metrics.monthlyBillCount} bills</p>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent className="pt-0">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-gold" />
                <span className="text-xs text-muted-foreground">Total Revenue</span>
              </div>
              <p className="font-heading text-base sm:text-lg font-bold break-all">{formatPKR(metrics.totalRevenue)}</p>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent className="pt-0">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-gold" />
                <span className="text-xs text-muted-foreground">Staff</span>
              </div>
              <p className="font-heading text-base sm:text-lg font-bold">{metrics.staffCount}</p>
              <p className="text-[10px] text-muted-foreground">{activeStaff} active</p>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent className="pt-0">
              <div className="flex items-center gap-2 mb-1">
                <UserCheck className="w-4 h-4 text-gold" />
                <span className="text-xs text-muted-foreground">Clients</span>
              </div>
              <p className="font-heading text-base sm:text-lg font-bold">{metrics.clientCount}</p>
              <p className="text-[10px] text-muted-foreground">{vipClients} VIP</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Salon Profile Edit */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Salon Profile</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="salon-name">Name</Label>
              <Input id="salon-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="salon-city">City</Label>
              <Input id="salon-city" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="salon-phone">Phone</Label>
              <Input id="salon-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="salon-type">Type</Label>
              <select
                id="salon-type"
                value={salonType}
                onChange={(e) => setSalonType(e.target.value as SalonType)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="gents">Gents</option>
                <option value="ladies">Ladies</option>
                <option value="unisex">Unisex</option>
              </select>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="salon-address">Address</Label>
              <Input id="salon-address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="admin-notes">Admin Notes</Label>
              <Textarea
                id="admin-notes"
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Internal notes about this salon..."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subscription Management */}
      <Card className="border-gold/40">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-gold" />
            Subscription Management
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="sub-plan">Plan</Label>
              <select
                id="sub-plan"
                value={plan}
                onChange={(e) => setPlan(e.target.value as SubscriptionPlan)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {Object.entries(planPrices).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sub-status">Status</Label>
              <select
                id="sub-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as SubscriptionStatus)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="pending">Pending</option>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sub-expires">Expires At</Label>
              <Input
                id="sub-expires"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t">
            <Button
              size="sm"
              className="h-10 sm:h-9 bg-green-600 text-white hover:bg-green-700 gap-1"
              onClick={handleActivate}
              disabled={saving}
            >
              <Zap className="w-3 h-3" />
              Activate
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-10 sm:h-9 text-red-600 border-red-500/25 hover:bg-red-500/10 gap-1"
              onClick={handleSuspend}
              disabled={saving}
            >
              <Ban className="w-3 h-3" />
              Suspend
            </Button>
            {salon.subscription_started_at && (
              <span className="text-xs text-muted-foreground w-full sm:w-auto sm:ml-auto">
                Started {formatPKDate(salon.subscription_started_at)}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sold by agent */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Sold by agent</CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-2">
          <p className="text-xs text-muted-foreground">
            Reassigning transfers future renewal commissions to the new agent. Past commissions stay with the original agent.
          </p>
          <select
            value={salon.sold_by_agent_id || ''}
            onChange={async (e) => {
              const v = e.target.value || null;
              try {
                await setSalonSoldByAgent(salon.id, v);
                toast.success('Updated');
                await load();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Failed');
              }
            }}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">— None —</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}{!a.active ? ' (inactive)' : ''}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {/* Payment Methods Breakdown */}
      {metrics && Object.keys(metrics.paymentBreakdown).length > 0 && (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Payment Methods — This Month</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(metrics.paymentBreakdown).map(([method, amount]) => (
                <div key={method} className="border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">
                    {PAYMENT_LABELS[method] || method}
                  </p>
                  <p className="font-heading font-semibold break-all">{formatPKR(amount)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Staff Table */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Staff ({staff.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 px-0">
          {staff.length === 0 ? (
            <p className="text-sm text-muted-foreground px-4 py-6 text-center">No staff registered</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium whitespace-nowrap">{member.name}</TableCell>
                      <TableCell className="whitespace-nowrap">{ROLE_LABELS[member.role] || member.role}</TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">{member.email || '—'}</TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">{member.phone || '—'}</TableCell>
                      <TableCell>
                        {member.is_active ? (
                          <Badge variant="outline" className="text-[10px] text-green-600 border-green-500/25 bg-green-500/10">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-red-600 border-red-500/25 bg-red-500/10">
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Branches */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            Branches ({branches.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {branches.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No branches</p>
          ) : (
            <div className="space-y-3">
              {branches.map((branch) => (
                <div key={branch.id} className="flex items-start gap-3 border rounded-lg p-3">
                  <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{branch.name}</p>
                      {branch.is_main && (
                        <Badge variant="outline" className="text-[10px] bg-gold/10 text-gold border-gold/25">
                          Main
                        </Badge>
                      )}
                    </div>
                    {branch.address && (
                      <p className="text-xs text-muted-foreground mt-0.5">{branch.address}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-stretch sm:justify-end pb-6">
        <Button
          className="w-full sm:w-auto h-11 sm:h-10 bg-gold text-black border border-gold gap-2"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </Button>
      </div>

      {/* Reset Owner Password modal */}
      {pwOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) closePwModal(); }}
        >
          <div className="bg-card border border-border rounded-lg shadow-lg w-full max-w-md">
            <div className="p-5 border-b border-border">
              <h2 className="font-heading text-lg font-semibold flex items-center gap-2">
                <Key className="w-5 h-5 text-gold" /> Reset owner password
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Generates a new login password for <span className="font-medium">{salon?.name}</span>&apos;s owner account. The old password stops working immediately.
              </p>
            </div>

            {!pwResult ? (
              <div className="p-5 space-y-4">
                <div className="flex gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/25">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-500">
                    The new password will be shown <strong>once</strong>. Copy it now and share with the owner via WhatsApp, SMS, or call. It will NOT be shown again.
                  </p>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={closePwModal} disabled={pwLoading}>Cancel</Button>
                  <Button className="bg-gold text-black border border-gold" onClick={handleGeneratePassword} disabled={pwLoading}>
                    {pwLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Key className="w-4 h-4 mr-1.5" />}
                    Generate new password
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <div className="mt-1 font-mono text-sm">{pwResult.email}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">New password</Label>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex-1 font-mono text-base p-2.5 rounded-md border border-border bg-secondary/30 select-all tracking-wider break-all">
                      {pwResult.password}
                    </div>
                    <Button
                      size="sm"
                      variant={pwCopied ? 'default' : 'outline'}
                      onClick={copyGeneratedPassword}
                      className={pwCopied ? 'bg-green-600 text-white border-green-600' : ''}
                    >
                      {pwCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Your iCut password has been reset. Email: ${pwResult.email} — New password: ${pwResult.password} — Please log in and change it from Settings.`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center text-sm text-gold hover:underline"
                >
                  Open WhatsApp to share
                </a>
                <div className="flex justify-end pt-2">
                  <Button onClick={closePwModal}>Done</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
