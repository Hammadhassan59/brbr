'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, CreditCard, CheckCircle2, Clock, XCircle, Wallet, CalendarDays, Receipt, AlertTriangle, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getBillingData, type BillingData, type BillingPaymentRow } from '@/app/actions/billing';
import { getPaymentScreenshotUrl } from '@/app/actions/storage';
import { PaymentSubmitModal } from '@/components/payment-submit-modal';
import { DEFAULT_PLANS, type PlanOption } from '@/lib/bank-details';
import { formatPKDate } from '@/lib/utils/dates';

const STATUS_BADGE: Record<BillingPaymentRow['status'], { cls: string; label: string; Icon: typeof CheckCircle2 }> = {
  approved: { cls: 'bg-green-500/15 text-green-700 border-green-500/30', label: 'Approved', Icon: CheckCircle2 },
  pending: { cls: 'bg-amber-500/15 text-amber-700 border-amber-500/30', label: 'Pending', Icon: Clock },
  rejected: { cls: 'bg-red-500/15 text-red-700 border-red-500/30', label: 'Rejected', Icon: XCircle },
};

export default function BillingPage() {
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [renewPlan, setRenewPlan] = useState<PlanOption | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  // Click-to-view handler — the bucket is private, so we mint a signed URL
  // on demand and open it in a new tab rather than storing expiring links
  // on the page.
  async function viewScreenshot(paymentId: string) {
    setViewingId(paymentId);
    try {
      const url = await getPaymentScreenshotUrl(paymentId);
      if (!url) {
        toast.error('Screenshot not available');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } finally {
      setViewingId(null);
    }
  }

  const load = useCallback(async () => {
    const { data, error } = await getBillingData();
    if (error || !data) {
      toast.error(error || 'Could not load billing');
      setLoading(false);
      return;
    }
    setData(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">Could not load billing data.</p>;
  }

  const { salon, history, totalPaid, approvedCount, lastPaymentAt, planPrices } = data;
  const isActive = salon.status === 'active';
  const isExpiringSoon = salon.daysRemaining !== null && salon.daysRemaining <= 7;
  const showRenewCTA = !isActive || isExpiringSoon;

  function openRenew(planKey: 'basic' | 'growth' | 'pro') {
    const tmpl = DEFAULT_PLANS.find((p) => p.key === planKey)!;
    setRenewPlan({ ...tmpl, price: planPrices[planKey] ?? tmpl.price });
    setModalOpen(true);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-sm text-muted-foreground mt-1">Subscription, payments, and renewals for {salon.name}.</p>
      </div>

      {/* Current plan card */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
              <CreditCard className="w-5 h-5 text-gold" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-heading font-semibold capitalize text-lg">
                  {salon.plan && salon.plan !== 'none' ? salon.plan : 'No active plan'}
                </p>
                <Badge variant="outline" className={`text-[11px] ${
                  isActive ? 'text-green-700 border-green-500/30 bg-green-500/10' :
                  salon.status === 'pending' ? 'text-amber-700 border-amber-500/30 bg-amber-500/10' :
                  salon.status === 'expired' ? 'text-red-700 border-red-500/30 bg-red-500/10' :
                  'text-gray-600 border-gray-400/30 bg-gray-500/10'
                }`}>
                  {String(salon.status).charAt(0).toUpperCase() + String(salon.status).slice(1)}
                </Badge>
              </div>
              {salon.subscription_expires_at ? (
                <p className="text-sm text-muted-foreground mt-1">
                  {isActive ? 'Renews' : 'Expired'} on {formatPKDate(salon.subscription_expires_at)}
                  {salon.daysRemaining !== null && (
                    <span className={`ml-2 ${isExpiringSoon ? 'text-red-600 font-medium' : ''}`}>
                      ({salon.daysRemaining} day{salon.daysRemaining === 1 ? '' : 's'} {isActive ? 'left' : 'overdue'})
                    </span>
                  )}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground mt-1">No active subscription. Choose a plan to get started.</p>
              )}
            </div>
          </div>

          {showRenewCTA && (
            <div className={`mt-5 rounded-lg border p-4 ${
              !isActive ? 'border-red-500/30 bg-red-500/5' : 'border-amber-500/30 bg-amber-500/5'
            }`}>
              <div className="flex items-start gap-2 mb-3">
                <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${!isActive ? 'text-red-600' : 'text-amber-600'}`} />
                <p className="text-sm font-medium">
                  {!isActive ? 'Renew now to restore full access.' : `Your subscription expires in ${salon.daysRemaining} day${salon.daysRemaining === 1 ? '' : 's'}.`}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {DEFAULT_PLANS.map((plan) => {
                  const livePrice = planPrices[plan.key] ?? plan.price;
                  return (
                    <Button
                      key={plan.key}
                      variant="outline"
                      onClick={() => openRenew(plan.key)}
                      className="justify-between h-auto py-2.5"
                    >
                      <span className="font-semibold capitalize">{plan.name}</span>
                      <span className="text-xs text-muted-foreground">Rs {livePrice.toLocaleString()}/mo</span>
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lifetime stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
              <Wallet className="w-3.5 h-3.5" /> Total paid
            </div>
            <p className="text-2xl font-bold mt-2">Rs {totalPaid.toLocaleString()}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{approvedCount} approved payment{approvedCount === 1 ? '' : 's'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
              <CalendarDays className="w-3.5 h-3.5" /> Member since
            </div>
            <p className="text-2xl font-bold mt-2">
              {salon.subscription_started_at ? formatPKDate(salon.subscription_started_at) : '—'}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">First activation</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
              <Receipt className="w-3.5 h-3.5" /> Last payment
            </div>
            <p className="text-2xl font-bold mt-2">
              {lastPaymentAt ? formatPKDate(lastPaymentAt) : '—'}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">Most recent approved</p>
          </CardContent>
        </Card>
      </div>

      {/* History */}
      <Card>
        <CardContent className="px-0 py-0">
          <div className="px-4 sm:px-5 py-3 border-b border-border flex items-center justify-between">
            <p className="text-sm font-semibold">Payment history</p>
            <p className="text-xs text-muted-foreground">{history.length} record{history.length === 1 ? '' : 's'}</p>
          </div>
          {history.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No payments yet. Submit one to activate your subscription.
            </div>
          ) : (
            <div className="overflow-auto max-h-[60vh]">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="pl-4">Date</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="pr-4">Receipt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((row) => {
                    const badge = STATUS_BADGE[row.status];
                    const StatusIcon = badge.Icon;
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="pl-4 text-sm">{formatPKDate(row.created_at)}</TableCell>
                        <TableCell className="capitalize text-sm">{row.plan}</TableCell>
                        <TableCell className="text-right font-medium text-sm">Rs {row.amount.toLocaleString()}</TableCell>
                        <TableCell className="capitalize text-sm">{row.method || '—'}</TableCell>
                        <TableCell className="font-mono text-xs">{row.reference || '—'}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${badge.cls}`}>
                            <StatusIcon className="w-3 h-3" />
                            {badge.label}
                          </span>
                        </TableCell>
                        <TableCell className="pr-4">
                          {row.screenshot_path || row.screenshot_url ? (
                            <button
                              type="button"
                              onClick={() => viewScreenshot(row.id)}
                              disabled={viewingId === row.id}
                              className="text-xs text-gold hover:underline disabled:opacity-50"
                            >
                              {viewingId === row.id ? 'Loading…' : 'View'}
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground text-center">
        We&apos;ll remind you 7 days before, 3 days before, and on the expiry date.
      </p>

      {/* Data export — always available, regardless of subscription status.
          Owner can pull a backup of their data anytime as a PDF. */}
      <Card>
        <CardContent className="p-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-semibold">Your data</p>
            <p className="text-xs text-muted-foreground mt-1">
              Download a PDF with your salon profile, branches, staff, services, clients,
              last 90 days of bills + appointments, and current inventory snapshot.
            </p>
          </div>
          <a href="/api/dashboard/data-export.pdf" download>
            <Button variant="outline" className="h-10">
              <Download className="w-4 h-4 mr-1.5" /> Download my data (PDF)
            </Button>
          </a>
        </CardContent>
      </Card>

      {renewPlan && (
        <PaymentSubmitModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          plan={renewPlan}
          onSubmitted={load}
        />
      )}
    </div>
  );
}
