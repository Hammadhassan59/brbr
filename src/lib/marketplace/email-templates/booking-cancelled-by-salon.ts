import { baseLayout, marketplaceButton, siteOrigin, H1_STYLE, P_STYLE, MUTED_STYLE, htmlToText } from './base-layout';
import { escapeHtml } from './format';

export interface BookingCancelledBySalonParams {
  consumerName: string;
  salonName: string;
  reason?: string;
}

export function bookingCancelledBySalonTemplate(p: BookingCancelledBySalonParams): { subject: string; html: string; text: string } {
  const subject = `Your booking at ${p.salonName} was cancelled`.slice(0, 49);
  const browseUrl = `${siteOrigin()}/`;
  const preview = `${p.salonName} cancelled your booking. No charge was made.`;

  const reasonBlock = p.reason
    ? `<p style="${P_STYLE}"><strong>Reason from the salon:</strong> ${escapeHtml(p.reason)}</p>`
    : '';

  const body = `
    <h1 style="${H1_STYLE}">Your booking was cancelled</h1>
    <p style="${P_STYLE}">Hi <strong>${escapeHtml(p.consumerName)}</strong>,</p>
    <p style="${P_STYLE}"><strong>${escapeHtml(p.salonName)}</strong> had to cancel your confirmed booking. We know that's frustrating — sorry for the hassle. No charge was made.</p>
    ${reasonBlock}
    <p style="${P_STYLE}">You can rebook with another salon in a few taps.</p>
    ${marketplaceButton('Find Another Salon', browseUrl)}
    <p style="${MUTED_STYLE}">Reply to this email if you'd like us to follow up with the salon on your behalf.</p>
  `;

  const html = baseLayout(body, preview);
  const text = [
    `Your booking was cancelled`,
    ``,
    `Hi ${p.consumerName},`,
    ``,
    `${p.salonName} had to cancel your confirmed booking. No charge was made.`,
    p.reason ? `\nReason from the salon: ${p.reason}` : '',
    ``,
    `Find another salon: ${browseUrl}`,
    ``,
    `— iCut`,
  ].filter(Boolean).join('\n');

  return { subject, html, text: text || htmlToText(html) };
}
