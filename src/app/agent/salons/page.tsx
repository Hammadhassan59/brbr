'use client';

import { useEffect, useState } from 'react';
import { Store } from 'lucide-react';
import { listMySalons, type MySalonRow } from '@/app/actions/agent-commissions';

export default function AgentSalonsPage() {
  const [salons, setSalons] = useState<MySalonRow[]>([]);

  useEffect(() => { listMySalons().then(r => setSalons(r.data)); }, []);

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl font-semibold">My Salons</h2>
      {salons.length === 0 ? (
        <div className="border border-dashed rounded-lg p-10 text-center text-muted-foreground">
          <Store className="w-7 h-7 mx-auto mb-2 opacity-50" />
          <p className="text-sm">You haven&apos;t sold any salons yet.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {salons.map(s => (
            <div key={s.id} className="border rounded-lg p-4 bg-white">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{s.name}</h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted">{s.subscription_status || '—'}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {s.subscription_plan || '—'}
                {s.subscription_expires_at && ` · renews ${new Date(s.subscription_expires_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}`}
              </p>
              <p className="text-sm mt-1">
                Lifetime commission: <span className="font-medium">Rs {s.lifetime_commission.toFixed(2)}</span>
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
