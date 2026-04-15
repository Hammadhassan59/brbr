'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import { getMyLead, updateMyLead, convertLeadToSalon } from '@/app/actions/leads';
import type { Lead, LeadStatus } from '@/types/sales';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const EDITABLE_STATUSES: LeadStatus[] = ['new','contacted','visited','interested','not_interested','lost'];

export default function AgentLeadDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [lead, setLead] = useState<Lead | null>(null);
  const [form, setForm] = useState({ owner_name: '', phone: '', city: '', notes: '', status: 'new' as LeadStatus });
  const [saving, setSaving] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);

  async function load() {
    const { data } = await getMyLead(params.id);
    if (!data) { router.push('/agent/leads'); return; }
    setLead(data);
    setForm({
      owner_name: data.owner_name || '',
      phone: data.phone || '',
      city: data.city || '',
      notes: data.notes || '',
      status: data.status,
    });
  }
  useEffect(() => { load(); }, [params.id]);

  if (!lead) return <p className="text-muted-foreground">Loading…</p>;

  async function save() {
    if (!lead) return;
    setSaving(true);
    const { error } = await updateMyLead(lead.id, {
      owner_name: form.owner_name || null,
      phone: form.phone || null,
      city: form.city || null,
      notes: form.notes || null,
      status: form.status,
    });
    setSaving(false);
    if (error) { toast.error(error); return; }
    toast.success('Saved');
    load();
  }

  return (
    <div className="space-y-6 max-w-xl">
      <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <h2 className="font-heading text-2xl font-semibold">{lead.salon_name}</h2>

      <div className="space-y-4 border rounded-lg p-5">
        <div><Label>Owner name</Label><Input value={form.owner_name} onChange={e => setForm({ ...form, owner_name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>City</Label><Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
        </div>
        <div>
          <Label>Status</Label>
          <select value={form.status} disabled={lead.status === 'converted'}
            onChange={e => setForm({ ...form, status: e.target.value as LeadStatus })}
            className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
            {lead.status === 'converted' ? (
              <option value="converted">converted</option>
            ) : (
              EDITABLE_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)
            )}
          </select>
        </div>
        <div><Label>Notes</Label><Textarea rows={4} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={save} disabled={saving || lead.status === 'converted'}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          {lead.status !== 'converted' && (
            <Button onClick={() => setConvertOpen(true)}>Convert to salon</Button>
          )}
        </div>
      </div>

      <ConvertDialog open={convertOpen} onClose={() => setConvertOpen(false)}
        lead={lead} onConverted={() => { setConvertOpen(false); load(); }} />
    </div>
  );
}

function ConvertDialog({ open, onClose, lead, onConverted }: {
  open: boolean; onClose: () => void; lead: Lead; onConverted: () => void;
}) {
  const [form, setForm] = useState({
    ownerEmail: '', plan: 'basic' as 'basic'|'growth'|'pro', amount: '', method: 'cash' as 'cash'|'jazzcash'|'bank', reference: '',
  });
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await convertLeadToSalon({
      leadId: lead.id,
      ownerEmail: form.ownerEmail.trim().toLowerCase(),
      plan: form.plan,
      amount: Number(form.amount),
      method: form.method,
      reference: form.reference.trim() || null,
    });
    setSubmitting(false);
    if (error) { toast.error(error); return; }
    toast.success('Salon created. Payment pending superadmin approval — commission will accrue on approval.');
    onConverted();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Convert {lead.salon_name} to salon</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>Owner email</Label>
            <Input type="email" required value={form.ownerEmail}
              onChange={e => setForm({ ...form, ownerEmail: e.target.value })} /></div>
          <div><Label>Plan</Label>
            <select value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value as 'basic'|'growth'|'pro' })}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
              <option value="basic">Basic</option>
              <option value="growth">Growth</option>
              <option value="pro">Pro</option>
            </select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Amount collected (Rs)</Label>
              <Input type="number" required min="1" value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
            <div><Label>Method</Label>
              <select value={form.method} onChange={e => setForm({ ...form, method: e.target.value as 'cash'|'jazzcash'|'bank' })}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                <option value="cash">Cash</option>
                <option value="jazzcash">JazzCash</option>
                <option value="bank">Bank transfer</option>
              </select></div>
          </div>
          <div><Label>Reference (optional)</Label>
            <Input value={form.reference}
              onChange={e => setForm({ ...form, reference: e.target.value })}
              placeholder="Tx ID, sender name, receipt #" /></div>
          <p className="text-xs text-muted-foreground">
            The owner will receive an email to set their password. Your commission accrues once the superadmin approves this payment.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Creating…' : 'Create salon'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
