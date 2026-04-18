import { baseLayout, marketplaceButton, siteOrigin, H1_STYLE, P_STYLE, MUTED_STYLE, htmlToText } from './base-layout';
import { escapeHtml } from './format';

export interface BookingDeclinedParams {
  consumerName: string;
  salonName: string;
  reason?: string;
}

export function bookingDeclinedTemplate(p: BookingDeclinedParams): { subject: string; html: string; text: string } {
  const subject = `Booking at ${p.salonName} couldn't go ahead`.slice(0, 49);
  const browseUrl = `${siteOrigin()}/`;
  const preview = `${p.salonName} can't take this booking — find another salon nearby.`;

  const reasonBlock = p.reason
    ? `<p style="${P_STYLE}"><strong>Reason from the salon:</strong> ${escapeHtml(p.reason)}</p>`
    : '';

  const body = `
    <h1 style="${H1_STYLE}">This booking couldn't go ahead</h1>
    <p style="${P_STYLE}">Hi <strong>${escapeHtml(p.consumerName)}</strong>,</p>
    <p style="${P_STYLE}">Sorry — <strong>${escapeHtml(p.salonName)}</strong> can't take your booking this time. No charge was made.</p>
    ${reasonBlock}
    <p style="${P_STYLE}">There are plenty of other salons on iCut, and many can take you today or tomorrow.</p>
    ${marketplaceButton('Find Another Salon', browseUrl)}
    <p style="${MUTED_STYLE}">If you think this was a mistake, reply to this email and we'll look into it.</p>
  `;

  const html = baseLayout(body, preview);
  const text = [
    `This booking couldn't go ahead`,
    ``,
    `Hi ${p.consumerName},`,
    ``,
    `Sorry — ${p.salonName} can't take your booking this time. No charge was made.`,
    p.reason ? `\nReason from the salon: ${p.reason}` : '',
    ``,
    `Find another salon: ${browseUrl}`,
    ``,
    `— iCut`,
  ].filter(Boolean).join('\n');

  return { subject, html, text: text || htmlToText(html) };
}
