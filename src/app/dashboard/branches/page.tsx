'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, X, MapPin, Pencil, Trash2, Users, CalendarDays, DollarSign } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { createBranch, updateBranch, deleteBranch, getBranchUsage } from '@/app/actions/settings';
import { useAppStore } from '@/store/app-store';
import { formatPKR } from '@/lib/utils/currency';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import toast from 'react-hot-toast';
import { showActionError, handleSubscriptionError } from '@/components/paywall-dialog';
import type { Branch } from '@/types/database';

export default function BranchesPage() {
  const { salon, branches, currentBranch, setBranches, setCurrentBranch } = useAppStore();
  const [branchStats, setBranchStats] = useState<Record<string, { staffCount: number; todayRevenue: number; todayAppointments: number }>>({});
  const [loading, setLoading] = useState(true);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete-branch modal state
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null);
  const [usage, setUsage] = useState<Awaited<ReturnType<typeof getBranchUsage>>['data']>(null);
  const [reassignTo, setReassignTo] = useState<string>('');
  const [deleting, setDeleting] = useState(false);

  const fetchStats = useCallback(async () => {
    if (!salon) return;
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const branchIds = branches.map((b) => b.id);
      const [staffRes, billsRes, aptsRes] = await Promise.all([
        supabase.from('staff').select('branch_id').eq('salon_id', salon.id).eq('is_active', true),
        supabase.from('bills').select('branch_id, total_amount').eq('salon_id', salon.id).gte('created_at', today + 'T00:00:00').lt('created_at', today + 'T23:59:59'),
        supabase.from('appointments').select('branch_id').eq('salon_id', salon.id).eq('appointment_date', today),
      ]);
      const stats: Record<string, { staffCount: number; todayRevenue: number; todayAppointments: number }> = {};
      branchIds.forEach((id) => { stats[id] = { staffCount: 0, todayRevenue: 0, todayAppointments: 0 }; });
      staffRes.data?.forEach((s: { branch_id: string | null }) => { if (s.branch_id && stats[s.branch_id]) stats[s.branch_id].staffCount++; });
      billsRes.data?.forEach((b: { branch_id: string | null; total_amount: number }) => { if (b.branch_id && stats[b.branch_id]) stats[b.branch_id].todayRevenue += b.total_amount; });
      aptsRes.data?.forEach((a: { branch_id: string | null }) => { if (a.branch_id && stats[a.branch_id]) stats[a.branch_id].todayAppointments++; });
      setBranchStats(stats);
    } finally {
      setLoading(false);
    }
  }, [salon, branches]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  function resetForm() {
    setName(''); setAddress(''); setPhone('');
    setEditingId(null); setShowForm(false);
  }

  function startEdit(branch: Branch) {
    setEditingId(branch.id);
    setName(branch.name);
    setAddress(branch.address || '');
    setPhone(branch.phone || '');
    setShowForm(true);
  }

  async function saveBranch() {
    if (!name.trim()) { toast.error('Branch name is required'); return; }
    setSaving(true);
    try {
      if (editingId) {
        const { data, error } = await updateBranch(editingId, { name: name.trim(), address, phone });
        if (showActionError(error)) return;
        const updated = branches.map((b) => b.id === editingId ? data as Branch : b);
        setBranches(updated);
        if (currentBranch?.id === editingId) setCurrentBranch(data as Branch);
        toast.success(`"${name.trim()}" updated`);
      } else {
        const { data, error } = await createBranch({ name: name.trim(), address, phone });
        if (showActionError(error)) return;
        setBranches([...branches, data as Branch]);
        toast.success(`"${name.trim()}" created`);
      }
      resetForm();
      fetchStats();
    } catch (err: unknown) {
      if (handleSubscriptionError(err)) return;
      toast.error(err instanceof Error ? err.message : 'Failed to save branch');
    } finally {
      setSaving(false);
    }
  }

  async function openDeleteModal(branch: Branch) {
    if (branches.length <= 1) {
      toast.error('Cannot delete the only branch — every salon needs at least one');
      return;
    }
    setDeleteTarget(branch);
    setReassignTo(branches.find((b) => b.id !== branch.id && b.is_main)?.id || branches.find((b) => b.id !== branch.id)?.id || '');
    setUsage(null);
    const { data, error } = await getBranchUsage(branch.id);
    if (error) {
      toast.error(error);
      setDeleteTarget(null);
      return;
    }
    setUsage(data);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const needsReassign = (usage?.total ?? 0) > 0;
      const { error } = await deleteBranch(deleteTarget.id, needsReassign ? reassignTo : undefined);
      if (showActionError(error)) { setDeleting(false); return; }
      const remaining = branches.filter((b) => b.id !== deleteTarget.id);
      if (deleteTarget.is_main && remaining.length > 0) {
        remaining[0] = { ...remaining[0], is_main: true };
      }
      setBranches(remaining);
      if (editingId === deleteTarget.id) resetForm();
      toast.success(`"${deleteTarget.name}" deleted${needsReassign ? ' (records moved)' : ''}`);
      setDeleteTarget(null);
      // Refresh stats — staff/bills counts moved between branches.
      fetchStats();
    } catch (err: unknown) {
      if (handleSubscriptionError(err)) return;
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Branches</h1>
          <p className="text-sm text-muted-foreground">{branches.length} {branches.length === 1 ? 'branch' : 'branches'}</p>
        </div>
        <Button onClick={() => { if (showForm) resetForm(); else setShowForm(true); }} className={showForm ? '' : 'bg-gold hover:bg-gold/90 text-black font-semibold'} variant={showForm ? 'outline' : 'default'}>
          {showForm ? <><X className="w-4 h-4 mr-1.5" /> Cancel</> : <><Plus className="w-4 h-4 mr-1.5" /> Add Branch</>}
        </Button>
      </div>

      {showForm && (
        <Card className="border-gold/30 bg-gold/5">
          <CardContent className="p-5 space-y-4">
            <p className="text-sm font-semibold">{editingId ? 'Edit Branch' : 'New Branch'}</p>
            <div>
              <Label className="text-xs">Branch Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gulberg Branch" className="mt-1" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Address</Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street address" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Phone</Label>
                <Input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03XX-XXXXXXX" className="mt-1" />
              </div>
            </div>
            <Button onClick={saveBranch} disabled={saving} className="bg-gold hover:bg-gold/90 text-black font-semibold h-11">
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Branch'}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {branches.map((branch) => {
          const stats = branchStats[branch.id];
          const isCurrent = currentBranch?.id === branch.id;
          return (
            <Card key={branch.id} className={`border-border ${isCurrent ? 'ring-2 ring-gold/30' : ''} ${editingId === branch.id ? 'ring-2 ring-gold/40' : ''}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
                      <MapPin className="w-5 h-5 text-gold" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{branch.name}</p>
                        {branch.is_main && <span className="text-[10px] bg-gold/20 text-gold px-2 py-0.5 rounded-full font-medium">Main</span>}
                        {isCurrent && <span className="text-[10px] bg-green-500/15 text-green-600 px-2 py-0.5 rounded-full font-medium">Active</span>}
                      </div>
                      {branch.address && <p className="text-xs text-muted-foreground mt-0.5">{branch.address}</p>}
                      {branch.phone && <p className="text-xs text-muted-foreground">{branch.phone}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(branch)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-600 disabled:text-muted-foreground disabled:cursor-not-allowed"
                      onClick={() => openDeleteModal(branch)}
                      disabled={branches.length <= 1}
                      title={branches.length <= 1 ? 'Cannot delete the only branch' : (branch.is_main ? 'Delete branch (will promote another to main)' : 'Delete branch')}
                      aria-label={`Delete ${branch.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {!loading && stats && (
                  <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border">
                    <div className="flex items-center gap-2">
                      <Users className="w-3.5 h-3.5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-semibold">{stats.staffCount}</p>
                        <p className="text-[10px] text-muted-foreground">Staff</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-semibold">{stats.todayAppointments}</p>
                        <p className="text-[10px] text-muted-foreground">Today</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-semibold">{formatPKR(stats.todayRevenue)}</p>
                        <p className="text-[10px] text-muted-foreground">Revenue</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Delete branch modal — shows usage counts and a reassign dropdown
          so the owner can move bills/staff/etc to another branch before
          the FK-constrained delete fires. */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-card border border-border rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border p-4">
              <p className="font-semibold text-base">Delete branch &ldquo;{deleteTarget.name}&rdquo;</p>
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="p-1.5 hover:bg-secondary rounded-md"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {!usage ? (
                <p className="text-sm text-muted-foreground">Checking what&apos;s linked to this branch…</p>
              ) : usage.total === 0 ? (
                <p className="text-sm">This branch has no linked records. It will be deleted permanently.</p>
              ) : (
                <>
                  <div className="bg-amber-500/5 border border-amber-500/30 rounded-lg p-3 space-y-2">
                    <p className="text-sm font-medium text-amber-700">This branch has linked records</p>
                    <ul className="text-xs text-muted-foreground space-y-0.5">
                      {usage.bills > 0 && <li>• {usage.bills} bill{usage.bills === 1 ? '' : 's'}</li>}
                      {usage.appointments > 0 && <li>• {usage.appointments} appointment{usage.appointments === 1 ? '' : 's'}</li>}
                      {usage.staff > 0 && <li>• {usage.staff} staff member{usage.staff === 1 ? '' : 's'}</li>}
                      {usage.attendance > 0 && <li>• {usage.attendance} attendance entr{usage.attendance === 1 ? 'y' : 'ies'}</li>}
                      {usage.expenses > 0 && <li>• {usage.expenses} expense{usage.expenses === 1 ? '' : 's'}</li>}
                      {usage.purchaseOrders > 0 && <li>• {usage.purchaseOrders} purchase order{usage.purchaseOrders === 1 ? '' : 's'}</li>}
                      {usage.stockMovements > 0 && <li>• {usage.stockMovements} stock movement{usage.stockMovements === 1 ? '' : 's'}</li>}
                      {usage.cashDrawers > 0 && <li>• {usage.cashDrawers} daily cash drawer{usage.cashDrawers === 1 ? '' : 's'} (will be discarded — bills move with the bills row)</li>}
                    </ul>
                  </div>

                  <div>
                    <Label className="text-xs">Move records to</Label>
                    <select
                      value={reassignTo}
                      onChange={(e) => setReassignTo(e.target.value)}
                      className="w-full mt-1 border border-border rounded-md h-9 text-sm px-2 bg-card"
                    >
                      {branches
                        .filter((b) => b.id !== deleteTarget.id)
                        .map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}{b.is_main ? ' (main)' : ''}
                          </option>
                        ))}
                    </select>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      All linked bills, appointments, and staff will be moved to this branch before
                      &ldquo;{deleteTarget.name}&rdquo; is deleted.
                    </p>
                  </div>
                </>
              )}

              {deleteTarget.is_main && (
                <p className="text-xs text-muted-foreground">
                  &ldquo;{deleteTarget.name}&rdquo; is currently your main branch — another branch will be
                  promoted to main automatically.
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                  Cancel
                </Button>
                <Button
                  onClick={confirmDelete}
                  disabled={deleting || (usage !== null && usage.total > 0 && !reassignTo)}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {deleting ? 'Deleting…' : 'Delete branch'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
