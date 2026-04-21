'use client';

import { useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Scissors, Building2, CheckCircle2 } from 'lucide-react';
import { submitAgencyRequest } from '@/app/actions/agency-requests';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function AgencySignupPage() {
  const [form, setForm] = useState({
    name: '', contactName: '', phone: '', email: '',
    nicNumber: '', city: '', address: '', notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { success, error } = await submitAgencyRequest({
      name: form.name.trim(),
      contactName: form.contactName.trim(),
      phone: form.phone.trim(),
      email: form.email.trim().toLowerCase(),
      nicNumber: form.nicNumber.trim() || null,
      city: form.city.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
    });
    setSubmitting(false);
    if (!success) { toast.error(error || 'Could not submit request'); return; }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-lg text-center space-y-5">
          <div className="w-16 h-16 rounded-full bg-green-500/15 mx-auto flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="font-heading text-2xl font-bold">Request submitted</h1>
          <p className="text-sm text-muted-foreground">
            Thank you for your interest in becoming an iCut agency partner. Our team will review your application and reach out at <span className="font-medium">{form.email}</span> within a few business days.
          </p>
          <Link href="/"><Button variant="outline">Back to homepage</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-10 px-6">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="flex items-center gap-2 mb-8">
          <Scissors className="w-6 h-6 text-gold" />
          <span className="font-heading text-xl font-bold">iCut</span>
        </Link>

        <div className="border rounded-lg p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-gold" />
            </div>
            <div>
              <h1 className="font-heading text-2xl font-bold">Become an iCut agency</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Earn commission by onboarding salons to iCut. Manage your own sales team, collect payments from tenants, and get paid per conversion.
              </p>
            </div>
          </div>

          <div className="rounded-lg bg-muted/40 p-4 text-sm space-y-2">
            <p className="font-medium">How it works</p>
            <ul className="space-y-1 list-disc list-inside text-muted-foreground text-[13px]">
              <li>Submit this form — our team reviews applications within a few business days.</li>
              <li>On approval, you post a refundable security deposit and agree to commission terms.</li>
              <li>You get a dashboard to add your own sales agents, track leads, and manage payouts.</li>
              <li>Platform pays you first-sale + renewal commission on every tenant your agents onboard.</li>
            </ul>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div><Label>Agency / company name *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Contact person *</Label><Input required value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></div>
              <div><Label>Phone *</Label><Input type="tel" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="03XXXXXXXXX" /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Email *</Label><Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>NIC / CNIC</Label><Input value={form.nicNumber} onChange={(e) => setForm({ ...form, nicNumber: e.target.value })} placeholder="XXXXX-XXXXXXX-X" /></div>
            </div>
            <div><Label>City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
            <div>
              <Label>Complete address</Label>
              <Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street, area, city, postal code" />
            </div>
            <div>
              <Label>Tell us about your sales experience</Label>
              <Textarea rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Team size, cities you cover, prior salon or SaaS sales experience, etc." />
            </div>
            <Button type="submit" disabled={submitting} className="w-full bg-gold hover:bg-gold/90 text-black font-bold">
              {submitting ? 'Submitting…' : 'Submit application'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
