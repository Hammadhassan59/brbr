'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Users, Plus, Camera, ImageIcon, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { listMyLeads, createMyLead, getLeadCounts, type LeadWithPhotoUrl } from '@/app/actions/leads';
import { compressImage } from '@/lib/image-compress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { LeadStatus } from '@/types/sales';

const STATUSES: (LeadStatus | 'all')[] = ['all','new','contacted','visited','followup','interested','not_interested','onboarded','converted','lost'];

const STATUS_LABELS: Record<string, string> = {
  all: 'All',
  new: 'New',
  contacted: 'Contacted',
  visited: 'Visited',
  followup: 'Follow-up',
  interested: 'Interested',
  not_interested: 'Not interested',
  onboarded: 'Onboarded',
  converted: 'Converted',
  lost: 'Lost',
};

export default function AgentLeadsPage() {
  const [leads, setLeads] = useState<LeadWithPhotoUrl[]>([]);
  const [status, setStatus] = useState<LeadStatus | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data }, countsRes] = await Promise.all([
      listMyLeads({ status }),
      getLeadCounts(),
    ]);
    setLeads(data);
    setCounts(countsRes.data || {});
    setLoading(false);
  }, [status]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const totalCount = Object.values(counts).reduce((s, n) => s + n, 0);
  function countFor(s: LeadStatus | 'all'): number {
    return s === 'all' ? totalCount : (counts[s] ?? 0);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-2xl font-semibold">My Leads</h2>
        <Button
          onClick={() => setCreating(true)}
          className="bg-gold text-black hover:bg-gold/90 font-semibold h-10"
        >
          <Plus className="w-4 h-4 mr-1.5" /> New lead
        </Button>
      </div>

      {/* Status filter — bigger named tabs with per-status counts. Replaces
          the old uniform pill row so 'Follow-up' and 'Onboarded' are
          unmissable, and forces a new HTML chunk hash to bust the CDN cache. */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
        {STATUSES.map((s) => {
          const active = status === s;
          const count = countFor(s);
          return (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-4 h-10 rounded-lg border text-sm font-medium transition-colors ${
                active
                  ? 'bg-gold text-black border-gold shadow-sm'
                  : 'bg-white border-border text-foreground hover:border-gold/50'
              }`}
            >
              <span>{STATUS_LABELS[s] ?? s}</span>
              <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                active ? 'bg-black/15 text-black' : 'bg-muted text-muted-foreground'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="border border-dashed rounded-lg p-10 text-center text-muted-foreground">
          <Loader2 className="w-6 h-6 mx-auto animate-spin opacity-50" />
        </div>
      ) : leads.length === 0 ? (
        <div className="border border-dashed rounded-lg p-10 text-center text-muted-foreground">
          <Users className="w-7 h-7 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No leads in this filter.</p>
          {status === 'all' && (
            <p className="text-xs mt-1">Tap &quot;New lead&quot; to capture one from the field.</p>
          )}
        </div>
      ) : (
        <div className="grid gap-2">
          {leads.map(l => (
            <Link key={l.id} href={`/agent/leads/${l.id}`}
              className="border rounded-lg p-4 bg-white hover:border-gold transition-colors flex gap-3">
              {l.photo_signed_url && (
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={l.photo_signed_url} alt={l.salon_name} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-medium truncate">{l.salon_name}</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted shrink-0">{l.status.replace('_', ' ')}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5 truncate">
                  {l.owner_name || '—'} · {l.phone || '—'} · {l.city || '—'}
                </p>
                {l.address && <p className="text-xs text-muted-foreground/80 mt-0.5 truncate">{l.address}</p>}
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Updated {new Date(l.updated_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {creating && (
        <NewLeadSheet onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />
      )}
    </div>
  );
}

function NewLeadSheet({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [salonName, setSalonName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleFile(file: File | null) {
    if (!file) return;
    setCompressing(true);
    try {
      const compressed = await compressImage(file, { maxEdge: 1280, quality: 0.8 });
      setPhoto(compressed);
      const reader = new FileReader();
      reader.onload = (e) => setPhotoPreview(typeof e.target?.result === 'string' ? e.target.result : null);
      reader.readAsDataURL(compressed);
    } catch {
      toast.error('Could not process image');
    } finally {
      setCompressing(false);
    }
  }

  function clearPhoto() {
    setPhoto(null);
    setPhotoPreview(null);
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!salonName.trim()) { toast.error('Salon name is required'); return; }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('salon_name', salonName.trim());
      if (ownerName.trim()) fd.append('owner_name', ownerName.trim());
      if (phone.trim()) fd.append('phone', phone.trim());
      if (city.trim()) fd.append('city', city.trim());
      if (address.trim()) fd.append('address', address.trim());
      if (notes.trim()) fd.append('notes', notes.trim());
      if (photo) fd.append('photo', photo);
      const { error } = await createMyLead(fd);
      if (error) { toast.error(error); return; }
      toast.success('Lead saved');
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-card border-b border-border flex items-center justify-between p-4">
          <h3 className="font-semibold text-base">New lead</h3>
          <button onClick={onClose} disabled={submitting} className="p-1.5 hover:bg-secondary rounded-md" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="p-4 space-y-4">
          <div>
            <Label className="text-xs">Salon name *</Label>
            <Input value={salonName} onChange={(e) => setSalonName(e.target.value)} placeholder="e.g. Glamour Studio" className="mt-1" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Owner name</Label>
              <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="e.g. Ahmed" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Contact phone</Label>
              <Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03XX-XXXXXXX" className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">City</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Lahore" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Address</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, area" className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Number of chairs, decision-maker, follow-up timing…"
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-xs">Salon photo (optional)</Label>
            {photoPreview ? (
              <div className="mt-1 relative rounded-lg overflow-hidden border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoPreview} alt="Salon preview" className="w-full max-h-56 object-cover" />
                <button
                  type="button"
                  onClick={clearPhoto}
                  className="absolute top-2 right-2 p-1.5 bg-black/70 text-white rounded-full"
                  aria-label="Remove photo"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                {photo && (
                  <p className="absolute bottom-2 left-2 text-[10px] bg-black/70 text-white px-2 py-0.5 rounded-full">
                    {(photo.size / 1024).toFixed(0)} KB
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-1 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={compressing}
                  className="flex flex-col items-center justify-center gap-1.5 border border-dashed border-border rounded-lg py-5 hover:border-gold/50 transition-colors"
                >
                  <Camera className="w-5 h-5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Take photo</span>
                </button>
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={compressing}
                  className="flex flex-col items-center justify-center gap-1.5 border border-dashed border-border rounded-lg py-5 hover:border-gold/50 transition-colors"
                >
                  <ImageIcon className="w-5 h-5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">From gallery</span>
                </button>
              </div>
            )}
            {compressing && <p className="text-xs text-muted-foreground mt-1.5">Compressing…</p>}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </div>

          <Button
            type="submit"
            disabled={submitting || compressing || !salonName.trim()}
            className="w-full bg-gold text-black hover:bg-gold/90 font-semibold h-11"
          >
            {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : 'Save lead'}
          </Button>
        </form>
      </div>
    </div>
  );
}
