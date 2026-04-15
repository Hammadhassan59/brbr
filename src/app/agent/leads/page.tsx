'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { listMyLeads } from '@/app/actions/leads';
import type { Lead, LeadStatus } from '@/types/sales';

const STATUSES: (LeadStatus | 'all')[] = ['all','new','contacted','visited','interested','not_interested','converted','lost'];

export default function AgentLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [status, setStatus] = useState<LeadStatus | 'all'>('all');

  async function load() {
    const { data } = await listMyLeads({ status });
    setLeads(data);
  }
  useEffect(() => { load(); }, [status]);

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl font-semibold">My Leads</h2>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {STATUSES.map(s => (
          <button key={s} onClick={() => setStatus(s)}
            className={`px-3 py-1.5 text-xs rounded-full border whitespace-nowrap ${
              status === s ? 'bg-gold text-black border-gold' : 'bg-white border-border text-muted-foreground'
            }`}>
            {s === 'all' ? 'All' : s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {leads.length === 0 ? (
        <div className="border border-dashed rounded-lg p-10 text-center text-muted-foreground">
          <Users className="w-7 h-7 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No leads in this filter.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {leads.map(l => (
            <Link key={l.id} href={`/agent/leads/${l.id}`}
              className="border rounded-lg p-4 bg-white hover:border-gold transition-colors">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{l.salon_name}</h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted">{l.status.replace('_', ' ')}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {l.owner_name || '—'} · {l.phone || '—'} · {l.city || '—'}
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Updated {new Date(l.updated_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
