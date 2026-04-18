/**
 * Shared HTML skeleton for marketplace emails.
 *
 * Brand palette (matches public/manifest.json):
 *   - theme_color       → #1A1A1A (near-black, used in header/footer bars)
 *   - background_color  → #F2F2F2 (outer canvas)
 *   - accent            → #F0B000 (gold CTA, matches src/lib/email-layout.ts)
 *
 * Tables-based layout for broad email-client support (Outlook, Gmail,
 * Apple Mail). All CSS inlined; no external assets. `<style>` tags live
 * only inside elements where email clients reliably support them.
 *
 * Kept separate from the owner-side src/lib/email-layout.ts because the
 * marketplace consumer voice is different (first-person consumer, "you got
 * booked" vs "your salon sent a receipt") and the footer copy differs —
 * consumer emails link to /account/bookings, owner emails link to /dashboard.
 */

const FONT_STACK = 'Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif';

/**
 * Build a gold CTA button as an inline table. Safe for Outlook.
 */
export function marketplaceButton(text: string, url: string): string {
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="background:#F0B000;padding:0;">
            <a href="${url}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-family:${FONT_STACK};font-size:14px;font-weight:bold;color:#1A1A1A;text-decoration:none;">${text}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

/**
 * Wrap body HTML in the iCut brand shell. `previewText` is the snippet
 * that shows next to the subject in most inbox lists.
 */
export function baseLayout(body: string, previewText: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>iCut</title>
</head>
<body style="margin:0;padding:0;background:#F2F2F2;font-family:${FONT_STACK};">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#F2F2F2;line-height:1px;">${previewText}&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F2F2F2;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">
          <tr>
            <td style="background:#1A1A1A;padding:20px 32px;">
              <a href="https://icut.pk" style="text-decoration:none;">
                <span style="font-family:${FONT_STACK};font-size:22px;font-weight:bold;color:#F0B000;">&#9986; iCut</span>
              </a>
            </td>
          </tr>
          <tr>
            <td style="background:#FFFFFF;padding:32px;">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="background:#1A1A1A;padding:20px 32px;">
              <p style="margin:0 0 6px 0;font-family:${FONT_STACK};font-size:13px;color:#EFEFEF;">Need help?</p>
              <p style="margin:0 0 10px 0;font-family:${FONT_STACK};font-size:13px;color:#EFEFEF;">
                <a href="mailto:support@icut.pk" style="color:#F0B000;text-decoration:none;font-weight:600;">support@icut.pk</a>
              </p>
              <p style="margin:0;font-family:${FONT_STACK};font-size:11px;color:#EFEFEF;opacity:0.5;">&#169; 2026 iCut by Inparlor Technologies Pvt Ltd</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Shared paragraph styling for consistent body copy. */
export const P_STYLE = `margin:0 0 16px 0;font-family:${FONT_STACK};font-size:15px;color:#1A1A1A;line-height:1.6;`;
/** Shared H1 styling. */
export const H1_STYLE = `margin:0 0 16px 0;font-family:${FONT_STACK};font-size:22px;font-weight:bold;color:#1A1A1A;`;
/** Muted fine-print styling. */
export const MUTED_STYLE = `margin:24px 0 0 0;font-family:${FONT_STACK};font-size:13px;color:#1A1A1A;opacity:0.6;`;
/** Emphasis box used for key facts (slot time, totals). */
export const FACT_BOX_STYLE = `background:#F7F7F7;border-left:3px solid #F0B000;padding:12px 16px;margin:0 0 20px 0;font-family:${FONT_STACK};font-size:14px;color:#1A1A1A;line-height:1.6;`;

/**
 * Strip HTML tags to produce a reasonable plain-text fallback. Collapses
 * whitespace. Not a full parser — our templates don't use nested HTML
 * in ways that break this. Resend accepts `text` alongside `html` and
 * some clients (enterprise Outlook, old iOS) prefer the text view.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#847;/g, '')
    .replace(/&#9986;/g, '')
    .replace(/&#169;/g, '(c)')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Public site origin — used to build deep links inside emails. */
export function siteOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://icut.pk';
}
