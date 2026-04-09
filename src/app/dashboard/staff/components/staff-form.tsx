'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import toast from 'react-hot-toast';
import { isValidPKPhone } from '@/lib/utils/phone';
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
  const { salon, currentBranch } = useAppStore();
  const isEditing = !!staff;

  const [name, setName] = useState(staff?.name || '');
  const [phone, setPhone] = useState(staff?.phone || '');
  const [role, setRole] = useState<StaffRole>(staff?.role || 'junior_stylist');
  const [joinDate, setJoinDate] = useState(staff?.join_date || new Date().toISOString().slice(0, 10));
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [baseSalary, setBaseSalary] = useState(String(staff?.base_salary ?? 0));
  const [commissionType, setCommissionType] = useState<CommissionType>(staff?.commission_type || 'percentage');
  const [commissionRate, setCommissionRate] = useState(String(staff?.commission_rate ?? 0));
  const [isActive, setIsActive] = useState(staff?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!salon || !currentBranch) return;
    if (!name.trim()) { toast.error('Name is required'); return; }
    if (phone && !isValidPKPhone(phone)) { toast.error('Invalid phone format — expected 03XX-XXXXXXX'); return; }
    if (!isEditing && pin.length !== 4) { toast.error('PIN must be 4 digits'); return; }
    if (!isEditing && pin !== confirmPin) { toast.error('PINs do not match'); return; }
    if (isEditing && pin) {
      if (pin.length !== 4 || !/^\d{4}$/.test(pin)) { toast.error('PIN must be exactly 4 digits'); return; }
      if (pin !== confirmPin) { toast.error('PINs do not match'); return; }
    }

    setSaving(true);
    try {
      const data: Record<string, unknown> = {
        salon_id: salon.id,
        branch_id: currentBranch.id,
        name: name.trim(),
        phone: phone || null,
        role,
        join_date: joinDate,
        base_salary: Number(baseSalary) || 0,
        commission_type: commissionType,
        commission_rate: Number(commissionRate) || 0,
      };
      if (isEditing) data.is_active = isActive;
      if (pin) data.pin_code = pin;

      if (isEditing && staff) {
        const { error } = await supabase.from('staff').update(data).eq('id', staff.id);
        if (error) throw error;
        toast.success('Staff updated');
      } else {
        data.pin_code = pin;
        const { data: newStaff, error } = await supabase.from('staff').insert(data).select().single();
        if (error) throw error;
        toast.success('Staff member added');
        router.push(`/dashboard/staff/${newStaff.id}`);
        return;
      }
      onSaved?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="font-heading text-xl font-bold">{isEditing ? 'Edit Staff Member' : 'Add Staff Member'}</h2>

      <div className="bg-card border border-border rounded-lg p-5 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Personal Info</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Full Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03XX-XXXXXXX" className="mt-1" />
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

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>{isEditing ? 'New PIN (leave blank to keep)' : 'Set 4-digit PIN *'}</Label>
          <Input type="password" maxLength={4} inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} className="mt-1 text-center tracking-widest" />
        </div>
        <div>
          <Label>Confirm PIN</Label>
          <Input type="password" maxLength={4} inputMode="numeric" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))} className="mt-1 text-center tracking-widest" />
          {pin && confirmPin && pin !== confirmPin && <p className="text-xs text-destructive mt-1">PINs don&apos;t match</p>}
        </div>
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
