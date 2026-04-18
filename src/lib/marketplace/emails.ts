/**
 * Marketplace consumer notifications (email only — decision 9 of
 * docs/superpowers/plans/2026-04-18-marketplace-phase-0-1.md).
 *
 * Every sender function:
 *   - Reads `process.env.RESEND_API_KEY` at call time (never cached at
 *     module scope — makes envless tests trivial).
 *   - Calls Resend's REST API with `fetch` (no SDK dep).
 *   - Returns { ok: true } | { ok: false, error: string }, never throws.
 *     Email failures must NEVER cascade into a booking server action.
 *
 * The consumer-facing sender domain is the constant `FROM` below. The
 * owner will verify `icut.pk` in Resend separately; until then Resend
 * will reject these sends with 403 (which we surface as { ok: false }).
 *
 * This module intentionally does NOT reuse src/lib/email-sender.ts —
 * that module loads per-salon Resend keys from platform_settings. For
 * marketplace consumer mails, we use the platform-wide RESEND_API_KEY
 * directly so a salon's bad config can't break consumer notifications.
 */

import { bookingReceivedTemplate, type BookingReceivedParams } from './email-templates/booking-received';
import { bookingConfirmedTemplate, type BookingConfirmedParams } from './email-templates/booking-confirmed';
import { bookingDeclinedTemplate, type BookingDeclinedParams } from './email-templates/booking-declined';
import { bookingCancelledBySalonTemplate, type BookingCancelledBySalonParams } from './email-templates/booking-cancelled-by-salon';
import { bookingCompletedReviewPromptTemplate, type BookingCompletedReviewPromptParams } from './email-templates/booking-completed-review-prompt';
import { salonHomeBookingReviewPromptTemplate, type SalonHomeBookingReviewPromptParams } from './email-templates/salon-home-booking-review-prompt';

const FROM = 'iCut <no-reply@icut.pk>';
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export type SendResult = { ok: true } | { ok: false; error: string };

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Low-level Resend POST. Never throws. On any failure, returns a user-safe
 * error string and logs details to the server console.
 */
async function sendViaResend(args: SendArgs): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[marketplace/emails] RESEND_API_KEY unset; skipping send.');
    return { ok: false, error: 'Email service not configured' };
  }

  if (!args.to || typeof args.to !== 'string') {
    return { ok: false, error: 'Missing recipient address' };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: args.to,
        subject: args.subject,
        html: args.html,
        text: args.text,
      }),
    });

    if (!res.ok) {
      // Resend surfaces errors as JSON { message, name, statusCode } most
      // of the time, but fall back to raw text for infra-layer failures.
      let errorMessage = `Resend ${res.status}`;
      try {
        const payload = await res.json();
        if (payload && typeof payload === 'object' && 'message' in payload) {
          errorMessage = `${errorMessage}: ${String((payload as { message: unknown }).message).slice(0, 200)}`;
        }
      } catch {
        try {
          const txt = await res.text();
          if (txt) errorMessage = `${errorMessage}: ${txt.slice(0, 200)}`;
        } catch {
          /* ignore — we have at least the status code */
        }
      }
      console.error(`[marketplace/emails] send failed to=${args.to} subject=${JSON.stringify(args.subject)} error=${errorMessage}`);
      return { ok: false, error: errorMessage };
    }

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown network error';
    console.error(`[marketplace/emails] network failure to=${args.to} error=${msg}`);
    return { ok: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Public sender functions
// ---------------------------------------------------------------------------

export async function sendBookingReceivedEmail(
  params: BookingReceivedParams & { to: string }
): Promise<SendResult> {
  const { to, ...rest } = params;
  const { subject, html, text } = bookingReceivedTemplate(rest);
  return sendViaResend({ to, subject, html, text });
}

export async function sendBookingConfirmedEmail(
  params: BookingConfirmedParams & { to: string }
): Promise<SendResult> {
  const { to, ...rest } = params;
  const { subject, html, text } = bookingConfirmedTemplate(rest);
  return sendViaResend({ to, subject, html, text });
}

export async function sendBookingDeclinedEmail(
  params: BookingDeclinedParams & { to: string }
): Promise<SendResult> {
  const { to, ...rest } = params;
  const { subject, html, text } = bookingDeclinedTemplate(rest);
  return sendViaResend({ to, subject, html, text });
}

export async function sendBookingCancelledBySalonEmail(
  params: BookingCancelledBySalonParams & { to: string }
): Promise<SendResult> {
  const { to, ...rest } = params;
  const { subject, html, text } = bookingCancelledBySalonTemplate(rest);
  return sendViaResend({ to, subject, html, text });
}

export async function sendBookingCompletedReviewPromptEmail(
  params: BookingCompletedReviewPromptParams & { to: string }
): Promise<SendResult> {
  const { to, ...rest } = params;
  const { subject, html, text } = bookingCompletedReviewPromptTemplate(rest);
  return sendViaResend({ to, subject, html, text });
}

export async function sendSalonHomeBookingReviewPromptEmail(
  params: SalonHomeBookingReviewPromptParams & { to: string }
): Promise<SendResult> {
  const { to, ...rest } = params;
  const { subject, html, text } = salonHomeBookingReviewPromptTemplate(rest);
  return sendViaResend({ to, subject, html, text });
}

// Exported for tests only.
export const __internal = { FROM, RESEND_ENDPOINT };
