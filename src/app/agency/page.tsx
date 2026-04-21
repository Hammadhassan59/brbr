'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Wallet, AlertTriangle, Users, Receipt, Loader2 } from 'lucide-react';
import { getMyAgency, listMyAgents } from '@/app/actions/agency-self';
import type { Agency } from '@/types/sales';
import { Card, CardContent } from '@/components/ui/card';
import { formatPKR } from '@/lib/utils/currency';

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-green-500/15 text-green-700',
  frozen: 'bg-amber-500/15 text-amber-700',
  terminated: 'bg-gray-500/15 text-gray-600',
};

export default function AgencyOverviewPage() {
  const [agency, setAgency] = useState<Agency | null>(null);
  const [balance, setBalance] = useState<{ commissionEarned: number; commissionPaid: number; unpaidLiability: number; depositBalance: number } | null>(null);
  const [agentCount, setAgentCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getMyAgency(), listMyAgents()]).then(([a, ag]) => {
      setAgency(a.data.agency);
      setBalance(a.data.balance);
      setAgentCount(ag.data.length);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  if (!agency) return <p className="text-sm text-muted-foreground">Could not load your agency.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Agency</p>
          <h1 className="font-heading text-2xl font-bold flex items-center gap-2">
            <Building2 className="w-6 h-6 text-gold" /> {agency.name}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">{agency.code}</p>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full capitalize ${STATUS_STYLE[agency.status] ?? 'bg-muted'}`}>{agency.status}</span>
      </div>

      {agency.status === 'frozen' && balance && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Your agency is frozen</p>
              <p className="text-xs mt-0.5">
                Your unpaid liability to the platform ({formatPKR(balance.unpaidLiability)}) has crossed the threshold. New tenant collections are blocked. Remit pending payments to reactivate — contact the platform admin.
              </p>
            </div>
          </div>
        </div>
      )}

      {agency.status === 'terminated' && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-900">
          Your agency account has been terminated. This dashboard is read-only.
        </div>
      )}

      {balance && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                <Wallet className="w-3.5 h-3.5" /> Commission earned
              </div>
              <p className="text-2xl font-bold mt-2">{formatPKR(balance.commissionEarned)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Lifetime, approved + paid</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                <Receipt className="w-3.5 h-3.5" /> Paid out
              </div>
              <p className="text-2xl font-bold mt-2">{formatPKR(balance.commissionPaid)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{formatPKR(Math.max(0, balance.commissionEarned - balance.commissionPaid))} owed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                <AlertTriangle className="w-3.5 h-3.5" /> Unpaid to platform
              </div>
              <p className="text-2xl font-bold mt-2">{formatPKR(balance.unpaidLiability)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Collections not yet remitted</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                <Building2 className="w-3.5 h-3.5" /> Deposit balance
              </div>
              <p className="text-2xl font-bold mt-2">{formatPKR(balance.depositBalance)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Security on file</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold flex items-center gap-2"><Users className="w-4 h-4" /> Your sales agents</p>
              <Link href="/agency/agents" className="text-xs text-gold hover:underline">Manage →</Link>
            </div>
            <p className="text-3xl font-bold">{agentCount}</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {agentCount === 0
                ? "You haven't added any agents yet. Each agent gets a code to share with salons during signup so the onboarding credits back to your agency."
                : 'Agents linked to your agency.'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-semibold mb-2">Your rates</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">First-sale</p>
                <p className="text-xl font-bold mt-0.5">{Number(agency.first_sale_pct).toFixed(2)}%</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Renewal</p>
                <p className="text-xl font-bold mt-0.5">{Number(agency.renewal_pct).toFixed(2)}%</p>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-3">
              Platform pays you this commission on every tenant your agents onboard. Contact the platform admin to adjust.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
