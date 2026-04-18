'use client';

import { useState } from 'react';
import { Store, User } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SalonsTab } from './salons-tab';
import { ConsumersTab } from './consumers-tab';
import type {
  FlaggedSalonRow,
  FlaggedConsumerRow,
} from '@/app/actions/admin-flagged';

interface Props {
  initialFlaggedSalons: FlaggedSalonRow[];
  initialBlockedSalons: FlaggedSalonRow[];
  initialFlaggedConsumers: FlaggedConsumerRow[];
  initialBlockedConsumers: FlaggedConsumerRow[];
  initialError: string | null;
}

/**
 * Client-side tab container. Owns no data logic of its own — just holds the
 * two tab state and passes the server-fetched initial payloads down.
 */
export function FlaggedTabs({
  initialFlaggedSalons,
  initialBlockedSalons,
  initialFlaggedConsumers,
  initialBlockedConsumers,
  initialError,
}: Props) {
  const [tab, setTab] = useState<'salons' | 'consumers'>('salons');

  return (
    <>
      {initialError && (
        <div className="border border-red-500/40 bg-red-500/5 rounded-lg p-3 text-sm text-red-600">
          {initialError}
        </div>
      )}
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'salons' | 'consumers')}>
        <TabsList>
          <TabsTrigger value="salons" className="gap-2">
            <Store className="w-4 h-4" />
            Flagged salons ({initialFlaggedSalons.length})
          </TabsTrigger>
          <TabsTrigger value="consumers" className="gap-2">
            <User className="w-4 h-4" />
            Flagged consumers ({initialFlaggedConsumers.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="salons" className="mt-4">
          <SalonsTab
            initialFlagged={initialFlaggedSalons}
            initialBlocked={initialBlockedSalons}
          />
        </TabsContent>
        <TabsContent value="consumers" className="mt-4">
          <ConsumersTab
            initialFlagged={initialFlaggedConsumers}
            initialBlocked={initialBlockedConsumers}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
