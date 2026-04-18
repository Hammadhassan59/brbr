'use client';

/**
 * `<AddressForm />` — shared create/edit form for consumer-saved addresses.
 *
 * Two modes:
 *   - `mode="create"` — blank form, submits via `saveConsumerAddress`.
 *   - `mode="edit"` — pre-populated from `address`, submits via
 *     `updateConsumerAddress`.
 *
 * Uses the same `<MapPinPicker />` that the salon-settings marketplace
 * flow uses, so lat/lng UX is consistent across owner + consumer surfaces.
 * On success the form `router.push`es back to the addresses list; errors
 * surface inline via a `toast`.
 *
 * Validation is kept deliberately simple (matching the server-side zod
 * rules in `consumer-addresses.ts`) — `label` >= 1 char, `street` >= 3
 * chars, lat/lng both set. The server re-validates so client-side checks
 * are UX only.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { MapPinPicker } from '@/app/dashboard/settings/marketplace/components/map-pin-picker';
import {
  saveConsumerAddress,
  updateConsumerAddress,
  type ConsumerAddress,
} from '@/app/actions/consumer-addresses';

interface AddressFormProps {
  mode: 'create' | 'edit';
  address?: ConsumerAddress;
}

export function AddressForm({ mode, address }: AddressFormProps) {
  const router = useRouter();

  const [label, setLabel] = useState(address?.label ?? '');
  const [street, setStreet] = useState(address?.street ?? '');
  const [lat, setLat] = useState<number | null>(address?.lat ?? null);
  const [lng, setLng] = useState<number | null>(address?.lng ?? null);
  const [isDefault, setIsDefault] = useState(address?.is_default ?? false);
  const [saving, setSaving] = useState(false);

  const isEdit = mode === 'edit';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!label.trim()) {
      toast.error('Add a label (e.g. Home, Office)');
      return;
    }
    if (!street.trim() || street.trim().length < 3) {
      toast.error('Enter a street address');
      return;
    }
    if (lat == null || lng == null) {
      toast.error('Drop a pin on the map');
      return;
    }

    setSaving(true);
    try {
      const res = isEdit && address
        ? await updateConsumerAddress({
            id: address.id,
            label: label.trim(),
            street: street.trim(),
            lat,
            lng,
            isDefault,
          })
        : await saveConsumerAddress({
            label: label.trim(),
            street: street.trim(),
            lat,
            lng,
            isDefault,
          });

      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(isEdit ? 'Address updated' : 'Address saved');
      router.push('/account/addresses');
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Link
        href="/account/addresses"
        className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#888] hover:text-[#1A1A1A]"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Back to addresses
      </Link>

      <header>
        <h1 className="font-heading text-2xl font-bold text-[#1A1A1A]">
          {isEdit ? 'Edit address' : 'Add address'}
        </h1>
        <p className="mt-1 text-[13px] text-[#888]">
          Save home, office, or any other address for faster checkout on home-service bookings.
        </p>
      </header>

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
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            disabled={saving}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="addr-street" className="text-[12px] font-semibold">
            Street / house details
          </Label>
          <Textarea
            id="addr-street"
            maxLength={500}
            rows={3}
            placeholder="House #, street name, area, nearby landmark"
            value={street}
            onChange={(e) => setStreet(e.target.value)}
            disabled={saving}
            required
          />
        </div>

        <MapPinPicker
          lat={lat}
          lng={lng}
          onChange={(la, ln) => {
            setLat(la);
            setLng(ln);
          }}
          disabled={saving}
        />

        <div className="flex items-center justify-between gap-3 rounded-xl border border-[#E8E8E8] bg-[#FAFAF8] px-4 py-3">
          <div>
            <p className="text-[13px] font-semibold text-[#1A1A1A]">Default address</p>
            <p className="text-[11px] text-[#888]">
              Used as the pre-picked option during checkout.
            </p>
          </div>
          <Switch
            checked={isDefault}
            onCheckedChange={setIsDefault}
            disabled={saving}
            aria-label="Set as default address"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push('/account/addresses')}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={saving}
          className="ml-auto h-11 bg-[#1A1A1A] px-6 text-white hover:bg-[#1A1A1A]/90"
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              Saving
            </>
          ) : isEdit ? (
            'Save changes'
          ) : (
            'Save address'
          )}
        </Button>
      </div>
    </form>
  );
}
