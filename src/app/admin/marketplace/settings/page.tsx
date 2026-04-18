'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, ShieldAlert, Store } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  getPlatformSettings,
  updatePlatformSetting,
  type PlatformSettingRow,
} from '@/app/actions/platform-settings';

// Flags whose boolean value controls a sensitive launch gate. We surface an
// explicit confirm + big warning banner before flipping ON. Add future
// high-stakes keys here.
const DANGEROUS_ON_ENABLE: Record<string, { title: string; body: string }> = {
  marketplace_women_enabled: {
    title: 'Expose women & mixed-gender salons to the marketplace?',
    body:
      'Flipping this ON will immediately expose women’s and mixed-gender salons to the consumer marketplace directory. This is a public, SEO-indexed surface. Proceed only if the platform is ready for a non-men-only launch.',
  },
};

// The seed row in migration 041. Having it in a constant lets the UI show a
// helpful empty state if the DB has been wiped / migration not run yet.
const SEED_KEYS = ['marketplace_women_enabled'] as const;

function isBool(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

export default function MarketplacePlatformSettingsPage() {
  const [rows, setRows] = useState<PlatformSettingRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Per-key saving state so two keys can flip independently without
  // disabling unrelated switches while the first write is in-flight.
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await getPlatformSettings();
    if (error) {
      toast.error(error);
    }
    setRows(data);
    setLoading(false);
  }, []);

   
  useEffect(() => {
    load();
  }, [load]);

  async function toggleBool(key: string, currentValue: boolean) {
    const next = !currentValue;

    // Confirm before flipping a flagged "dangerous-on" key ON. Flipping OFF
    // is always allowed without prompt — pulling a feature back is safe.
    if (next && DANGEROUS_ON_ENABLE[key]) {
      const warn = DANGEROUS_ON_ENABLE[key];
      const ok = window.confirm(`${warn.title}\n\n${warn.body}\n\nProceed?`);
      if (!ok) return;
    }

    setSavingKey(key);
    try {
      const { error } = await updatePlatformSetting(key, next);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(`${key} → ${next ? 'ON' : 'OFF'}`);
      // Re-fetch so updated_at / updated_by reflect the live server state.
      await load();
    } finally {
      setSavingKey(null);
    }
  }

  // Surface the women-enabled flag at the top (only one today, but this is
  // how we'll keep future high-risk flags visually grouped + warned).
  const womenRow = rows.find((r) => r.key === 'marketplace_women_enabled');
  const womenOn = isBool(womenRow?.value) ? (womenRow!.value as boolean) : false;
  const otherRows = rows.filter((r) => r.key !== 'marketplace_women_enabled');

  // If migration 041 hasn't run yet the seed row is missing. Help the
  // operator out rather than rendering a silently empty page.
  const missingSeed = !loading && !womenRow && SEED_KEYS.includes('marketplace_women_enabled');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-2xl font-semibold flex items-center gap-2">
          <Store className="w-5 h-5" /> Marketplace Platform Settings
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Super-admin-only launch gates for the consumer marketplace. Each change is
          recorded to the admin audit log.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {missingSeed && (
            <Card className="border-amber-500/40 bg-amber-500/5">
              <CardContent className="py-4 flex gap-3 text-sm">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Seed row missing</p>
                  <p className="text-muted-foreground mt-1">
                    The <code>marketplace_women_enabled</code> row is not in{' '}
                    <code>platform_settings</code>. Migration 041 may not have run on
                    this database. Run it before using this page.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {womenRow && (
            <Card className="border-red-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-600" />
                  Women &amp; Mixed-Gender Marketplace Gate
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start justify-between gap-4 p-4 border border-red-500/25 bg-red-500/5 rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium text-sm">
                      Flipping this ON will immediately expose women&apos;s and
                      mixed-gender salons to the consumer marketplace directory.
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      The men-only launch gate. While this is OFF, any branch with{' '}
                      <code>gender_type IN (&apos;women&apos;, &apos;mixed&apos;)</code>{' '}
                      is hidden from the public directory + programmatic SEO pages.
                      Flip to ON only when the platform is ready for a non-men-only
                      launch.
                    </p>
                  </div>
                  <Switch
                    checked={womenOn}
                    disabled={savingKey === womenRow.key}
                    onCheckedChange={() => toggleBool(womenRow.key, womenOn)}
                  />
                </div>

                <SettingMeta row={womenRow} />
              </CardContent>
            </Card>
          )}

          {otherRows.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Other Platform Flags</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {otherRows.map((row) => {
                  const val = row.value;
                  const asBool = isBool(val) ? val : null;
                  return (
                    <div
                      key={row.key}
                      className="flex items-start justify-between gap-4 p-3 border rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{row.key}</p>
                        {row.description && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {row.description}
                          </p>
                        )}
                        {asBool === null && (
                          <p className="text-xs text-amber-600 mt-1">
                            Non-boolean value — edit via migration for now.
                          </p>
                        )}
                        <SettingMeta row={row} />
                      </div>
                      {asBool !== null && (
                        <Switch
                          checked={asBool}
                          disabled={savingKey === row.key}
                          onCheckedChange={() => toggleBool(row.key, asBool)}
                        />
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function SettingMeta({ row }: { row: PlatformSettingRow }) {
  return (
    <div className="text-[11px] text-muted-foreground space-y-0.5">
      {row.description && !row.key.startsWith('marketplace_women') && (
        <p>{row.description}</p>
      )}
      <p>
        Last updated:{' '}
        {new Date(row.updated_at).toLocaleString('en-PK', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })}
        {row.updated_by ? ` · by ${row.updated_by.slice(0, 8)}…` : ''}
      </p>
    </div>
  );
}
