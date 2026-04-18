'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Ban, MessageSquareWarning, Star, Store, Undo2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  blockSalonMarketplace,
  unblockSalonMarketplace,
  listFlaggedSalons,
  listBlockedSalons,
  getRecentReviewsForSalon,
  type FlaggedSalonRow,
  type RecentReview,
} from '@/app/actions/admin-flagged';

interface Props {
  initialFlagged: FlaggedSalonRow[];
  initialBlocked: FlaggedSalonRow[];
}

function formatStars(avg: number | null) {
  if (avg === null) return '—';
  return `${avg.toFixed(1)}★`;
}

export function SalonsTab({ initialFlagged, initialBlocked }: Props) {
  const [flagged, setFlagged] = useState<FlaggedSalonRow[]>(initialFlagged);
  const [blocked, setBlocked] = useState<FlaggedSalonRow[]>(initialBlocked);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [a, b] = await Promise.all([listFlaggedSalons(), listBlockedSalons()]);
    if (a.error) toast.error(a.error);
    else setFlagged(a.data);
    if (b.error) toast.error(b.error);
    else setBlocked(b.data);
  }, []);

  async function onBlock(row: FlaggedSalonRow) {
    const reason = window.prompt(
      `Block "${row.salon_name}" from the marketplace?\n\n` +
        `This will silently remove it from consumer directory pages — NO notification is sent to the salon.\n\n` +
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
      `Confirm block of "${row.salon_name}"? This will immediately hide it from the consumer marketplace.`,
    );
    if (!ok) return;

    setBusy(row.salon_id);
    try {
      const res = await blockSalonMarketplace({ salonId: row.salon_id, reason: trimmed });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Blocked "${row.salon_name}"`);
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function onUnblock(row: FlaggedSalonRow) {
    const ok = window.confirm(
      `Unblock "${row.salon_name}"? It will reappear on the consumer marketplace if its branches are still listed.`,
    );
    if (!ok) return;
    setBusy(row.salon_id);
    try {
      const res = await unblockSalonMarketplace({ salonId: row.salon_id });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Unblocked "${row.salon_name}"`);
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
          Flagged salons ({flagged.length})
        </h3>
        {flagged.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No salons below the threshold right now. A salon appears here when
              any branch has an average rating under 2★ with 5+ reviews.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {flagged.map((row) => (
              <SalonCard
                key={row.salon_id}
                row={row}
                busy={busy === row.salon_id}
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
              No admin-blocked salons.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {blocked.map((row) => (
              <SalonCard
                key={row.salon_id}
                row={row}
                busy={busy === row.salon_id}
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

function SalonCard({
  row,
  busy,
  onBlock,
  onUnblock,
}: {
  row: FlaggedSalonRow;
  busy: boolean;
  onBlock: (() => void) | null;
  onUnblock: (() => void) | null;
}) {
  const [reviews, setReviews] = useState<RecentReview[] | null>(null);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const loadReviews = useCallback(async () => {
    setLoadingReviews(true);
    try {
      const res = await getRecentReviewsForSalon(row.salon_id, 5);
      if (res.error) {
        toast.error(res.error);
        setReviews([]);
        return;
      }
      setReviews(res.data);
    } finally {
      setLoadingReviews(false);
    }
  }, [row.salon_id]);

   
  useEffect(() => {
    if (expanded && reviews === null && !loadingReviews) {
      loadReviews();
    }
  }, [expanded, reviews, loadingReviews, loadReviews]);

  return (
    <Card className={row.marketplace_admin_blocked_at ? 'border-red-500/30' : 'border-amber-500/30'}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-start gap-2">
          <Store className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="font-semibold">{row.salon_name}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {formatStars(row.worst_rating_avg)} · {row.total_review_count} reviews
            </span>
            {row.marketplace_admin_blocked_at && (
              <span className="ml-2 text-[11px] bg-red-500/15 text-red-700 border border-red-500/30 px-1.5 py-0.5 rounded">
                BLOCKED {new Date(row.marketplace_admin_blocked_at).toLocaleDateString('en-PK')}
              </span>
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {/* Branch list */}
        <div className="text-xs text-muted-foreground space-y-1">
          {row.branches.map((b) => (
            <div key={b.id} className="flex items-center gap-2">
              <span className="inline-block w-1 h-1 rounded-full bg-muted-foreground/50" />
              <span className="flex-1 min-w-0 truncate">{b.name}</span>
              <span className="shrink-0 flex items-center gap-1">
                <Star className="w-3 h-3" />
                {formatStars(b.rating_avg)} · {b.rating_count}
              </span>
              {b.listed_on_marketplace && (
                <span className="shrink-0 text-[10px] bg-muted/40 px-1 py-0.5 rounded">listed</span>
              )}
            </div>
          ))}
        </div>

        {/* Review snippets (lazy-loaded) */}
        <div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <MessageSquareWarning className="w-3 h-3" />
            {expanded ? 'Hide recent reviews' : 'Show recent reviews'}
          </button>
          {expanded && (
            <div className="mt-2 space-y-2 border-l-2 border-muted pl-3">
              {loadingReviews && <div className="text-xs text-muted-foreground">Loading…</div>}
              {reviews !== null && reviews.length === 0 && (
                <div className="text-xs text-muted-foreground">No reviews to show.</div>
              )}
              {reviews?.map((r) => (
                <div key={r.id} className="text-xs">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span>{r.rating}★</span>
                    <span>·</span>
                    <span>{r.branch_name || '—'}</span>
                    <span>·</span>
                    <span>{new Date(r.created_at).toLocaleDateString('en-PK')}</span>
                  </div>
                  {r.comment && <div className="mt-0.5 text-foreground/90">“{r.comment}”</div>}
                </div>
              ))}
            </div>
          )}
        </div>

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
