'use client';

import { useEffect, useState } from 'react';
import { Plus, Target } from 'lucide-react';
import toast from 'react-hot-toast';
import { listLeads, createLead, reassignLead, type LeadWithAgent } from '@/app/actions/leads';
import { listSalesAgents } from '@/app/actions/sales-agents';
import type { SalesAgent, LeadStatus } from '@/types/sales';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const STATUSES: (LeadStatus | 'all')[] = ['all','new','contacted','visited','interested','not_interested','converted','lost'];

export default function AdminLeadsPage() {
  const [leads, setLeads] = useState<LeadWithAgent[]>([]);
  const [agents, setAgents] = useState<SalesAgent[]>([]);
  const [agentFilter, setAgentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all');
  const [open, setOpen] = useState(false);

  async function load() {
    const [l, a] = await Promise.all([
      listLeads({ agentId: agentFilter || undefined, status: statusFilter }),
      listSalesAgents(),
    ]);
    if (l.error) toast.error(`Could not load leads: ${l.error}`);
    setLeads(l.data);
    setAgents(a.data);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [agentFilter, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-2xl font-semibold">Leads</h2>
        <Button onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> New lead
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">All agents</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as LeadStatus | 'all')}
          className="border rounded-lg px-3 py-2 text-sm bg-white">
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {leads.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center text-muted-foreground">
          <Target className="w-8 h-8 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No leads.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-4 py-3">Salon</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {leads.map(l => (
                <LeadRow key={l.id} lead={l} agents={agents} onReassigned={load} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewLeadDialog open={open} onClose={() => setOpen(false)} agents={agents} onCreated={load} />
    </div>
  );
}

function LeadRow({ lead, agents, onReassigned }: { lead: LeadWithAgent; agents: SalesAgent[]; onReassigned: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(lead.assigned_agent_id);

  async function save() {
    const { error } = await reassignLead(lead.id, value);
    if (error) { toast.error(error); return; }
    toast.success('Lead reassigned');
    setEditing(false);
    onReassigned();
  }

  return (
    <tr className="border-t">
      <td className="px-4 py-3 font-medium">{lead.salon_name}</td>
      <td className="px-4 py-3">{lead.owner_name || '—'}</td>
      <td className="px-4 py-3">{lead.phone || '—'}</td>
      <td className="px-4 py-3">{lead.city || '—'}</td>
      <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-muted">{lead.status}</span></td>
      <td className="px-4 py-3">
        {editing ? (
          <select value={value} onChange={e => setValue(e.target.value)}
            className="border rounded px-2 py-1 text-sm bg-white">
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        ) : (
          lead.agent?.name || '—'
        )}
      </td>
      <td className="px-4 py-3">
        {editing ? (
          <>
            <button onClick={save} className="text-gold hover:underline text-sm mr-2">Save</button>
            <button onClick={() => setEditing(false)} className="text-muted-foreground text-sm">Cancel</button>
          </>
        ) : (
          <button onClick={() => setEditing(true)} className="text-gold hover:underline text-sm">
            Reassign
          </button>
        )}
      </td>
    </tr>
  );
}

function NewLeadDialog({ open, onClose, agents, onCreated }: {
  open: boolean; onClose: () => void; agents: SalesAgent[]; onCreated: () => void;
}) {
  const [form, setForm] = useState({ salon_name: '', owner_name: '', phone: '', city: '', notes: '', assigned_agent_id: '' });
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await createLead({
      salon_name: form.salon_name.trim(),
      owner_name: form.owner_name.trim() || null,
      phone: form.phone.trim() || null,
      city: form.city.trim() || null,
      notes: form.notes.trim() || null,
      assigned_agent_id: form.assigned_agent_id,
    });
    setSubmitting(false);
    if (error) { toast.error(error); return; }
    toast.success('Lead created');
    setForm({ salon_name: '', owner_name: '', phone: '', city: '', notes: '', assigned_agent_id: '' });
    onClose();
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>New lead</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>Salon name</Label>
            <Input required value={form.salon_name} onChange={e => setForm({ ...form, salon_name: e.target.value })} /></div>
          <div><Label>Owner name</Label>
            <Input value={form.owner_name} onChange={e => setForm({ ...form, owner_name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Phone</Label>
              <Input type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>City</Label>
              <Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
          </div>
          <div><Label>Assign to</Label>
            <select required value={form.assigned_agent_id}
              onChange={e => setForm({ ...form, assigned_agent_id: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">Select agent…</option>
              {agents.filter(a => a.active).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select></div>
          <div><Label>Notes</Label>
            <Textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Creating…' : 'Create lead'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
