'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Building2, Copy, Loader2, Wallet, AlertTriangle, ShieldOff, Ban,
  PlusCircle, Banknote, KeyRound, Check as CheckIcon,
} from 'lucide-react';
import {
  getAgency,
  updateAgency,
  getAgencyBalance,
  freezeAgency,
  unfreezeAgency,
  terminateAgency,
  recordDepositEvent,
  listDepositLedger,
  listAgencyRemittances,
  recordAgencyRemittance,
  listUnremittedPayments,
  listAgencyCommissions,
  generateAgencyOwnerPassword,
  type AgencyBalance,
  type UnremittedPayment,
} from '@/app/actions/agencies';
import { listSalesAgents } from '@/app/actions/sales-agents';
import type {
  Agency, AgencyDepositEvent, AgencyRemittance, AgencyCommission,
  DepositEventKind, RemittanceMethod, SalesAgent,
} from '@/types/sales';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { formatPKR } from '@/lib/utils/currency';
import { formatPKDate } from '@/lib/utils/dates';

const STATUS_STYLE = {
  active: 'bg-green-500/15 text-green-700',
  frozen: 'bg-amber-500/15 text-amber-700',
  terminated: 'bg-gray-500/15 text-gray-600',
};

export default function AgencyDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [agency, setAgency] = useState<Agency | null>(null);
  const [balance, setBalance] = useState<AgencyBalance | null>(null);

  const load = useCallback(async () => {
    const [{ data: a }, { data: b }] = await Promise.all([
      getAgency(params.id),
      getAgencyBalance(params.id),
    ]);
    if (!a) { router.push('/admin/agencies'); return; }
    setAgency(a);
    setBalance(b);
  }, [params.id, router]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  if (!agency || !balance) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <Link href="/admin/agencies" className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Back to agencies
        </Link>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <h2 className="font-heading text-2xl font-semibold flex items-center gap-2">
            <Building2 className="w-6 h-6 text-gold" /> {agency.name}
          </h2>
          <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${STATUS_STYLE[agency.status]}`}>{agency.status}</span>
          <button
            onClick={() => navigator.clipboard.writeText(agency.code).then(() => toast.success(`${agency.code} copied`))}
            className="inline-flex items-center gap-1.5 font-mono font-semibold text-gold hover:underline text-sm"
          >
            {agency.code}
            <Copy className="w-3 h-3 opacity-60" />
          </button>
        </div>
      </div>

      <BalanceSummary balance={balance} />

      <Tabs defaultValue="profile">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="profile">Profile &amp; Rates</TabsTrigger>
          <TabsTrigger value="deposit">Deposit</TabsTrigger>
          <TabsTrigger value="remittances">Remittances</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
          <TabsTrigger value="commissions">Commissions</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
        </TabsList>

        <TabsContent value="profile"><ProfileTab agency={agency} onChanged={load} /></TabsContent>
        <TabsContent value="deposit"><DepositTab agencyId={agency.id} onChanged={load} /></TabsContent>
        <TabsContent value="remittances"><RemittancesTab agencyId={agency.id} onChanged={load} /></TabsContent>
        <TabsContent value="agents"><AgentsTab agencyId={agency.id} /></TabsContent>
        <TabsContent value="commissions"><CommissionsTab agencyId={agency.id} /></TabsContent>
        <TabsContent value="actions"><ActionsTab agency={agency} balance={balance} onChanged={load} /></TabsContent>
      </Tabs>
    </div>
  );
}

function BalanceSummary({ balance }: { balance: AgencyBalance }) {
  const breachRatio = balance.liability_threshold === 0 ? 0 : balance.unpaid_liability / balance.liability_threshold;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
            <Wallet className="w-3.5 h-3.5" /> Deposit balance
          </div>
          <p className="text-2xl font-bold mt-2">{formatPKR(balance.deposit_balance)}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Post. deposit: {formatPKR(balance.deposit_threshold)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
            <AlertTriangle className="w-3.5 h-3.5" /> Unpaid liability
          </div>
          <p className={`text-2xl font-bold mt-2 ${breachRatio >= 1 ? 'text-red-600' : breachRatio >= 0.8 ? 'text-amber-600' : ''}`}>
            {formatPKR(balance.unpaid_liability)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">Threshold: {formatPKR(balance.liability_threshold)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
            <Banknote className="w-3.5 h-3.5" /> Total remitted
          </div>
          <p className="text-2xl font-bold mt-2">{formatPKR(balance.total_remitted)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
            <PlusCircle className="w-3.5 h-3.5" /> Unremitted payments
          </div>
          <p className="text-2xl font-bold mt-2">{balance.unremitted_payment_count}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Open payment requests</p>
        </CardContent>
      </Card>
    </div>
  );
}

function ProfileTab({ agency, onChanged }: { agency: Agency; onChanged: () => void }) {
  const [form, setForm] = useState({
    name: agency.name,
    contact_name: agency.contact_name ?? '',
    phone: agency.phone ?? '',
    email: agency.email ?? '',
    city: agency.city ?? '',
    nic_number: agency.nic_number ?? '',
    address: agency.address ?? '',
    area: agency.area ?? '',
    first_sale_pct: String(agency.first_sale_pct),
    renewal_pct: String(agency.renewal_pct),
    deposit_amount: String(agency.deposit_amount),
    liability_threshold: String(agency.liability_threshold),
    terms: agency.terms ?? '',
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await updateAgency(agency.id, {
      name: form.name.trim(),
      contact_name: form.contact_name.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      city: form.city.trim() || null,
      nic_number: form.nic_number.trim() || null,
      address: form.address.trim() || null,
      area: form.area.trim() || null,
      first_sale_pct: Number(form.first_sale_pct),
      renewal_pct: Number(form.renewal_pct),
      deposit_amount: Number(form.deposit_amount),
      liability_threshold: Number(form.liability_threshold),
      terms: form.terms.trim() || null,
    });
    setSaving(false);
    if (error) toast.error(error); else { toast.success('Saved'); onChanged(); }
  }

  return (
    <div className="space-y-4 border rounded-lg p-5">
      <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Contact name</Label><Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></div>
        <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div><Label>City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>NIC / CNIC number</Label><Input value={form.nic_number} onChange={(e) => setForm({ ...form, nic_number: e.target.value })} placeholder="XXXXX-XXXXXXX-X" /></div>
        <div><Label>Complete address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street, area, city, postal code" /></div>
      </div>
      <div>
        <Label>Assigned area / territory</Label>
        <Input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="e.g. Lahore DHA + Johar Town" />
        <p className="text-[11px] text-muted-foreground mt-1">Where the agency is authorized to acquire tenants. Shown on their dashboard.</p>
      </div>
      <h3 className="font-medium pt-2">Commission rates (platform → agency)</h3>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>First-sale %</Label><Input type="number" min="0" max="100" step="0.01" value={form.first_sale_pct} onChange={(e) => setForm({ ...form, first_sale_pct: e.target.value })} /></div>
        <div><Label>Renewal %</Label><Input type="number" min="0" max="100" step="0.01" value={form.renewal_pct} onChange={(e) => setForm({ ...form, renewal_pct: e.target.value })} /></div>
      </div>
      <h3 className="font-medium pt-2">Collateral</h3>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Posted deposit</Label><Input type="number" min="0" step="0.01" value={form.deposit_amount} onChange={(e) => setForm({ ...form, deposit_amount: e.target.value })} /></div>
        <div><Label>Liability threshold</Label><Input type="number" min="0" step="0.01" value={form.liability_threshold} onChange={(e) => setForm({ ...form, liability_threshold: e.target.value })} /></div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Editing the posted deposit does NOT change the deposit ledger. Record actual collections/refunds on the Deposit tab.
      </p>
      <div>
        <Label>Terms &amp; conditions</Label>
        <Textarea rows={6} value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} />
      </div>
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </div>
    </div>
  );
}

function DepositTab({ agencyId, onChanged }: { agencyId: string; onChanged: () => void }) {
  const [events, setEvents] = useState<AgencyDepositEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await listDepositLedger(agencyId);
    setEvents(data);
    setLoading(false);
  }, [agencyId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Audit trail of deposit collections, refunds, and clawbacks. Current balance = sum of collected − refunded − clawed.
        </p>
        <Button size="sm" onClick={() => setOpen(true)}><PlusCircle className="w-4 h-4 mr-1" /> Record event</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No deposit events yet.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Kind</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="px-4 py-3">{formatPKDate(e.created_at)}</td>
                  <td className="px-4 py-3 capitalize">{e.kind}</td>
                  <td className={`px-4 py-3 font-semibold ${e.kind === 'collected' ? 'text-green-700' : 'text-red-700'}`}>
                    {e.kind === 'collected' ? '+' : '−'}{formatPKR(Number(e.amount))}
                  </td>
                  <td className="px-4 py-3">{e.method ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs">{e.reference ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{e.notes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RecordDepositDialog open={open} agencyId={agencyId} onClose={() => setOpen(false)} onSaved={() => { load(); onChanged(); }} />
    </div>
  );
}

function RecordDepositDialog({
  open, agencyId, onClose, onSaved,
}: { open: boolean; agencyId: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    kind: 'collected' as DepositEventKind,
    amount: '',
    method: 'bank' as RemittanceMethod,
    reference: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(form.amount);
    if (!Number.isFinite(amt) || amt <= 0) { toast.error('Amount must be > 0'); return; }
    setSubmitting(true);
    const { error } = await recordDepositEvent({
      agencyId,
      kind: form.kind,
      amount: amt,
      method: form.method,
      reference: form.reference.trim() || null,
      notes: form.notes.trim() || null,
    });
    setSubmitting(false);
    if (error) { toast.error(error); return; }
    toast.success('Recorded');
    setForm({ kind: 'collected', amount: '', method: 'bank', reference: '', notes: '' });
    onSaved();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Record deposit event</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Event</Label>
            <select className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as DepositEventKind })}>
              <option value="collected">Collected (agency paid platform)</option>
              <option value="refunded">Refunded (platform returned cash)</option>
              <option value="clawed">Clawed (platform deducted from deposit)</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Amount</Label><Input type="number" min="0" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <div>
              <Label>Method</Label>
              <select className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as RemittanceMethod })}>
                <option value="bank">Bank</option>
                <option value="jazzcash">JazzCash</option>
                <option value="cash">Cash</option>
              </select>
            </div>
          </div>
          <div><Label>Reference</Label><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Bank ref / txn id / cheque no." /></div>
          <div><Label>Notes</Label><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Record'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemittancesTab({ agencyId, onChanged }: { agencyId: string; onChanged: () => void }) {
  const [remittances, setRemittances] = useState<AgencyRemittance[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await listAgencyRemittances(agencyId);
    setRemittances(data);
    setLoading(false);
  }, [agencyId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Money the agency has handed back to the platform, each covering one or more approved payment requests.
        </p>
        <Button size="sm" onClick={() => setOpen(true)}><PlusCircle className="w-4 h-4 mr-1" /> Record remittance</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : remittances.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No remittances yet.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-4 py-3">Received</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {remittances.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-3">{formatPKDate(r.received_at)}</td>
                  <td className="px-4 py-3 font-semibold text-green-700">{formatPKR(Number(r.amount))}</td>
                  <td className="px-4 py-3 capitalize">{r.method}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.reference ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{r.notes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RecordRemittanceDialog open={open} agencyId={agencyId} onClose={() => setOpen(false)} onSaved={() => { load(); onChanged(); }} />
    </div>
  );
}

function RecordRemittanceDialog({
  open, agencyId, onClose, onSaved,
}: { open: boolean; agencyId: string; onClose: () => void; onSaved: () => void }) {
  const [unremitted, setUnremitted] = useState<UnremittedPayment[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({
    amount: '',
    method: 'bank' as RemittanceMethod,
    reference: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      listUnremittedPayments(agencyId).then(({ data }) => setUnremitted(data));
    }
  }, [open, agencyId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(form.amount);
    if (!Number.isFinite(amt) || amt <= 0) { toast.error('Amount must be > 0'); return; }
    setSubmitting(true);
    const { error } = await recordAgencyRemittance({
      agencyId,
      amount: amt,
      method: form.method,
      reference: form.reference.trim() || null,
      notes: form.notes.trim() || null,
      paymentRequestIds: Array.from(selected),
    });
    setSubmitting(false);
    if (error) { toast.error(error); return; }
    toast.success('Remittance recorded');
    setForm({ amount: '', method: 'bank', reference: '', notes: '' });
    setSelected(new Set());
    onSaved();
    onClose();
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Record agency remittance</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Amount received</Label><Input type="number" min="0" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <div>
              <Label>Method</Label>
              <select className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as RemittanceMethod })}>
                <option value="bank">Bank</option>
                <option value="jazzcash">JazzCash</option>
                <option value="cash">Cash</option>
              </select>
            </div>
          </div>
          <div><Label>Reference</Label><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></div>
          <div><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>

          <div>
            <Label>Attach payment requests ({selected.size} selected)</Label>
            {unremitted.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3">No unremitted approved payments for this agency.</p>
            ) : (
              <div className="border rounded-lg max-h-60 overflow-y-auto">
                {unremitted.map((p) => (
                  <label key={p.id} className="flex items-center gap-3 p-3 border-b last:border-0 hover:bg-muted/30 cursor-pointer">
                    <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggle(p.id)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.salon_name}</p>
                      <p className="text-[11px] text-muted-foreground">{formatPKDate(p.created_at)}</p>
                    </div>
                    <p className="text-sm font-semibold">{formatPKR(p.amount)}</p>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Record'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AgentsTab({ agencyId }: { agencyId: string }) {
  const [agents, setAgents] = useState<SalesAgent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listSalesAgents({ includeAgencyOwned: true }).then(({ data }) => {
      setAgents(data.filter((a) => a.agency_id === agencyId));
      setLoading(false);
    });
  }, [agencyId]);

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  if (agents.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">No agents linked to this agency yet.</p>;
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr className="text-left">
            <th className="px-4 py-3">Code</th>
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Phone</th>
            <th className="px-4 py-3">City</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {agents.map((a) => (
            <tr key={a.id} className="border-t">
              <td className="px-4 py-3 font-mono text-gold font-semibold">{a.code}</td>
              <td className="px-4 py-3 font-medium">{a.name}</td>
              <td className="px-4 py-3">{a.phone || '—'}</td>
              <td className="px-4 py-3">{a.city || '—'}</td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-0.5 rounded-full ${a.active ? 'bg-green-500/15 text-green-700' : 'bg-gray-500/15 text-gray-600'}`}>
                  {a.active ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td className="px-4 py-3">
                <Link href={`/admin/agents/${a.id}`} className="text-gold hover:underline text-sm">Open</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CommissionsTab({ agencyId }: { agencyId: string }) {
  const [comms, setComms] = useState<AgencyCommission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listAgencyCommissions(agencyId).then(({ data }) => { setComms(data); setLoading(false); });
  }, [agencyId]);

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  if (comms.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">No commissions accrued yet.</p>;
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr className="text-left">
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Kind</th>
            <th className="px-4 py-3">Base</th>
            <th className="px-4 py-3">Pct</th>
            <th className="px-4 py-3">Amount</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {comms.map((c) => (
            <tr key={c.id} className="border-t">
              <td className="px-4 py-3">{formatPKDate(c.created_at)}</td>
              <td className="px-4 py-3 capitalize">{c.kind.replace('_', ' ')}</td>
              <td className="px-4 py-3">{formatPKR(Number(c.base_amount))}</td>
              <td className="px-4 py-3">{Number(c.pct).toFixed(2)}%</td>
              <td className="px-4 py-3 font-semibold">{formatPKR(Number(c.amount))}</td>
              <td className="px-4 py-3 capitalize">{c.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActionsTab({ agency, balance, onChanged }: { agency: Agency; balance: AgencyBalance; onChanged: () => void }) {
  const [freezeReason, setFreezeReason] = useState('');
  const [termReason, setTermReason] = useState('');
  const [generating, setGenerating] = useState(false);
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function doFreeze() {
    if (!freezeReason.trim()) { toast.error('Reason required'); return; }
    const { error } = await freezeAgency(agency.id, freezeReason.trim());
    if (error) toast.error(error); else { toast.success('Agency frozen'); setFreezeReason(''); onChanged(); }
  }
  async function doUnfreeze() {
    const { error } = await unfreezeAgency(agency.id);
    if (error) toast.error(error); else { toast.success('Agency reactivated'); onChanged(); }
  }
  async function doTerminate() {
    if (!termReason.trim()) { toast.error('Reason required'); return; }
    if (!confirm(`Terminate ${agency.name}? Unpaid liability (${formatPKR(balance.unpaid_liability)}) will be clawed from the deposit. All associated agents and admins will be deactivated. This action cannot be undone.`)) return;
    const { error, clawed, refunded } = await terminateAgency(agency.id, termReason.trim());
    if (error) toast.error(error); else { toast.success(`Terminated — ${formatPKR(clawed)} clawed, ${formatPKR(refunded)} refunded`); setTermReason(''); onChanged(); }
  }
  async function doGeneratePassword() {
    if (!confirm('Generate a fresh password for the agency owner? Any previous password becomes invalid.')) return;
    setGenerating(true);
    const result = await generateAgencyOwnerPassword(agency.id);
    setGenerating(false);
    if (!result.success) { toast.error(result.error); return; }
    setCreds({ email: result.email, password: result.password });
  }

  return (
    <div className="space-y-4">
      {agency.status !== 'terminated' && (
        <div className="border rounded-lg p-5 space-y-3">
          <h3 className="font-medium flex items-center gap-2"><KeyRound className="w-4 h-4 text-gold" /> Agency owner login</h3>
          <p className="text-sm text-muted-foreground">
            Generate a fresh password for the agency&apos;s owner account. Share the credentials via WhatsApp so the agency can log in immediately — no password-reset email required.
          </p>
          {creds ? (
            <div className="rounded-lg border border-gold/30 bg-gold/5 p-4 space-y-2">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Email</p>
                <p className="font-mono text-sm">{creds.email}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Password</p>
                <div className="flex items-center gap-2">
                  <code className="font-mono text-sm bg-background px-2 py-1 rounded border flex-1">{creds.password}</code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(`Email: ${creds.email}\nPassword: ${creds.password}\nLogin: https://icut.pk/login`)
                        .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
                    }}
                  >
                    {copied ? <CheckIcon className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                    {copied ? 'Copied' : 'Copy all'}
                  </Button>
                </div>
              </div>
              <p className="text-[11px] text-amber-700">
                Copy now — this password will not be shown again. Share only through a secure channel.
              </p>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => setCreds(null)}>Close</Button>
                <a
                  href={`https://wa.me/${(agency.phone ?? '').replace(/\D/g, '')}?text=${encodeURIComponent(`Your iCut agency login\nEmail: ${creds.email}\nPassword: ${creds.password}\nLogin: https://icut.pk/login`)}`}
                  target="_blank" rel="noopener noreferrer"
                >
                  <Button size="sm" variant="outline">Send via WhatsApp</Button>
                </a>
              </div>
            </div>
          ) : (
            <Button onClick={doGeneratePassword} disabled={generating}>
              {generating ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <KeyRound className="w-4 h-4 mr-1.5" />}
              {generating ? 'Generating…' : 'Generate password'}
            </Button>
          )}
        </div>
      )}

      {agency.status !== 'terminated' && (
        <div className="border rounded-lg p-5 space-y-3">
          <h3 className="font-medium flex items-center gap-2"><ShieldOff className="w-4 h-4 text-amber-600" /> Freeze / unfreeze</h3>
          <p className="text-sm text-muted-foreground">
            A frozen agency cannot collect new payments from tenants. Their agents can still log in but write paths are gated.
          </p>
          {agency.status === 'frozen' ? (
            <Button variant="outline" onClick={doUnfreeze}>Reactivate agency</Button>
          ) : (
            <div className="space-y-2">
              <Input placeholder="Reason (audit trail)" value={freezeReason} onChange={(e) => setFreezeReason(e.target.value)} />
              <Button variant="destructive" onClick={doFreeze}>Freeze agency</Button>
            </div>
          )}
        </div>
      )}

      {agency.status !== 'terminated' && (
        <div className="border rounded-lg p-5 space-y-3">
          <h3 className="font-medium flex items-center gap-2"><Ban className="w-4 h-4 text-red-600" /> Terminate</h3>
          <p className="text-sm text-muted-foreground">
            Permanently ends the agency relationship. Unpaid liability of {formatPKR(balance.unpaid_liability)} will be clawed from the deposit balance of {formatPKR(balance.deposit_balance)}, and {formatPKR(Math.max(0, balance.deposit_balance - balance.unpaid_liability))} will be refunded. All associated agents and admins will be deactivated.
          </p>
          <Input placeholder="Reason (audit trail)" value={termReason} onChange={(e) => setTermReason(e.target.value)} />
          <Button variant="destructive" onClick={doTerminate}>Terminate agency</Button>
        </div>
      )}

      {agency.status === 'terminated' && (
        <div className="border rounded-lg p-5 bg-gray-500/5">
          <p className="text-sm text-muted-foreground">
            This agency is terminated. Deposit ledger and commission history remain visible for audit purposes.
          </p>
        </div>
      )}
    </div>
  );
}
