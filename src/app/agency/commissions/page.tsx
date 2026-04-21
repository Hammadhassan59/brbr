'use client';

import { useEffect, useState } from 'react';
import { Wallet, Loader2 } from 'lucide-react';
import { listMyCommissions, listMyPayouts } from '@/app/actions/agency-self';
import type { AgencyCommission, AgencyPayout } from '@/types/sales';
import { Card, CardContent } from '@/components/ui/card';
import { formatPKR } from '@/lib/utils/currency';
import { formatPKDate } from '@/lib/utils/dates';

export default function AgencyCommissionsPage() {
  const [comms, setComms] = useState<AgencyCommission[]>([]);
  const [payouts, setPayouts] = useState<AgencyPayout[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([listMyCommissions(), listMyPayouts()]).then(([c, p]) => {
      setComms(c.data);
      setPayouts(p.data);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  const totalEarned = comms.filter((c) => c.status === 'approved' || c.status === 'paid').reduce((s, c) => s + Number(c.amount), 0);
  const totalPaid = comms.filter((c) => c.status === 'paid').reduce((s, c) => s + Number(c.amount), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-bold flex items-center gap-2">
          <Wallet className="w-6 h-6 text-gold" /> Commissions
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every commission you&apos;ve earned from the platform, and every payout that settled it.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Earned</p>
          <p className="text-xl font-bold mt-1">{formatPKR(totalEarned)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Paid out</p>
          <p className="text-xl font-bold mt-1">{formatPKR(totalPaid)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Outstanding</p>
          <p className="text-xl font-bold mt-1">{formatPKR(Math.max(0, totalEarned - totalPaid))}</p>
        </CardContent></Card>
      </div>

      <Card><CardContent className="p-0">
        <div className="px-4 py-3 border-b font-semibold text-sm">Commission accruals</div>
        {comms.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No commissions accrued yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Kind</th>
                  <th className="px-4 py-2">Base</th>
                  <th className="px-4 py-2">Rate</th>
                  <th className="px-4 py-2">Amount</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {comms.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="px-4 py-2">{formatPKDate(c.created_at)}</td>
                    <td className="px-4 py-2 capitalize">{c.kind.replace('_', ' ')}</td>
                    <td className="px-4 py-2">{formatPKR(Number(c.base_amount))}</td>
                    <td className="px-4 py-2">{Number(c.pct).toFixed(2)}%</td>
                    <td className="px-4 py-2 font-semibold">{formatPKR(Number(c.amount))}</td>
                    <td className="px-4 py-2 capitalize">{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent></Card>

      <Card><CardContent className="p-0">
        <div className="px-4 py-3 border-b font-semibold text-sm">Payouts</div>
        {payouts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No payouts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="px-4 py-2">Requested</th>
                  <th className="px-4 py-2">Amount requested</th>
                  <th className="px-4 py-2">Paid</th>
                  <th className="px-4 py-2">Method</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-4 py-2">{formatPKDate(p.requested_at)}</td>
                    <td className="px-4 py-2">{formatPKR(Number(p.requested_amount))}</td>
                    <td className="px-4 py-2">{p.paid_amount !== null ? formatPKR(Number(p.paid_amount)) : '—'}</td>
                    <td className="px-4 py-2 capitalize">{p.method ?? '—'}</td>
                    <td className="px-4 py-2 capitalize">{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent></Card>

      <p className="text-[11px] text-muted-foreground text-center pt-2">
        Self-serve payout requests will land here in a follow-up. For now, contact the platform admin to settle owed commission.
      </p>
    </div>
  );
}
