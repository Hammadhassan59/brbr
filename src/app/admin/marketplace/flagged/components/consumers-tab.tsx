'use client';

import { useCallback, useState } from 'react';
import { AlertTriangle, Ban, Phone, Undo2, User } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  blockConsumer,
  unblockConsumer,
  listFlaggedConsumers,
  listBlockedConsumers,
  type FlaggedConsumerRow,
} from '@/app/actions/admin-flagged';

interface Props {
  initialFlagged: FlaggedConsumerRow[];
  initialBlocked: FlaggedConsumerRow[];
}

function formatStars(avg: number | null, count: number) {
  if (avg === null || count === 0) return 'No ratings';
  return `${avg.toFixed(1)}★ (${count})`;
}

export function ConsumersTab({ initialFlagged, initialBlocked }: Props) {
  const [flagged, setFlagged] = useState<FlaggedConsumerRow[]>(initialFlagged);
  const [blocked, setBlocked] = useState<FlaggedConsumerRow[]>(initialBlocked);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [a, b] = await Promise.all([listFlaggedConsumers(), listBlockedConsumers()]);
    if (a.error) toast.error(a.error);
    else setFlagged(a.data);
    if (b.error) toast.error(b.error);
    else setBlocked(b.data);
  }, []);

  async function onBlock(row: FlaggedConsumerRow) {
    const reason = window.prompt(
      `Block "${row.name}" from booking?\n\n` +
        `They keep account access but the booking endpoint will silently refuse new requests. NO notification is sent.\n\n` +
        `Reason (required, stored in the audit log):`,
      '',
    );
    if (reason === null) return;
    const trimmed = reason.trim();
    if (trimmed.length === 0) {
      toast.error('A reason is required.');
      return;
    }
    const ok = window.confirm(
      `Confirm block of "${row.name}"? They will be unable to place new bookings.`,
    );
    if (!ok) return;

    setBusy(row.id);
    try {
      const res = await blockConsumer({ consumerId: row.id, reason: trimmed });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Blocked "${row.name}"`);
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function onUnblock(row: FlaggedConsumerRow) {
    const ok = window.confirm(
      `Unblock "${row.name}"? They will be able to place bookings again.`,
    );
    if (!ok) return;
    setBusy(row.id);
    try {
      const res = await unblockConsumer({ consumerId: row.id });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Unblocked "${row.name}"`);
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          Flagged consumers ({flagged.length})
        </h3>
        {flagged.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No consumers below threshold right now. A consumer is flagged when
              their rating is under 2★ with 3+ reviews, OR no-shows ≥ 3, OR
              post-confirmation cancels ≥ 5.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {flagged.map((row) => (
              <ConsumerCard
                key={row.id}
                row={row}
                busy={busy === row.id}
                onBlock={() => onBlock(row)}
                onUnblock={null}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Ban className="w-4 h-4 text-red-600" />
          Already blocked ({blocked.length})
        </h3>
        {blocked.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No admin-blocked consumers.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {blocked.map((row) => (
              <ConsumerCard
                key={row.id}
                row={row}
                busy={busy === row.id}
                onBlock={null}
                onUnblock={() => onUnblock(row)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ConsumerCard({
  row,
  busy,
  onBlock,
  onUnblock,
}: {
  row: FlaggedConsumerRow;
  busy: boolean;
  onBlock: (() => void) | null;
  onUnblock: (() => void) | null;
}) {
  return (
    <Card className={row.blocked_by_admin ? 'border-red-500/30' : 'border-amber-500/30'}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-start gap-2">
          <User className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="font-semibold">{row.name}</span>
            <span className="ml-2 text-xs text-muted-foreground inline-flex items-center gap-1">
              <Phone className="w-3 h-3" />
              {row.phone}
            </span>
            {row.blocked_by_admin && row.blocked_at && (
              <span className="ml-2 text-[11px] bg-red-500/15 text-red-700 border border-red-500/30 px-1.5 py-0.5 rounded">
                BLOCKED {new Date(row.blocked_at).toLocaleDateString('en-PK')}
              </span>
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <StatTile label="Rating" value={formatStars(row.rating_avg, row.rating_count)} />
          <StatTile label="No-shows" value={String(row.no_show_count)} />
          <StatTile
            label="Post-confirm cancels"
            value={String(row.post_confirm_cancel_count)}
          />
        </div>

        {/* Flag reasons */}
        {row.flag_reasons.length > 0 && (
          <div className="text-xs text-muted-foreground">
            <div className="font-medium text-amber-700 mb-0.5">Flagged because:</div>
            <ul className="list-disc ml-4 space-y-0.5">
              {row.flag_reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          {onBlock && (
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={onBlock}
            >
              <Ban className="w-3.5 h-3.5" />
              Block
            </Button>
          )}
          {onUnblock && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={onUnblock}
            >
              <Undo2 className="w-3.5 h-3.5" />
              Unblock
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
