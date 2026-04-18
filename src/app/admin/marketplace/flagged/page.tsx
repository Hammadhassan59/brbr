import { AlertTriangle } from 'lucide-react';
import { requireAdminRole } from '@/app/actions/auth';
import {
  listFlaggedSalons,
  listBlockedSalons,
  listFlaggedConsumers,
  listBlockedConsumers,
} from '@/app/actions/admin-flagged';
import { FlaggedTabs } from './components/flagged-tabs';

// ─────────────────────────────────────────────────────────────────────────
// Super-admin "Flagged" dashboard.
//
// Server component. Guards with requireAdminRole(['super_admin']) so the
// role check runs BEFORE any data fetch (belt-and-braces against the layout
// guard). Initial data fetched server-side; tab switching + block/unblock
// run entirely client-side via the FlaggedTabs component.
//
// Pattern mirrors src/app/admin/marketplace/settings/page.tsx — same
// heading typography, same muted-foreground subhead, same space-y-6 shell.
// ─────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';

export default async function FlaggedPage() {
  // Belt: the admin layout already verifies the JWT and filters nav, but a
  // direct hit should still fail-closed if we somehow miss the guard.
  await requireAdminRole(['super_admin']);

  const [
    flaggedSalons,
    blockedSalons,
    flaggedConsumers,
    blockedConsumers,
  ] = await Promise.all([
    listFlaggedSalons(),
    listBlockedSalons(),
    listFlaggedConsumers(),
    listBlockedConsumers(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-2xl font-semibold flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-600" /> Flagged
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Auto-flagged salons and consumers. Blocking is silent — no notification
          is sent to the blocked party (decision 29). Each block/unblock is
          recorded to the admin audit log.
        </p>
      </div>

      <FlaggedTabs
        initialFlaggedSalons={flaggedSalons.data}
        initialBlockedSalons={blockedSalons.data}
        initialFlaggedConsumers={flaggedConsumers.data}
        initialBlockedConsumers={blockedConsumers.data}
        initialError={
          flaggedSalons.error ||
          blockedSalons.error ||
          flaggedConsumers.error ||
          blockedConsumers.error ||
          null
        }
      />
    </div>
  );
}
