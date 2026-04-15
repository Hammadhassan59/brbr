'use client';

import { useEffect, useState } from 'react';
import { Users, Store, Wallet, Receipt } from 'lucide-react';
import { listMyLeads } from '@/app/actions/leads';
import { listMyCommissions } from '@/app/actions/agent-commissions';
import type { Lead } from '@/types/sales';

export default function AgentDashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [available, setAvailable] = useState(0);
  const [lifetimePaid, setLifetimePaid] = useState(0);

  useEffect(() => {
    listMyLeads().then(r => setLeads(r.data));
    listMyCommissions().then(r => {
      let a = 0;
      let p = 0;
      for (const c of r.data) {
        const amt = Number(c.amount);
        if (c.status === 'approved' && !c.payout_id) a += amt;
        if (c.status === 'paid') p += amt;
      }
      setAvailable(a);
      setLifetimePaid(p);
    });
  }, []);

  const openLeads = leads.filter(l => l.status !== 'converted' && l.status !== 'lost' && l.status !== 'not_interested').length;
  const converted = leads.filter(l => l.status === 'converted').length;

  return (
    <div className="space-y-6">
      <h2 className="font-heading text-2xl font-semibold">Dashboard</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard icon={Users} label="Open leads" value={String(openLeads)} />
        <MetricCard icon={Store} label="Salons sold" value={String(converted)} />
        <MetricCard icon={Wallet} label="Available" value={`Rs ${available.toFixed(0)}`} />
        <MetricCard icon={Receipt} label="Lifetime paid" value={`Rs ${lifetimePaid.toFixed(0)}`} />
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        <Icon className="w-4 h-4" />
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-semibold font-heading">{value}</p>
    </div>
  );
}
