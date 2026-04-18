/**
 * Checkout entry page — `/book/[slug]`.
 *
 * Server component. Resolves the branch + session + mode on the server, then
 * hands off to the client `<BookingWizard />` for the step-by-step flow.
 *
 * Gating order (anything that fails redirects or 404s):
 *   1. `getBranchBySlug(slug)` — applies every marketplace visibility filter
 *      already. Returns null → `notFound()`.
 *   2. Session — `/sign-up?next=/book/[slug]` if there's no consumer session.
 *      (The consumer registers, verifies email, lands back here.)
 *   3. Mode gate — if the cookie says `at_home` but the branch doesn't offer
 *      home service, bounce back to the salon profile in `at_salon` mode so
 *      the user still gets the hero + service menu without a confusing
 *      disabled CTA. A query param (`?nudge=no-home`) lets the profile page
 *      surface an amber banner explaining what happened.
 */
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';

import {
  MARKETPLACE_MODE_COOKIE,
  MARKETPLACE_MODE_DEFAULT,
  type MarketplaceMode,
} from '@/lib/marketplace/mode';
import { getBranchBySlug } from '@/lib/marketplace/queries';
import { getConsumerSession } from '@/lib/consumer-session';
import { listConsumerAddresses } from '@/app/actions/consumer-addresses';
import { getRebookPrefillForBranch } from '@/lib/marketplace/rebook';

import { BookingWizard } from './components/booking-wizard';

export const metadata: Metadata = {
  title: 'Complete your booking',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function readMode(cookieValue: string | undefined): MarketplaceMode {
  if (cookieValue === 'at_salon' || cookieValue === 'at_home') {
    return cookieValue;
  }
  return MARKETPLACE_MODE_DEFAULT;
}

export default async function BookPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;

  const branch = await getBranchBySlug(slug);
  if (!branch) notFound();

  const session = await getConsumerSession();
  if (!session) {
    redirect(`/sign-up?next=/book/${slug}`);
  }

  const cookieStore = await cookies();
  const mode = readMode(cookieStore.get(MARKETPLACE_MODE_COOKIE)?.value);

  // Mode gate — the UI at `/barber/[slug]` already shows a banner when this
  // happens, so we just redirect there with a nudge flag.
  if (mode === 'at_home' && !branch.offers_home_service) {
    redirect(`/barber/${slug}?nudge=no-home`);
  }

  // Preload saved addresses for home mode so step 1 renders instantly with
  // the radio list. For at-salon mode this is skipped entirely (step 1 isn't
  // shown). `.data` defaults to [] on error — saved-addresses aren't critical.
  const savedAddresses =
    mode === 'at_home'
      ? await listConsumerAddresses()
          .then((r) => (r.ok ? r.data : []))
          .catch(() => [])
      : [];

  // Optional `?step=` query param for back-button navigation inside the
  // wizard. Validated / clamped by the client.
  const rawStep = typeof sp.step === 'string' ? sp.step : undefined;
  const initialStep = rawStep ? Number.parseInt(rawStep, 10) : undefined;

  // Optional `?rebook=<bookingId>` deep-link — `/account/bookings/[id]` "Book
  // again" CTA routes here. We resolve the prefill server-side so the client
  // never sees mismatched booking state (different salon, stale services,
  // deleted address, etc). Silent no-op on any mismatch.
  const rawRebook = typeof sp.rebook === 'string' ? sp.rebook : undefined;
  const rebookPrefill = rawRebook
    ? await getRebookPrefillForBranch(rawRebook, branch.id, session.userId)
    : { serviceIds: [], addressId: null };

  return (
    <div className="mx-auto w-full max-w-md px-5 py-6 pb-28 md:max-w-2xl md:py-10">
      <BookingWizard
        branch={{
          id: branch.id,
          name: branch.name,
          slug: branch.slug,
          lat: branch.lat,
          lng: branch.lng,
          offers_home_service: branch.offers_home_service,
          home_service_radius_km: branch.home_service_radius_km,
          working_hours: branch.working_hours,
          services: branch.services,
        }}
        mode={mode}
        consumer={{
          userId: session.userId,
          name: session.name,
          phone: session.phone,
        }}
        savedAddresses={savedAddresses}
        initialStep={Number.isFinite(initialStep) ? initialStep : undefined}
        initialServiceIds={rebookPrefill.serviceIds}
        initialAddressId={rebookPrefill.addressId ?? undefined}
      />
    </div>
  );
}
