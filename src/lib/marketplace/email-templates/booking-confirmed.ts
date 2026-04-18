import { baseLayout, marketplaceButton, siteOrigin, H1_STYLE, P_STYLE, FACT_BOX_STYLE, MUTED_STYLE, htmlToText } from './base-layout';
import { escapeHtml, formatSlot, modeLabel, servicesListHtml, servicesListText, type BookingServiceLine } from './format';

export interface BookingConfirmedParams {
  consumerName: string;
  salonName: string;
  services: BookingServiceLine[];
  slotStart: Date | string;
  mode: 'in_salon' | 'home';
  address?: string;
  bookingId?: string;
}

export function bookingConfirmedTemplate(p: BookingConfirmedParams): { subject: string; html: string; text: string } {
  const subject = `Confirmed: ${p.salonName}`.slice(0, 49);
  const slot = formatSlot(p.slotStart);
  const bookingUrl = p.bookingId ? `${siteOrigin()}/account/bookings/${encodeURIComponent(p.bookingId)}` : `${siteOrigin()}/account/bookings`;
  const preview = `${p.salonName} confirmed your booking for ${slot}.`;

  const addressLine = p.mode === 'home' && p.address
    ? `<strong>Address:</strong> ${escapeHtml(p.address)}<br/>`
    : '';

  const expectations = p.mode === 'home'
    ? `<p style="${P_STYLE}">The stylist will contact you to confirm arrival and any last details. Please make sure the address and phone on your account are correct.</p>`
    : `<p style="${P_STYLE}">Arrive a few minutes early. If you can't make it, cancel from your bookings page so the salon can offer the slot to someone else.</p>`;

  const body = `
    <h1 style="${H1_STYLE}">You're booked!</h1>
    <p style="${P_STYLE}">Hi <strong>${escapeHtml(p.consumerName)}</strong>,</p>
    <p style="${P_STYLE}"><strong>${escapeHtml(p.salonName)}</strong> has confirmed your booking. Here's what to expect.</p>
    <div style="${FACT_BOX_STYLE}">
      <strong>When:</strong> ${escapeHtml(slot)}<br/>
      <strong>Where:</strong> ${modeLabel(p.mode)}<br/>
      ${addressLine}
    </div>
    <p style="${P_STYLE}"><strong>Services</strong></p>
    ${servicesListHtml(p.services)}
    ${expectations}
    ${marketplaceButton('View Booking', bookingUrl)}
    <p style="${MUTED_STYLE}">Can't make it? Cancel at least a few hours before your slot so the salon can re-book.</p>
  `;

  const html = baseLayout(body, preview);
  const text = [
    `You're booked!`,
    ``,
    `Hi ${p.consumerName},`,
    ``,
    `${p.salonName} has confirmed your booking.`,
    ``,
    `When: ${slot}`,
    `Where: ${modeLabel(p.mode)}`,
    p.mode === 'home' && p.address ? `Address: ${p.address}` : '',
    ``,
    `Services:`,
    servicesListText(p.services),
    ``,
    `View booking: ${bookingUrl}`,
    ``,
    `— iCut`,
  ].filter(Boolean).join('\n');

  return { subject, html, text: text || htmlToText(html) };
}
