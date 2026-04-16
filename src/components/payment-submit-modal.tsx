'use client';

import { useEffect, useState } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { submitPaymentRequest } from '@/app/actions/payment-requests';
import { getPublicPlatformConfig } from '@/app/actions/admin-settings';
import type { PlanOption } from '@/lib/bank-details';

type Method = 'bank' | 'jazzcash' | 'easypaisa';

const METHOD_LABELS: Record<Method, string> = {
  bank: 'Bank Transfer',
  jazzcash: 'JazzCash',
  easypaisa: 'EasyPaisa',
};

interface Props {
  open: boolean;
  onClose: () => void;
  plan: PlanOption;
  onSubmitted: () => void;
}

/**
 * Shared in-app payment submission flow used by /paywall, /dashboard/billing,
 * and /dashboard/settings. Owner uploads a screenshot, picks an enabled method,
 * optionally adds a transaction reference. We hand the file + fields to
 * submitPaymentRequest which uploads to Supabase Storage and inserts the
 * pending payment_requests row.
 *
 * Method options come from platform_settings — super admin toggles which of
 * Bank / JazzCash / EasyPaisa are accepted, and only those show here.
 */
export function PaymentSubmitModal({ open, onClose, plan, onSubmitted }: Props) {
  const [method, setMethod] = useState<Method>('bank');
  const [reference, setReference] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [enabledMethods, setEnabledMethods] = useState<Method[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getPublicPlatformConfig()
      .then((cfg) => {
        if (cancelled) return;
        const enabled: Method[] = [];
        if (cfg.payment.bankEnabled) enabled.push('bank');
        if (cfg.payment.jazzcashEnabled) enabled.push('jazzcash');
        if (cfg.payment.easypaisaEnabled) enabled.push('easypaisa');
        setEnabledMethods(enabled);
        // Reset selection to first enabled method on open.
        if (enabled.length > 0) setMethod(enabled[0]);
      })
      .catch(() => {
        // If the config fetch fails, fall back to bank + jazzcash so the
        // owner can still submit.
        setEnabledMethods(['bank', 'jazzcash']);
      });
    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (f && f.size > 10 * 1024 * 1024) {
      toast.error('Screenshot too large (10MB max)');
      return;
    }
    setFile(f);
  }

  async function submit() {
    if (!file) {
      toast.error('Please attach a payment screenshot');
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('plan', plan.key);
      fd.append('method', method);
      if (reference.trim()) fd.append('reference', reference.trim());
      fd.append('screenshot', file);
      const { error } = await submitPaymentRequest(fd);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success('Payment submitted — admin will review shortly');
      onSubmitted();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="bg-card border border-border rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <p className="text-sm font-semibold">Submit payment for {plan.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Rs {plan.price.toLocaleString()} / month</p>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1 hover:bg-secondary rounded transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {enabledMethods.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payment methods enabled — contact support.</p>
          ) : (
            <div>
              <Label className="text-xs">Payment method</Label>
              <div className={`grid gap-2 mt-1 ${enabledMethods.length === 1 ? 'grid-cols-1' : enabledMethods.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {enabledMethods.map((m) => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    className={`text-sm font-medium py-2 rounded-md border transition-all ${
                      method === m ? 'border-gold bg-gold/10 text-gold' : 'border-border hover:border-gold/40'
                    }`}
                  >
                    {METHOD_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs">Transaction reference (optional)</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. TXN12345"
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-xs">Payment screenshot *</Label>
            <label className="mt-1 flex flex-col items-center justify-center gap-2 border border-dashed border-border rounded-lg p-6 cursor-pointer hover:border-gold/60 transition-colors">
              <Upload className="w-5 h-5 text-muted-foreground" />
              {file ? (
                <span className="text-sm text-foreground break-all text-center">{file.name}</span>
              ) : (
                <>
                  <span className="text-sm text-muted-foreground">Tap to select an image</span>
                  <span className="text-[11px] text-muted-foreground">JPG, PNG, WEBP, HEIC — 10MB max</span>
                </>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                onChange={pickFile}
                className="hidden"
              />
            </label>
          </div>

          <Button
            onClick={submit}
            disabled={submitting || !file || enabledMethods.length === 0}
            className="w-full bg-gold hover:bg-gold/90 text-black font-semibold h-11"
          >
            {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting…</> : 'Submit for review'}
          </Button>
          <p className="text-[11px] text-muted-foreground text-center">
            Admin usually approves within minutes during business hours.
          </p>
        </div>
      </div>
    </div>
  );
}
