'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ArrowLeft, Building2, Check, X, Loader2, RefreshCw, Inbox } from 'lucide-react';
import {
  listAgencyRequests,
  approveAgencyRequest,
  rejectAgencyRequest,
  resendAgencyWelcome,
} from '@/app/actions/agency-requests';
import type { AgencyRequest, AgencyRequestStatus } from '@/types/sales';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatPKDate } from '@/lib/utils/dates';

const STATUS_STYLE: Record<AgencyRequestStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-700',
  approved: 'bg-green-500/15 text-green-700',
  rejected: 'bg-red-500/15 text-red-700',
};

export default function AgencyRequestsPage() {
  const [filter, setFilter] = useState<AgencyRequestStatus | 'all'>('pending');
  const [requests, setRequests] = useState<AgencyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [approveOn, setApproveOn] = useState<AgencyRequest | null>(null);
  const [rejectOn, setRejectOn] = useState<AgencyRequest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await listAgencyRequests(filter);
    setRequests(data);
    setLoading(false);
  }, [filter]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  async function resend(r: AgencyRequest) {
    const { error } = await resendAgencyWelcome(r.id);
    if (error) toast.error(error); else toast.success('Welcome email re-sent');
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/agencies" className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Back to agencies
        </Link>
        <div className="flex items-center justify-between mt-1 flex-wrap gap-3">
          <div>
            <h2 className="font-heading text-2xl font-semibold flex items-center gap-2">
              <Inbox className="w-6 h-6 text-gold" /> Agency signup requests
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Public applications from <code className="text-xs">/agency-signup</code>. Approve to spawn the agency + send a welcome email.
            </p>
          </div>
          <div className="flex gap-1 border rounded-lg p-1 bg-muted/30">
            {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-md text-xs capitalize ${filter === f ? 'bg-white shadow-sm font-medium' : 'text-muted-foreground'}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : requests.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">
          <Building2 className="w-8 h-8 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No {filter === 'all' ? '' : filter} requests.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{r.name}</h3>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full capitalize ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                      <span className="text-[11px] text-muted-foreground">· {formatPKDate(r.created_at)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {r.contact_name} · {r.phone} · <a href={`mailto:${r.email}`} className="text-gold hover:underline">{r.email}</a>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {r.city ?? '—'} · NIC {r.nic_number ?? '—'}
                    </p>
                    {r.address && <p className="text-[11px] text-muted-foreground mt-1">📍 {r.address}</p>}
                    {r.notes && <p className="text-xs mt-2 p-2 bg-muted/40 rounded">{r.notes}</p>}
                    {r.review_notes && (
                      <p className="text-[11px] text-muted-foreground mt-2">
                        <b>Review notes:</b> {r.review_notes}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {r.status === 'pending' && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setApproveOn(r)}>
                          <Check className="w-4 h-4 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setRejectOn(r)}>
                          <X className="w-4 h-4 mr-1" /> Reject
                        </Button>
                      </>
                    )}
                    {r.status === 'approved' && r.created_agency_id && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => resend(r)}>
                          <RefreshCw className="w-4 h-4 mr-1" /> Resend welcome
                        </Button>
                        <Link href={`/admin/agencies/${r.created_agency_id}`}>
                          <Button size="sm" variant="outline">Open agency</Button>
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ApproveDialog request={approveOn} onClose={() => setApproveOn(null)} onApproved={() => { setApproveOn(null); load(); }} />
      <RejectDialog request={rejectOn} onClose={() => setRejectOn(null)} onRejected={() => { setRejectOn(null); load(); }} />
    </div>
  );
}

function ApproveDialog({ request, onClose, onApproved }: {
  request: AgencyRequest | null;
  onClose: () => void;
  onApproved: () => void;
}) {
  const [form, setForm] = useState({
    firstSalePct: '15', renewalPct: '7',
    depositAmount: '0', liabilityThreshold: '0',
    terms: '', reviewNotes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!request) return;
    setSubmitting(true);
    const { error, adminEmailSent } = await approveAgencyRequest(request.id, {
      firstSalePct: Number(form.firstSalePct),
      renewalPct: Number(form.renewalPct),
      depositAmount: Number(form.depositAmount),
      liabilityThreshold: Number(form.liabilityThreshold),
      terms: form.terms.trim() || null,
      reviewNotes: form.reviewNotes.trim() || null,
    });
    setSubmitting(false);
    if (error) { toast.error(error); return; }
    toast.success(adminEmailSent ? 'Approved — welcome email sent' : 'Approved (email failed — resend from list)');
    onApproved();
  }

  return (
    <Dialog open={!!request} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Approve agency — {request?.name}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Spawns the agency row, creates the owner&apos;s login, and emails {request?.email} a password-reset link to set up their dashboard account.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>First-sale %</Label><Input type="number" min="0" max="100" step="0.01" required value={form.firstSalePct} onChange={(e) => setForm({ ...form, firstSalePct: e.target.value })} /></div>
            <div><Label>Renewal %</Label><Input type="number" min="0" max="100" step="0.01" required value={form.renewalPct} onChange={(e) => setForm({ ...form, renewalPct: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Deposit (PKR)</Label><Input type="number" min="0" step="0.01" value={form.depositAmount} onChange={(e) => setForm({ ...form, depositAmount: e.target.value })} /></div>
            <div><Label>Liability threshold</Label><Input type="number" min="0" step="0.01" value={form.liabilityThreshold} onChange={(e) => setForm({ ...form, liabilityThreshold: e.target.value })} /></div>
          </div>
          <div>
            <Label>Terms &amp; conditions</Label>
            <Textarea rows={3} value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} />
          </div>
          <div>
            <Label>Review notes (internal)</Label>
            <Input value={form.reviewNotes} onChange={(e) => setForm({ ...form, reviewNotes: e.target.value })} placeholder="Why approved" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Approving…' : 'Approve + send welcome'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ request, onClose, onRejected }: {
  request: AgencyRequest | null;
  onClose: () => void;
  onRejected: () => void;
}) {
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!request) return;
    if (!notes.trim()) { toast.error('Reason required'); return; }
    setSubmitting(true);
    const { error } = await rejectAgencyRequest(request.id, notes.trim());
    setSubmitting(false);
    if (error) { toast.error(error); return; }
    toast.success('Request rejected');
    setNotes('');
    onRejected();
  }

  return (
    <Dialog open={!!request} onOpenChange={(o) => { if (!o) { onClose(); setNotes(''); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Reject request — {request?.name}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Reason *</Label>
            <Textarea rows={4} required value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Kept for audit. Not sent to applicant." />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="destructive" disabled={submitting}>{submitting ? 'Rejecting…' : 'Reject'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
