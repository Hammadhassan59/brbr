'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import { createStaff, updateStaff, updateStaffBranches } from '@/app/actions/staff';
import { getAgentPasswordError, AGENT_MIN_PASSWORD_LENGTH } from '@/lib/schemas/common';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import toast from 'react-hot-toast';
import { showActionError, handleSubscriptionError } from '@/components/paywall-dialog';
import type { Staff, StaffRole, CommissionType } from '@/types/database';

interface StaffFormProps {
  staff?: Staff | null;
  onSaved?: () => void;
}

const ROLES: { value: StaffRole; label: string }[] = [
  { value: 'manager', label: 'Manager' },
  { value: 'senior_stylist', label: 'Senior Stylist' },
  { value: 'junior_stylist', label: 'Junior Stylist' },
  { value: 'receptionist', label: 'Receptionist' },
  { value: 'helper', label: 'Helper' },
];

export function StaffForm({ staff, onSaved }: StaffFormProps) {
  const router = useRouter();
  const { salon, currentBranch, memberBranches } = useAppStore();
  const isEditing = !!staff;

  const [name, setName] = useState(staff?.name || '');
  const [email, setEmail] = useState(staff?.email || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState(staff?.phone || '');
  const [role, setRole] = useState<StaffRole>(staff?.role || 'junior_stylist');
  const [joinDate, setJoinDate] = useState(staff?.join_date || new Date().toISOString().slice(0, 10));
  const [baseSalary, setBaseSalary] = useState(String(staff?.base_salary ?? 0));
  const [commissionType, setCommissionType] = useState<CommissionType>(staff?.commission_type || 'percentage');
  const [commissionRate, setCommissionRate] = useState(String(staff?.commission_rate ?? 0));
  const [isActive, setIsActive] = useState(staff?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  // Multi-branch membership (migration 036). For a new staff row we default
  // to the current branch; for an existing row we hydrate from staff_branches.
  const [branchIds, setBranchIds] = useState<string[]>(
    staff ? [] : (currentBranch ? [currentBranch.id] : [])
  );

  useEffect(() => {
    if (!staff) return;
    (async () => {
      const { data } = await supabase
        .from('staff_branches')
        .select('branch_id')
        .eq('staff_id', staff.id);
      if (data) {
        setBranchIds((data as Array<{ branch_id: string }>).map((r) => r.branch_id));
      }
    })();
  }, [staff]);

  function toggleBranch(id: string, checked: boolean) {
    setBranchIds((prev) => (checked ? Array.from(new Set([...prev, id])) : prev.filter((b) => b !== id)));
  }

  async function handleSave() {
    if (!salon || !currentBranch) return;
    if (!name.trim()) { toast.error('Name is required'); return; }
    if (!phone.trim()) { toast.error('Phone is required'); return; }
    // Email + password are optional for create — but if one is provided, both
    // must be. Staff with no credentials are "resource" rows that can't log in.
    if (!isEditing) {
      const hasEmail = !!email.trim();
      const hasPassword = password.length > 0;
      if (hasEmail !== hasPassword) { toast.error('Provide both email and password, or leave both blank'); return; }
      if (hasPassword) {
        const pwErr = getAgentPasswordError(password);
        if (pwErr) { toast.error(pwErr); return; }
        if (password !== confirmPassword) { toast.error('Passwords do not match'); return; }
      }
    }
    if (isEditing && password) {
      const pwErr = getAgentPasswordError(password);
      if (pwErr) { toast.error(pwErr); return; }
      if (password !== confirmPassword) { toast.error('Passwords do not match'); return; }
    }

    setSaving(true);
    try {
      if (isEditing && staff) {
        const data: Record<string, unknown> = {
          name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim(),
          role,
          join_date: joinDate,
          base_salary: Number(baseSalary) || 0,
          commission_type: commissionType,
          commission_rate: Number(commissionRate) || 0,
          is_active: isActive,
        };

        const { error } = await updateStaff(staff.id, data);
        if (showActionError(error)) return;
        // Persist the multi-branch grants (migration 036). Empty array is
        // allowed — the server action keeps at least primary_branch_id in
        // the set.
        const { error: branchErr } = await updateStaffBranches(staff.id, branchIds);
        if (showActionError(branchErr)) return;
        toast.success('Staff updated');
      } else {
        // createStaff now takes branchIds[] (migration 036); it sets the first
        // as primary_branch_id and inserts all into staff_branches atomically.
        const grants = branchIds.length > 0 ? branchIds : [currentBranch.id];
        const { data: newStaff, error } = await createStaff({
          branchIds: grants,
          name: name.trim(),
          email: email.trim(),
          password,
          phone: phone.trim(),
          role,
          joinDate,
          baseSalary: Number(baseSalary) || 0,
          commissionType,
          commissionRate: Number(commissionRate) || 0,
        });
        if (showActionError(error)) return;
        toast.success('Staff member added');
        router.push(`/dashboard/staff/${newStaff!.id}`);
        return;
      }
      onSaved?.();
    } catch (err: unknown) {
      if (handleSubscriptionError(err)) return;
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <h2 className="font-heading text-xl font-bold">{isEditing ? 'Edit Staff Member' : 'Add Staff Member'}</h2>

      <div className="bg-card border border-border rounded-lg p-5 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Personal Info</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Full Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>{isEditing ? 'Email' : 'Email (optional)'}</Label>
            <Input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff@example.com" className="mt-1" disabled={isEditing} />
            {!isEditing && <p className="text-xs text-muted-foreground mt-1">Leave blank if this staff won&apos;t log in to the dashboard</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>{isEditing ? 'New Password (leave blank to keep)' : 'Password (optional)'}</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={AGENT_MIN_PASSWORD_LENGTH} className="mt-1" />
            {password && <p className="text-xs text-muted-foreground mt-1">Min {AGENT_MIN_PASSWORD_LENGTH} characters. Keep it simple and easy to remember.</p>}
          </div>
          <div>
            <Label>Confirm Password</Label>
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-1" />
            {password && confirmPassword && password !== confirmPassword && <p className="text-xs text-destructive mt-1">Passwords don&apos;t match</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Role *</Label>
            <Select value={role} onValueChange={(v) => { if (v) setRole(v as StaffRole); }}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Join Date</Label>
            <Input type="date" value={joinDate} onChange={(e) => setJoinDate(e.target.value)} className="mt-1" />
          </div>
        </div>

        <div>
          <Label>Phone *</Label>
          <Input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03XX-XXXXXXX" className="mt-1 w-64" required />
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-5 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Salary & Commission</p>
        <div>
          <Label>Base Salary (Rs/month)</Label>
          <Input type="number" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} className="mt-1 w-48" inputMode="numeric" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Commission Type</Label>
            <Select value={commissionType} onValueChange={(v) => { if (v) setCommissionType(v as CommissionType); }}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Percentage (%)</SelectItem>
                <SelectItem value="flat">Flat per service (Rs)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{commissionType === 'percentage' ? 'Commission Rate (%)' : 'Flat Amount (Rs)'}</Label>
            <Input type="number" value={commissionRate} onChange={(e) => setCommissionRate(e.target.value)} className="mt-1" inputMode="numeric" />
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-5 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Works At</p>
        {memberBranches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No branches available.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {memberBranches.map((b) => (
              <label key={b.id} className="flex items-center gap-2 p-3 border border-border rounded-md cursor-pointer hover:border-gold/40">
                <input
                  type="checkbox"
                  checked={branchIds.includes(b.id)}
                  onChange={(e) => toggleBranch(b.id, e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">{b.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {isEditing && (
        <div className="bg-card border border-border rounded-lg p-5 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</p>
          <div className="flex items-center justify-between p-4 bg-secondary/50 border border-border">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">
                {isActive
                  ? 'This staff member is active and visible in booking and POS.'
                  : 'Deactivated staff won\u2019t appear in booking or POS.'}
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
          {!isActive && (
            <p className="text-xs text-destructive font-medium">
              Warning: Deactivated staff won&apos;t appear in booking or POS.
            </p>
          )}
        </div>
      )}

      <div className="flex gap-3 pt-4">
        <Button variant="outline" onClick={() => router.back()} className="">Cancel</Button>
        <Button onClick={handleSave} disabled={saving} className="bg-gold hover:bg-gold/90 text-black border border-gold font-bold h-11 px-6">
          {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Staff'}
        </Button>
      </div>
    </div>
  );
}
