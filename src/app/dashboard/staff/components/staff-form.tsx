'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import toast from 'react-hot-toast';
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
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!salon || !currentBranch) return;
    if (!name.trim()) { toast.error('Name is required'); return; }
    if (!isEditing && pin.length !== 4) { toast.error('PIN must be 4 digits'); return; }
    if (!isEditing && pin !== confirmPin) { toast.error('PINs do not match'); return; }

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

      <section className="space-y-4 pt-4 border-t">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Salary & Commission</h3>
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
      </section>

      <div className="flex gap-3 pt-4 border-t">
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving} className="bg-gold hover:bg-gold/90 text-black border border-gold">
          {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Staff'}
        </Button>
      </div>
    </div>
  );
}
