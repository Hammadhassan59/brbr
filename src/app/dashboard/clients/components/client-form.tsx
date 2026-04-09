'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import toast from 'react-hot-toast';
import { isValidPKPhone } from '@/lib/utils/phone';
import type { Client } from '@/types/database';

interface ClientFormProps {
  client?: Client | null;
  onSaved?: () => void;
}

export function ClientForm({ client, onSaved }: ClientFormProps) {
  const router = useRouter();
  const { salon } = useAppStore();
  const isEditing = !!client;

  const [name, setName] = useState(client?.name || '');
  const [phone, setPhone] = useState(client?.phone || '');
  const [whatsapp, setWhatsapp] = useState(client?.whatsapp || '');
  const [sameAsPhone, setSameAsPhone] = useState(!client?.whatsapp || client?.whatsapp === client?.phone);
  const [gender, setGender] = useState<string>(client?.gender || '');
  const [notes, setNotes] = useState(client?.notes || '');
  const [hairNotes, setHairNotes] = useState(client?.hair_notes || '');
  const [allergyNotes, setAllergyNotes] = useState(client?.allergy_notes || '');
  const [isVip, setIsVip] = useState(client?.is_vip || false);
  const [isBlacklisted, setIsBlacklisted] = useState(client?.is_blacklisted || false);
  const [udhaarLimit, setUdhaarLimit] = useState(String(client?.udhaar_limit ?? 5000));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!salon) return;
    if (!name.trim()) { toast.error('Name is required'); return; }
    if (!phone.trim()) { toast.error('Phone number is required'); return; }
    if (!isValidPKPhone(phone)) { toast.error('Invalid phone format — expected 03XX-XXXXXXX'); return; }

    setSaving(true);
    try {
      const data = {
        salon_id: salon.id,
        name: name.trim(),
        phone: phone || null,
        whatsapp: sameAsPhone ? phone || null : whatsapp || null,
        gender: gender || null,
        notes: notes || null,
        hair_notes: hairNotes || null,
        allergy_notes: allergyNotes || null,
        is_vip: isVip,
        is_blacklisted: isBlacklisted,
        udhaar_limit: udhaarLimit === '' ? 5000 : Number(udhaarLimit),
      };

      if (isEditing && client) {
        const { error } = await supabase
          .from('clients')
          .update(data)
          .eq('id', client.id);
        if (error) throw error;
        toast.success('Client updated');
      } else {
        // Check for duplicate phone
        if (phone) {
          const { data: existing } = await supabase
            .from('clients')
            .select('id')
            .eq('salon_id', salon.id)
            .eq('phone', phone)
            .limit(1);
          if (existing && existing.length > 0) {
            toast.error('A client with this phone number already exists');
            setSaving(false);
            return;
          }
        }

        const { data: newClient, error } = await supabase
          .from('clients')
          .insert(data)
          .select()
          .single();
        if (error) throw error;
        toast.success('Client added');
        router.push(`/dashboard/clients/${newClient.id}`);
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
      <h2 className="font-heading text-xl font-bold">
        {isEditing ? 'Edit Client' : 'Add New Client'}
      </h2>

      <section className="bg-card p-5 border border-border space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Personal Info</h3>

        <div>
          <Label>Full Name *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Client name" className="mt-1" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Phone Number *</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03XX-XXXXXXX" className="mt-1" />
          </div>
          <div>
            <Label>WhatsApp</Label>
            {sameAsPhone ? (
              <Input value={phone} disabled className="mt-1" />
            ) : (
              <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="03XX-XXXXXXX" className="mt-1" />
            )}
            <label className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={sameAsPhone} onChange={(e) => setSameAsPhone(e.target.checked)} className="rounded" />
              Same as phone
            </label>
          </div>
        </div>

        <div>
          <Label>Gender</Label>
          <div className="flex gap-2 mt-1">
            {[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }].map((g) => (
              <button
                key={g.value}
                onClick={() => setGender(g.value)}
                className={`flex-1 py-2.5 border text-sm font-medium transition-all duration-150 ${
                  gender === g.value ? 'border-gold bg-gold/10' : 'border-border hover:border-gold/40'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

      </section>

      <section className="bg-card p-5 border border-border space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Preferences & Notes</h3>

        <div>
          <Label>General Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes about this client..." rows={2} className="mt-1" />
        </div>

        <div>
          <Label>Hair Type Notes</Label>
          <Textarea value={hairNotes} onChange={(e) => setHairNotes(e.target.value)} placeholder="e.g. Thick hair, tends to frizz" rows={2} className="mt-1" />
        </div>

        <div>
          <Label className="text-destructive">Allergy / Sensitivity Warning</Label>
          <Textarea
            value={allergyNotes}
            onChange={(e) => setAllergyNotes(e.target.value)}
            placeholder="Any allergies or sensitivities..."
            rows={2}
            className="mt-1 border-destructive/30 focus-visible:ring-destructive/30"
          />
          {allergyNotes && (
            <p className="text-xs text-destructive mt-1">This will show as a warning on appointments</p>
          )}
        </div>
      </section>

      <section className="bg-card p-5 border border-border space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Settings</h3>

        <div className="bg-background/50 p-4 border border-border/20 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">VIP Client</p>
            <p className="text-xs text-muted-foreground">Mark this client as VIP</p>
          </div>
          <Switch checked={isVip} onCheckedChange={setIsVip} />
        </div>

        <div>
          <Label>Udhaar Limit (Rs)</Label>
          <Input
            type="number"
            value={udhaarLimit}
            onChange={(e) => setUdhaarLimit(e.target.value)}
            className="mt-1 w-40"
            inputMode="numeric"
          />
        </div>

        <div className="bg-red-500/5 border border-red-500/20 p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-red-600">Blacklist Client</p>
            <p className="text-xs text-red-600">Block this client from bookings</p>
          </div>
          <Switch checked={isBlacklisted} onCheckedChange={setIsBlacklisted} />
        </div>
      </section>

      <div className="flex gap-3 pt-4 border-t">
        <Button variant="ghost" onClick={() => router.back()} className="transition-all duration-150">Cancel</Button>
        <Button onClick={handleSave} disabled={saving} className="bg-gold hover:bg-gold/90 text-black font-bold h-11 px-6 transition-all duration-150">
          {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Client'}
        </Button>
      </div>
    </div>
  );
}
