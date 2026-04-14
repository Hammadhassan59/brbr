'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Check, CreditCard, Building2, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppStore } from '@/store/app-store';
import { getPublicPlatformConfig } from '@/app/actions/admin-settings';
import { submitPaymentRequest } from '@/app/actions/payment-requests';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface PlanRow {
  key: string;
  name: string;
  price: number;
  features: string[];
}

const PLAN_META: Array<{ key: 'basic' | 'growth' | 'pro'; name: string; tagline: string }> = [
  { key: 'basic', name: 'Basic', tagline: 'All features' },
  { key: 'growth', name: 'Growth', tagline: 'All features' },
  { key: 'pro', name: 'Pro', tagline: 'Priority support' },
];

const FALLBACK_PLANS: Record<string, { price: number; branches: number; staff: number }> = {
  basic: { price: 2500, branches: 1, staff: 3 },
  growth: { price: 5000, branches: 1, staff: 0 },
  pro: { price: 9000, branches: 3, staff: 0 },
};

function buildFeatures(branches: number, staff: number, tagline: string): string[] {
  const branchLabel = branches === 1 ? '1 branch' : `Up to ${branches} branches`;
  const staffLabel = staff === 0 ? 'Unlimited staff' : `Up to ${staff} staff`;
  return [branchLabel, staffLabel, tagline];
}

function copyToClipboard(text: string, label: string) {
  navigator.clipboard.writeText(text).then(() => {
    toast.success(`${label} copied`);
  });
}

export function PaywallDialog() {
  const { showPaywall, setShowPaywall, salon } = useAppStore();
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>(() =>
    PLAN_META.map((m) => ({
      key: m.key,
      name: m.name,
      price: FALLBACK_PLANS[m.key].price,
      features: buildFeatures(FALLBACK_PLANS[m.key].branches, FALLBACK_PLANS[m.key].staff, m.tagline),
    }))
  );
  const [bankAccount, setBankAccount] = useState('');
  const [jazzcash, setJazzcash] = useState('');
  const [supportWhatsApp, setSupportWhatsApp] = useState('');
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Fetch plans + payment details from superadmin settings on mount
  useEffect(() => {
    if (!showPaywall) return;
    let cancelled = false;
    getPublicPlatformConfig()
      .then((cfg) => {
        if (cancelled) return;
        setPlans(
          PLAN_META.map((m) => {
            const p = cfg.plans[m.key] ?? FALLBACK_PLANS[m.key];
            return {
              key: m.key,
              name: m.name,
              price: p.price,
              features: buildFeatures(p.branches, p.staff, m.tagline),
            };
          })
        );
        setBankAccount(cfg.payment.bankAccount);
        setJazzcash(cfg.payment.jazzcashAccount);
        setSupportWhatsApp(cfg.supportWhatsApp);
      })
      .catch(() => {
        // Keep fallbacks silently
      });
    return () => { cancelled = true; };
  }, [showPaywall]);

  const currentPlan = salon?.subscription_plan || 'none';

  function handleOpenChange(open: boolean) {
    if (!open) {
      setShowPaywall(false);
      setSelectedPlan(null);
      setReference('');
      setSubmitted(false);
    }
  }

  // Reset per-plan state when the user picks a different plan
  useEffect(() => {
    setSubmitted(false);
  }, [selectedPlan]);

  async function handleSubmitAndOpenWhatsApp(plan: PlanRow) {
    if (submitting) return;
    setSubmitting(true);
    try {
      const { error } = await submitPaymentRequest({
        plan: plan.key as 'basic' | 'growth' | 'pro',
        reference: reference || null,
      });
      if (error) {
        // Don't block the WhatsApp link on submit failure — admin can still
        // manually activate from /admin/salons. But surface the error.
        toast.error(`Couldn't record request: ${error}. Send the screenshot anyway.`);
      } else {
        setSubmitted(true);
        toast.success('Request submitted. Send your screenshot to activate.');
      }
    } finally {
      setSubmitting(false);
    }

    // Always open WhatsApp regardless of submit outcome
    if (supportWhatsApp) {
      const phone = supportWhatsApp.replace(/\D/g, '');
      const msg = `Hi, I want to subscribe to the ${plan.name} plan (Rs ${plan.price.toLocaleString()}/mo) for my salon "${salon?.name || ''}".${reference ? ` Transaction ref: ${reference}.` : ''} I'm sending the payment screenshot.`;
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
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
              {plans.map((plan) => {
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
                    {bankAccount && (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground">Bank Account</p>
                          <p className="font-medium font-mono whitespace-pre-wrap">{bankAccount}</p>
                        </div>
                        <button onClick={() => copyToClipboard(bankAccount, 'Bank account')} className="p-1 hover:bg-secondary rounded shrink-0">
                          <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      </div>
                    )}
                    {jazzcash && (
                      <div className={`${bankAccount ? 'border-t border-border pt-1.5 ' : ''}flex items-center justify-between`}>
                        <div>
                          <p className="text-xs text-muted-foreground">JazzCash</p>
                          <p className="font-medium font-mono">{jazzcash}</p>
                        </div>
                        <button onClick={() => copyToClipboard(jazzcash, 'JazzCash number')} className="p-1 hover:bg-secondary rounded shrink-0">
                          <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      </div>
                    )}
                    {!bankAccount && !jazzcash && (
                      <p className="text-xs text-muted-foreground">
                        Contact support on WhatsApp for payment details.
                      </p>
                    )}
                  </div>

                  <div className="bg-gold/5 border border-gold/20 rounded p-2 mt-2">
                    <p className="text-xs">
                      <span className="font-semibold">Amount:</span>{' '}
                      Rs {plans.find((p) => p.key === selectedPlan)?.price.toLocaleString()}/month
                    </p>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground space-y-1">
                  <p>1. Transfer the amount to the account above</p>
                  <p>2. Submit your transaction reference and send screenshot on WhatsApp</p>
                  <p>3. Admin will approve within minutes and your account activates</p>
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Transaction Reference (optional)
                  </label>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="e.g. JazzCash TID or sender name"
                    className="w-full mt-1 h-9 px-3 text-sm border border-border rounded-md bg-background focus:outline-none focus:border-gold"
                    maxLength={100}
                  />
                </div>

                {submitted && (
                  <div className="bg-green-500/10 border border-green-500/30 rounded p-2 text-xs text-green-700">
                    Request submitted. Admin sees it in the queue. Send your screenshot
                    via WhatsApp to confirm.
                  </div>
                )}

                {(() => {
                  const plan = plans.find((p) => p.key === selectedPlan);
                  if (!plan) return null;
                  if (!supportWhatsApp) {
                    return (
                      <Button disabled className="w-full bg-gold/40 text-black/60 font-semibold">
                        Support WhatsApp not configured
                      </Button>
                    );
                  }
                  return (
                    <Button
                      onClick={() => handleSubmitAndOpenWhatsApp(plan)}
                      disabled={submitting}
                      className="w-full bg-gold text-black hover:bg-gold/90 font-semibold"
                    >
                      {submitting ? 'Submitting...' : submitted ? 'Resend on WhatsApp' : 'Submit Request & Send Screenshot'}
                    </Button>
                  );
                })()}
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
            {supportWhatsApp ? (
              <a
                href={`https://wa.me/${supportWhatsApp.replace(/\D/g, '')}?text=${encodeURIComponent(
                  'Hi, my iCut account has been suspended. Please help me reactivate it.'
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Button className="w-full bg-gold text-black hover:bg-gold/90 font-semibold">
                  Contact Support on WhatsApp
                </Button>
              </a>
            ) : (
              <Button disabled className="w-full bg-gold/40 text-black/60 font-semibold">
                Support WhatsApp not configured
              </Button>
            )}
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
