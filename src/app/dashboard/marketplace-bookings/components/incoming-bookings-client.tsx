'use client';

/**
 * IncomingBookingsClient — salon-side realtime panel for iCut marketplace
 * booking requests.
 *
 * ─── Supabase session scoping caveat ───────────────────────────────────────
 *
 * Known pre-existing bug (documented in CLAUDE.md, 2026-04-16 security pass
 * and 2026-04-16 evening investigation log):
 *
 *   "Impersonation Supabase session redemption. `enterDashboard` in
 *    `/admin/salons/[id]` and `exitImpersonation` callers never redeem the
 *    `supabaseAuth.tokenHash` returned by the server action, so the browser's
 *    Supabase session stays as the super-admin while the iCut JWT flips.
 *    Client-side `.from('appointments').select()` etc. hit RLS with the wrong
 *    auth-uid and return zero rows."
 *
 * Impact here: when this dashboard is reached through an impersonation
 * handoff the browser's Supabase session may not match the salon JWT. The
 * Realtime subscription will connect as whatever identity the Supabase
 * session holds, which can drop postgres_changes events under RLS.
 *
 * Mitigation strategy in this panel:
 *   1. Initial snapshot comes from `listPendingBookingsForSalon()` — a server
 *      action that runs under the salon JWT (not Supabase auth), so it always
 *      has the right tenant context regardless of the browser Supabase state.
 *   2. A 30s polling fallback re-runs that server action periodically so the
 *      panel self-heals if Realtime drops an event.
 *   3. Realtime is best-effort — when it works it's instant; when it doesn't
 *      the polling keeps the panel within 30s of freshness.
 *
 * TODO(iCut/impersonation): fix the root cause by redeeming `tokenHash` via
 *   `supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })` in both
 *   `enterDashboard` and the demo-agent exit flow. Once that lands, the
 *   Realtime channel should get a stable authenticated scope and the 30s
 *   polling fallback can be relaxed to 2–5 min.
 *
 * ─── Privacy note ──────────────────────────────────────────────────────────
 *
 * Consumer rating is salon-private (marketplace plan, decision 26). We render
 * it here but MUST NOT log it, forward it to analytics, or surface it outside
 * this panel. That privacy invariant is also enforced server-side by
 * `getConsumerByIdForSalon()`.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  CheckCircle2,
  XCircle,
  Phone,
  MessageCircle,
  MapPin,
  Loader2,
  Clock,
  Star,
  PlayCircle,
  FlagOff,
  Home,
  Store,
  UserX,
  CheckCheck,
  ThumbsUp,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  listPendingBookingsForSalon,
  confirmBooking,
  declineBooking,
  markBookingInProgress,
  markBookingComplete,
  markBookingNoShow,
  cancelBookingBySalon,
  type PendingBookingForSalon,
  type BookingStatus,
  type BookingMode,
} from '@/app/actions/bookings';
import {
  getConsumerByIdForSalon,
  type ConsumerForSalonView,
} from '@/lib/marketplace/consumer-for-salon';
import {
  submitSalonReview,
  getReviewStatusForBooking,
} from '@/app/actions/marketplace-reviews';

// ─── Types ───────────────────────────────────────────────────────────────

/**
 * Panel row = pending booking + optional enriched consumer. We also
 * optionally carry `address_lat/address_lng` for the "Open in Maps" link —
 * `listPendingBookingsForSalon` doesn't return these today, but a realtime
 * INSERT payload does, and we're defensive about either source.
 */
export interface PanelBooking extends PendingBookingForSalon {
  address_lat?: number | null;
  address_lng?: number | null;
}

type ActionKey =
  | 'confirm'
  | 'decline'
  | 'in_progress'
  | 'complete'
  | 'no_show'
  | 'cancel'
  | 'review';

/**
 * Per-row review state lazily populated when a row hits COMPLETED + home.
 * `undefined` = not fetched yet; `null` = fetch failed; otherwise the flags.
 */
interface ReviewRowState {
  salonHasReviewed: boolean;
  windowOpen: boolean;
  closesAt: string | null;
}

// ─── Status badge styling ────────────────────────────────────────────────

export const STATUS_BADGE: Record<
  BookingStatus,
  { label: string; cls: string }
> = {
  PENDING: {
    label: 'Pending',
    cls: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  },
  CONFIRMED: {
    label: 'Confirmed',
    cls: 'bg-green-500/15 text-green-700 border-green-500/30',
  },
  IN_PROGRESS: {
    label: 'In progress',
    cls: 'bg-blue-500/15 text-blue-700 border-blue-500/30',
  },
  COMPLETED: {
    label: 'Completed',
    cls: 'bg-slate-500/15 text-slate-700 border-slate-500/30',
  },
  DECLINED: {
    label: 'Declined',
    cls: 'bg-red-500/15 text-red-700 border-red-500/30',
  },
  CANCELLED_BY_CONSUMER: {
    label: 'Cancelled (consumer)',
    cls: 'bg-slate-500/15 text-slate-700 border-slate-500/30',
  },
  CANCELLED_BY_SALON: {
    label: 'Cancelled (you)',
    cls: 'bg-slate-500/15 text-slate-700 border-slate-500/30',
  },
  NO_SHOW: {
    label: 'No-show',
    cls: 'bg-rose-500/15 text-rose-700 border-rose-500/30',
  },
};

/**
 * Terminal statuses get no action buttons — rendered greyed out.
 */
export const TERMINAL_STATUSES: ReadonlySet<BookingStatus> = new Set([
  'DECLINED',
  'CANCELLED_BY_CONSUMER',
  'CANCELLED_BY_SALON',
  'NO_SHOW',
  'COMPLETED',
]);

// ─── Humanize slot — "Today 3:00pm" / "Tomorrow 10:00am" / "Fri 4:00pm" ──

export function humanizeSlot(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  const time = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).toLowerCase().replace(' ', '');

  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const diffDays = Math.round(
    (startOfDay(d).getTime() - startOfDay(now).getTime()) / (24 * 60 * 60 * 1000),
  );
  if (diffDays === 0) return `Today ${time}`;
  if (diffDays === 1) return `Tomorrow ${time}`;
  if (diffDays === -1) return `Yesterday ${time}`;
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
  return `${weekday} ${time}`;
}

// ─── Bell sound ───────────────────────────────────────────────────────────
// A tiny base64 WAV. ~1KB. A short sine-wave "ding". Kept inline (not a
// separate /public/sounds/bell.mp3 file) so this file is self-contained and
// so the panel has something to play even in offline PWA contexts. The data
// URL is short enough to live in-source without bloating the client bundle.
const BELL_DATA_URL =
  'data:audio/wav;base64,UklGRlQDAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YTADAAAAAJMmEEzZbrJ/TXIiUCYZTd7JpYB+wJF6RVQ1KsT1Cc4nsiCnV68jyI7oOByhUNHJQwBp23e0d6WOrn3G4v7aN65noH/2d1FVdijQ8wG81Pet5aNbsmzMgwiwQrJu8H8Mcy9OBRUT2YuhQoItxJp3dlQyJ8LxaMzmsFWoqbIkJZPzXR2woUjHgjtCoxnKHgJy3Re2w6T+rbvKaA7yS3JqBoCaczJM5RDb1KWeqYMrybqPH0tkMnLtSswCsIenp7bfKFP3nyHAqCvO4DTcqJ3LgwN03oayxKPSrafPIhTwVCVs4n9Xc2lL/wySzE2Y54XQz/iU4VWEMZ3kmckZsF2o27h6LEH7Eyd7stDT8zaho6Bh3h0jPPyw/fD7pG5dV9HnO/MTyC+s9LoYMNNtC04K7Mxlo5OIg9ZwmuJczVExacSSa7j+qqDdtWu+8jJe/2isfdTVH7DprQLfWFSrzA1p5v16ny1Y5ZLvh0M1qmWXB5nDnC2kKLQMPSFbRe71T1ngswIVmLGnstOZW5J7mlPo18nSAF93T6Sq0ov4GN6CtnAEf69dV7xyAQta6Psgjif8mJVaW6p/CKhBzA17rqwvpvSbP8P6a8EyB7NKWTrivLCn5q7mbUnbudBWr9+y5B/J36kD6Vdb3QCY4mC97gD6+RLfz6NlPsaslrpgEcSjgWu5f/ZwKk+pLhQk2MKkBJdQujZG/MjiyQ3KqCt30vCxP6yDqGC8EPnzSTVmw/5mcElCZOrLkbiHhiaIqnF0GdNQSckz/tN2EbV8pRCz98Z6//Y3g2eVf3J3Nk9GxOGA/BvB0ZWyVKIrstRXCIVDsryC7LL0/a7ypC+zwO/vsjNUnl6B6HfKT+5OohYZ8tbfD1VyyoARcu3n9TkZ/nNJUnOpK8yOA';

function playBell(): void {
  try {
    const audio = new Audio(BELL_DATA_URL);
    audio.volume = 0.4;
    void audio.play();
  } catch {
    // Autoplay may be blocked before first user interaction — swallow silently.
  }
}

// ─── Main component ─────────────────────────────────────────────────────

interface Props {
  initial: PendingBookingForSalon[];
  salonId: string;
}

export function IncomingBookingsClient({ initial, salonId }: Props) {
  const [rows, setRows] = useState<PanelBooking[]>(() => [...initial]);
  const [consumers, setConsumers] = useState<Record<string, ConsumerForSalonView>>({});
  const [busy, setBusy] = useState<Record<string, ActionKey | null>>({});
  const [declineOpen, setDeclineOpen] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [cancelOpen, setCancelOpen] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [reviewOpen, setReviewOpen] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewStatusById, setReviewStatusById] = useState<
    Record<string, ReviewRowState | null>
  >({});

  // Block double-playing the bell for the same insert when both the pre-load
  // snapshot and the realtime INSERT race. Tracks seen ids as "initial
  // hydrated" so we only ring on truly new requests.
  const seenIdsRef = useRef<Set<string>>(new Set(initial.map((b) => b.id)));

  // ─── Enrich consumer for a set of ids ────────────────────────────────
  const fetchConsumers = useCallback(
    async (ids: string[]) => {
      const missing = ids.filter((id) => id && !consumers[id]);
      if (missing.length === 0) return;
      const results = await Promise.all(
        missing.map((id) => getConsumerByIdForSalon(id)),
      );
      const patch: Record<string, ConsumerForSalonView> = {};
      results.forEach((res, i) => {
        if (res.ok) patch[missing[i]] = res.data;
      });
      if (Object.keys(patch).length > 0) {
        setConsumers((prev) => ({ ...prev, ...patch }));
      }
    },
    [consumers],
  );

  // On mount + whenever rows change, fetch any missing consumer enrichments.
  useEffect(() => {
    const ids = Array.from(new Set(rows.map((r) => r.consumer_id))).filter(Boolean);
    if (ids.length > 0) void fetchConsumers(ids);
  }, [rows, fetchConsumers]);

  // Lazily load review status for COMPLETED home bookings so we know whether
  // to show the "Rate customer" button. One request per row, and only once —
  // we cache the result until the panel unmounts. Failed fetches are stored
  // as `null` so we don't retry.
  useEffect(() => {
    const pending = rows.filter(
      (r) =>
        r.status === 'COMPLETED' &&
        r.location_type === 'home' &&
        !(r.id in reviewStatusById),
    );
    if (pending.length === 0) return;
    let alive = true;
    void (async () => {
      for (const row of pending) {
        const res = await getReviewStatusForBooking(row.id);
        if (!alive) return;
        setReviewStatusById((prev) => ({
          ...prev,
          [row.id]: res.ok
            ? {
                salonHasReviewed: res.data.salonHasReviewed,
                windowOpen: res.data.windowOpen,
                closesAt: res.data.closesAt,
              }
            : null,
        }));
      }
    })();
    return () => {
      alive = false;
    };
  }, [rows, reviewStatusById]);

  // ─── Realtime subscription ──────────────────────────────────────────
  useEffect(() => {
    if (!salonId) return;
    const channel = supabase
      .channel(`incoming-bookings:${salonId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `salon_id=eq.${salonId}`,
        },
        (payload: {
          eventType: 'INSERT' | 'UPDATE' | 'DELETE';
          new: Record<string, unknown> | null;
          old: Record<string, unknown> | null;
        }) => {
          if (payload.eventType === 'INSERT' && payload.new) {
            const row = payload.new as unknown as PanelBooking;
            setRows((prev) => {
              if (prev.some((r) => r.id === row.id)) return prev;
              return [row, ...prev];
            });
            if (!seenIdsRef.current.has(row.id)) {
              seenIdsRef.current.add(row.id);
              toast.success('New booking request');
              playBell();
            }
            return;
          }
          if (payload.eventType === 'UPDATE' && payload.new) {
            const row = payload.new as unknown as PanelBooking;
            setRows((prev) => replaceRow(prev, row));
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [salonId]);

  // ─── 30s polling fallback (see header comment — impersonation caveat) ─
  useEffect(() => {
    if (!salonId) return;
    const interval = setInterval(async () => {
      const res = await listPendingBookingsForSalon();
      if (res.ok) {
        setRows((prev) => mergePolledRows(prev, res.data));
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [salonId]);

  // ─── Mutation runners ───────────────────────────────────────────────

  const runAction = useCallback(
    async (
      id: string,
      key: ActionKey,
      fn: () => Promise<{ ok: boolean; error?: string } | { ok: true; data: unknown }>,
    ) => {
      setBusy((b) => ({ ...b, [id]: key }));
      try {
        const res = (await fn()) as { ok: boolean; error?: string };
        if (!res.ok) {
          toast.error(res.error ?? 'Action failed');
          return;
        }
        toast.success(actionSuccessLabel(key));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Action failed');
      } finally {
        setBusy((b) => ({ ...b, [id]: null }));
      }
    },
    [],
  );

  // ─── Sort: PENDING first, then by slot ascending ────────────────────
  const sorted = useMemo(() => sortRows(rows), [rows]);

  if (sorted.length === 0) {
    return (
      <Card className="border-border">
        <CardContent className="p-10 text-center space-y-3">
          <Clock className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-sm font-medium">No incoming bookings yet</p>
          <p className="text-xs text-muted-foreground">
            When a consumer submits a request on icut.pk, it will land here in real time.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {sorted.map((row) => {
        const consumer = consumers[row.consumer_id] ?? null;
        const isTerminal = TERMINAL_STATUSES.has(row.status);
        const isBusy = busy[row.id];
        const badge = STATUS_BADGE[row.status];
        const canStart = row.status === 'CONFIRMED';
        const canComplete = row.status === 'CONFIRMED' || row.status === 'IN_PROGRESS';
        const canNoShow =
          row.status === 'CONFIRMED' &&
          new Date(row.requested_slot_start).getTime() < Date.now();
        const canCancel = row.status === 'CONFIRMED';
        const canConfirmDecline = row.status === 'PENDING';
        const isHome = row.location_type === 'home';
        // "Rate customer" — only on COMPLETED home bookings with the window
        // still open and no prior review. Status is fetched lazily after the
        // row enters this state (see the reviewStatusById effect).
        const reviewState = reviewStatusById[row.id];
        const canRateConsumer =
          row.status === 'COMPLETED' &&
          isHome &&
          !!reviewState &&
          reviewState.windowOpen &&
          !reviewState.salonHasReviewed;

        return (
          <Card
            key={row.id}
            className={`border-border ${isTerminal ? 'opacity-60' : ''}`}
          >
            <CardContent className="p-4 sm:p-5 space-y-3">
              {/* Header row: name + rating + status */}
              <div className="flex items-start gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm sm:text-base font-semibold truncate">
                      {consumer?.name || 'Customer'}
                    </p>
                    <ConsumerRatingBadge consumer={consumer} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                    {isHome ? (
                      <>
                        <Home className="w-3.5 h-3.5" />
                        <span>Home service</span>
                      </>
                    ) : (
                      <>
                        <Store className="w-3.5 h-3.5" />
                        <span>At salon</span>
                      </>
                    )}
                    <span className="opacity-50">·</span>
                    <Clock className="w-3.5 h-3.5" />
                    <span>{humanizeSlot(row.requested_slot_start)}</span>
                  </p>
                </div>
                <Badge className={badge.cls}>{badge.label}</Badge>
              </div>

              {/* Total price */}
              <p className="text-sm">
                <span className="text-muted-foreground">Total:</span>{' '}
                <span className="font-semibold">
                  Rs {Number(row.consumer_total ?? 0).toLocaleString('en-PK')}
                </span>
              </p>

              {/* Home address + Maps link */}
              {isHome && row.address_street && (
                <div className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p>{row.address_street}</p>
                    {row.address_lat != null && row.address_lng != null && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${row.address_lat},${row.address_lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-gold hover:underline mt-0.5"
                      >
                        Open in Maps
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Notes */}
              {row.consumer_notes && (
                <div className="text-xs bg-secondary/40 border border-border rounded-md p-2">
                  <span className="text-muted-foreground font-medium">Note: </span>
                  {row.consumer_notes}
                </div>
              )}

              {/* Contact — Phone + WhatsApp */}
              {consumer?.phone && (
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`tel:${consumer.phone}`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium bg-muted hover:bg-muted/70 text-foreground rounded-md h-9 px-3 transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    Call
                  </a>
                  <a
                    href={`https://wa.me/${normalizePhoneForWa(consumer.phone)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium bg-green-500/10 hover:bg-green-500/20 text-green-700 rounded-md h-9 px-3 transition-colors"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    WhatsApp
                  </a>
                </div>
              )}

              {/* Actions */}
              {!isTerminal && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {canConfirmDecline && (
                    <>
                      <Button
                        size="sm"
                        className="bg-gold hover:bg-gold/90 text-black font-semibold"
                        disabled={!!isBusy}
                        onClick={() =>
                          runAction(row.id, 'confirm', () => confirmBooking(row.id))
                        }
                      >
                        {isBusy === 'confirm' ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                        )}
                        Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!isBusy}
                        onClick={() => {
                          setDeclineReason('');
                          setDeclineOpen(row.id);
                        }}
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        Decline
                      </Button>
                    </>
                  )}
                  {canStart && (
                    <Button
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      disabled={!!isBusy}
                      onClick={() =>
                        runAction(row.id, 'in_progress', () =>
                          markBookingInProgress(row.id),
                        )
                      }
                    >
                      {isBusy === 'in_progress' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <PlayCircle className="w-4 h-4 mr-1" />
                      )}
                      Start
                    </Button>
                  )}
                  {canComplete && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!!isBusy}
                      onClick={() =>
                        runAction(row.id, 'complete', () => markBookingComplete(row.id))
                      }
                    >
                      {isBusy === 'complete' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCheck className="w-4 h-4 mr-1" />
                      )}
                      Complete
                    </Button>
                  )}
                  {canCancel && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!!isBusy}
                      onClick={() => {
                        setCancelReason('');
                        setCancelOpen(row.id);
                      }}
                    >
                      <FlagOff className="w-4 h-4 mr-1" />
                      Cancel
                    </Button>
                  )}
                  {canNoShow && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!!isBusy}
                      onClick={() =>
                        runAction(row.id, 'no_show', () => markBookingNoShow(row.id))
                      }
                    >
                      <UserX className="w-4 h-4 mr-1" />
                      Mark no-show
                    </Button>
                  )}
                </div>
              )}

              {/* Post-completion: "Rate customer" button for home bookings
                  within the 7-day window. Rendered outside the !isTerminal
                  guard because COMPLETED is a terminal state but still lets
                  the salon leave a review. */}
              {canRateConsumer && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    size="sm"
                    className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                    disabled={!!isBusy}
                    onClick={() => {
                      setReviewRating(5);
                      setReviewComment('');
                      setReviewOpen(row.id);
                    }}
                  >
                    <ThumbsUp className="w-4 h-4 mr-1" />
                    Rate customer
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Decline reason modal */}
      <Dialog open={!!declineOpen} onOpenChange={(v) => !v && setDeclineOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline booking</DialogTitle>
            <DialogDescription>
              Optional — share a reason. The consumer sees it in their email.
            </DialogDescription>
          </DialogHeader>
          <textarea
            className="w-full min-h-24 rounded-md border border-border bg-background p-2 text-sm"
            placeholder="E.g. fully booked at that time"
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            maxLength={500}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeclineOpen(null)}
            >
              Cancel
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={async () => {
                const id = declineOpen;
                if (!id) return;
                setDeclineOpen(null);
                await runAction(id, 'decline', () =>
                  declineBooking(id, declineReason.trim() || undefined),
                );
              }}
            >
              Decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel reason modal */}
      <Dialog open={!!cancelOpen} onOpenChange={(v) => !v && setCancelOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel confirmed booking</DialogTitle>
            <DialogDescription>
              Optional — share a reason. The consumer sees it in their email.
            </DialogDescription>
          </DialogHeader>
          <textarea
            className="w-full min-h-24 rounded-md border border-border bg-background p-2 text-sm"
            placeholder="E.g. stylist unavailable"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            maxLength={500}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(null)}>
              Keep booking
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={async () => {
                const id = cancelOpen;
                if (!id) return;
                setCancelOpen(null);
                await runAction(id, 'cancel', () =>
                  cancelBookingBySalon(id, cancelReason.trim() || undefined),
                );
              }}
            >
              Cancel booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rate-customer modal (salon_of_consumer review; home bookings only) */}
      <Dialog open={!!reviewOpen} onOpenChange={(v) => !v && setReviewOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rate customer</DialogTitle>
            <DialogDescription>
              Your rating is private to your salon — the customer does not see it.
              This helps other salons decide whether to accept repeat home bookings.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div
              role="radiogroup"
              aria-label="Rating (1 to 5 stars)"
              className="flex items-center gap-1"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="cursor-pointer p-1" aria-label={`${n} stars`}>
                  <input
                    type="radio"
                    name="salon-review-rating"
                    value={n}
                    checked={reviewRating === n}
                    onChange={() => setReviewRating(n)}
                    className="sr-only"
                  />
                  <Star
                    className={`w-7 h-7 ${
                      n <= reviewRating
                        ? 'fill-amber-500 stroke-amber-500'
                        : 'fill-none stroke-[#D4D4D4]'
                    }`}
                    aria-hidden
                  />
                </label>
              ))}
              <span className="ml-2 text-sm font-semibold">{reviewRating} / 5</span>
            </div>
            <textarea
              className="w-full min-h-24 rounded-md border border-border bg-background p-2 text-sm"
              placeholder="Optional — note anything salons should know (private)"
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value.slice(0, 2000))}
              maxLength={2000}
            />
            <p className="text-right text-[11px] text-muted-foreground">
              {reviewComment.length} / 2000
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewOpen(null)}>
              Cancel
            </Button>
            <Button
              className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
              onClick={async () => {
                const id = reviewOpen;
                if (!id) return;
                setReviewOpen(null);
                await runAction(id, 'review', async () => {
                  const res = await submitSalonReview({
                    bookingId: id,
                    rating: reviewRating,
                    comment: reviewComment.trim() || undefined,
                  });
                  if (res.ok) {
                    // Refresh row review status so the button disappears.
                    setReviewStatusById((prev) => ({
                      ...prev,
                      [id]: {
                        salonHasReviewed: true,
                        windowOpen: prev[id]?.windowOpen ?? true,
                        closesAt: prev[id]?.closesAt ?? null,
                      },
                    }));
                  }
                  return res;
                });
              }}
            >
              Submit rating
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────

function ConsumerRatingBadge({
  consumer,
}: {
  consumer: ConsumerForSalonView | null;
}) {
  if (!consumer) return null;
  if (consumer.rating_count === 0 || consumer.rating_avg == null) {
    return (
      <Badge variant="outline" className="text-[10px]">
        New
      </Badge>
    );
  }
  const avg = Number(consumer.rating_avg);
  return (
    <Badge
      variant="outline"
      className="text-[10px] inline-flex items-center gap-0.5"
    >
      <Star className="w-3 h-3 fill-current" />
      {avg.toFixed(1)} ({consumer.rating_count})
    </Badge>
  );
}

// ─── Helpers (exported for tests) ────────────────────────────────────────

/**
 * Replace a row in the list by id — or prepend if it wasn't there yet.
 * The realtime UPDATE handler uses this: it's not safe to assume we had the
 * row in our snapshot (e.g. a booking minted before the page mounted and
 * then updated could arrive as our first event for that id).
 */
export function replaceRow(rows: PanelBooking[], next: PanelBooking): PanelBooking[] {
  const idx = rows.findIndex((r) => r.id === next.id);
  if (idx === -1) return [next, ...rows];
  const copy = rows.slice();
  copy[idx] = { ...copy[idx], ...next };
  return copy;
}

/**
 * Merge the polled PENDING list with the existing rows. Rows that are still
 * PENDING in the poll stay as-is; rows not in the poll are retained (they
 * may have moved to CONFIRMED/COMPLETED via a realtime UPDATE we already
 * saw). New PENDING rows get prepended.
 */
export function mergePolledRows(
  prev: PanelBooking[],
  polled: PendingBookingForSalon[],
): PanelBooking[] {
  const polledMap = new Map(polled.map((r) => [r.id, r]));
  const existingIds = new Set(prev.map((r) => r.id));
  const merged: PanelBooking[] = prev.map((r) => {
    const latest = polledMap.get(r.id);
    if (latest && r.status === 'PENDING') {
      return { ...r, ...latest };
    }
    return r;
  });
  for (const row of polled) {
    if (!existingIds.has(row.id)) merged.unshift(row);
  }
  return merged;
}

/** Sort: PENDING first, then everything else, then by slot ascending within each group. */
export function sortRows<T extends { status: BookingStatus; requested_slot_start: string }>(
  rows: T[],
): T[] {
  return rows.slice().sort((a, b) => {
    const ap = a.status === 'PENDING' ? 0 : 1;
    const bp = b.status === 'PENDING' ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return (
      new Date(a.requested_slot_start).getTime() -
      new Date(b.requested_slot_start).getTime()
    );
  });
}

function actionSuccessLabel(key: ActionKey): string {
  switch (key) {
    case 'confirm':
      return 'Booking confirmed';
    case 'decline':
      return 'Booking declined';
    case 'in_progress':
      return 'Service started';
    case 'complete':
      return 'Booking completed';
    case 'no_show':
      return 'Marked as no-show';
    case 'cancel':
      return 'Booking cancelled';
    case 'review':
      return 'Rating submitted';
  }
}

/**
 * Strip everything that isn't a digit, then drop a leading 0 so PK numbers
 * passed as `03001234567` render as `923001234567` — the format `wa.me`
 * expects (country code + subscriber, no plus, no leading zero).
 */
export function normalizePhoneForWa(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) return `92${digits.slice(1)}`;
  if (digits.startsWith('92')) return digits;
  return digits;
}

export type { BookingStatus, BookingMode };
