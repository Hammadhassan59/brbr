export function generateWhatsAppLink(phone: string, message: string): string {
  // Convert Pakistani phone format to international
  // 0321-1234567 → 923211234567
  const cleaned = phone.replace(/[-\s]/g, '');
  const international = cleaned.startsWith('0')
    ? `92${cleaned.slice(1)}`
    : cleaned.startsWith('+92')
      ? cleaned.slice(1)
      : cleaned;
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${international}?text=${encoded}`;
}

export function encodeMessage(
  template: string,
  variables: Record<string, string>
): string {
  let message = template;
  for (const [key, value] of Object.entries(variables)) {
    message = message.replaceAll(`{${key}}`, value);
  }
  return message;
}
