/**
 * Validate Pakistani phone number format.
 * Accepts 03XX-XXXXXXX (11 digits starting with 03, optional dash/spaces).
 * Returns true if empty (phone is optional) or if format is valid.
 */
export function isValidPKPhone(p: string): boolean {
  if (!p) return true;
  return /^0[3-9]\d{2}-?\d{7}$/.test(p.replace(/\s/g, ''));
}
