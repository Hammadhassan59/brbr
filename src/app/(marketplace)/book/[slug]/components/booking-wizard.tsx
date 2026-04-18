'use client';

/**
 * Booking wizard — orchestrates the 4-step checkout flow defined in the
 * 2026-04-18 marketplace plan (Week 3, "Cart + checkout").
 *
 * Steps (home mode shows all 4; at-salon skips step 1):
 *   1. Address (home only)
 *   2. Services
 *   3. Time slot
 *   4. Review + submit → createBooking
 *
 * State management: `useReducer` rather than a bag of `useState`s because the
 * step transitions and cross-step invariants (selected service price map,
 * validated address, timezone-safe slot) benefit from a single atomic update.
 * The reducer also makes it trivial to URL-encode the current step via
 * `?step=N` — the `setStep` action is the only place that touches history.
 *
 * URL-step sync: `history.replaceState` (not `router.replace`) so back/forward
 * navigates through steps without a server round-trip. The server page reads
 * `?step=` on initial render for deep-links / refresh.
 *
 * At each step we validate locally, then advance; the final submit calls the
 * `createBooking` server action. On ok we router.replace to the booking
 * detail page; on error we toast and stay on review.
 */

import { useCallback, useEffect, useReducer } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

import { createBooking } from '@/app/actions/bookings';
import type { ConsumerAddress } from '@/app/actions/consumer-addresses';
import type { MarketplaceMode } from '@/lib/marketplace/mode';

import { StepAddress } from './step-address';
import { StepServices } from './step-services';
import { StepSlot } from './step-slot';
import { StepReview } from './step-review';
import { Stepper } from './stepper';
import type { WizardBranch, WizardConsumer } from './types';

// ───────────────────────────── Reducer ─────────────────────────────

interface WizardState {
  step: 1 | 2 | 3 | 4;
  /** Address for home mode. Either a saved row (id + fields) or a newly
   *  created one (also has an id after save). For at-salon mode this stays
   *  null forever. */
  address: {
    id: string | null;
    street: string;
    lat: number;
    lng: number;
  } | null;
  /** Service IDs selected by the consumer. Order preserved for display. */
  selectedServiceIds: string[];
  /** Chosen ISO slot start/end. `null` until step 3 is completed. */
  slotStart: string | null;
  slotEnd: string | null;
  /** Notes for the salon — max 200 chars per spec. */
  notes: string;
  /** True while the final submit is in flight. */
  submitting: boolean;
}

type WizardAction =
  | { type: 'SET_STEP'; step: 1 | 2 | 3 | 4 }
  | { type: 'SET_ADDRESS'; address: WizardState['address'] }
  | { type: 'TOGGLE_SERVICE'; serviceId: string }
  | { type: 'SET_SLOT'; slotStart: string; slotEnd: string }
  | { type: 'SET_NOTES'; notes: string }
  | { type: 'SUBMITTING'; submitting: boolean };

function reducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: action.step };
    case 'SET_ADDRESS':
      return { ...state, address: action.address };
    case 'TOGGLE_SERVICE': {
      const has = state.selectedServiceIds.includes(action.serviceId);
      return {
        ...state,
        selectedServiceIds: has
          ? state.selectedServiceIds.filter((id) => id !== action.serviceId)
          : [...state.selectedServiceIds, action.serviceId],
      };
    }
    case 'SET_SLOT':
      return {
        ...state,
        slotStart: action.slotStart,
        slotEnd: action.slotEnd,
      };
    case 'SET_NOTES':
      return { ...state, notes: action.notes };
    case 'SUBMITTING':
      return { ...state, submitting: action.submitting };
    default:
      return state;
  }
}

// ───────────────────────────── Component ─────────────────────────────

interface Props {
  branch: WizardBranch;
  mode: MarketplaceMode;
  consumer: WizardConsumer;
  savedAddresses: ConsumerAddress[];
  initialStep?: number;
  /**
   * Rebook prefill — pre-selected service IDs carried over from a past
   * completed booking (`/account/bookings/[id]` → "Book again" CTA wires
   * this via `?rebook=<bookingId>`). IDs are validated server-side against
   * the branch's current service catalog; unknown IDs are dropped before
   * they reach this component.
   */
  initialServiceIds?: string[];
  /**
   * Rebook prefill — the address row to pre-select if the old booking was a
   * home booking AND the address still exists in the consumer's address book.
   * Overrides the usual default-first selection in home mode.
   */
  initialAddressId?: string;
}

/** The first step number the wizard can legally show for this mode. */
function firstStepForMode(mode: MarketplaceMode): 1 | 2 {
  return mode === 'at_home' ? 1 : 2;
}

function clampStep(n: number, mode: MarketplaceMode): 1 | 2 | 3 | 4 {
  const min = firstStepForMode(mode);
  if (n < min) return min;
  if (n > 4) return 4;
  if (n === 1 || n === 2 || n === 3 || n === 4) return n;
  return min;
}

export function BookingWizard({
  branch,
  mode,
  consumer,
  savedAddresses,
  initialStep,
  initialServiceIds,
  initialAddressId,
}: Props) {
  const router = useRouter();

  const [state, dispatch] = useReducer(reducer, {
    step: clampStep(initialStep ?? firstStepForMode(mode), mode),
    address:
      mode === 'at_home'
        ? (() => {
            // Rebook: prefer the explicitly re-picked address if it's still
            // in the book. Otherwise default-first selection as before.
            const rebook = initialAddressId
              ? savedAddresses.find((a) => a.id === initialAddressId)
              : undefined;
            const def = rebook ?? savedAddresses.find((a) => a.is_default) ?? savedAddresses[0];
            if (!def) return null;
            return { id: def.id, street: def.street, lat: def.lat, lng: def.lng };
          })()
        : null,
    selectedServiceIds: (() => {
      if (!initialServiceIds || initialServiceIds.length === 0) return [];
      // Only keep IDs that map to a service currently offered by this branch
      // in this mode — "home" filters out non-available-at-home lines. Keeps
      // the cart clean if the catalog changed between bookings.
      const visibleIds = new Set(
        (mode === 'at_home'
          ? branch.services.filter((s) => s.available_at_home !== false)
          : branch.services
        ).map((s) => s.id),
      );
      return initialServiceIds.filter((id) => visibleIds.has(id));
    })(),
    slotStart: null,
    slotEnd: null,
    notes: '',
    submitting: false,
  });

  // Keep the URL in sync with the current step so the browser back button
  // navigates steps instead of leaving the wizard. `replaceState` keeps the
  // history slim — one entry per wizard regardless of how many steps were
  // traversed. Hash-based step tracking would work too, but `?step=` is
  // clearer in shared URLs + analytics.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (String(state.step) !== url.searchParams.get('step')) {
      url.searchParams.set('step', String(state.step));
      window.history.replaceState({}, '', url.toString());
    }
  }, [state.step]);

  const setStep = useCallback((step: 1 | 2 | 3 | 4) => {
    dispatch({ type: 'SET_STEP', step });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (state.submitting) return;
    if (state.selectedServiceIds.length === 0) {
      toast.error('Pick at least one service');
      setStep(2);
      return;
    }
    if (!state.slotStart || !state.slotEnd) {
      toast.error('Pick a time slot');
      setStep(3);
      return;
    }
    if (mode === 'at_home' && !state.address) {
      toast.error('Add a delivery address');
      setStep(1);
      return;
    }

    dispatch({ type: 'SUBMITTING', submitting: true });
    try {
      const payload = {
        branchId: branch.id,
        serviceIds: state.selectedServiceIds,
        slotStart: state.slotStart,
        slotEnd: state.slotEnd,
        mode: (mode === 'at_home' ? 'home' : 'in_salon') as 'home' | 'in_salon',
        notes: state.notes.trim() ? state.notes.trim() : undefined,
        ...(mode === 'at_home' && state.address
          ? {
              addressId: state.address.id ?? undefined,
              addressStreet: state.address.street,
              addressLat: state.address.lat,
              addressLng: state.address.lng,
            }
          : {}),
      };

      const res = await createBooking(payload);
      if (!res.ok) {
        toast.error(res.error);
        dispatch({ type: 'SUBMITTING', submitting: false });
        return;
      }
      // Redirect — no point setting submitting=false, we're navigating away.
      router.replace(`/account/bookings/${res.data.bookingId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Booking failed');
      dispatch({ type: 'SUBMITTING', submitting: false });
    }
  }, [
    state.submitting,
    state.selectedServiceIds,
    state.slotStart,
    state.slotEnd,
    state.notes,
    state.address,
    branch.id,
    mode,
    router,
    setStep,
  ]);

  return (
    <section aria-label="Booking flow">
      <header className="mb-5">
        <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-gold">
          Booking {mode === 'at_home' ? 'at home' : 'at salon'}
        </p>
        <h1 className="mt-1 font-heading text-2xl font-bold text-[#1A1A1A]">
          {branch.name}
        </h1>
      </header>

      <Stepper current={state.step} mode={mode} onJump={setStep} />

      <div className="mt-6">
        {state.step === 1 && mode === 'at_home' && (
          <StepAddress
            branch={branch}
            savedAddresses={savedAddresses}
            address={state.address}
            onChange={(address) => dispatch({ type: 'SET_ADDRESS', address })}
            onContinue={() => setStep(2)}
          />
        )}
        {state.step === 2 && (
          <StepServices
            services={branch.services}
            mode={mode}
            selectedIds={state.selectedServiceIds}
            onToggle={(serviceId) =>
              dispatch({ type: 'TOGGLE_SERVICE', serviceId })
            }
            onBack={mode === 'at_home' ? () => setStep(1) : undefined}
            onContinue={() => setStep(3)}
          />
        )}
        {state.step === 3 && (
          <StepSlot
            workingHours={branch.working_hours}
            services={branch.services}
            selectedIds={state.selectedServiceIds}
            slotStart={state.slotStart}
            slotEnd={state.slotEnd}
            onSlot={(slotStart, slotEnd) =>
              dispatch({ type: 'SET_SLOT', slotStart, slotEnd })
            }
            onBack={() => setStep(2)}
            onContinue={() => setStep(4)}
          />
        )}
        {state.step === 4 && (
          <StepReview
            branch={branch}
            mode={mode}
            services={branch.services}
            selectedIds={state.selectedServiceIds}
            slotStart={state.slotStart}
            slotEnd={state.slotEnd}
            address={state.address}
            notes={state.notes}
            onNotesChange={(notes) => dispatch({ type: 'SET_NOTES', notes })}
            onBack={() => setStep(3)}
            onSubmit={handleSubmit}
            submitting={state.submitting}
            consumer={consumer}
          />
        )}
      </div>
    </section>
  );
}
