'use client';

import { useState, useEffect, useRef } from 'react';
import { Lock, Check, CreditCard, Copy, Upload, X, FileImage } from 'lucide-react';
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
  const [reference, setReference] = useState('');
  const [method, setMethod] = useState<'bank' | 'jazzcash'>('bank');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      })
      .catch(() => {
        // Keep fallbacks silently
      });
    return () => { cancelled = true; };
  }, [showPaywall]);

  // Revoke object URLs to avoid leaks
  useEffect(() => {
    return () => {
      if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    };
  }, [screenshotPreview]);

  const currentPlan = salon?.subscription_plan || 'none';

  function resetForm() {
    setSelectedPlan(null);
    setReference('');
    setMethod('bank');
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    setScreenshot(null);
    setScreenshotPreview(null);
    setSubmitted(false);
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      setShowPaywall(false);
      resetForm();
    }
  }

  // Reset per-plan state when the user picks a different plan
  useEffect(() => {
    setSubmitted(false);
  }, [selectedPlan]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image (jpg, png, webp)');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image too large (10MB max)');
      return;
    }
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    setScreenshot(file);
    setScreenshotPreview(URL.createObjectURL(file));
  }

  function clearScreenshot() {
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    setScreenshot(null);
    setScreenshotPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSubmit() {
    if (submitting || !selectedPlan) return;
    if (!screenshot) {
      toast.error('Please upload your payment screenshot');
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('plan', selectedPlan);
      fd.append('reference', reference);
      fd.append('method', method);
      fd.append('screenshot', screenshot);

      const { error } = await submitPaymentRequest(fd);
      if (error) {
        toast.error(error);
        return;
      }
      setSubmitted(true);
      toast.success('Payment submitted! Admin will activate within minutes.');
    } finally {
      setSubmitting(false);
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

        {salon?.subscription_status === 'suspended' ? (
          <div className="mt-2 bg-red-500/5 border border-red-500/20 rounded p-3 text-xs text-red-700">
            Account suspended. Please contact the platform admin for reactivation.
          </div>
        ) : submitted ? (
          /* Success state — request submitted */
          <div className="mt-2 space-y-3">
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-center">
              <Check className="w-10 h-10 text-green-600 mx-auto mb-2 p-2 bg-green-500/20 rounded-full" />
              <p className="font-semibold text-sm">Payment Submitted</p>
              <p className="text-xs text-muted-foreground mt-1">
                The admin will review your screenshot and activate your account within minutes. You can close this dialog.
              </p>
            </div>
            <Button
              onClick={() => handleOpenChange(false)}
              className="w-full bg-gold text-black hover:bg-gold/90 font-semibold"
            >
              Close
            </Button>
          </div>
        ) : (
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

            {/* Payment form (after plan selection) */}
            {selectedPlan && (
              <div className="mt-3 space-y-3">
                {/* Always show bank + jazzcash blocks. Empty means admin hasn't
                    configured them yet — surface that clearly. */}
                <div className="border border-border rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5" />
                    Pay To
                  </p>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">Bank Account</p>
                        {bankAccount ? (
                          <p className="font-medium font-mono whitespace-pre-wrap break-words">{bankAccount}</p>
                        ) : (
                          <p className="text-xs italic text-muted-foreground">Not configured — ask admin to add</p>
                        )}
                      </div>
                      {bankAccount && (
                        <button onClick={() => copyToClipboard(bankAccount, 'Bank account')} className="p-1.5 hover:bg-secondary rounded shrink-0">
                          <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                    <div className="border-t border-border pt-2 flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">JazzCash</p>
                        {jazzcash ? (
                          <p className="font-medium font-mono">{jazzcash}</p>
                        ) : (
                          <p className="text-xs italic text-muted-foreground">Not configured — ask admin to add</p>
                        )}
                      </div>
                      {jazzcash && (
                        <button onClick={() => copyToClipboard(jazzcash, 'JazzCash number')} className="p-1.5 hover:bg-secondary rounded shrink-0">
                          <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="bg-gold/5 border border-gold/20 rounded p-2 mt-2">
                    <p className="text-xs">
                      <span className="font-semibold">Amount to transfer:</span>{' '}
                      Rs {plans.find((p) => p.key === selectedPlan)?.price.toLocaleString()}/month
                    </p>
                  </div>
                </div>

                {/* Method picker */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Payment Method
                  </label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {(['bank', 'jazzcash'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMethod(m)}
                        className={`py-2 text-xs font-medium border rounded-md transition-all ${
                          method === m
                            ? 'border-gold bg-gold/10 text-foreground'
                            : 'border-border text-muted-foreground hover:border-gold/40'
                        }`}
                      >
                        {m === 'bank' ? 'Bank Transfer' : 'JazzCash'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reference */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Transaction ID / Reference (optional)
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

                {/* Screenshot upload (required) */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Payment Screenshot <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {screenshotPreview ? (
                    <div className="mt-1 relative border border-border rounded-md overflow-hidden bg-secondary/30">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={screenshotPreview} alt="Payment screenshot" className="w-full h-40 object-contain" />
                      <button
                        type="button"
                        onClick={clearScreenshot}
                        className="absolute top-1.5 right-1.5 p-1 bg-black/60 hover:bg-black/80 text-white rounded-full"
                        aria-label="Remove screenshot"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-2 py-1 flex items-center gap-1">
                        <FileImage className="w-3 h-3" />
                        {screenshot?.name} ({screenshot ? Math.round(screenshot.size / 1024) : 0}KB)
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full mt-1 border-2 border-dashed border-border hover:border-gold/50 rounded-md p-4 text-center transition-colors group"
                    >
                      <Upload className="w-5 h-5 text-muted-foreground group-hover:text-gold mx-auto mb-1" />
                      <p className="text-xs font-medium">Tap to upload screenshot</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">JPG, PNG or WebP, max 10MB</p>
                    </button>
                  )}
                </div>

                <Button
                  onClick={handleSubmit}
                  disabled={submitting || !screenshot}
                  className="w-full bg-gold text-black hover:bg-gold/90 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Submitting...' : 'Submit Payment'}
                </Button>

                <p className="text-[10px] text-muted-foreground text-center">
                  Admin reviews within minutes during business hours
                </p>
              </div>
            )}
          </>
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
