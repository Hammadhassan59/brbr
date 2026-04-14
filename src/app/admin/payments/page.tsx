'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Check, X, Clock, Search, Phone, Building2, AlertCircle, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  listPaymentRequests,
  approvePaymentRequest,
  rejectPaymentRequest,
  type PaymentRequestWithSalon,
} from '@/app/actions/payment-requests';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

type Filter = 'pending' | 'approved' | 'rejected' | 'all';

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-500/15 text-yellow-700 border-yellow-500/30',
  approved: 'bg-green-500/15 text-green-700 border-green-500/30',
  rejected: 'bg-red-500/15 text-red-700 border-red-500/30',
};

function formatPKR(n: number) {
  return `Rs ${n.toLocaleString('en-PK')}`;
}

function formatRelative(iso: string) {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.round((now - then) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

export default function AdminPaymentsPage() {
  const [requests, setRequests] = useState<PaymentRequestWithSalon[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('pending');
  const [search, setSearch] = useState('');

  // Approve dialog
  const [approveTarget, setApproveTarget] = useState<PaymentRequestWithSalon | null>(null);
  const [approvePlan, setApprovePlan] = useState<'basic' | 'growth' | 'pro'>('basic');
  const [approveDays, setApproveDays] = useState('30');
  const [approveNotes, setApproveNotes] = useState('');
  const [approving, setApproving] = useState(false);

  // Reject dialog
  const [rejectTarget, setRejectTarget] = useState<PaymentRequestWithSalon | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await listPaymentRequests({ status: filter });
      if (error) {
        toast.error(error);
        setRequests([]);
      } else {
        setRequests(data);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const filtered = requests.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.salon?.name?.toLowerCase().includes(q) ||
      r.salon?.phone?.toLowerCase().includes(q) ||
      r.reference?.toLowerCase().includes(q)
    );
  });

  const counts = {
    pending: requests.filter((r) => r.status === 'pending').length,
    approved: requests.filter((r) => r.status === 'approved').length,
    rejected: requests.filter((r) => r.status === 'rejected').length,
  };

  function openApprove(r: PaymentRequestWithSalon) {
    setApproveTarget(r);
    setApprovePlan(r.plan);
    setApproveDays(String(r.duration_days || 30));
    setApproveNotes('');
  }

  function openReject(r: PaymentRequestWithSalon) {
    setRejectTarget(r);
    setRejectReason('');
  }

  async function confirmApprove() {
    if (!approveTarget) return;
    setApproving(true);
    try {
      const { error } = await approvePaymentRequest(approveTarget.id, {
        plan: approvePlan,
        durationDays: Number(approveDays) || 30,
        notes: approveNotes || undefined,
      });
      if (error) { toast.error(error); return; }
      toast.success(`${approveTarget.salon?.name || 'Salon'} activated on ${approvePlan}`);
      setApproveTarget(null);
      fetchRequests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setApproving(false);
    }
  }

  async function confirmReject() {
    if (!rejectTarget) return;
    setRejecting(true);
    try {
      const { error } = await rejectPaymentRequest(rejectTarget.id, {
        reason: rejectReason || undefined,
      });
      if (error) { toast.error(error); return; }
      toast.success('Request rejected');
      setRejectTarget(null);
      fetchRequests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject');
    } finally {
      setRejecting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Payment Requests</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Salon owners submit a request when they pay via bank or JazzCash. Approve to
          activate the plan and start the 30-day clock.
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 items-center">
        {([
          ['pending', `Pending (${counts.pending})`],
          ['approved', `Approved (${counts.approved})`],
          ['rejected', `Rejected (${counts.rejected})`],
          ['all', 'All'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-all duration-150 ${
              filter === value
                ? 'bg-foreground text-white'
                : 'text-muted-foreground hover:text-foreground border border-border'
            }`}
          >
            {label}
          </button>
        ))}
        <div className="ml-auto relative w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search salon, phone, reference"
            className="pl-8 h-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-border">
          <CardContent className="p-12 text-center">
            <Clock className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {filter === 'pending'
                ? 'No pending payment requests.'
                : `No ${filter} requests.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <Card key={r.id} className="border-border">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  {/* Salon info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={r.salon ? `/admin/salons/${r.salon.id}` : '#'}
                        className="font-semibold hover:text-gold transition-colors"
                      >
                        {r.salon?.name || 'Unknown salon'}
                      </Link>
                      <Badge
                        variant="outline"
                        className={`text-[10px] uppercase ${STATUS_STYLES[r.status]}`}
                      >
                        {r.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatRelative(r.created_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      {r.salon?.city && (
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3 h-3" /> {r.salon.city}
                        </span>
                      )}
                      {r.salon?.phone && (
                        <a
                          href={`tel:${r.salon.phone}`}
                          className="flex items-center gap-1 hover:text-foreground"
                        >
                          <Phone className="w-3 h-3" /> {r.salon.phone}
                        </a>
                      )}
                      {r.salon?.subscription_status && (
                        <span>
                          Current:{' '}
                          <span className="font-medium capitalize">
                            {r.salon.subscription_plan || 'none'} ({r.salon.subscription_status})
                          </span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-3 text-sm flex-wrap">
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Plan</p>
                        <p className="font-medium capitalize">{r.plan}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Amount</p>
                        <p className="font-bold text-gold">{formatPKR(r.amount)}</p>
                      </div>
                      {r.method && (
                        <div>
                          <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Method</p>
                          <p className="font-medium capitalize">{r.method}</p>
                        </div>
                      )}
                      {r.reference && (
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Reference</p>
                          <p className="font-mono text-xs truncate" title={r.reference}>{r.reference}</p>
                        </div>
                      )}
                    </div>
                    {r.reviewer_notes && (
                      <div className="mt-3 p-2 bg-secondary/50 border border-border rounded text-xs">
                        <span className="font-semibold">Note:</span> {r.reviewer_notes}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  {r.status === 'pending' && (
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => openApprove(r)}
                        className="bg-green-600 hover:bg-green-700 text-white gap-1"
                      >
                        <Check className="w-4 h-4" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openReject(r)}
                        className="border-red-500/30 text-red-600 hover:bg-red-500/10 gap-1"
                      >
                        <X className="w-4 h-4" /> Reject
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Approve dialog */}
      <Dialog open={!!approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Approve Payment</DialogTitle>
          </DialogHeader>
          {approveTarget && (
            <div className="space-y-4">
              <div className="bg-secondary/50 border border-border rounded p-3 text-sm">
                <p className="font-semibold">{approveTarget.salon?.name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Submitted {formatRelative(approveTarget.created_at)} for{' '}
                  <span className="font-medium capitalize">{approveTarget.plan}</span> ({formatPKR(approveTarget.amount)})
                </p>
                {approveTarget.reference && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Ref: <span className="font-mono">{approveTarget.reference}</span>
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs">Plan to activate</Label>
                <Select value={approvePlan} onValueChange={(v) => setApprovePlan(v as 'basic' | 'growth' | 'pro')}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basic">Basic</SelectItem>
                    <SelectItem value="growth">Growth</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Duration (days)</Label>
                <Input
                  type="number"
                  value={approveDays}
                  onChange={(e) => setApproveDays(e.target.value)}
                  inputMode="numeric"
                  className="mt-1"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Adds to existing expiry if salon is already active.
                </p>
              </div>
              <div>
                <Label className="text-xs">Notes (optional)</Label>
                <Textarea
                  value={approveNotes}
                  onChange={(e) => setApproveNotes(e.target.value)}
                  rows={2}
                  className="mt-1"
                  placeholder="e.g. JazzCash TID 12345 verified"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setApproveTarget(null)} className="flex-1">
                  Cancel
                </Button>
                <Button
                  onClick={confirmApprove}
                  disabled={approving}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                >
                  {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Approve & Activate'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500" /> Reject Payment
            </DialogTitle>
          </DialogHeader>
          {rejectTarget && (
            <div className="space-y-4">
              <p className="text-sm">
                Reject payment request from <span className="font-semibold">{rejectTarget.salon?.name}</span>?
              </p>
              <div>
                <Label className="text-xs">Reason (visible to admin only)</Label>
                <Textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  className="mt-1"
                  placeholder="e.g. Could not verify transaction, no screenshot received"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setRejectTarget(null)} className="flex-1">
                  Cancel
                </Button>
                <Button
                  onClick={confirmReject}
                  disabled={rejecting}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                >
                  {rejecting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reject'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
