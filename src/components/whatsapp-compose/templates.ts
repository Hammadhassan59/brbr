import { encodeMessage } from '@/lib/utils/whatsapp';

export type TemplateKey =
  | 'appointment_reminder'
  | 'udhaar_reminder'
  | 'receipt'
  | 'birthday'
  | 'no_show'
  | 'thank_you'
  | 'custom';

export interface MessageTemplate {
  key: TemplateKey;
  label: string;
  template: string;
}

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    key: 'appointment_reminder',
    label: 'Reminder',
    template: "Reminder: Your appointment is at {time}. {staff_name} is waiting for you! — {salon_name}",
  },
  {
    key: 'udhaar_reminder',
    label: 'Udhaar',
    template: "Dear {name}, your outstanding balance is {amount}. Please clear it on your next visit. Thank you! — {salon_name}",
  },
  {
    key: 'receipt',
    label: 'Receipt',
    template: '',
  },
  {
    key: 'birthday',
    label: 'Birthday',
    template: "Happy Birthday {name}! Visit {salon_name} today for a special treat. We'd love to see you!",
  },
  {
    key: 'no_show',
    label: 'No-show',
    template: "Hi {name}, we missed you at your {time} appointment today. Would you like to reschedule? — {salon_name}",
  },
  {
    key: 'thank_you',
    label: 'Thanks',
    template: "Thank you for visiting {salon_name}, {name}! We hope you loved your experience. See you next time!",
  },
  {
    key: 'custom',
    label: 'Custom',
    template: '',
  },
];

export function fillTemplate(
  key: TemplateKey,
  variables: Record<string, string>
): string {
  if (key === 'receipt') {
    return variables.receipt_text ?? '';
  }

  if (key === 'custom') {
    return '';
  }

  const tpl = MESSAGE_TEMPLATES.find((t) => t.key === key);
  if (!tpl) {
    return '';
  }

  return encodeMessage(tpl.template, variables);
}
