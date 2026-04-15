'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { updateOwnAgentProfile, getMyAgentProfile } from '@/app/actions/sales-agents';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function AgentProfilePage() {
  const [form, setForm] = useState({ name: '', phone: '', city: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getMyAgentProfile().then(r => {
      if (r.data) setForm({ name: r.data.name, phone: r.data.phone || '', city: r.data.city || '' });
    });
  }, []);

  async function save() {
    if (!form.phone.trim()) { toast.error('Phone is required'); return; }
    setSaving(true);
    const { error } = await updateOwnAgentProfile({ name: form.name, phone: form.phone.trim() });
    setSaving(false);
    if (error) { toast.error(error); return; }
    toast.success('Saved');
  }

  return (
    <div className="space-y-6 max-w-md">
      <h2 className="font-heading text-2xl font-semibold">Profile</h2>
      <div className="space-y-3 border rounded-lg p-5">
        <div><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
        <div><Label>Phone *</Label><Input required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
        <div><Label>City</Label><Input value={form.city} readOnly disabled /></div>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving || !form.name || !form.phone.trim()}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        City edits and password changes are handled by the platform admin. To reset your password, log out and use &quot;Forgot password&quot; on the login page.
      </p>
    </div>
  );
}
