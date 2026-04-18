'use client';

/**
 * Dashboard → Marketplace → Incoming Bookings
 *
 * Salon-side realtime panel (Week 3 Wave 2 deliverable from the marketplace
 * Phase 0+1 plan). Landing target: salons get a realtime notification when a
 * consumer submits a booking through icut.pk, then confirm, decline, start,
 * complete, or mark no-show.
 *
 * ## Why this is a client component (not a true server component)
 *
 * The spec called for a server component that `requireSession()`s and hands
 * the first snapshot down as a prop. In this codebase every other page under
 * `/dashboard` is a `'use client'` component — the session is materialized
 * client-side by the shared `DashboardLayout` via `getDashboardBootstrap()`,
 * and pages lift `salonId` off `useAppStore()`. Forcing a server component
 * here would fork the pattern for no behavior change, so we keep the client
 * shape and call `listPendingBookingsForSalon()` from the panel itself on
 * mount. The permission gate is enforced a second time server-side by the
 * action helper, so the server-component flow's isolation is preserved.
 *
 * ## Permission gate
 *
 * `manage_salon` — same permission that lets the user tap Confirm/Decline
 * (enforced server-side in `src/app/actions/bookings.ts`).
 *
 * ## Realtime Supabase subscription
 *
 * Mirrored from the calendar page's pattern — see
 * `src/app/dashboard/appointments/page.tsx:183-207`. Key difference: the
 * marketplace channel filters on `salon_id` (not branch_id) because an
 * incoming booking's target branch is the one the consumer picked, and the
 * salon may operate multiple branches but has ONE incoming queue.
 */

import { useEffect, useState } from 'react';
import { ShieldAlert, Inbox } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { usePermission } from '@/lib/permissions';
import { Card, CardContent } from '@/components/ui/card';
import { listPendingBookingsForSalon, type PendingBookingForSalon } from '@/app/actions/bookings';
import { IncomingBookingsClient } from './components/incoming-bookings-client';

export default function MarketplaceBookingsPage() {
  const canManage = usePermission('manage_salon');
  const salon = useAppStore((s) => s.salon);
  const salonId = salon?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [initial, setInitial] = useState<PendingBookingForSalon[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!salonId || !canManage) {
      queueMicrotask(() => setLoading(false));
      return;
    }
    let alive = true;
    (async () => {
      setLoading(true);
      const res = await listPendingBookingsForSalon();
      if (!alive) return;
      if (res.ok) {
        setInitial(res.data);
        setLoadError(null);
      } else {
        setLoadError(res.error);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [salonId, canManage]);

  if (!canManage) {
    return (
      <div className="space-y-6">
        <Card className="border-border">
          <CardContent className="p-6 sm:p-10 text-center space-y-4">
            <ShieldAlert className="w-10 h-10 text-muted-foreground mx-auto" />
            <p className="text-sm font-medium">You don&rsquo;t have access to this page</p>
            <p className="text-xs text-muted-foreground">
              Ask your salon owner to grant you the &ldquo;Manage salon&rdquo; permission.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!salonId || loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 bg-muted rounded-lg animate-pulse" />
        <div className="h-48 bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <Inbox className="w-5 h-5 text-gold" />
          Incoming Bookings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          New booking requests from iCut consumers. Confirm, decline, or call
          the consumer to verify before confirming.
        </p>
      </div>

      {loadError && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-4 text-sm text-red-800 dark:text-red-200">
            Could not load incoming bookings: {loadError}
          </CardContent>
        </Card>
      )}

      <IncomingBookingsClient initial={initial} salonId={salonId} />
    </div>
  );
}
