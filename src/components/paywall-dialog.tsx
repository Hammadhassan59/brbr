'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Check, CreditCard, Building2, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppStore } from '@/store/app-store';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const PLANS = [
  {
    key: 'basic',
    name: 'Basic',
    price: 2500,
    features: ['1 branch', 'Up to 3 staff', 'All features'],
  },
  {
    key: 'growth',
    name: 'Growth',
    price: 5000,
    features: ['1 branch', 'Unlimited staff', 'All features'],
  },
  {
    key: 'pro',
    name: 'Pro',
    price: 9000,
    features: ['Up to 3 branches', 'Unlimited staff', 'Priority support'],
  },
];

const BANK_DETAILS = {
  bankName: 'Meezan Bank',
  accountTitle: 'iCut Technologies',
  accountNumber: '02340105566723',
  jazzcash: '03001234567',
};

function copyToClipboard(text: string, label: string) {
  navigator.clipboard.writeText(text).then(() => {
    toast.success(`${label} copied`);
  });
}

export function PaywallDialog() {
  const { showPaywall, setShowPaywall, salon } = useAppStore();
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  const currentPlan = salon?.subscription_plan || 'none';

  function handleOpenChange(open: boolean) {
    if (!open) {
      setShowPaywall(false);
      setSelectedPlan(null);
    }
  }

  return (
    <Dialog open={showPaywall} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-gold" />
            <DialogTitle>Subscribe to Continue</DialogTitle>
          </div>
          <DialogDescription>
            {salon?.subscription_status === 'expired'
              ? 'Your subscription has expired. Renew to continue using all features.'
              : salon?.subscription_status === 'suspended'
              ? 'Your account has been suspended. Contact support to reactivate.'
              : 'Choose a plan to unlock all features. Your data is safe and visible in read-only mode.'}
          </DialogDescription>
        </DialogHeader>

        {salon?.subscription_status !== 'suspended' && (
          <>
            {/* Plan cards */}
            <div className="space-y-2 mt-2">
              {PLANS.map((plan) => {
                const isSelected = selectedPlan === plan.key;
                const isCurrent = currentPlan === plan.key;
                return (
                  <button
                    key={plan.key}
                    onClick={() => setSelectedPlan(plan.key)}
                    className={`w-full text-left border rounded-lg p-3 transition-all ${
                      isSelected
                        ? 'border-gold bg-gold/5'
                        : 'border-border hover:border-gold/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm">
                          {plan.name}
                          {isCurrent && (
                            <span className="ml-2 text-[10px] font-medium text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                              Current
                            </span>
                          )}
                        </p>
                        <p className="text-lg font-bold mt-0.5">
                          Rs {plan.price.toLocaleString()}
                          <span className="text-xs font-normal text-muted-foreground">/mo</span>
                        </p>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        isSelected ? 'border-gold bg-gold' : 'border-border'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 text-black" />}
                      </div>
                    </div>
                    <ul className="mt-2 space-y-0.5">
                      {plan.features.map((f) => (
                        <li key={f} className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <span className="text-gold">+</span> {f}
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>

            {/* Bank details (shown after plan selection) */}
            {selectedPlan && (
              <div className="mt-3 space-y-3">
                <div className="border border-border rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5" />
                    Payment Details
                  </p>

                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Bank</p>
                        <p className="font-medium">{BANK_DETAILS.bankName}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Account Title</p>
                        <p className="font-medium">{BANK_DETAILS.accountTitle}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Account Number</p>
                        <p className="font-medium font-mono">{BANK_DETAILS.accountNumber}</p>
                      </div>
                      <button onClick={() => copyToClipboard(BANK_DETAILS.accountNumber, 'Account number')} className="p-1 hover:bg-secondary rounded">
                        <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </div>
                    <div className="border-t border-border pt-1.5 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">JazzCash</p>
                        <p className="font-medium font-mono">{BANK_DETAILS.jazzcash}</p>
                      </div>
                      <button onClick={() => copyToClipboard(BANK_DETAILS.jazzcash, 'JazzCash number')} className="p-1 hover:bg-secondary rounded">
                        <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  </div>

                  <div className="bg-gold/5 border border-gold/20 rounded p-2 mt-2">
                    <p className="text-xs">
                      <span className="font-semibold">Amount:</span>{' '}
                      Rs {PLANS.find((p) => p.key === selectedPlan)?.price.toLocaleString()}/month
                    </p>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground space-y-1">
                  <p>1. Transfer the amount to the account above</p>
                  <p>2. Send the payment screenshot on WhatsApp</p>
                  <p>3. Your account will be activated within minutes</p>
                </div>

                <a
                  href={`https://wa.me/923001234567?text=${encodeURIComponent(
                    `Hi, I want to subscribe to the ${selectedPlan?.toUpperCase()} plan for my salon "${salon?.name || ''}". I'm sending the payment screenshot.`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <Button className="w-full bg-gold text-black hover:bg-gold/90 font-semibold">
                    Send Screenshot on WhatsApp
                  </Button>
                </a>
              </div>
            )}

            {!selectedPlan && (
              <Button
                variant="outline"
                className="w-full mt-2"
                onClick={() => {
                  setShowPaywall(false);
                  router.push('/dashboard/settings?tab=subscription');
                }}
              >
                <Building2 className="w-4 h-4 mr-2" />
                View Full Details in Settings
              </Button>
            )}
          </>
        )}

        {salon?.subscription_status === 'suspended' && (
          <div className="mt-2">
            <a
              href="https://wa.me/923001234567?text=Hi%2C%20my%20iCut%20account%20has%20been%20suspended.%20Please%20help%20me%20reactivate%20it."
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <Button className="w-full bg-gold text-black hover:bg-gold/90 font-semibold">
                Contact Support on WhatsApp
              </Button>
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Check if an error is a subscription error and show the paywall dialog.
 * Returns true if it was a subscription error (caller should stop processing).
 */
export function handleSubscriptionError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg === 'SUBSCRIPTION_REQUIRED' || msg.includes('SUBSCRIPTION_REQUIRED')) {
    useAppStore.getState().setShowPaywall(true);
    return true;
  }
  return false;
}

/**
 * Show an error toast, but intercept SUBSCRIPTION_REQUIRED to show paywall instead.
 * Use this anywhere you'd normally do: if (error) toast.error(error)
 */
export function showActionError(error: string | null | undefined): boolean {
  if (!error) return false;
  if (error === 'SUBSCRIPTION_REQUIRED') {
    useAppStore.getState().setShowPaywall(true);
    return true;
  }
  toast.error(error);
  return true;
}
