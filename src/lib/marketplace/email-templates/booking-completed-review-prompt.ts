import { baseLayout, marketplaceButton, siteOrigin, H1_STYLE, P_STYLE, MUTED_STYLE, htmlToText } from './base-layout';
import { escapeHtml } from './format';

export interface BookingCompletedReviewPromptParams {
  consumerName: string;
  salonName: string;
  bookingId: string;
}

export function bookingCompletedReviewPromptTemplate(p: BookingCompletedReviewPromptParams): { subject: string; html: string; text: string } {
  const subject = `How was ${p.salonName}?`.slice(0, 49);
  const reviewUrl = `${siteOrigin()}/account/bookings/${encodeURIComponent(p.bookingId)}/review`;
  const preview = `Leave a quick rating for ${p.salonName} — open 7 days.`;

  const body = `
    <h1 style="${H1_STYLE}">How was it?</h1>
    <p style="${P_STYLE}">Hi <strong>${escapeHtml(p.consumerName)}</strong>,</p>
    <p style="${P_STYLE}">Thanks for booking with <strong>${escapeHtml(p.salonName)}</strong>. Your rating and a line or two of feedback helps other people pick a great salon.</p>
    <p style="${P_STYLE}">It takes less than 30 seconds.</p>
    ${marketplaceButton('Leave a Review', reviewUrl)}
    <p style="${MUTED_STYLE}">The review window closes 7 days after your appointment.</p>
  `;

  const html = baseLayout(body, preview);
  const text = [
    `How was it?`,
    ``,
    `Hi ${p.consumerName},`,
    ``,
    `Thanks for booking with ${p.salonName}. Your rating helps other people pick a great salon.`,
    ``,
    `Leave a review: ${reviewUrl}`,
    ``,
    `The review window closes 7 days after your appointment.`,
    ``,
    `— iCut`,
  ].join('\n');

  return { subject, html, text: text || htmlToText(html) };
}
