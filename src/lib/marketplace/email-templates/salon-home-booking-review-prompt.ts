import { baseLayout, marketplaceButton, siteOrigin, H1_STYLE, P_STYLE, MUTED_STYLE, htmlToText } from './base-layout';
import { escapeHtml } from './format';

export interface SalonHomeBookingReviewPromptParams {
  salonOwnerName: string;
  consumerFirstName: string;
  bookingId: string;
}

export function salonHomeBookingReviewPromptTemplate(p: SalonHomeBookingReviewPromptParams): { subject: string; html: string; text: string } {
  const subject = `Rate your home visit to ${p.consumerFirstName}`.slice(0, 49);
  // Home-booking consumer reviews live inside the owner dashboard, not /account/.
  const reviewUrl = `${siteOrigin()}/dashboard/marketplace/bookings/${encodeURIComponent(p.bookingId)}/review-consumer`;
  const preview = `Quick rating for ${p.consumerFirstName} — helps other salons trust the booking.`;

  const body = `
    <h1 style="${H1_STYLE}">How was the home visit?</h1>
    <p style="${P_STYLE}">Hi <strong>${escapeHtml(p.salonOwnerName)}</strong>,</p>
    <p style="${P_STYLE}">Your stylist just finished a home booking with <strong>${escapeHtml(p.consumerFirstName)}</strong>. Rating customers on home bookings helps other salons decide whether to accept future requests from them.</p>
    ${marketplaceButton('Rate Customer', reviewUrl)}
    <p style="${MUTED_STYLE}">The review window closes 7 days after the appointment.</p>
  `;

  const html = baseLayout(body, preview);
  const text = [
    `How was the home visit?`,
    ``,
    `Hi ${p.salonOwnerName},`,
    ``,
    `Your stylist just finished a home booking with ${p.consumerFirstName}. Rating customers on home bookings helps other salons decide whether to accept future requests.`,
    ``,
    `Rate customer: ${reviewUrl}`,
    ``,
    `The review window closes 7 days after the appointment.`,
    ``,
    `— iCut`,
  ].join('\n');

  return { subject, html, text: text || htmlToText(html) };
}
