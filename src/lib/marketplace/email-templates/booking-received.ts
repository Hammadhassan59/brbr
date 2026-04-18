import { baseLayout, marketplaceButton, siteOrigin, H1_STYLE, P_STYLE, FACT_BOX_STYLE, MUTED_STYLE, htmlToText } from './base-layout';
import { escapeHtml, formatSlot, modeLabel, servicesListHtml, servicesListText, type BookingServiceLine } from './format';

export interface BookingReceivedParams {
  consumerName: string;
  salonName: string;
  services: BookingServiceLine[];
  requestedSlot: Date | string;
  mode: 'in_salon' | 'home';
  consumerTotal: number;
  bookingId: string;
}

export function bookingReceivedTemplate(p: BookingReceivedParams): { subject: string; html: string; text: string } {
  const subject = `Booking request sent to ${p.salonName}`.slice(0, 49);
  const slot = formatSlot(p.requestedSlot);
  const bookingUrl = `${siteOrigin()}/account/bookings/${encodeURIComponent(p.bookingId)}`;
  const preview = `Waiting for ${p.salonName} to confirm your ${slot} booking.`;

  const body = `
    <h1 style="${H1_STYLE}">We got your request</h1>
    <p style="${P_STYLE}">Hi <strong>${escapeHtml(p.consumerName)}</strong>,</p>
    <p style="${P_STYLE}">Your booking request has been sent to <strong>${escapeHtml(p.salonName)}</strong>. We're waiting for them to confirm — you'll get another email as soon as they do (usually within a few hours).</p>
    <div style="${FACT_BOX_STYLE}">
      <strong>When:</strong> ${escapeHtml(slot)}<br/>
      <strong>Where:</strong> ${modeLabel(p.mode)}<br/>
      <strong>Total:</strong> Rs ${p.consumerTotal.toLocaleString('en-PK')}
    </div>
    <p style="${P_STYLE}"><strong>Services</strong></p>
    ${servicesListHtml(p.services)}
    ${marketplaceButton('View Booking', bookingUrl)}
    <p style="${MUTED_STYLE}">If the salon declines, we'll let you know right away and your booking will be cancelled at no charge.</p>
  `;

  const html = baseLayout(body, preview);
  const text = [
    `We got your request`,
    ``,
    `Hi ${p.consumerName},`,
    ``,
    `Your booking request has been sent to ${p.salonName}. We're waiting for them to confirm.`,
    ``,
    `When: ${slot}`,
    `Where: ${modeLabel(p.mode)}`,
    `Total: Rs ${p.consumerTotal.toLocaleString('en-PK')}`,
    ``,
    `Services:`,
    servicesListText(p.services),
    ``,
    `View booking: ${bookingUrl}`,
    ``,
    `— iCut`,
  ].join('\n');

  return { subject, html, text: text || htmlToText(html) };
}
