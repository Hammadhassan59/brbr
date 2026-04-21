'use client';

import { useEffect, useState, useCallback } from 'react';
import { Users, Loader2, Copy, Plus, Pencil, UserX, UserCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  listMyAgents,
  getMyAgency,
  createAgencyAgent,
  updateAgencyAgentProfile,
  updateAgencyAgentRates,
  setAgencyAgentActive,
} from '@/app/actions/agency-self';
import type { SalesAgent, Agency } from '@/types/sales';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';

export default function AgencyAgentsPage() {
  const [agents, setAgents] = useState<SalesAgent[]>([]);
  const [agency, setAgency] = useState<Agency | null>(null);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [editing, setEditing] = useState<SalesAgent | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: list }, { data: ag }] = await Promise.all([listMyAgents(), getMyAgency()]);
    setAgents(list);
    setAgency(ag.agency);
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  async function toggleActive(a: SalesAgent) {
    if (a.active && !confirm(`Deactivate ${a.name}? They will no longer be able to log in.`)) return;
    const { error } = await setAgencyAgentActive(a.id, !a.active);
    if (error) toast.error(error); else { toast.success(a.active ? 'Deactivated' : 'Reactivated'); load(); }
  }

  const locked = agency?.status === 'terminated';

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-gold" /> My sales agents
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Agents you add here belong to <b>{agency?.name}</b>. Commission from every salon they onboard flows into your agency&apos;s balance — you handle payroll to each agent internally using the per-agent rate below.
          </p>
        </div>
        <Button onClick={() => setNewOpen(true)} disabled={locked}>
          <Plus className="w-4 h-4 mr-1" /> New agent
        </Button>
      </div>

      {locked && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-900">
          Your agency is terminated. Agent management is read-only.
        </div>
      )}

      {agents.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">
          <Users className="w-8 h-8 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No agents yet.</p>
          <p className="text-xs mt-2">Click <b>New agent</b> to add your first one.</p>
        </CardContent></Card>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="px-4 py-3">Code</th>
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
              {agents.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => navigator.clipboard.writeText(a.code).then(() => toast.success(`${a.code} copied`))}
                      className="inline-flex items-center gap-1.5 font-mono font-semibold text-gold hover:underline"
                    >
                      {a.code}
                      <Copy className="w-3 h-3 opacity-60" />
                    </button>
                  </td>
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
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(a)} disabled={locked} title="Edit">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleActive(a)} disabled={locked} title={a.active ? 'Deactivate' : 'Reactivate'}>
                        {a.active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground text-center pt-2">
        First-sale % and renewal % are the rates YOUR agency pays each agent — used for your own internal payroll, not by the platform.
      </p>

      <NewAgentDialog open={newOpen} onClose={() => setNewOpen(false)} onCreated={load} />
      {editing && <EditAgentDialog key={editing.id} agent={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
}

function NewAgentDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    email: '', name: '', phone: '', city: '', firstSalePct: '20', renewalPct: '5',
  });
  const [submitting, setSubmitting] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);

  function close() {
    setForm({ email: '', name: '', phone: '', city: '', firstSalePct: '20', renewalPct: '5' });
    setCreatedCode(null);
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.phone.trim()) { toast.error('Phone is required'); return; }
    setSubmitting(true);
    const { data, error } = await createAgencyAgent({
      email: form.email.trim().toLowerCase(),
      name: form.name.trim(),
      phone: form.phone.trim(),
      city: form.city.trim() || null,
      firstSalePct: Number(form.firstSalePct),
      renewalPct: Number(form.renewalPct),
    });
    setSubmitting(false);
    if (error || !data) { toast.error(error || 'Create failed'); return; }
    toast.success('Agent created — password-reset email sent');
    setCreatedCode(data.code);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{createdCode ? 'Agent created' : 'New sales agent'}</DialogTitle></DialogHeader>
        {createdCode ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-gold/30 bg-gold/5 p-4 space-y-2">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Agent code</p>
                <p className="font-mono text-xl font-bold mt-1">{createdCode}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Share this code with salons during signup so the onboarding credits back to your agency. A password-reset email was sent to the agent so they can set their login.
              </p>
            </div>
            <Button onClick={close} className="w-full">Done</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label>Email *</Label>
              <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label>Name *</Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Phone *</Label>
                <Input type="tel" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <Label>City</Label>
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground mb-2">
                Internal rates: what YOUR agency pays this agent. Platform pays your agency at your agency-level rate; this is your split with the agent.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>First-sale %</Label>
                  <Input type="number" min="0" max="100" step="0.01" required value={form.firstSalePct} onChange={(e) => setForm({ ...form, firstSalePct: e.target.value })} />
                </div>
                <div>
                  <Label>Renewal %</Label>
                  <Input type="number" min="0" max="100" step="0.01" required value={form.renewalPct} onChange={(e) => setForm({ ...form, renewalPct: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={close}>Cancel</Button>
              <Button type="submit" disabled={submitting}>{submitting ? 'Creating…' : 'Create agent'}</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditAgentDialog({ agent, onClose, onSaved }: { agent: SalesAgent; onClose: () => void; onSaved: () => void }) {
  // Component is remounted per agent via a `key` prop on the parent, so
  // initial state from props is stable — no sync-back-to-props useEffect
  // needed (which would fire the react-hooks/set-state-in-effect rule).
  const [form, setForm] = useState({
    name: agent.name,
    phone: agent.phone ?? '',
    city: agent.city ?? '',
    firstSalePct: String(agent.first_sale_pct),
    renewalPct: String(agent.renewal_pct),
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.phone.trim()) { toast.error('Phone is required'); return; }
    setSaving(true);
    const [p, r] = await Promise.all([
      updateAgencyAgentProfile(agent.id, { name: form.name, phone: form.phone.trim(), city: form.city.trim() || null }),
      updateAgencyAgentRates(agent.id, { firstSalePct: Number(form.firstSalePct), renewalPct: Number(form.renewalPct) }),
    ]);
    setSaving(false);
    if (p.error || r.error) { toast.error(p.error || r.error || 'Save failed'); return; }
    toast.success('Saved');
    onSaved();
    onClose();
  }

  return (
    <Dialog open={!!agent} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit agent</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Phone</Label><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>First-sale %</Label><Input type="number" min="0" max="100" step="0.01" value={form.firstSalePct} onChange={(e) => setForm({ ...form, firstSalePct: e.target.value })} /></div>
            <div><Label>Renewal %</Label><Input type="number" min="0" max="100" step="0.01" value={form.renewalPct} onChange={(e) => setForm({ ...form, renewalPct: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
