'use client';

import { useState } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { submitPaymentRequest } from '@/app/actions/payment-requests';
import type { PlanOption } from '@/lib/bank-details';

type Method = 'bank' | 'jazzcash';

interface Props {
  open: boolean;
  onClose: () => void;
  plan: PlanOption;
  onSubmitted: () => void;
}

/**
 * Shared in-app payment submission flow used by both /paywall (first-time
 * activation) and /dashboard/billing (renewal). Owner uploads a screenshot,
 * picks a method, optionally adds a transaction reference; we hand the file +
 * fields to submitPaymentRequest which uploads to Supabase Storage and inserts
 * the pending payment_requests row.
 */
export function PaymentSubmitModal({ open, onClose, plan, onSubmitted }: Props) {
  const [method, setMethod] = useState<Method>('bank');
  const [reference, setReference] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
          <div>
            <Label className="text-xs">Payment method</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {(['bank', 'jazzcash'] as Method[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={`text-sm font-medium py-2 rounded-md border transition-all capitalize ${
                    method === m ? 'border-gold bg-gold/10 text-gold' : 'border-border hover:border-gold/40'
                  }`}
                >
                  {m === 'jazzcash' ? 'JazzCash' : 'Bank Transfer'}
                </button>
              ))}
            </div>
          </div>

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
            disabled={submitting || !file}
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
