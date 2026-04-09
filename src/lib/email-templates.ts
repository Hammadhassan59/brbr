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

— BrBr Platform`,
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

— BrBr Platform`,
    variables: ['date', 'salon_name', 'branch_name', 'total_revenue', 'completed', 'total', 'cash', 'jazzcash', 'udhaar', 'top_service', 'top_stylist'],
  },
];

export function welcomeEmail(salonName: string, dashboardUrl: string): string {
  const previewText = `Welcome to BrBr! Your salon ${salonName} is live. Let's get started.`;
  const body = `
    <h1 style="margin:0 0 16px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:22px;font-weight:bold;color:#1A1A1A;">Welcome to BrBr!</h1>
    <p style="margin:0 0 20px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:15px;color:#1A1A1A;line-height:1.6;">Your salon <strong>${salonName}</strong> is live on BrBr.</p>
    <p style="margin:0 0 8px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:15px;color:#1A1A1A;font-weight:600;">Here's how to get started:</p>
    <ol style="margin:0 0 24px 0;padding-left:20px;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:15px;color:#1A1A1A;line-height:1.8;">
      <li>Add your services</li>
      <li>Invite staff (phone + PIN)</li>
      <li>Book your first appointment</li>
    </ol>
    ${emailButton('Open Your Dashboard', dashboardUrl)}
    <p style="margin:24px 0 0 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:13px;color:#1A1A1A;opacity:0.5;">Your 14-day free trial has started. No card needed.</p>
  `;
  return wrapEmailHtml(body, previewText);
}

export function passwordResetEmail(resetUrl: string): string {
  const previewText = 'Reset your BrBr password — link expires in 1 hour.';
  const body = `
    <h1 style="margin:0 0 16px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:22px;font-weight:bold;color:#1A1A1A;">Reset your password</h1>
    <p style="margin:0 0 16px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:15px;color:#1A1A1A;line-height:1.6;">Someone requested a password reset for your BrBr account. Click the button below to set a new password.</p>
    <p style="margin:0 0 24px 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:15px;color:#1A1A1A;line-height:1.6;">If you did not request this, ignore this email — your password will remain unchanged.</p>
    ${emailButton('Reset Password', resetUrl)}
    <p style="margin:24px 0 0 0;font-family:Inter,-apple-system,BlinkMacSystemFont,Arial,sans-serif;font-size:13px;color:#1A1A1A;opacity:0.5;">This link expires in 1 hour.</p>
  `;
  return wrapEmailHtml(body, previewText);
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
