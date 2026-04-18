'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Phone,
  ShieldAlert,
  Wallet,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  listSalonsWithUnsettled,
  type SalonWithUnsettled,
} from '@/app/actions/admin-settlements';

type SortKey = 'amount_desc' | 'last_payment_asc';

function formatPKR(n: number) {
  return `Rs ${Math.round(n).toLocaleString('en-PK')}`;
}

function formatRelative(iso: string | null) {
  if (!iso) return 'Never';
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.round((now - then) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

const STATUS_BADGE: Record<SalonWithUnsettled['status'], { label: string; cls: string; icon: React.ElementType }> = {
  OK: {
    label: 'OK',
    cls: 'bg-green-500/15 text-green-700 border-green-500/30',
    icon: CheckCircle2,
  },
  WARNING: {
    label: 'Warning',
    cls: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
    icon: AlertTriangle,
  },
  BLOCKED: {
    label: 'Blocked',
    cls: 'bg-red-500/15 text-red-700 border-red-500/30',
    icon: ShieldAlert,
  },
};

export default function AdminSettlementsPage() {
  const [rows, setRows] = useState<SalonWithUnsettled[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>('amount_desc');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await listSalonsWithUnsettled({ sort });
      if (error) {
        toast.error(error);
        setRows([]);
        return;
      }
      setRows(data);
    } finally {
      setLoading(false);
    }
  }, [sort]);

   
  useEffect(() => {
    load();
  }, [load]);

  // Totals strip — show full picture at a glance. Blocked count is the most
  // actionable number here (every blocked salon is currently losing revenue).
  const totalUnsettled = rows.reduce((acc, r) => acc + r.unsettled, 0);
  const blockedCount = rows.filter((r) => r.status === 'BLOCKED').length;
  const warningCount = rows.filter((r) => r.status === 'WARNING').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold flex items-center gap-2">
          <Wallet className="w-5 h-5" /> Marketplace Settlements
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track what each salon owes the platform (30% markup + Rs 300 per
          home booking) and record payments as they come in. Salons auto-block
          at Rs 5,000 unsettled — recording a payment that drops their balance
          below the threshold clears the block automatically.
        </p>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] uppercase text-muted-foreground tracking-wider">
              Total unsettled
            </p>
            <p className="text-2xl font-bold mt-1">{formatPKR(totalUnsettled)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              across {rows.length} salon{rows.length === 1 ? '' : 's'}
            </p>
          </CardContent>
        </Card>
        <Card className={blockedCount > 0 ? 'border-red-500/30' : undefined}>
          <CardContent className="p-4">
            <p className="text-[11px] uppercase text-muted-foreground tracking-wider">
              Blocked
            </p>
            <p className="text-2xl font-bold mt-1 text-red-600">
              {blockedCount}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              over the Rs 5,000 threshold
            </p>
          </CardContent>
        </Card>
        <Card className={warningCount > 0 ? 'border-amber-500/30' : undefined}>
          <CardContent className="p-4">
            <p className="text-[11px] uppercase text-muted-foreground tracking-wider">
              Warning
            </p>
            <p className="text-2xl font-bold mt-1 text-amber-600">
              {warningCount}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              at 80%+ of threshold
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Sort control */}
      <div className="flex items-center gap-2">
        <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Sort:</span>
        {(
          [
            ['amount_desc', 'Highest balance'],
            ['last_payment_asc', 'Oldest payment'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setSort(value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              sort === value
                ? 'bg-foreground text-white border-foreground'
                : 'text-muted-foreground border-border hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table / list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <CheckCircle2 className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No salons have an unsettled balance. Nothing to collect.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const s = STATUS_BADGE[r.status];
            const Icon = s.icon;
            const pct = Math.min(
              100,
              Math.round((r.unsettled / Math.max(1, r.block_threshold)) * 100),
            );
            return (
              <Link
                key={r.salon_id}
                href={`/admin/marketplace/settlements/${r.salon_id}`}
                className="block"
              >
                <Card className="hover:border-gold/40 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4 flex-wrap sm:flex-nowrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold truncate">{r.salon_name}</p>
                          <Badge
                            variant="outline"
                            className={`text-[10px] uppercase gap-1 ${s.cls}`}
                          >
                            <Icon className="w-3 h-3" />
                            {s.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                          {r.owner_name && <span>{r.owner_name}</span>}
                          {r.owner_phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {r.owner_phone}
                            </span>
                          )}
                          <span>
                            {r.home_bookings_contributing} home booking
                            {r.home_bookings_contributing === 1 ? '' : 's'}{' '}
                            contributing
                          </span>
                          <span>Last payment: {formatRelative(r.last_payment_at)}</span>
                        </div>

                        {/* Threshold progress bar — visual, not precise. A full
                            bar = balance ≥ block threshold. */}
                        <div className="mt-3 h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              r.status === 'BLOCKED'
                                ? 'bg-red-500'
                                : r.status === 'WARNING'
                                  ? 'bg-amber-500'
                                  : 'bg-green-500'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-3 sm:shrink-0">
                        <div className="text-right">
                          <p className="text-[10px] uppercase text-muted-foreground tracking-wider">
                            Unsettled
                          </p>
                          <p className="font-bold text-lg text-gold">
                            {formatPKR(r.unsettled)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            of {formatPKR(r.block_threshold)}
                          </p>
                        </div>
                        <Button size="sm" variant="outline" className="gap-1">
                          View
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {loading && rows.length > 0 && (
        <div className="flex items-center justify-center py-2">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
