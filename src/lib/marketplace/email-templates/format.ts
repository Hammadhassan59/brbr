/**
 * Tiny formatting helpers shared across booking email templates.
 * Pure functions — no env reads, no side effects.
 */

export interface BookingServiceLine {
  name: string;
  displayPrice: number;
}

/** Render a bullet list of services as HTML. */
export function servicesListHtml(services: BookingServiceLine[]): string {
  if (!services.length) return '';
  const items = services
    .map(
      (s) =>
        `<li style="margin:0 0 4px 0;">${escapeHtml(s.name)} — <strong>Rs ${s.displayPrice.toLocaleString('en-PK')}</strong></li>`
    )
    .join('');
  return `<ul style="margin:0 0 16px 0;padding-left:20px;font-size:14px;color:#1A1A1A;line-height:1.6;">${items}</ul>`;
}

/** Render the same list as plain text. */
export function servicesListText(services: BookingServiceLine[]): string {
  return services.map((s) => `  - ${s.name} — Rs ${s.displayPrice.toLocaleString('en-PK')}`).join('\n');
}

/**
 * Format a Date / ISO string as "Sun, 19 Apr 2026, 3:00 PM" in Asia/Karachi.
 * PKT is UTC+5 with no DST, so the formatter is stable.
 */
export function formatSlot(input: Date | string): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return String(input);
  try {
    return new Intl.DateTimeFormat('en-PK', {
      timeZone: 'Asia/Karachi',
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

/** HTML-escape user-supplied content. Templates are string builders; this is our safety net. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Human label for booking location mode. */
export function modeLabel(mode: 'in_salon' | 'home'): string {
  return mode === 'home' ? 'At your home' : 'At the salon';
}
