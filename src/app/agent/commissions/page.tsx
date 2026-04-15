'use client';

import { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import { listMyCommissions, type AgentCommissionWithSalon } from '@/app/actions/agent-commissions';
import { requestPayout } from '@/app/actions/agent-payouts';
import { Button } from '@/components/ui/button';

export default function AgentCommissionsPage() {
  const [rows, setRows] = useState<AgentCommissionWithSalon[]>([]);
  const [requesting, setRequesting] = useState(false);

  async function reload() {
    const r = await listMyCommissions();
    setRows(r.data);
  }

  useEffect(() => { reload(); }, []);

  const totals = rows.reduce(
    (acc, r) => {
      const amt = Number(r.amount);
      if (r.status === 'approved' && !r.payout_id) acc.available += amt;
      if (r.status === 'approved' && r.payout_id) acc.pending += amt;
      if (r.status === 'paid') acc.paid += amt;
      if (r.status === 'reversed') acc.reversed += amt;
      return acc;
    },
    { available: 0, pending: 0, paid: 0, reversed: 0 },
  );

  async function handleRequest() {
    if (totals.available <= 0) return;
    if (!confirm(`Request payout of Rs ${totals.available.toFixed(2)}?`)) return;
    setRequesting(true);
    const { error } = await requestPayout();
    setRequesting(false);
    if (error) { toast.error(error); return; }
    toast.success('Payout requested — superadmin will process');
    await reload();
  }

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl font-semibold">Commissions</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Summary label="Available" value={totals.available} />
        <Summary label="Pending payout" value={totals.pending} />
        <Summary label="Lifetime paid" value={totals.paid} />
        <Summary label="Reversed" value={totals.reversed} negative />
      </div>

      <div className="flex justify-end">
        <Button onClick={handleRequest} disabled={requesting || totals.available <= 0}>
          {requesting ? 'Requesting…' : `Request payout (Rs ${totals.available.toFixed(2)})`}
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="border border-dashed rounded-lg p-10 text-center text-muted-foreground">
          <Wallet className="w-7 h-7 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No commissions yet.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Salon</th>
                <th className="px-4 py-3">Kind</th>
                <th className="px-4 py-3">Base</th>
                <th className="px-4 py-3">%</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-3">{new Date(r.created_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}</td>
                  <td className="px-4 py-3 font-medium">{r.salon?.name || '—'}</td>
                  <td className="px-4 py-3">{r.kind === 'first_sale' ? 'First sale' : 'Renewal'}</td>
                  <td className="px-4 py-3">Rs {Number(r.base_amount).toFixed(0)}</td>
                  <td className="px-4 py-3">{Number(r.pct).toFixed(2)}</td>
                  <td className="px-4 py-3 font-medium">Rs {Number(r.amount).toFixed(2)}</td>
                  <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-muted">{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Payout history is on the <a href="/agent/payouts" className="text-gold hover:underline">Payouts</a> page.
      </p>
    </div>
  );
}

function Summary({ label, value, negative }: { label: string; value: number; negative?: boolean }) {
  return (
    <div className="border rounded-lg p-4 bg-white">
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-heading font-semibold ${negative && value > 0 ? 'text-red-600' : ''}`}>
        {negative && value > 0 ? '−' : ''}Rs {value.toFixed(2)}
      </p>
    </div>
  );
}
