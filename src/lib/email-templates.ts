export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  variables: string[];
}

import { wrapEmailHtml, emailButton } from './email-layout';

export const DEFAULT_EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'winback',
    name: 'Win-Back Email',
    subject: 'We miss you, {client_name}!',
    body: `Hi {client_name},

It's been a while since your last visit to {salon_name}. We'd love to see you again!

As a welcome-back treat, enjoy 10% OFF your next appointment.

Book now: {booking_link}

Warm regards,
{salon_name} Team`,
    variables: ['client_name', 'salon_name', 'booking_link'],
  },
  {
    id: 'udhaar_reminder',
    name: 'Udhaar Reminder Email',
    subject: 'Payment Reminder — Rs {udhaar_amount} outstanding',
    body: `Dear {client_name},

This is a friendly reminder that you have an outstanding balance of Rs {udhaar_amount} at {salon_name}.

Please clear it on your next visit or contact us to arrange payment.

Thank you for your continued patronage.

Best regards,
{salon_name}`,
    variables: ['client_name', 'salon_name', 'udhaar_amount'],
  },
  {
    id: 'low_stock_alert',
    name: 'Low Stock Alert Email',
    subject: 'Low Stock Alert — {salon_name}',
    body: `Low Stock Alert — {salon_name} | {branch_name}

The following products are below their reorder threshold:

{product_list}

Please place orders with your suppliers to avoid running out.

— iCut Platform`,
    variables: ['salon_name', 'branch_name', 'product_list'],
  },
  {
    id: 'daily_summary',
    name: 'Daily Summary Email',
    subject: 'Daily Summary — {salon_name} — {date}',
    body: `Daily Business Summary
{salon_name} | {branch_name} | {date}

Revenue:         Rs {total_revenue}
Appointments:    {completed} / {total}
Cash:            Rs {cash}
JazzCash:        Rs {jazzcash}
Udhaar Added:    Rs {udhaar}

Top Service:     {top_service}
Top Stylist:     {top_stylist}

— iCut Platform`,
    variables: ['date', 'salon_name', 'branch_name', 'total_revenue', 'completed', 'total', 'cash', 'jazzcash', 'udhaar', 'top_service', 'top_stylist'],
  },
];

export function welcomeEmail(salonName: string, dashboardUrl: string): string {
  const previewText = `Welcome to iCut! Your salon ${salonName} is live. Let's get started.`;
  const body = `
    <h1 style="margin:0 0 16px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:22px;font-weight:bold;color:#1A1A1A;">Welcome to iCut!</h1>
    <p style="margin:0 0 20px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:15px;color:#1A1A1A;line-height:1.6;">Your salon <strong>${salonName}</strong> is live on iCut.</p>
    <p style="margin:0 0 8px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:15px;color:#1A1A1A;font-weight:600;">Here's how to get started:</p>
    <ol style="margin:0 0 24px 0;padding-left:20px;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:15px;color:#1A1A1A;line-height:1.8;">
      <li>Add your services</li>
      <li>Invite staff (phone + PIN)</li>
      <li>Book your first appointment</li>
    </ol>
    ${emailButton('Open Your Dashboard', dashboardUrl)}
    <p style="margin:24px 0 0 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:13px;color:#1A1A1A;opacity:0.5;">Every paid plan is covered by a 7-day money-back guarantee. If iCut isn't the right fit, email contact@icut.pk for a full refund.</p>
  `;
  return wrapEmailHtml(body, previewText);
}

export function passwordResetEmail(resetUrl: string): string {
  const previewText = 'Reset your iCut password — link expires in 1 hour.';
  const body = `
    <h1 style="margin:0 0 16px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:22px;font-weight:bold;color:#1A1A1A;">Reset your password</h1>
    <p style="margin:0 0 16px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:15px;color:#1A1A1A;line-height:1.6;">Someone requested a password reset for your iCut account. Click the button below to set a new password.</p>
    <p style="margin:0 0 24px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:15px;color:#1A1A1A;line-height:1.6;">If you did not request this, ignore this email — your password will remain unchanged.</p>
    ${emailButton('Reset Password', resetUrl)}
    <p style="margin:24px 0 0 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:13px;color:#1A1A1A;opacity:0.5;">This link expires in 1 hour.</p>
  `;
  return wrapEmailHtml(body, previewText);
}

export function planRenewalReminderEmail(params: {
  salonName: string;
  planName: string;
  priceRs: number;
  daysUntilExpiry: number; // positive = days until expiry; 0 = today; negative = overdue
  expiresOn: string; // human-readable date
  renewUrl: string;
}): string {
  const { salonName, planName, priceRs, daysUntilExpiry, expiresOn, renewUrl } = params;

  let headline: string;
  let body: string;
  let preview: string;
  let buttonLabel: string;

  if (daysUntilExpiry > 0) {
    headline = `Your iCut plan renews in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'}`;
    body = `
      <p style="margin:0 0 16px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:15px;color:#1A1A1A;line-height:1.6;">Hi <strong>${salonName}</strong> owner,</p>
      <p style="margin:0 0 16px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:15px;color:#1A1A1A;line-height:1.6;">Your <strong>${planName}</strong> plan on iCut is set to renew on <strong>${expiresOn}</strong>. To keep your dashboard, POS, and staff logins active, please submit payment before then.</p>
      <p style="margin:0 0 24px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:15px;color:#1A1A1A;line-height:1.6;">Amount due: <strong>Rs ${priceRs.toLocaleString('en-PK')}</strong></p>
    `;
    preview = `Plan renews in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'} — Rs ${priceRs.toLocaleString('en-PK')}`;
    buttonLabel = 'Submit Payment';
  } else {
    headline = 'Your iCut plan has expired';
    body = `
      <p style="margin:0 0 16px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:15px;color:#1A1A1A;line-height:1.6;">Hi <strong>${salonName}</strong> owner,</p>
      <p style="margin:0 0 16px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:15px;color:#1A1A1A;line-height:1.6;">Your <strong>${planName}</strong> plan expired on <strong>${expiresOn}</strong>. The app is now in read-only mode until you renew — your data is safe, but new bills, appointments, and edits are paused.</p>
      <p style="margin:0 0 24px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:15px;color:#1A1A1A;line-height:1.6;">Renewal amount: <strong>Rs ${priceRs.toLocaleString('en-PK')}</strong></p>
    `;
    preview = `Plan expired — renew to reactivate your salon`;
    buttonLabel = 'Renew Now';
  }

  const fullBody = `
    <h1 style="margin:0 0 16px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:22px;font-weight:bold;color:#1A1A1A;">${headline}</h1>
    ${body}
    ${emailButton(buttonLabel, renewUrl)}
    <p style="margin:24px 0 0 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:13px;color:#1A1A1A;opacity:0.5;">Questions? Reply to this email or contact support@icut.pk.</p>
  `;
  return wrapEmailHtml(fullBody, preview);
}

export function paymentApprovedEmail(params: {
  salonName: string;
  planName: string;
  amountRs: number;
  validUntil: string;
  dashboardUrl: string;
}): string {
  const { salonName, planName, amountRs, validUntil, dashboardUrl } = params;
  const preview = `Payment received — ${planName} plan active until ${validUntil}`;
  const body = `
    <h1 style="margin:0 0 16px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:22px;font-weight:bold;color:#1A1A1A;">Payment received</h1>
    <p style="margin:0 0 16px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:15px;color:#1A1A1A;line-height:1.6;">Hi <strong>${salonName}</strong> owner,</p>
    <p style="margin:0 0 16px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:15px;color:#1A1A1A;line-height:1.6;">We confirmed your payment of <strong>Rs ${amountRs.toLocaleString('en-PK')}</strong> for the <strong>${planName}</strong> plan. Your salon is active through <strong>${validUntil}</strong>.</p>
    <p style="margin:0 0 24px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:15px;color:#1A1A1A;line-height:1.6;">Thanks for using iCut.</p>
    ${emailButton('Open Dashboard', dashboardUrl)}
  `;
  return wrapEmailHtml(body, preview);
}

export function paymentDeniedEmail(params: {
  salonName: string;
  amountRs: number;
  reason: string;
  retryUrl: string;
}): string {
  const { salonName, amountRs, reason, retryUrl } = params;
  const preview = `Payment request declined — ${reason}`;
  const body = `
    <h1 style="margin:0 0 16px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:22px;font-weight:bold;color:#1A1A1A;">Payment request declined</h1>
    <p style="margin:0 0 16px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:15px;color:#1A1A1A;line-height:1.6;">Hi <strong>${salonName}</strong> owner,</p>
    <p style="margin:0 0 16px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:15px;color:#1A1A1A;line-height:1.6;">Your payment request for <strong>Rs ${amountRs.toLocaleString('en-PK')}</strong> could not be verified.</p>
    <p style="margin:0 0 16px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:15px;color:#1A1A1A;line-height:1.6;"><strong>Reason:</strong> ${reason}</p>
    <p style="margin:0 0 24px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:15px;color:#1A1A1A;line-height:1.6;">Please resubmit with a clearer screenshot or contact support if you believe this was a mistake.</p>
    ${emailButton('Resubmit Payment', retryUrl)}
    <p style="margin:24px 0 0 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:13px;color:#1A1A1A;opacity:0.5;">Questions? Reply to this email or contact support@icut.pk.</p>
  `;
  return wrapEmailHtml(body, preview);
}

export interface LowStockProduct {
  name: string;
  stock: number;
  threshold: number;
}
export interface LowStockBranch {
  branchName: string;
  products: LowStockProduct[];
}

/**
 * Owner-facing: daily summary of products below reorder threshold,
 * grouped by branch. Sent once per salon per day when at least one
 * product is under threshold.
 */
export function lowStockAlertEmail(params: {
  salonName: string;
  dashboardUrl: string;
  branches: LowStockBranch[];
  totalCount: number;
}): string {
  const { salonName, dashboardUrl, branches, totalCount } = params;
  const preview = `${totalCount} product${totalCount === 1 ? '' : 's'} below stock threshold at ${salonName}.`;

  const branchBlocks = branches.map((b) => {
    const rows = b.products.map((p) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #EEE;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:14px;color:#1A1A1A;">${escapeHtml(p.name)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #EEE;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:14px;color:#D32F2F;text-align:right;font-weight:600;">${p.stock}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #EEE;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:14px;color:#888;text-align:right;">${p.threshold}</td>
      </tr>`).join('');
    return `
      <h3 style="margin:20px 0 8px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:15px;font-weight:600;color:#1A1A1A;">${escapeHtml(b.branchName)}</h3>
      <table style="border-collapse:collapse;width:100%;border:1px solid #EEE;border-radius:6px;overflow:hidden;">
        <thead>
          <tr style="background:#FAFAFA;">
            <th style="padding:8px 12px;text-align:left;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:12px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Product</th>
            <th style="padding:8px 12px;text-align:right;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:12px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Stock</th>
            <th style="padding:8px 12px;text-align:right;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:12px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Threshold</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }).join('');

  const body = `
    <h1 style="margin:0 0 12px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:22px;font-weight:bold;color:#1A1A1A;">Low stock alert</h1>
    <p style="margin:0 0 4px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:15px;color:#1A1A1A;line-height:1.6;"><strong>${escapeHtml(salonName)}</strong> has <strong>${totalCount}</strong> product${totalCount === 1 ? '' : 's'} below the reorder threshold.</p>
    <p style="margin:0 0 20px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:14px;color:#666;line-height:1.6;">Reorder now so you don\u2019t run out during peak hours.</p>
    ${branchBlocks}
    <div style="margin-top:24px;">${emailButton('Open Inventory', dashboardUrl)}</div>
    <p style="margin:24px 0 0 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:13px;color:#999;">This alert is scheduled to run once per day. Turn it off in Settings \u2192 Email.</p>
  `;
  return wrapEmailHtml(body, preview);
}

export interface UdhaarClient {
  name: string;
  phone: string | null;
  balance: number;
  oldestDays: number;      // days since oldest outstanding bill
}

/**
 * Owner-facing weekly summary of clients carrying udhaar (credit).
 * Flags clients whose oldest outstanding bill is \u226528 days (~2 days before
 * typical 30-day terms) so the owner can follow up by phone/WhatsApp.
 */
export function udhaarOwnerSummaryEmail(params: {
  salonName: string;
  dashboardUrl: string;
  clients: UdhaarClient[];
  totalBalance: number;
}): string {
  const { salonName, dashboardUrl, clients, totalBalance } = params;
  const preview = `${clients.length} client${clients.length === 1 ? '' : 's'} owe Rs ${totalBalance.toLocaleString('en-PK')} \u2014 ${clients.filter((c) => c.oldestDays >= 28).length} due soon.`;

  const rows = clients.map((c) => {
    const dueSoon = c.oldestDays >= 28;
    const flag = dueSoon ? `<span style="display:inline-block;background:#FFF3E0;color:#E65100;font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;margin-left:6px;">Due in ${Math.max(0, 30 - c.oldestDays)}d</span>` : '';
    return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #EEE;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:14px;color:#1A1A1A;">${escapeHtml(c.name)}${flag}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #EEE;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:13px;color:#666;">${escapeHtml(c.phone ?? '\u2014')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #EEE;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:14px;color:#1A1A1A;text-align:right;font-weight:600;">Rs ${c.balance.toLocaleString('en-PK')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #EEE;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:12px;color:#888;text-align:right;">${c.oldestDays}d</td>
      </tr>`;
  }).join('');

  const body = `
    <h1 style="margin:0 0 12px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:22px;font-weight:bold;color:#1A1A1A;">Udhaar summary</h1>
    <p style="margin:0 0 4px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:15px;color:#1A1A1A;line-height:1.6;"><strong>${escapeHtml(salonName)}</strong> has <strong>${clients.length}</strong> client${clients.length === 1 ? '' : 's'} with outstanding udhaar totalling <strong>Rs ${totalBalance.toLocaleString('en-PK')}</strong>.</p>
    <p style="margin:0 0 20px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:14px;color:#666;line-height:1.6;">Clients flagged in orange are approaching their typical 30-day payment window \u2014 follow up now.</p>
    <table style="border-collapse:collapse;width:100%;border:1px solid #EEE;border-radius:6px;overflow:hidden;">
      <thead>
        <tr style="background:#FAFAFA;">
          <th style="padding:8px 12px;text-align:left;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:12px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Client</th>
          <th style="padding:8px 12px;text-align:left;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:12px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Phone</th>
          <th style="padding:8px 12px;text-align:right;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:12px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Balance</th>
          <th style="padding:8px 12px;text-align:right;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:12px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Oldest</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:24px;">${emailButton('Open Clients', dashboardUrl)}</div>
    <p style="margin:24px 0 0 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:13px;color:#999;">This weekly summary can be turned off in Settings \u2192 Email.</p>
  `;
  return wrapEmailHtml(body, preview);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    c === '&' ? '&amp;' :
    c === '<' ? '&lt;' :
    c === '>' ? '&gt;' :
    c === '"' ? '&quot;' : '&#39;'
  ));
}

export function udhaarReminderEmail(clientName: string, salonName: string, amount: string): string {
  const previewText = `Payment reminder from ${salonName} — Rs ${amount} outstanding.`;
  const body = `
    <h1 style="margin:0 0 16px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:22px;font-weight:bold;color:#1A1A1A;">Payment Reminder</h1>
    <p style="margin:0 0 8px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:15px;color:#1A1A1A;line-height:1.6;">Dear <strong>${clientName}</strong>,</p>
    <p style="margin:0 0 20px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:15px;color:#1A1A1A;line-height:1.6;">You have an outstanding balance at <strong>${salonName}</strong>:</p>
    <p style="margin:0 0 24px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:28px;font-weight:bold;color:#F0B000;">Rs ${amount}</p>
    <p style="margin:0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:15px;color:#1A1A1A;line-height:1.6;">Please clear it on your next visit or contact us to arrange payment. Thank you for your continued patronage.</p>
  `;
  return wrapEmailHtml(body, previewText);
}
