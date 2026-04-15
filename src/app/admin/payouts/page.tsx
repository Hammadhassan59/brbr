'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Receipt } from 'lucide-react';
import { listAllPayouts, markPayoutPaid, rejectPayout, type PayoutWithAgent } from '@/app/actions/agent-payouts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { PayoutStatus } from '@/types/sales';

const STATUSES: (PayoutStatus | 'all')[] = ['all','requested','paid','rejected'];

export default function AdminPayoutsPage() {
  const [payouts, setPayouts] = useState<PayoutWithAgent[]>([]);
  const [status, setStatus] = useState<PayoutStatus | 'all'>('requested');
  const [payDialog, setPayDialog] = useState<PayoutWithAgent | null>(null);

  async function load() {
    const { data } = await listAllPayouts({ status });
    setPayouts(data);
  }
  useEffect(() => { load(); }, [status]);

  async function handleReject(p: PayoutWithAgent) {
    const reason = window.prompt('Reason for rejection?');
    if (reason === null) return;
    const { error } = await rejectPayout(p.id, reason.trim() || null);
    if (error) { toast.error(error); return; }
    toast.success('Payout rejected — commissions unlocked');
    load();
  }

  return (
    <div className="space-y-6">
      <h2 className="font-heading text-2xl font-semibold">Payouts</h2>

      <div className="flex gap-2">
        {STATUSES.map(s => (
          <button key={s} onClick={() => setStatus(s)}
            className={`px-3 py-1.5 text-xs rounded-full border ${status === s ? 'bg-gold text-black border-gold' : 'bg-white border-border text-muted-foreground'}`}>
            {s}
          </button>
        ))}
      </div>

      {payouts.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center text-muted-foreground">
          <Receipt className="w-8 h-8 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No payouts in this filter.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Requested</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Paid</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {payouts.map(p => (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{p.agent?.name || '—'}</td>
                  <td className="px-4 py-3">{new Date(p.requested_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}</td>
                  <td className="px-4 py-3">Rs {Number(p.requested_amount).toFixed(2)}</td>
                  <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-muted">{p.status}</span></td>
                  <td className="px-4 py-3">{p.paid_amount ? `Rs ${Number(p.paid_amount).toFixed(2)}` : '—'}</td>
                  <td className="px-4 py-3">
                    {p.status === 'requested' && (
                      <>
                        <button onClick={() => setPayDialog(p)} className="text-gold hover:underline text-sm mr-2">Mark paid</button>
                        <button onClick={() => handleReject(p)} className="text-red-600 hover:underline text-sm">Reject</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <MarkPaidDialog payout={payDialog} onClose={() => setPayDialog(null)} onPaid={load} />
    </div>
  );
}

function MarkPaidDialog({ payout, onClose, onPaid }: { payout: PayoutWithAgent | null; onClose: () => void; onPaid: () => void }) {
  const [form, setForm] = useState({ paidAmount: '', method: 'bank' as 'bank'|'jazzcash'|'cash', reference: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (payout) setForm({ paidAmount: String(payout.requested_amount), method: 'bank', reference: '', notes: '' });
  }, [payout]);

  if (!payout) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!payout) return;
    setSubmitting(true);
    const { error } = await markPayoutPaid(payout.id, {
      paidAmount: Number(form.paidAmount),
      method: form.method,
      reference: form.reference.trim() || null,
      notes: form.notes.trim() || null,
    });
    setSubmitting(false);
    if (error) { toast.error(error); return; }
    toast.success('Payout marked paid');
    onClose();
    onPaid();
  }

  return (
    <Dialog open={!!payout} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark payout paid — {payout.agent?.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>Amount paid (Rs)</Label>
            <Input type="number" required min="0" step="0.01" value={form.paidAmount}
              onChange={e => setForm({ ...form, paidAmount: e.target.value })} /></div>
          <div><Label>Method</Label>
            <select value={form.method}
              onChange={e => setForm({ ...form, method: e.target.value as 'bank'|'jazzcash'|'cash' })}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
              <option value="bank">Bank transfer</option>
              <option value="jazzcash">JazzCash</option>
              <option value="cash">Cash</option>
            </select></div>
          <div><Label>Reference</Label>
            <Input value={form.reference}
              onChange={e => setForm({ ...form, reference: e.target.value })}
              placeholder="Tx ID, cheque #, etc." /></div>
          <div><Label>Notes</Label>
            <Textarea rows={2} value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Mark paid'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
