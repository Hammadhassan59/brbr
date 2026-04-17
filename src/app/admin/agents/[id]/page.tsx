'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Copy, KeyRound, TrendingUp, Wallet, Store, Banknote, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { getSalesAgent, updateAgentRates, setAgentActive, updateAgentProfile, getDemoCredentials, setDemoPassword } from '@/app/actions/sales-agents';
import { getAgentReport, type AgentReport } from '@/app/actions/agent-commissions';
import type { SalesAgent } from '@/types/sales';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatPKR } from '@/lib/utils/currency';
import { formatPKDate } from '@/lib/utils/dates';

export default function AgentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [agent, setAgent] = useState<SalesAgent | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', city: '', firstSalePct: '0', renewalPct: '0' });
  const [saving, setSaving] = useState(false);
  const [demoEmail, setDemoEmail] = useState<string | null>(null);
  const [showResetDemo, setShowResetDemo] = useState(false);
  const [newDemoPwd, setNewDemoPwd] = useState('');
  const [resettingDemo, setResettingDemo] = useState(false);

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
    const { data: demo } = await getDemoCredentials(params.id);
    setDemoEmail(demo?.email ?? null);
  }

  async function resetDemo() {
    if (newDemoPwd.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setResettingDemo(true);
    const { error } = await setDemoPassword(params.id, newDemoPwd);
    setResettingDemo(false);
    if (error) { toast.error(error); return; }
    toast.success('Demo password updated');
    setShowResetDemo(false);
    setNewDemoPwd('');
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [params.id]);

  if (!agent) return <p className="text-muted-foreground">Loading…</p>;

  async function saveProfile() {
    if (!agent) return;
    if (!form.phone.trim()) { toast.error('Phone is required'); return; }
    setSaving(true);
    const [p, r] = await Promise.all([
      updateAgentProfile(agent.id, { name: form.name, phone: form.phone.trim(), city: form.city || null }),
      updateAgentRates(agent.id, { firstSalePct: Number(form.firstSalePct), renewalPct: Number(form.renewalPct) }),
    ]);
    setSaving(false);
    if (p.error || r.error) { toast.error(p.error || r.error || 'Save failed'); return; }
    toast.success('Saved');
    load();
  }

  async function toggleActive() {
    if (!agent) return;
    if (agent.active && !confirm('Deactivate this agent? They will no longer be able to log in (demo login is also blocked). Their leads, commissions, and payouts stay intact.')) return;
    const { error } = await setAgentActive(agent.id, !agent.active);
    if (error) { toast.error(error); return; }
    toast.success(agent.active ? 'Agent + demo deactivated' : 'Agent + demo reactivated');
    load();
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <h2 className="font-heading text-2xl font-semibold">{agent.name}</h2>

      <Tabs defaultValue="reports">
        <TabsList>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="profile">Profile &amp; Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="reports">
          <ReportsTab agentId={agent.id} />
        </TabsContent>

        <TabsContent value="profile">
          <div className="space-y-6">
            <div className="border border-gold/30 bg-gold/5 rounded-lg p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Agent code</p>
                <p className="font-mono text-2xl font-bold text-gold mt-1">{agent.code}</p>
                <p className="text-xs text-muted-foreground mt-1">Share this code with new salons so the agent gets credit on signup.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigator.clipboard.writeText(agent.code).then(() => toast.success(`${agent.code} copied`))}
              >
                <Copy className="w-4 h-4 mr-1.5" /> Copy
              </Button>
            </div>

            {demoEmail && (
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Demo login</p>
                    <p className="font-mono text-sm break-all mt-1">{demoEmail}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Demo data resets every 10 minutes. Deactivating this agent also blocks the demo login.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigator.clipboard.writeText(demoEmail).then(() => toast.success('Email copied'))}
                  >
                    <Copy className="w-4 h-4 mr-1.5" /> Copy email
                  </Button>
                </div>
                {showResetDemo ? (
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Label className="text-xs">New demo password (8+ chars)</Label>
                      <Input
                        type="text"
                        value={newDemoPwd}
                        onChange={(e) => setNewDemoPwd(e.target.value)}
                        className="font-mono mt-1"
                        placeholder="Enter new password"
                      />
                    </div>
                    <Button onClick={resetDemo} disabled={resettingDemo}>{resettingDemo ? 'Saving…' : 'Save'}</Button>
                    <Button variant="outline" onClick={() => { setShowResetDemo(false); setNewDemoPwd(''); }}>Cancel</Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setShowResetDemo(true)}>
                    <KeyRound className="w-4 h-4 mr-1.5" /> Reset demo password
                  </Button>
                )}
              </div>
            )}

            <div className="space-y-4 border rounded-lg p-5">
              <h3 className="font-medium">Profile</h3>
              <div className="grid grid-cols-1 gap-3">
                <div><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                <div><Label>Phone *</Label><Input type="tel" inputMode="tel" autoComplete="tel" required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}

const FUNNEL_LABELS: Record<string, string> = {
  new: 'New', contacted: 'Contacted', visited: 'Visited', followup: 'Follow-up',
  interested: 'Interested', not_interested: 'Not interested', onboarded: 'Onboarded',
  converted: 'Converted', lost: 'Lost',
};

function ReportsTab({ agentId }: { agentId: string }) {
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<AgentReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await getAgentReport({ agentId, from, to });
    if (error) toast.error(error);
    setReport(data);
    setLoading(false);
  }, [agentId, from, to]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  if (loading || !report) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <Label className="text-xs">From</Label>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36 h-9" />
        <Label className="text-xs">To</Label>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36 h-9" />
        <p className="text-xs text-muted-foreground ml-auto">
          Date range filters commissions, payouts and cash. Funnel and salons sold are lifetime.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI icon={TrendingUp} label="Earned (period)" value={formatPKR(report.commissions.earned_total)} sub={`${formatPKR(report.commissions.paid_total)} paid out`} />
        <KPI icon={Wallet} label="Available now" value={formatPKR(report.commissions.available_total)} sub="Approved, not yet paid" />
        <KPI icon={Store} label="Salons sold" value={String(report.salons_sold.total)} sub={`${report.salons_sold.active} active`} />
        <KPI icon={Banknote} label="Cash balance" value={formatPKR(report.cash_ledger.balance)} sub={report.cash_ledger.balance > 0 ? 'Owed to admin' : report.cash_ledger.balance < 0 ? 'Owed to agent' : 'Settled'} />
      </div>

      {report.commissions.monthly.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-semibold mb-3">Monthly commissions</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.commissions.monthly} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => formatPKR(Number(v))} />
                  <Legend />
                  <Bar dataKey="earned" fill="#d4af37" name="Earned" />
                  <Bar dataKey="paid" fill="#22c55e" name="Paid" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-semibold mb-3">Lead funnel (lifetime)</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {(Object.keys(FUNNEL_LABELS) as Array<keyof typeof FUNNEL_LABELS>).map((status) => {
              const count = (report.funnel as unknown as Record<string, number>)[status] ?? 0;
              return (
                <div key={status} className="border rounded-lg p-3 text-center bg-muted/20">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{FUNNEL_LABELS[status]}</p>
                  <p className="text-2xl font-bold mt-1">{count}</p>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 text-right">Total leads ever assigned: {report.funnel.leads_total}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <p className="text-sm font-semibold">Salons sold ({report.salons_sold.total})</p>
            <p className="text-xs text-muted-foreground">{report.salons_sold.active} active · {report.salons_sold.expired} expired · {report.salons_sold.suspended} suspended</p>
          </div>
          {report.salons_sold.list.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">This agent hasn&apos;t sold any salons yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Salon</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right pr-4">Lifetime commission</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.salons_sold.list.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="pl-4 text-sm font-medium">{s.name}</TableCell>
                      <TableCell className="capitalize text-sm">{s.plan ?? '—'}</TableCell>
                      <TableCell>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full border ${
                          s.status === 'active' ? 'text-green-700 border-green-500/30 bg-green-500/10' :
                          s.status === 'pending' ? 'text-amber-700 border-amber-500/30 bg-amber-500/10' :
                          s.status === 'expired' ? 'text-red-700 border-red-500/30 bg-red-500/10' :
                          'text-gray-600 border-gray-400/30 bg-gray-500/10'
                        }`}>
                          {s.status ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{s.expires_at ? formatPKDate(s.expires_at) : '—'}</TableCell>
                      <TableCell className="text-right pr-4 text-sm font-semibold">{formatPKR(s.lifetime_commission)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Mini label="By kind: first-sale" value={formatPKR(report.commissions.by_kind.first_sale)} />
          <Mini label="By kind: renewal" value={formatPKR(report.commissions.by_kind.renewal)} />
          <Mini label="Pending" value={formatPKR(report.commissions.pending_total)} />
          <Mini label="Last payout" value={report.payouts.last_payout_at ? formatPKDate(report.payouts.last_payout_at) : '—'} />
        </CardContent>
      </Card>
    </div>
  );
}

function KPI({ icon: Icon, label, value, sub }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
          <Icon className="w-3.5 h-3.5" /> {label}
        </div>
        <p className="text-2xl font-bold mt-2">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm font-semibold mt-1">{value}</p>
    </div>
  );
}
