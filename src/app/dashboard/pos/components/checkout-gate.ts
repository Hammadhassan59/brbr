import type { PaymentMethod } from '@/types/database';

export interface CheckoutGateInput {
  total: number;
  hasStylist: boolean;
  hasClient: boolean;
  selectedPaymentMethod: PaymentMethod | null;
  cashReceived: number;
  isSplit: boolean;
  splitRemaining: number;
  saving: boolean;
}

export type CheckoutBlockReason =
  | 'saving'
  | 'empty_bill'
  | 'no_stylist'
  | 'no_client'
  | 'no_payment_method'
  | 'cash_short'
  | 'split_unbalanced';

export function getCheckoutBlockReason(input: CheckoutGateInput): CheckoutBlockReason | null {
  if (input.saving) return 'saving';
  if (input.total <= 0) return 'empty_bill';
  if (!input.hasStylist) return 'no_stylist';
  if (!input.hasClient) return 'no_client';
  if (input.isSplit) {
    if (Math.abs(input.splitRemaining) >= 0.5) return 'split_unbalanced';
  } else {
    if (!input.selectedPaymentMethod) return 'no_payment_method';
    if (input.selectedPaymentMethod === 'cash' && input.cashReceived < input.total) return 'cash_short';
  }
  return null;
}

export function describeBlockReason(reason: CheckoutBlockReason): string {
  switch (reason) {
    case 'saving': return 'Processing...';
    case 'empty_bill': return 'Add items to the bill first';
    case 'no_stylist': return 'Select a stylist';
    case 'no_client': return 'Select or add a client';
    case 'no_payment_method': return 'Choose a payment method';
    case 'cash_short': return 'Cash received is less than total';
    case 'split_unbalanced': return 'Split amounts must match the total';
  }
}
