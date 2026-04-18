/**
 * /account/notifications — consumer email-notification preferences.
 *
 * Server component. Loads `consumers.notification_prefs` via
 * `getConsumerProfile`, applies defaults for any missing keys (migration 041
 * default is `{"booking_updates":true,"promos":false}`), and hands the
 * resolved map to a client form component for toggling.
 *
 * Phase 1 emits consumer-facing notifications via email only (see plan
 * decision 9 — no WhatsApp, no SMS, no PWA push). This page is the consumer's
 * knob to choose which categories they want emails for.
 *
 * Keys shown on this page (kept small and stable; the schema is flexible
 * though — see `updateConsumerNotificationPrefs` for the merge semantics):
 *   - booking_updates    — email on booking status changes.
 *   - review_reminders   — remind to leave a review after a booking.
 *   - promos             — marketing offers / new salons.
 *
 * Auth gate + container are handled by `src/app/(marketplace)/account/layout.tsx`.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getConsumerSession } from '@/lib/consumer-session';
import { getConsumerProfile } from '@/app/actions/consumer-profile';

import { NotificationsForm, type NotificationPref } from './notifications-form';

export const metadata: Metadata = {
  title: 'Notification settings',
  robots: { index: false, follow: false },
};

/**
 * Canonical list of notification preference keys the UI knows about. Each
 * row carries default, human-readable title + description. The server-action
 * merge semantics mean arbitrary future keys on a consumer's row will survive
 * updates — we just don't render them here until a deploy adds them to this
 * list.
 */
const PREFS: NotificationPref[] = [
  {
    key: 'booking_updates',
    title: 'Booking status updates',
    description:
      'Email me when a salon confirms, declines, or changes my booking.',
    defaultValue: true,
  },
  {
    key: 'review_reminders',
    title: 'Review reminders',
    description:
      'Remind me to leave a review after a completed booking.',
    defaultValue: true,
  },
  {
    key: 'promos',
    title: 'Offers and new salons',
    description:
      'Occasional emails about discounts, new salons, and home-service expansion near you.',
    defaultValue: false,
  },
];

export default async function NotificationsPage() {
  const session = await getConsumerSession();
  if (!session) redirect('/sign-in?next=/account/notifications');

  const res = await getConsumerProfile();
  if (!res.ok) {
    return (
      <div className="space-y-5">
        <header>
          <h1 className="font-heading text-2xl font-bold text-[#1A1A1A]">
            Notifications
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

  // Merge stored prefs onto defaults so any key the user hasn't explicitly
  // set yet gets its canonical default on first render. If the stored blob
  // already has the key, its value wins.
  const stored = res.data.notificationPrefs;
  const resolved: Record<string, boolean> = {};
  for (const p of PREFS) {
    resolved[p.key] = typeof stored[p.key] === 'boolean' ? stored[p.key] : p.defaultValue;
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-heading text-2xl font-bold text-[#1A1A1A]">
          Notifications
        </h1>
        <p className="mt-1 text-[13px] text-[#888]">
          Choose which emails you want from iCut. We never send SMS or WhatsApp.
        </p>
      </header>

      <NotificationsForm prefs={PREFS} initialValues={resolved} />
    </div>
  );
}
