'use client';

import { useEffect, useState } from 'react';
import { Receipt } from 'lucide-react';
import { listMyPayouts } from '@/app/actions/agent-payouts';
import type { AgentPayout } from '@/types/sales';

export default function AgentPayoutsPage() {
  const [payouts, setPayouts] = useState<AgentPayout[]>([]);

  useEffect(() => { listMyPayouts().then(r => setPayouts(r.data)); }, []);

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl font-semibold">Payouts</h2>
      {payouts.length === 0 ? (
        <div className="border border-dashed rounded-lg p-10 text-center text-muted-foreground">
          <Receipt className="w-7 h-7 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No payout requests yet.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-4 py-3">Requested</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Paid</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Reference</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map(p => (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-3">{new Date(p.requested_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}</td>
                  <td className="px-4 py-3 font-medium">Rs {Number(p.requested_amount).toFixed(2)}</td>
                  <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-muted">{p.status}</span></td>
                  <td className="px-4 py-3">{p.paid_amount ? `Rs ${Number(p.paid_amount).toFixed(2)}` : '—'}</td>
                  <td className="px-4 py-3">{p.method || '—'}</td>
                  <td className="px-4 py-3">{p.reference || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
