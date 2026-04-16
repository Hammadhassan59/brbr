'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Copy, KeyRound } from 'lucide-react';
import { getSalesAgent, updateAgentRates, setAgentActive, updateAgentProfile, getDemoCredentials, setDemoPassword } from '@/app/actions/sales-agents';
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

      {/* Demo identity card */}
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
  );
}
