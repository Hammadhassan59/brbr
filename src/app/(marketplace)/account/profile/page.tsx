/**
 * /account/profile — consumer profile page.
 *
 * Server component. Loads the current consumer's `consumers` row + auth email
 * through `getConsumerProfile`, then renders a client form with three
 * sections (personal info, email, password) per the marketplace Phase 1
 * spec at `docs/superpowers/plans/2026-04-18-marketplace-phase-0-1.md`.
 *
 * Auth gate and container/side-rail layout are both handled by
 * `src/app/(marketplace)/account/layout.tsx` — this page only renders its
 * own content and relies on the layout's redirect to `/sign-in` if there is
 * no consumer session. We still call `getConsumerSession()` once defensively
 * so a race between layout and page renders doesn't flash raw error state.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getConsumerSession } from '@/lib/consumer-session';
import { getConsumerProfile } from '@/app/actions/consumer-profile';

import { ProfileForm } from './profile-form';

export const metadata: Metadata = {
  title: 'Your profile',
  robots: { index: false, follow: false },
};

export default async function ProfilePage() {
  const session = await getConsumerSession();
  if (!session) redirect('/sign-in?next=/account/profile');

  const res = await getConsumerProfile();
  if (!res.ok) {
    return (
      <div className="space-y-5">
        <header>
          <h1 className="font-heading text-2xl font-bold text-[#1A1A1A]">
            Your profile
          </h1>
        </header>
        <div
          role="alert"
          className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-900"
        >
          {res.error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-heading text-2xl font-bold text-[#1A1A1A]">
          Your profile
        </h1>
        <p className="mt-1 text-[13px] text-[#888]">
          Update your details and password. Email changes require you to confirm a link sent to your new address.
        </p>
      </header>

      <ProfileForm
        initialName={res.data.name}
        initialPhone={res.data.phone}
        initialEmail={res.data.email}
      />
    </div>
  );
}
