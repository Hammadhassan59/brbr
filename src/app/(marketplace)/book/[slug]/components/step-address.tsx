'use client';

/**
 * Step 1 — Delivery address (home mode only).
 *
 * Two modes:
 *   a. Pick a saved address. Radio list ordered by default-first.
 *   b. Add a new one. Opens a draggable Mapbox pin. Pattern mirrored from
 *      `src/app/dashboard/settings/marketplace/components/map-pin-picker.tsx`
 *      — the "Adjust on map" deferred-mount + dynamic import of `mapbox-gl`
 *      + injected stylesheet all carry over. This component owns a text
 *      label + street line and uses the shared <MapPinPicker /> via a local
 *      mini-wrapper because that component doesn't handle the "add new"
 *      flow (save button, label input) — we compose instead of forking.
 *
 * Radius check: runs pure `distanceKm` against the branch's pin every time
 * lat/lng changes and blocks "Continue" if outside the salon's radius. The
 * server action `createBooking` re-verifies this, so the client-side check
 * is UX only — a compromised client can't bypass coverage.
 */

import { useMemo, useState } from 'react';
import { Plus, Check, Loader2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { distanceKm } from '@/lib/mapbox';
import type { ConsumerAddress } from '@/app/actions/consumer-addresses';
import { saveConsumerAddress } from '@/app/actions/consumer-addresses';

import { MapPinPicker } from '@/app/dashboard/settings/marketplace/components/map-pin-picker';
import type { WizardBranch } from './types';

interface Props {
  branch: WizardBranch;
  savedAddresses: ConsumerAddress[];
  address: {
    id: string | null;
    street: string;
    lat: number;
    lng: number;
  } | null;
  onChange: (
    address: {
      id: string | null;
      street: string;
      lat: number;
      lng: number;
    } | null,
  ) => void;
  onContinue: () => void;
}

export function StepAddress({
  branch,
  savedAddresses,
  address,
  onChange,
  onContinue,
}: Props) {
  const [picking, setPicking] = useState(savedAddresses.length === 0);
  const [newLabel, setNewLabel] = useState('');
  const [newStreet, setNewStreet] = useState('');
  const [newLat, setNewLat] = useState<number | null>(null);
  const [newLng, setNewLng] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Derive the selected saved ID (if any) — null means we're on "add new".
  const selectedSavedId = address?.id ?? null;

  // Radius guardrail. `distanceKm` is a pure function so this is cheap on
  // every keystroke / drag.
  const outOfRadius = useMemo(() => {
    if (!address) return false;
    if (
      branch.lat == null ||
      branch.lng == null ||
      branch.home_service_radius_km == null
    ) {
      return false;
    }
    const d = distanceKm(
      Number(branch.lat),
      Number(branch.lng),
      address.lat,
      address.lng,
    );
    return d > Number(branch.home_service_radius_km);
  }, [address, branch.lat, branch.lng, branch.home_service_radius_km]);

  const handlePickSaved = (saved: ConsumerAddress) => {
    onChange({
      id: saved.id,
      street: saved.street,
      lat: saved.lat,
      lng: saved.lng,
    });
    setPicking(false);
  };

  const handleSaveNew = async () => {
    if (!newLabel.trim()) {
      toast.error('Add a label (e.g. Home, Office)');
      return;
    }
    if (!newStreet.trim() || newStreet.trim().length < 3) {
      toast.error('Enter a street address');
      return;
    }
    if (newLat == null || newLng == null) {
      toast.error('Drop a pin on the map');
      return;
    }
    setSaving(true);
    try {
      const res = await saveConsumerAddress({
        label: newLabel.trim(),
        street: newStreet.trim(),
        lat: newLat,
        lng: newLng,
        isDefault: savedAddresses.length === 0,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onChange({
        id: res.data.id,
        street: res.data.street,
        lat: res.data.lat,
        lng: res.data.lng,
      });
      setPicking(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-heading text-lg font-bold text-[#1A1A1A]">
          Where should we come?
        </h2>
        <p className="mt-1 text-[13px] text-[#888]">
          {branch.home_service_radius_km != null
            ? `This salon serves addresses within ${branch.home_service_radius_km} km of the branch.`
            : 'Pick a delivery address.'}
        </p>
      </div>

      {savedAddresses.length > 0 && !picking && (
        <ul className="space-y-2">
          {savedAddresses.map((a) => {
            const isSelected = selectedSavedId === a.id;
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => handlePickSaved(a)}
                  className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors ${
                    isSelected
                      ? 'border-gold bg-gold/10'
                      : 'border-[#E8E8E8] bg-white hover:border-[#1A1A1A]/40'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                      isSelected
                        ? 'border-gold bg-gold'
                        : 'border-[#CCC] bg-white'
                    }`}
                  >
                    {isSelected && (
                      <Check className="h-3 w-3 text-[#1A1A1A]" aria-hidden />
                    )}
                  </span>
                  <div className="flex-1">
                    <p className="text-[14px] font-semibold text-[#1A1A1A]">
                      {a.label}
                      {a.is_default && (
                        <span className="ml-2 rounded bg-gold/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#1A1A1A]">
                          Default
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[12px] text-[#888]">{a.street}</p>
                  </div>
                </button>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => {
                setPicking(true);
                onChange(null);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#CCC] bg-white p-4 text-[13px] font-semibold text-[#1A1A1A] hover:border-[#1A1A1A]/40"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add new address
            </button>
          </li>
        </ul>
      )}

      {picking && (
        <div className="space-y-4 rounded-2xl border border-[#E8E8E8] bg-white p-4">
          <div className="space-y-2">
            <Label htmlFor="addr-label" className="text-[12px] font-semibold">
              Label
            </Label>
            <Input
              id="addr-label"
              type="text"
              maxLength={60}
              placeholder="Home, Office, Mom's place"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="addr-street" className="text-[12px] font-semibold">
              Street / area
            </Label>
            <Input
              id="addr-street"
              type="text"
              maxLength={500}
              placeholder="House #, street name, area"
              value={newStreet}
              onChange={(e) => setNewStreet(e.target.value)}
              disabled={saving}
            />
          </div>

          <MapPinPicker
            lat={newLat}
            lng={newLng}
            onChange={(la, ln) => {
              setNewLat(la);
              setNewLng(ln);
              // Mirror into wizard state live so the radius check highlights
              // immediately, even before the user saves.
              onChange({
                id: null,
                street: newStreet.trim() || 'New address',
                lat: la,
                lng: ln,
              });
            }}
            centerHint={
              branch.lat != null && branch.lng != null
                ? { lat: Number(branch.lat), lng: Number(branch.lng) }
                : null
            }
            disabled={saving}
          />

          <div className="flex items-center gap-2">
            {savedAddresses.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setPicking(false);
                  onChange(null);
                }}
                disabled={saving}
              >
                Cancel
              </Button>
            )}
            <Button
              type="button"
              onClick={handleSaveNew}
              disabled={saving}
              className="ml-auto h-10 bg-[#1A1A1A] px-5 text-white hover:bg-[#1A1A1A]/90"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Saving
                </>
              ) : (
                'Save address'
              )}
            </Button>
          </div>
        </div>
      )}

      {outOfRadius && address && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-800"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">
              This salon doesn&rsquo;t cover your area.
            </p>
            <p className="mt-1">
              Pick another salon or switch to &ldquo;At salon&rdquo; on the home
              page.
            </p>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={onContinue}
          disabled={!address || outOfRadius}
          className="h-11 bg-[#1A1A1A] px-6 text-[14px] font-bold text-white hover:bg-[#1A1A1A]/90 disabled:bg-[#BBB]"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
