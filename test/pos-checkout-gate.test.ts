import { describe, it, expect } from 'vitest';
import { getCheckoutBlockReason } from '../src/app/dashboard/pos/components/checkout-gate';

const ready = {
  total: 1500,
  hasStylist: true,
  hasClient: true,
  selectedPaymentMethod: 'cash' as const,
  cashReceived: 1500,
  isSplit: false,
  splitRemaining: 0,
  saving: false,
};

describe('getCheckoutBlockReason', () => {
  it('allows checkout when everything is in order', () => {
    expect(getCheckoutBlockReason(ready)).toBeNull();
  });

  it('blocks while saving', () => {
    expect(getCheckoutBlockReason({ ...ready, saving: true })).toBe('saving');
  });

  it('blocks with empty bill', () => {
    expect(getCheckoutBlockReason({ ...ready, total: 0 })).toBe('empty_bill');
  });

  it('blocks when no stylist selected', () => {
    expect(getCheckoutBlockReason({ ...ready, hasStylist: false })).toBe('no_stylist');
  });

  it('blocks when no client selected', () => {
    expect(getCheckoutBlockReason({ ...ready, hasClient: false })).toBe('no_client');
  });

  it('blocks when payment method not chosen', () => {
    expect(getCheckoutBlockReason({ ...ready, selectedPaymentMethod: null })).toBe('no_payment_method');
  });

  // Regression: 1500 bill, 1000 cash received should NOT proceed
  it('blocks when cash received is less than total', () => {
    expect(getCheckoutBlockReason({
      ...ready,
      selectedPaymentMethod: 'cash',
      cashReceived: 1000,
    })).toBe('cash_short');
  });

  it('allows cash exact and cash over (with change)', () => {
    expect(getCheckoutBlockReason({ ...ready, cashReceived: 1500 })).toBeNull();
    expect(getCheckoutBlockReason({ ...ready, cashReceived: 2000 })).toBeNull();
  });

  it('does not require cash amount for non-cash methods', () => {
    expect(getCheckoutBlockReason({
      ...ready,
      selectedPaymentMethod: 'jazzcash',
      cashReceived: 0,
    })).toBeNull();
  });

  it('blocks split when not balanced', () => {
    expect(getCheckoutBlockReason({
      ...ready,
      isSplit: true,
      selectedPaymentMethod: null,
      splitRemaining: 500,
    })).toBe('split_unbalanced');
  });

  it('allows split when balanced within tolerance', () => {
    expect(getCheckoutBlockReason({
      ...ready,
      isSplit: true,
      selectedPaymentMethod: null,
      splitRemaining: 0.1,
    })).toBeNull();
  });

  it('gates stylist before payment checks', () => {
    expect(getCheckoutBlockReason({
      ...ready,
      hasStylist: false,
      cashReceived: 0,
    })).toBe('no_stylist');
  });
});
