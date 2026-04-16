'use client';

import { useEffect, useState } from 'react';
import { Users, Store, Wallet, Receipt, Copy, ArrowDownToLine, ArrowUpFromLine, Scale } from 'lucide-react';
import toast from 'react-hot-toast';
import { listMyLeads, getAgentBalance } from '@/app/actions/leads';
import { listMyCommissions } from '@/app/actions/agent-commissions';
import type { Lead } from '@/types/sales';

export default function AgentDashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [available, setAvailable] = useState(0);
  const [lifetimePaid, setLifetimePaid] = useState(0);
  const [balance, setBalance] = useState<{ code: string | null; collected: number; earned: number; settled: number; balance: number } | null>(null);

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
    getAgentBalance().then(r => setBalance(r.data));
  }, []);

  const openLeads = leads.filter(l => l.status !== 'converted' && l.status !== 'lost' && l.status !== 'not_interested').length;
  const converted = leads.filter(l => l.status === 'converted').length;

  function copyCode() {
    if (!balance?.code) return;
    navigator.clipboard.writeText(balance.code).then(() => toast.success(`${balance.code} copied`));
  }

  const owesAdmin = (balance?.balance ?? 0) > 0;
  const adminOwesAgent = (balance?.balance ?? 0) < 0;

  return (
    <div className="space-y-6">
      <h2 className="font-heading text-2xl font-semibold">Dashboard</h2>

      {/* Agent code card — first thing they see, big and copyable */}
      {balance?.code && (
        <div className="bg-gradient-to-br from-gold/15 to-gold/5 border border-gold/30 rounded-lg p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Your agent code</p>
            <p className="font-mono text-3xl font-bold text-gold mt-1">{balance.code}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Share with new salons during signup so you get credit on every payment.
            </p>
          </div>
          <button
            onClick={copyCode}
            className="flex items-center gap-1.5 text-xs font-semibold bg-gold text-black px-3 py-2 rounded-md hover:bg-gold/90 transition-colors shrink-0"
          >
            <Copy className="w-3.5 h-3.5" /> Copy
          </button>
        </div>
      )}

      {/* Activity tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard icon={Users} label="Open leads" value={String(openLeads)} />
        <MetricCard icon={Store} label="Salons sold" value={String(converted)} />
        <MetricCard icon={Wallet} label="Available" value={`Rs ${available.toFixed(0)}`} />
        <MetricCard icon={Receipt} label="Lifetime paid" value={`Rs ${lifetimePaid.toFixed(0)}`} />
      </div>

      {/* Ledger — what you owe admin vs what admin owes you */}
      {balance && (
        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold uppercase tracking-wider">Cash ledger</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ArrowDownToLine className="w-3.5 h-3.5" /> Cash you collected
              </div>
              <p className="text-2xl font-bold mt-1.5">Rs {balance.collected.toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">From approved cash payments</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ArrowUpFromLine className="w-3.5 h-3.5" /> Commission earned
              </div>
              <p className="text-2xl font-bold mt-1.5">Rs {balance.earned.toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {balance.settled > 0 ? `Rs ${balance.settled.toLocaleString()} already paid out` : 'None paid out yet'}
              </p>
            </div>
          </div>

          {/* Net settlement */}
          <div className={`rounded-lg p-4 border ${
            owesAdmin ? 'border-amber-500/40 bg-amber-500/5' :
            adminOwesAgent ? 'border-green-500/40 bg-green-500/5' :
            'border-border bg-secondary/30'
          }`}>
            {owesAdmin && (
              <>
                <p className="text-xs font-medium text-amber-700">You owe admin</p>
                <p className="text-2xl font-bold text-amber-700 mt-0.5">Rs {balance.balance.toLocaleString()}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Hand this in or net it against your next commission payout.
                </p>
              </>
            )}
            {adminOwesAgent && (
              <>
                <p className="text-xs font-medium text-green-700">Admin owes you</p>
                <p className="text-2xl font-bold text-green-700 mt-0.5">Rs {Math.abs(balance.balance).toLocaleString()}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Available to request as a payout.
                </p>
              </>
            )}
            {!owesAdmin && !adminOwesAgent && (
              <>
                <p className="text-xs font-medium text-muted-foreground">Settled up</p>
                <p className="text-2xl font-bold mt-0.5">Rs 0</p>
                <p className="text-[11px] text-muted-foreground mt-1">No money pending in either direction.</p>
              </>
            )}
          </div>
        </div>
      )}
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
