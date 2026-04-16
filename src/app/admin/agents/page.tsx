'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, UserCog, Copy } from 'lucide-react';
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
  // eslint-disable-next-line react-hooks/set-state-in-effect
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
              {agents.map(a => (
                <tr key={a.id} className="border-t">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(a.code).then(() => toast.success(`${a.code} copied`));
                      }}
                      className="inline-flex items-center gap-1.5 font-mono font-semibold text-gold hover:underline"
                      title="Click to copy"
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
    if (!form.phone.trim()) {
      setSubmitting(false);
      toast.error('Phone is required');
      return;
    }
    const { error } = await createSalesAgent({
      email: form.email.trim().toLowerCase(),
      name: form.name.trim(),
      phone: form.phone.trim(),
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
            <Input id="email" type="email" inputMode="email" autoComplete="email" required value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" required value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="phone">Phone *</Label>
              <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" required value={form.phone}
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
