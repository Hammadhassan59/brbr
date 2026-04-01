export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  variables: string[];
}

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
