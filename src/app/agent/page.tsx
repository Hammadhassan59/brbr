'use client';

import { useEffect, useState } from 'react';
import { Users, Store, Wallet, Receipt } from 'lucide-react';
import { listMyLeads } from '@/app/actions/leads';
import type { Lead } from '@/types/sales';

export default function AgentDashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);

  useEffect(() => {
    listMyLeads().then(r => setLeads(r.data));
  }, []);

  const openLeads = leads.filter(l => l.status !== 'converted' && l.status !== 'lost' && l.status !== 'not_interested').length;
  const converted = leads.filter(l => l.status === 'converted').length;

  return (
    <div className="space-y-6">
      <h2 className="font-heading text-2xl font-semibold">Dashboard</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard icon={Users} label="Open leads" value={String(openLeads)} />
        <MetricCard icon={Store} label="Salons sold" value={String(converted)} />
        <MetricCard icon={Wallet} label="Available" value="—" hint="Phase 4" />
        <MetricCard icon={Receipt} label="Lifetime paid" value="—" hint="Phase 5" />
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, hint }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; hint?: string }) {
  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        <Icon className="w-4 h-4" />
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-semibold font-heading">{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground/60 mt-1">{hint}</p>}
    </div>
  );
}
