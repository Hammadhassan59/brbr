'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ArrowLeft, Plus, Trophy, Trash2, Loader2 } from 'lucide-react';
import {
  listAgencyBonusTiers,
  createAgencyBonusTier,
  updateAgencyBonusTier,
  deleteAgencyBonusTier,
  evaluateAgencyBonusThresholds,
  type AgencyBonusTier,
} from '@/app/actions/agency-bonus-tiers';
import { listAgencies } from '@/app/actions/agencies';
import type { BonusMetric, BonusPeriod, Agency } from '@/types/sales';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { formatPKR } from '@/lib/utils/currency';

const METRIC_LABEL: Record<BonusMetric, string> = {
  onboarded_count: 'Onboarded count',
  revenue_generated: 'Revenue generated',
};
const PERIOD_LABEL: Record<BonusPeriod, string> = { monthly: 'Monthly', lifetime: 'Lifetime' };

export default function AgencyBonusTiersPage() {
  const [tiers, setTiers] = useState<AgencyBonusTier[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [evaluating, setEvaluating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: t }, { data: a }] = await Promise.all([listAgencyBonusTiers(), listAgencies()]);
    setTiers(t);
    setAgencies(a);
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  async function runEvaluator() {
    setEvaluating(true);
    const { data, error } = await evaluateAgencyBonusThresholds();
    setEvaluating(false);
    if (error) { toast.error(error); return; }
    toast.success(`Evaluated ${data.evaluated_agencies} agencies — ${data.accrued} bonuses accrued (${data.skipped_existing} already accrued)`);
    load();
  }

  const agencyName = (id: string | null) =>
    id === null ? 'Global default' : (agencies.find((a) => a.id === id)?.name ?? 'Unknown');

  const globalTiers = tiers.filter((t) => t.agency_id === null);
  const perAgencyTiers = tiers.filter((t) => t.agency_id !== null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link href="/admin/agencies" className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Back to agencies
          </Link>
          <h2 className="font-heading text-2xl font-semibold mt-1 flex items-center gap-2">
            <Trophy className="w-6 h-6 text-gold" /> Agency bonus tiers
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Reward agencies that outperform. Per-agency tiers override globals on the same metric + period.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={runEvaluator} disabled={evaluating}>
            {evaluating && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            {evaluating ? 'Evaluating…' : 'Evaluate now'}
          </Button>
          <Button onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4 mr-1" /> New tier</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <TierSection title="Global default tiers" description="Apply to every active agency unless overridden." tiers={globalTiers} agencyName={agencyName} onChanged={load} />
          <TierSection title="Per-agency overrides" description="Replace globals for the specified agency on the same metric + period." tiers={perAgencyTiers} agencyName={agencyName} onChanged={load} />
        </>
      )}

      <NewTierDialog open={dialogOpen} agencies={agencies} onClose={() => setDialogOpen(false)} onCreated={load} />
    </div>
  );
}

function TierSection({ title, description, tiers, agencyName, onChanged }: {
  title: string;
  description: string;
  tiers: AgencyBonusTier[];
  agencyName: (id: string | null) => string;
  onChanged: () => void;
}) {
  async function toggle(id: string, active: boolean) {
    const { error } = await updateAgencyBonusTier(id, { active });
    if (error) toast.error(error); else { toast.success(active ? 'Activated' : 'Deactivated'); onChanged(); }
  }
  async function remove(id: string, label: string) {
    if (!confirm(`Delete tier "${label}"? Existing accruals are kept.`)) return;
    const { error } = await deleteAgencyBonusTier(id);
    if (error) toast.error(error); else { toast.success('Deleted'); onChanged(); }
  }
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground mb-3">{description}</p>
        {tiers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No tiers yet.</p>
        ) : (
          <div className="space-y-2">
            {tiers.map((t) => (
              <div key={t.id} className={`border rounded-lg p-3 flex items-center justify-between gap-3 ${t.active ? 'bg-white' : 'bg-muted/30 opacity-60'}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{t.label ?? '—'}</span>
                    <span className="text-muted-foreground">·</span>
                    <span>{METRIC_LABEL[t.metric]} ({PERIOD_LABEL[t.period]})</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Threshold <span className="font-mono">{t.metric === 'revenue_generated' ? formatPKR(Number(t.threshold)) : t.threshold}</span>
                    {' → '}
                    Bonus <span className="font-mono">{formatPKR(Number(t.bonus_amount))}</span>
                    {t.agency_id !== null && (
                      <> · Agency: <span className="font-medium">{agencyName(t.agency_id)}</span></>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={t.active} onCheckedChange={(v) => toggle(t.id, v)} />
                  <Button size="icon" variant="ghost" onClick={() => remove(t.id, t.label ?? 'tier')}>
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NewTierDialog({ open, agencies, onClose, onCreated }: {
  open: boolean;
  agencies: Agency[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    agencyId: '',
    metric: 'onboarded_count' as BonusMetric,
    period: 'monthly' as BonusPeriod,
    threshold: '',
    bonusAmount: '',
    label: '',
  });
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const thr = Number(form.threshold);
    const amt = Number(form.bonusAmount);
    if (!Number.isFinite(thr) || thr <= 0) { toast.error('Threshold must be > 0'); return; }
    if (!Number.isFinite(amt) || amt < 0) { toast.error('Bonus amount must be >= 0'); return; }
    setSubmitting(true);
    const { error } = await createAgencyBonusTier({
      agencyId: form.agencyId || null,
      metric: form.metric,
      period: form.period,
      threshold: thr,
      bonusAmount: amt,
      label: form.label.trim() || null,
    });
    setSubmitting(false);
    if (error) { toast.error(error); return; }
    setForm({ agencyId: '', metric: 'onboarded_count', period: 'monthly', threshold: '', bonusAmount: '', label: '' });
    toast.success('Tier created');
    onCreated();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>New agency bonus tier</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Scope</Label>
            <select className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              value={form.agencyId} onChange={(e) => setForm({ ...form, agencyId: e.target.value })}>
              <option value="">Global (applies to every active agency)</option>
              {agencies.filter((a) => a.status === 'active').map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.code})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Metric</Label>
              <select className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value as BonusMetric })}>
                <option value="onboarded_count">Onboarded count</option>
                <option value="revenue_generated">Revenue generated (PKR)</option>
              </select>
            </div>
            <div>
              <Label>Period</Label>
              <select className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value as BonusPeriod })}>
                <option value="monthly">Monthly</option>
                <option value="lifetime">Lifetime</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Threshold</Label>
              <Input type="number" min="0" step="0.01" required value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} />
            </div>
            <div>
              <Label>Bonus amount (PKR)</Label>
              <Input type="number" min="0" step="0.01" required value={form.bonusAmount} onChange={(e) => setForm({ ...form, bonusAmount: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Label</Label>
            <Input placeholder="e.g. Gold tier" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Creating…' : 'Create tier'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
