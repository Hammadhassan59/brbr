'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Phone,
  Receipt,
  ShieldAlert,
  Wallet,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  getSalonSettlementDetail,
  recordSettlementPayment,
  type SalonSettlementDetail,
} from '@/app/actions/admin-settlements';

function formatPKR(n: number) {
  return `Rs ${Math.round(n).toLocaleString('en-PK')}`;
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const STATUS_BADGE = {
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
} as const;

export default function AdminSalonSettlementDetailPage({
  params,
}: {
  params: Promise<{ salonId: string }>;
}) {
  const { salonId } = use(params);
  const [detail, setDetail] = useState<SalonSettlementDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Record payment modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await getSalonSettlementDetail(salonId);
      if (error) {
        toast.error(error);
        setDetail(null);
        return;
      }
      setDetail(data);
    } finally {
      setLoading(false);
    }
  }, [salonId]);

   
  useEffect(() => {
    load();
  }, [load]);

  function openModal() {
    // Pre-fill with current unsettled so the default action is "settle the
    // full balance". Admin can overwrite for partial payments.
    setAmount(
      detail?.salon.unsettled ? String(Math.round(detail.salon.unsettled)) : '',
    );
    setNote('');
    setModalOpen(true);
  }

  async function submitPayment() {
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) {
      toast.error('Enter a valid amount greater than 0');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await recordSettlementPayment({
        salonId,
        amount: num,
        note: note.trim() || undefined,
      });
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(`Recorded ${formatPKR(num)} payment`);
      setModalOpen(false);
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="space-y-4">
        <Link
          href="/admin/marketplace/settlements"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Back to settlements
        </Link>
        <Card>
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            Salon not found.
          </CardContent>
        </Card>
      </div>
    );
  }

  const s = STATUS_BADGE[detail.salon.status];
  const StatusIcon = s.icon;

  // If the sum of contributing bookings doesn't match current_unsettled, the
  // balance was over-paid at some point (GREATEST(0, …) in the trigger
  // zeroes the balance without wiping booking history). Show a small
  // explanatory hint in the detail card so the operator doesn't chase a
  // "why don't the numbers match" ghost.
  const delta = detail.contributing_total - detail.salon.unsettled;
  const showDeltaHint = Math.abs(delta) > 0.01;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/marketplace/settlements"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Back to settlements
        </Link>
      </div>

      {/* Salon header */}
      <div className="flex items-start gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="font-heading text-2xl font-bold flex items-center gap-2 flex-wrap">
            <Wallet className="w-5 h-5" />
            {detail.salon.name}
            <Badge
              variant="outline"
              className={`text-[10px] uppercase gap-1 ${s.cls}`}
            >
              <StatusIcon className="w-3 h-3" />
              {s.label}
            </Badge>
          </h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
            {detail.salon.owner_name && <span>Owner: {detail.salon.owner_name}</span>}
            {detail.salon.owner_phone && (
              <a
                href={`tel:${detail.salon.owner_phone}`}
                className="flex items-center gap-1 hover:text-foreground"
              >
                <Phone className="w-3 h-3" />
                {detail.salon.owner_phone}
              </a>
            )}
          </div>
        </div>
        <Button
          onClick={openModal}
          className="gap-2 bg-gold text-white hover:bg-gold/90"
        >
          <Receipt className="w-4 h-4" /> Record Payment
        </Button>
      </div>

      {/* Balance cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className={detail.salon.status === 'BLOCKED' ? 'border-red-500/40' : undefined}>
          <CardContent className="p-4">
            <p className="text-[11px] uppercase text-muted-foreground tracking-wider">
              Current unsettled
            </p>
            <p className="text-2xl font-bold mt-1 text-gold">
              {formatPKR(detail.salon.unsettled)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              threshold {formatPKR(detail.salon.block_threshold)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] uppercase text-muted-foreground tracking-wider">
              Block status
            </p>
            <p className="text-lg font-semibold mt-1">
              {detail.salon.blocked_at ? 'Blocked' : 'Not blocked'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {detail.salon.blocked_at
                ? `since ${formatDateTime(detail.salon.blocked_at)}`
                : 'new home bookings accepted'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] uppercase text-muted-foreground tracking-wider">
              Bookings since last payment
            </p>
            <p className="text-2xl font-bold mt-1">
              {detail.contributing_bookings.length}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              summing to {formatPKR(detail.contributing_total)}
            </p>
          </CardContent>
        </Card>
      </div>

      {showDeltaHint && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-3 flex gap-3 text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Balance differs from contributing total</p>
              <p className="text-muted-foreground mt-1 text-xs">
                The unsettled balance is {formatPKR(detail.salon.unsettled)}, but
                home bookings since the last payment sum to{' '}
                {formatPKR(detail.contributing_total)}. The delta of{' '}
                {formatPKR(Math.abs(delta))} is expected when an earlier
                over-payment zeroed the balance (the trigger clamps at 0 without
                wiping booking history).
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contributing bookings */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            Contributing home bookings (since last payment)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {detail.contributing_bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No home bookings completed since the last settlement.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Completed</TableHead>
                    <TableHead>Consumer</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead className="text-right">Markup</TableHead>
                    <TableHead className="text-right">Service charge</TableHead>
                    <TableHead className="text-right">Owed to platform</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.contributing_bookings.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="text-xs">
                        {formatDateTime(b.completed_at)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {b.consumer_name ?? '—'}
                      </TableCell>
                      <TableCell
                        className="text-xs max-w-[240px] truncate"
                        title={b.address_street ?? ''}
                      >
                        {b.address_street ?? '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatPKR(b.platform_markup)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatPKR(b.service_charge)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold">
                        {formatPKR(b.platform_markup + b.service_charge)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Settlement history */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Settlement history</CardTitle>
        </CardHeader>
        <CardContent>
          {detail.history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No payments recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paid at</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>Recorded by</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="text-xs">
                        {formatDateTime(h.paid_at)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold">
                        {formatPKR(h.amount)}
                      </TableCell>
                      <TableCell className="text-xs">{h.note ?? '—'}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {h.recorded_by.slice(0, 8)}…
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Record payment modal */}
      <Dialog open={modalOpen} onOpenChange={(o) => !submitting && setModalOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Settlement Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-secondary/50 border border-border rounded p-3 text-sm">
              <p className="font-semibold">{detail.salon.name}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Currently owes{' '}
                <span className="font-bold text-gold">
                  {formatPKR(detail.salon.unsettled)}
                </span>
                {detail.salon.status === 'BLOCKED' && (
                  <>
                    {' '}
                    — recording a payment that drops the balance below{' '}
                    {formatPKR(detail.salon.block_threshold)} will auto-clear
                    the block.
                  </>
                )}
              </p>
            </div>

            <div>
              <Label className="text-xs">Amount (Rs)</Label>
              <Input
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1"
                placeholder="e.g. 5000"
                autoFocus
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Payment is out-of-band (bank / JazzCash / EasyPaisa). Enter the
                amount actually received.
              </p>
            </div>

            <div>
              <Label className="text-xs">Note (optional)</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="mt-1"
                placeholder="e.g. Bank transfer ref TXN-84291"
                maxLength={1000}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setModalOpen(false)}
                disabled={submitting}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={submitPayment}
                disabled={submitting}
                className="flex-1 bg-gold text-white hover:bg-gold/90"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Record payment'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
