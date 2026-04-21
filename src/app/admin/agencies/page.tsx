'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Plus, Building2, Loader2, Inbox } from 'lucide-react';
import { listAgencies, createAgency } from '@/app/actions/agencies';
import type { Agency, AgencyStatus } from '@/types/sales';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatPKR } from '@/lib/utils/currency';

const STATUS_STYLE: Record<AgencyStatus, string> = {
  active: 'bg-green-500/15 text-green-700',
  frozen: 'bg-amber-500/15 text-amber-700',
  terminated: 'bg-gray-500/15 text-gray-600',
};

export default function AgenciesPage() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await listAgencies();
    setAgencies(data);
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-heading text-2xl font-semibold flex items-center gap-2">
            <Building2 className="w-6 h-6 text-gold" /> Agencies
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Partner organizations that onboard tenants on the platform&apos;s behalf. Each agency posts a refundable security deposit and is paid commission at agency-level rates.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/agencies/requests">
            <Button variant="outline">
              <Inbox className="w-4 h-4 mr-1" /> Signup requests
            </Button>
          </Link>
          <Button onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> New agency
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : agencies.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center text-muted-foreground">
          <Building2 className="w-8 h-8 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No agencies yet.</p>
        </div>
      ) : (
        <div className="hidden md:block border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">First-sale %</th>
                <th className="px-4 py-3">Renewal %</th>
                <th className="px-4 py-3">Deposit</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {agencies.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="px-4 py-3 font-mono text-gold font-semibold">{a.code}</td>
                  <td className="px-4 py-3 font-medium">{a.name}</td>
                  <td className="px-4 py-3">{a.city || '—'}</td>
                  <td className="px-4 py-3">{Number(a.first_sale_pct).toFixed(2)}</td>
                  <td className="px-4 py-3">{Number(a.renewal_pct).toFixed(2)}</td>
                  <td className="px-4 py-3">{formatPKR(Number(a.deposit_amount))}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${STATUS_STYLE[a.status]}`}>{a.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/agencies/${a.id}`} className="text-gold hover:underline text-sm">Manage</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile cards */}
      {!loading && agencies.length > 0 && (
        <div className="md:hidden space-y-2">
          {agencies.map((a) => (
            <Link key={a.id} href={`/admin/agencies/${a.id}`}
              className="block border rounded-lg p-4 bg-white min-h-[44px] active:bg-muted/40 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono font-semibold text-gold text-xs">{a.code}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize ${STATUS_STYLE[a.status]}`}>{a.status}</span>
                  </div>
                  <p className="font-medium text-sm truncate">{a.name}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {a.city || '—'} · {Number(a.first_sale_pct).toFixed(1)}%/{Number(a.renewal_pct).toFixed(1)}% · {formatPKR(Number(a.deposit_amount))}
                  </p>
                </div>
                <span className="text-gold text-sm shrink-0">Manage ›</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <NewAgencyDialog open={open} onClose={() => setOpen(false)} onCreated={load} />
    </div>
  );
}

function NewAgencyDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const emptyForm = {
    name: '', contactName: '', phone: '', email: '', city: '',
    nicNumber: '', address: '', area: '',
    firstSalePct: '15', renewalPct: '7',
    depositAmount: '0', liabilityThreshold: '0',
    terms: '',
    adminEmail: '', adminName: '',
    sendWelcome: true,
  };
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Name required'); return; }
    setSubmitting(true);
    const adminEmail = form.sendWelcome ? (form.adminEmail.trim() || form.email.trim()) : '';
    const adminName = form.sendWelcome ? (form.adminName.trim() || form.contactName.trim() || form.name.trim()) : '';
    const { error, adminEmailSent } = await createAgency({
      name: form.name.trim(),
      contactName: form.contactName.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      city: form.city.trim() || null,
      nicNumber: form.nicNumber.trim() || null,
      address: form.address.trim() || null,
      area: form.area.trim() || null,
      firstSalePct: Number(form.firstSalePct),
      renewalPct: Number(form.renewalPct),
      depositAmount: Number(form.depositAmount),
      liabilityThreshold: Number(form.liabilityThreshold),
      terms: form.terms.trim() || null,
      adminEmail: adminEmail || null,
      adminName: adminName || null,
    });
    setSubmitting(false);
    if (error) { toast.error(error); return; }
    toast.success(adminEmailSent ? 'Agency created — welcome email sent' : 'Agency created');
    setForm(emptyForm);
    onCreated();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New agency</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div><Label>Name *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Contact</Label><Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></div>
            <div><Label>Phone</Label><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>NIC / CNIC number</Label><Input value={form.nicNumber} onChange={(e) => setForm({ ...form, nicNumber: e.target.value })} placeholder="XXXXX-XXXXXXX-X" /></div>
            <div><Label>Complete address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street, area, city, postal code" /></div>
          </div>
          <div>
            <Label>Assigned area / territory</Label>
            <Input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="e.g. Lahore DHA + Johar Town, or Multan + Bahawalpur" />
            <p className="text-[11px] text-muted-foreground mt-1">Where the agency is authorized to acquire tenants. Shown on their dashboard.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>First-sale %</Label><Input type="number" min="0" max="100" step="0.01" required value={form.firstSalePct} onChange={(e) => setForm({ ...form, firstSalePct: e.target.value })} /></div>
            <div><Label>Renewal %</Label><Input type="number" min="0" max="100" step="0.01" required value={form.renewalPct} onChange={(e) => setForm({ ...form, renewalPct: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Security deposit (PKR)</Label>
              <Input type="number" min="0" step="0.01" required value={form.depositAmount} onChange={(e) => setForm({ ...form, depositAmount: e.target.value })} />
              <p className="text-[11px] text-muted-foreground mt-1">Collateral against unpaid liability. Record the collection separately on the agency page.</p>
            </div>
            <div>
              <Label>Liability threshold (PKR)</Label>
              <Input type="number" min="0" step="0.01" value={form.liabilityThreshold} onChange={(e) => setForm({ ...form, liabilityThreshold: e.target.value })} />
              <p className="text-[11px] text-muted-foreground mt-1">Auto-freeze at this unpaid amount. Defaults to deposit if 0.</p>
            </div>
          </div>
          <div>
            <Label>Terms &amp; conditions</Label>
            <Textarea rows={4} value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} placeholder="Contract terms, commission rules, remittance cadence, etc." />
          </div>
          <div className="border-t pt-4 space-y-3">
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="send-welcome"
                className="mt-1"
                checked={form.sendWelcome}
                onChange={(e) => setForm({ ...form, sendWelcome: e.target.checked })}
              />
              <label htmlFor="send-welcome" className="text-sm">
                <span className="font-medium">Send welcome email to agency owner</span>
                <span className="block text-[11px] text-muted-foreground">
                  Creates their login account and sends a password-reset link so they can access the agency dashboard.
                </span>
              </label>
            </div>
            {form.sendWelcome && (
              <div className="grid grid-cols-2 gap-3 pl-6">
                <div>
                  <Label>Owner email</Label>
                  <Input type="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} placeholder={form.email || 'owner@agency.com'} />
                  <p className="text-[11px] text-muted-foreground mt-0.5">Defaults to the agency email above.</p>
                </div>
                <div>
                  <Label>Owner name</Label>
                  <Input value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} placeholder={form.contactName || form.name} />
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Creating…' : 'Create agency'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
