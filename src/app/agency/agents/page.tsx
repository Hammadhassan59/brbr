'use client';

import { useEffect, useState } from 'react';
import { Users, Loader2, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { listMyAgents } from '@/app/actions/agency-self';
import type { SalesAgent } from '@/types/sales';
import { Card, CardContent } from '@/components/ui/card';

export default function AgencyAgentsPage() {
  const [agents, setAgents] = useState<SalesAgent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listMyAgents().then(({ data }) => { setAgents(data); setLoading(false); });
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-bold flex items-center gap-2">
          <Users className="w-6 h-6 text-gold" /> My sales agents
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sales agents linked to your agency. Each agent has a short code that tenants can use during signup to credit your agency for the onboarding.
        </p>
      </div>

      {agents.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">
          <Users className="w-8 h-8 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No agents linked yet.</p>
          <p className="text-xs mt-2">Contact the platform admin to have agents attached to your agency.</p>
        </CardContent></Card>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => navigator.clipboard.writeText(a.code).then(() => toast.success(`${a.code} copied`))}
                      className="inline-flex items-center gap-1.5 font-mono font-semibold text-gold hover:underline"
                    >
                      {a.code}
                      <Copy className="w-3 h-3 opacity-60" />
                    </button>
                  </td>
                  <td className="px-4 py-3 font-medium">{a.name}</td>
                  <td className="px-4 py-3">{a.phone || '—'}</td>
                  <td className="px-4 py-3">{a.city || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${a.active ? 'bg-green-500/15 text-green-700' : 'bg-gray-500/15 text-gray-600'}`}>
                      {a.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground text-center pt-2">
        Full agent management (create, rate overrides, deactivate) is coming soon. For now, contact the platform admin to add or change an agent.
      </p>
    </div>
  );
}
