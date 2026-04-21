'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Plus, UserCog, Copy, TrendingUp, Banknote, Store, Trophy, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { listSalesAgents, createSalesAgent } from '@/app/actions/sales-agents';
import { getAgentsLeaderboard } from '@/app/actions/agent-commissions';
import type { SalesAgent } from '@/types/sales';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { formatPKR } from '@/lib/utils/currency';

type Leaderboard = Awaited<ReturnType<typeof getAgentsLeaderboard>>['data'];

export default function AgentsPage() {
  const [agents, setAgents] = useState<SalesAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [leaderboard, setLeaderboard] = useState<Leaderboard>(null);

  async function load() {
    setLoading(true);
    const { data } = await listSalesAgents();
    setAgents(data);
    setLoading(false);
  }

  const loadLeaderboard = useCallback(async () => {
    const { data } = await getAgentsLeaderboard({ from, to });
    setLeaderboard(data);
  }, [from, to]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadLeaderboard(); }, [loadLeaderboard]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-heading text-2xl font-semibold">Sales Agents</h2>
        <div className="flex gap-2">
          <Link href="/admin/agents/bonus-tiers">
            <Button variant="outline">
              <Trophy className="w-4 h-4 mr-1" /> Bonus tiers
            </Button>
          </Link>
          <Button onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> New agent
          </Button>
        </div>
      </div>

      {/* Top performers — cross-agent overview for the chosen window */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="font-medium text-sm flex items-center gap-2">
            <Trophy className="w-4 h-4 text-gold" /> Performance overview
          </h3>
          <div className="flex items-center gap-2 ml-auto">
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36 h-8" />
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36 h-8" />
          </div>
        </div>

        {leaderboard ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card><CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                  <TrendingUp className="w-3.5 h-3.5" /> Commissions paid
                </div>
                <p className="text-2xl font-bold mt-2">{formatPKR(leaderboard.totals.commissions_paid)}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                  <Banknote className="w-3.5 h-3.5" /> Cash collected
                </div>
                <p className="text-2xl font-bold mt-2">{formatPKR(leaderboard.totals.cash_collected)}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                  <Store className="w-3.5 h-3.5" /> Salons activated
                </div>
                <p className="text-2xl font-bold mt-2">{leaderboard.totals.salons_onboarded}</p>
              </CardContent></Card>
            </div>

            {leaderboard.leaderboard.filter((a) => a.earned > 0).length > 0 && (
              <Card><CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Top performers (by commissions earned)</p>
                <div className="space-y-2">
                  {leaderboard.leaderboard.slice(0, 3).map((a, i) => (
                    <Link key={a.agent_id} href={`/admin/agents/${a.agent_id}`} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/40 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          i === 0 ? 'bg-gold text-black' : i === 1 ? 'bg-gray-300 text-black' : 'bg-amber-700/40 text-amber-900'
                        }`}>{i + 1}</div>
                        <div>
                          <p className="font-medium text-sm">{a.agent_name}</p>
                          <p className="text-[11px] text-muted-foreground font-mono">{a.agent_code}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{formatPKR(a.earned)}</p>
                        <p className="text-[11px] text-muted-foreground">{a.salons} salon{a.salons === 1 ? '' : 's'}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent></Card>
            )}
          </>
        ) : (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        )}
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : agents.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center text-muted-foreground">
          <UserCog className="w-8 h-8 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No agents yet.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block border rounded-lg overflow-hidden">
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

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {agents.map(a => (
              <Link
                key={a.id}
                href={`/admin/agents/${a.id}`}
                className="block border rounded-lg p-4 bg-white min-h-[44px] active:bg-muted/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono font-semibold text-gold text-xs">{a.code}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${a.active ? 'bg-green-500/15 text-green-700' : 'bg-gray-500/15 text-gray-600'}`}>
                        {a.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="font-medium text-sm truncate">{a.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{a.city || '—'}</p>
                  </div>
                  <span className="text-gold text-sm shrink-0">Manage ›</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      <NewAgentDialog open={open} onClose={() => setOpen(false)} onCreated={load} />
    </div>
  );
}

function genDemoPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let p = '';
  for (let i = 0; i < 12; i++) p += chars[Math.floor(Math.random() * chars.length)];
  return p + '!9';
}

function NewAgentDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    email: '', name: '', phone: '', city: '', firstSalePct: '20', renewalPct: '5',
  });
  const [submitting, setSubmitting] = useState(false);
  const [createdInfo, setCreatedInfo] = useState<{ code: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    if (!form.phone.trim()) {
      setSubmitting(false);
      toast.error('Phone is required');
      return;
    }
    const { data, error } = await createSalesAgent({
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
    setCreatedInfo({ code: data.code });
    onCreated();
  }

  function close() {
    setForm({ email: '', name: '', phone: '', city: '', firstSalePct: '20', renewalPct: '5' });
    setCreatedInfo(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader><DialogTitle>{createdInfo ? 'Agent created — share these creds' : 'New sales agent'}</DialogTitle></DialogHeader>
        {createdInfo ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-gold/30 bg-gold/5 p-4 space-y-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Agent code</p>
                <p className="font-mono text-xl font-bold mt-1">{createdInfo.code}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Agent created. A password-reset email has been sent so they can set their login.
              </p>
            </div>
            <Button onClick={close} className="w-full">Done</Button>
          </div>
        ) : (
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
              <Button type="button" variant="outline" onClick={close}>Cancel</Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create agent'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
