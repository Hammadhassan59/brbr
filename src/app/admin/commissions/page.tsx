'use client';

import { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { listAllCommissions, type AgentCommissionAudit } from '@/app/actions/agent-commissions';
import { listSalesAgents } from '@/app/actions/sales-agents';
import type { SalesAgent, CommissionStatus } from '@/types/sales';

const STATUSES: (CommissionStatus | 'all')[] = ['all','pending','approved','paid','reversed'];

export default function AdminCommissionsPage() {
  const [rows, setRows] = useState<AgentCommissionAudit[]>([]);
  const [agents, setAgents] = useState<SalesAgent[]>([]);
  const [agentFilter, setAgentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<CommissionStatus | 'all'>('all');

  useEffect(() => { listSalesAgents().then(r => setAgents(r.data)); }, []);
  useEffect(() => {
    listAllCommissions({ agentId: agentFilter || undefined, status: statusFilter }).then(r => setRows(r.data));
  }, [agentFilter, statusFilter]);

  const total = rows.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl font-semibold">Commissions (audit)</h2>

      <div className="flex gap-3 flex-wrap items-center">
        <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">All agents</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as CommissionStatus | 'all')}
          className="border rounded-lg px-3 py-2 text-sm bg-white">
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="ml-auto text-sm text-muted-foreground">
          Total in filter: <strong>Rs {total.toFixed(2)}</strong>
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center text-muted-foreground">
          <Wallet className="w-8 h-8 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No commissions.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Agent</th>
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
                  <td className="px-4 py-3 font-medium">{r.agent?.name || '—'}</td>
                  <td className="px-4 py-3">{r.salon?.name || '—'}</td>
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
    </div>
  );
}
