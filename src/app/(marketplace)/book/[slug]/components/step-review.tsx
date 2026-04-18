'use client';

/**
 * Step 4 — review + submit.
 *
 * Cart summary (one row per selected service at its display price), separate
 * line for the flat Rs 300 home service charge (home mode only, per decision
 * 20 in the plan), final total, notes textarea (200 chars), confirm button.
 *
 * No edits happen here — tweaks send the user back via the Stepper or the
 * "Back" button. The submit handler lives on the wizard.
 */

import { useMemo } from 'react';
import { Loader2, MapPin, Calendar, User } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { BranchService } from '@/lib/marketplace/queries';
import type { MarketplaceMode } from '@/lib/marketplace/mode';
import {
  computeBookingTotals,
  displayPriceForMode,
  HOME_SERVICE_CHARGE,
} from '@/lib/marketplace/pricing';

import type { WizardBranch, WizardConsumer } from './types';

const NOTES_MAX = 200;

interface Props {
  branch: WizardBranch;
  mode: MarketplaceMode;
  services: BranchService[];
  selectedIds: string[];
  slotStart: string | null;
  slotEnd: string | null;
  address: {
    id: string | null;
    street: string;
    lat: number;
    lng: number;
  } | null;
  notes: string;
  onNotesChange: (notes: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
  consumer: WizardConsumer;
}

function formatPrice(rupees: number): string {
  return new Intl.NumberFormat('en-PK').format(Math.round(rupees));
}

function formatSlot(iso: string | null): string {
  if (!iso) return 'Not selected';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Not selected';
  const date = d.toLocaleDateString('en-PK', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const time = d.toLocaleTimeString('en-PK', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${date} · ${time}`;
}

export function StepReview({
  branch,
  mode,
  services,
  selectedIds,
  slotStart,
  slotEnd: _slotEnd,
  address,
  notes,
  onNotesChange,
  onBack,
  onSubmit,
  submitting,
  consumer,
}: Props) {
  void _slotEnd;

  const selected = useMemo(
    () => services.filter((s) => selectedIds.includes(s.id)),
    [services, selectedIds],
  );

  // Same computeBookingTotals the server uses → display stays in sync with
  // what createBooking will snapshot into the `bookings` row.
  const totals = useMemo(
    () =>
      computeBookingTotals({
        items: selected.map((s) => ({ base: s.base_price })),
        mode,
      }),
    [selected, mode],
  );

  return (
    <div className="space-y-5 pb-28 md:pb-0">
      <div>
        <h2 className="font-heading text-lg font-bold text-[#1A1A1A]">
          Review &amp; confirm
        </h2>
        <p className="mt-1 text-[13px] text-[#888]">
          Pay cash at the {mode === 'at_home' ? 'door' : 'salon'} after your
          service.
        </p>
      </div>

      {/* Summary cards */}
      <div className="space-y-3">
        <div className="rounded-2xl border border-[#E8E8E8] bg-white p-4">
          <div className="flex items-start gap-3">
            <User className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-[1.5px] text-[#888]">
                Booking for
              </p>
              <p className="text-[14px] font-semibold text-[#1A1A1A]">
                {consumer.name || 'You'}
              </p>
              {consumer.phone && (
                <p className="text-[12px] text-[#888]">{consumer.phone}</p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#E8E8E8] bg-white p-4">
          <div className="flex items-start gap-3">
            <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-[1.5px] text-[#888]">
                When
              </p>
              <p className="text-[14px] font-semibold text-[#1A1A1A]">
                {formatSlot(slotStart)}
              </p>
              <p className="text-[12px] text-[#888]">{branch.name}</p>
            </div>
          </div>
        </div>

        {mode === 'at_home' && address && (
          <div className="rounded-2xl border border-[#E8E8E8] bg-white p-4">
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-[1.5px] text-[#888]">
                  Where
                </p>
                <p className="text-[14px] font-semibold text-[#1A1A1A]">
                  {address.street}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Cart */}
      <div
        className="overflow-hidden rounded-2xl border border-[#E8E8E8] bg-white"
        data-testid="review-cart"
      >
        <div className="border-b border-[#F0F0F0] bg-[#FAFAF8] px-4 py-2">
          <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-[#888]">
            Your cart
          </p>
        </div>
        <ul>
          {selected.map((svc, i) => {
            const price = displayPriceForMode(svc.base_price, mode);
            return (
              <li
                key={svc.id}
                className={`flex items-center justify-between gap-4 px-4 py-3 ${
                  i === selected.length - 1 ? '' : 'border-b border-[#F5F5F5]'
                }`}
                data-testid="review-cart-row"
                data-service-id={svc.id}
                data-service-price={price}
              >
                <span className="truncate text-[14px] text-[#1A1A1A]">
                  {svc.name}
                </span>
                <span className="shrink-0 text-[14px] font-semibold text-[#1A1A1A]">
                  Rs {formatPrice(price)}
                </span>
              </li>
            );
          })}
          {mode === 'at_home' && totals.service_charge > 0 && (
            <li
              className="flex items-center justify-between gap-4 border-t border-[#F0F0F0] bg-[#FAFAF8] px-4 py-3"
              data-testid="review-service-charge"
            >
              <div>
                <p className="text-[13px] text-[#1A1A1A]">Home service charge</p>
                <p className="text-[11px] text-[#888]">
                  Flat Rs {HOME_SERVICE_CHARGE} per home booking
                </p>
              </div>
              <span className="shrink-0 text-[14px] font-semibold text-[#1A1A1A]">
                Rs {formatPrice(totals.service_charge)}
              </span>
            </li>
          )}
          <li className="flex items-center justify-between gap-4 border-t border-[#1A1A1A]/10 bg-[#FAFAF8] px-4 py-3">
            <span className="text-[13px] font-bold text-[#1A1A1A]">
              Total (cash on service)
            </span>
            <span
              className="shrink-0 text-lg font-bold text-[#1A1A1A]"
              data-testid="review-total"
            >
              Rs {formatPrice(totals.consumer_total)}
            </span>
          </li>
        </ul>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <label
          htmlFor="notes"
          className="text-[12px] font-semibold text-[#1A1A1A]"
        >
          Notes for the salon <span className="text-[#888]">(optional)</span>
        </label>
        <Textarea
          id="notes"
          placeholder="Parking instructions, gate code, preferred stylist, etc."
          value={notes}
          maxLength={NOTES_MAX}
          onChange={(e) => onNotesChange(e.target.value.slice(0, NOTES_MAX))}
        />
        <p className="text-[11px] text-[#888]">
          {notes.length}/{NOTES_MAX}
        </p>
      </div>

      <div className="fixed inset-x-0 bottom-16 z-20 border-t border-[#E8E8E8] bg-white px-4 py-3 md:static md:border-0 md:bg-transparent md:p-0">
        <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3 md:max-w-none">
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            className="h-11"
            disabled={submitting}
          >
            Back
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={submitting || selected.length === 0 || !slotStart}
            className="h-11 bg-[#1A1A1A] px-6 text-[14px] font-bold text-white hover:bg-[#1A1A1A]/90 disabled:bg-[#BBB]"
            data-testid="review-submit"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Submitting
              </>
            ) : (
              'Confirm booking request'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
