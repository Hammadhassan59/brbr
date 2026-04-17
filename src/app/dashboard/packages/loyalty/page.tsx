'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Award, Users, TrendingDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import { usePermission } from '@/lib/permissions';
import { formatPKR } from '@/lib/utils/currency';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import toast from 'react-hot-toast';
import { showActionError, handleSubscriptionError } from '@/components/paywall-dialog';
import { saveLoyaltyRules } from '@/app/actions/packages';
import type { LoyaltyRules, Client } from '@/types/database';

export default function LoyaltyPage() {
  const router = useRouter();
  const { salon, currentBranch } = useAppStore();
  const canManagePackages = usePermission('manage_packages');
  const [rules, setRules] = useState<LoyaltyRules | null>(null);

  useEffect(() => {
    if (!canManagePackages) {
      toast.error('You do not have permission to manage loyalty settings');
      router.replace('/dashboard');
    }
  }, [canManagePackages, router]);
  const [topClients, setTopClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [pointsPer100, setPointsPer100] = useState('10');
  const [pkrPerPoint, setPkrPerPoint] = useState('0.5');
  const [bdayMultiplier, setBdayMultiplier] = useState('2');

  const fetch = useCallback(async () => {
    if (!salon || !currentBranch) return;
    setLoading(true);
    // Migration 037 scopes loyalty_rules per-branch: (salon_id, branch_id)
    // is the new unique. Use maybeSingle() so a branch without rules yet
    // (common right after 037 ran) doesn't 404 the whole page.
    const [rulesRes, clientsRes] = await Promise.all([
      supabase.from('loyalty_rules').select('*').eq('salon_id', salon.id).eq('branch_id', currentBranch.id).maybeSingle(),
      supabase.from('clients').select('*').eq('salon_id', salon.id).eq('branch_id', currentBranch.id).gt('loyalty_points', 0).order('loyalty_points', { ascending: false }).limit(10),
    ]);
    if (rulesRes.data) {
      const r = rulesRes.data as LoyaltyRules;
      setRules(r);
      setPointsPer100(String(r.points_per_100_pkr));
      setPkrPerPoint(String(r.pkr_per_point_redemption));
      setBdayMultiplier(String(r.birthday_bonus_multiplier));
    } else {
      setRules(null);
    }
    if (clientsRes.data) setTopClients(clientsRes.data as Client[]);
    setLoading(false);
  }, [salon, currentBranch]);

  useEffect(() => { fetch(); }, [fetch]);

  async function saveRules() {
    if (!salon || !currentBranch) return;
    setSaving(true);
    try {
      const data = {
        pointsPer100Pkr: Number(pointsPer100) || 10,
        pkrPerPointRedemption: Number(pkrPerPoint) || 0.5,
        birthdayBonusMultiplier: Number(bdayMultiplier) || 2,
      };
      const { error } = await saveLoyaltyRules(rules?.id ?? null, currentBranch.id, data);
      if (showActionError(error)) return;
      toast.success('Loyalty settings saved');
      fetch();
    } catch (err: unknown) {
      if (handleSubscriptionError(err)) return;
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
    finally { setSaving(false); }
  }

  const totalOutstanding = topClients.reduce((s, c) => s + c.loyalty_points, 0);
  const totalLiability = totalOutstanding * (Number(pkrPerPoint) || 0.5);

  // Loyalty config is per-branch post-037 — without a branch selection we
  // have nothing to read or save. The rest of the dashboard enforces this
  // too; short-circuit here so the client calls don't fire unscoped.
  if (!currentBranch) return null;

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-xl font-bold">Loyalty Program</h2>

      {/* Overview stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-4 text-center">
          <Award className="w-6 h-6 text-gold mx-auto mb-1" />
          <p className="text-2xl font-bold">{totalOutstanding.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Total Points Outstanding</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <TrendingDown className="w-6 h-6 text-orange-500 mx-auto mb-1" />
          <p className="text-2xl font-bold">{formatPKR(totalLiability)}</p>
          <p className="text-xs text-muted-foreground">Points Liability (Rs)</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <Users className="w-6 h-6 text-blue-500 mx-auto mb-1" />
          <p className="text-2xl font-bold">{topClients.length}</p>
          <p className="text-xs text-muted-foreground">Clients with Points</p>
        </CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Configuration */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Configuration</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {loading ? <div className="h-32 bg-muted rounded-lg animate-pulse" /> : (
              <>
                <div>
                  <Label className="text-xs">Points earned per Rs 100 spent</Label>
                  <Input type="number" value={pointsPer100} onChange={(e) => setPointsPer100(e.target.value)} className="mt-1 w-32" inputMode="numeric" />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Client spends Rs 1,000 → earns {Number(pointsPer100) * 10} points</p>
                </div>
                <div>
                  <Label className="text-xs">Rs value per point (redemption)</Label>
                  <Input type="number" value={pkrPerPoint} onChange={(e) => setPkrPerPoint(e.target.value)} className="mt-1 w-32" step="0.1" />
                  <p className="text-[10px] text-muted-foreground mt-0.5">100 points = {formatPKR(100 * (Number(pkrPerPoint) || 0.5))} discount</p>
                </div>
                <div>
                  <Label className="text-xs">Birthday bonus multiplier</Label>
                  <Input type="number" value={bdayMultiplier} onChange={(e) => setBdayMultiplier(e.target.value)} className="mt-1 w-32" inputMode="numeric" />
                  <p className="text-[10px] text-muted-foreground mt-0.5">{bdayMultiplier}× points in birthday month</p>
                </div>
                <Button onClick={saveRules} disabled={saving} className="bg-gold text-black border border-gold" size="sm">
                  {saving ? 'Saving...' : 'Save Settings'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Leaderboard */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Top 10 Clients by Points</CardTitle></CardHeader>
          <CardContent className="px-0">
            {topClients.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-6">No loyalty data yet</p>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="pl-4">#</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                  <TableHead className="text-right pr-4">Value</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {topClients.map((c, i) => (
                    <TableRow key={c.id}>
                      <TableCell className="pl-4 text-sm">{i + 1}</TableCell>
                      <TableCell className="text-sm font-medium">{c.name}</TableCell>
                      <TableCell className="text-right text-sm">{c.loyalty_points.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-sm pr-4">{formatPKR(c.loyalty_points * (Number(pkrPerPoint) || 0.5))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
