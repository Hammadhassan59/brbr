'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Copy } from 'lucide-react';
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
    const { error } = await setAgentActive(agent.id, !agent.active);
    if (error) { toast.error(error); return; }
    toast.success(agent.active ? 'Agent deactivated' : 'Agent reactivated');
    load();
  }

  return (
    <div className="space-y-6 max-w-xl">
      <h2 className="font-heading text-2xl font-semibold">{agent.name}</h2>

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
  );
}
