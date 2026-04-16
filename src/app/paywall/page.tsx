'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Scissors, Lock, Clock, AlertTriangle, Copy, CheckCircle2, LogOut, RefreshCw, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { destroySession, checkSubscriptionStatus } from '@/app/actions/auth';
import { getPaywallContext } from '@/app/actions/payment-requests';
import { useAppStore } from '@/store/app-store';
import { BANK_DETAILS, DEFAULT_PLANS, type PlanOption } from '@/lib/bank-details';
import { PaymentSubmitModal } from '@/components/payment-submit-modal';

interface Context {
  salon: { id: string; name: string; subscription_status: string; subscription_plan: string | null };
  pendingRequest: { id: string; plan: string; amount: number; created_at: string; method: string | null } | null;
  planPrices: Record<'basic' | 'growth' | 'pro', number>;
}

const STATUS_COPY: Record<string, { title: string; subtitle: string; tone: 'amber' | 'red' | 'gold'; Icon: typeof Lock }> = {
  pending: {
    title: 'Awaiting payment',
    subtitle: 'Subscribe to unlock your dashboard.',
    tone: 'gold',
    Icon: Clock,
  },
  expired: {
    title: 'Subscription expired',
    subtitle: 'Renew to regain access to your salon dashboard.',
    tone: 'amber',
    Icon: AlertTriangle,
  },
  suspended: {
    title: 'Account suspended',
    subtitle: 'Please contact support to reactivate your account.',
    tone: 'red',
    Icon: Lock,
  },
};

function copy(value: string, label: string) {
  navigator.clipboard.writeText(value).then(() => toast.success(`${label} copied`));
}

export default function PaywallPage() {
  const router = useRouter();
  const [ctx, setCtx] = useState<Context | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<PlanOption | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await getPaywallContext();
    if (error || !data) {
      toast.error(error || 'Could not load paywall');
      setLoading(false);
      return;
    }
    setCtx(data as Context);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Poll subscription status every 30s. If admin approves while we're sitting
  // here, the cookie + state flip and we redirect to the dashboard.
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const { status } = await checkSubscriptionStatus();
        if (status === 'active') {
          router.push('/dashboard');
        }
      } catch {
        // Auth gone — let the layout/proxy bounce on next nav.
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [router]);

  async function manualRefresh() {
    setRefreshing(true);
    try {
      const { status } = await checkSubscriptionStatus();
      if (status === 'active') {
        router.push('/dashboard');
        return;
      }
      await load();
      toast.success('Status refreshed');
    } catch {
      toast.error('Could not refresh');
    } finally {
      setRefreshing(false);
    }
  }

  async function logout() {
    document.cookie = 'icut-session=; path=/; max-age=0';
    document.cookie = 'icut-role=; path=/; max-age=0';
    document.cookie = 'icut-sub=; path=/; max-age=0';
    useAppStore.getState().reset();
    await destroySession().catch(() => {});
    window.location.href = '/login';
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gold" />
      </div>
    );
  }

  if (!ctx) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Could not load your account. <button onClick={logout} className="text-gold hover:underline">Sign out</button></p>
      </div>
    );
  }

  const status = ctx.salon.subscription_status;
  const copy_ = STATUS_COPY[status] || STATUS_COPY.pending;
  const StatusIcon = copy_.Icon;
  const isSuspended = status === 'suspended';

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="border-b border-border bg-card">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gold/15 flex items-center justify-center">
              <Scissors className="w-4 h-4 text-gold" />
            </div>
            <span className="font-heading text-base font-bold tracking-tight">iCut</span>
          </div>
          <button onClick={logout} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6 sm:py-10 space-y-6">
        {/* Status banner */}
        <div className={`rounded-lg p-5 sm:p-6 border ${
          copy_.tone === 'red' ? 'bg-red-500/5 border-red-500/30' :
          copy_.tone === 'amber' ? 'bg-amber-500/5 border-amber-500/30' :
          'bg-gold/5 border-gold/30'
        }`}>
          <div className="flex items-start gap-3">
            <StatusIcon className={`w-5 h-5 shrink-0 mt-0.5 ${
              copy_.tone === 'red' ? 'text-red-600' :
              copy_.tone === 'amber' ? 'text-amber-600' :
              'text-gold'
            }`} />
            <div className="flex-1 min-w-0">
              <p className="font-heading text-lg font-bold">{copy_.title}</p>
              <p className="text-sm text-muted-foreground mt-0.5">{copy_.subtitle}</p>
              <p className="text-xs text-muted-foreground mt-2">Salon: <span className="font-medium text-foreground">{ctx.salon.name}</span></p>
            </div>
          </div>
        </div>

        {/* Suspended: contact support only */}
        {isSuspended && (
          <div className="bg-card border border-border rounded-lg p-5 text-center space-y-3">
            <p className="text-sm">Reach out on WhatsApp to reactivate your account.</p>
            <a
              href={`https://wa.me/${BANK_DETAILS.supportWhatsapp}?text=${encodeURIComponent(`Hi, my iCut account "${ctx.salon.name}" has been suspended. Please help.`)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button className="bg-gold text-black hover:bg-gold/90 font-semibold">Contact support</Button>
            </a>
          </div>
        )}

        {/* Pending request: show waiting state */}
        {!isSuspended && ctx.pendingRequest && (
          <div className="bg-card border border-border rounded-lg p-5 space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-sm">Payment submitted</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Submitted on {new Date(ctx.pendingRequest.created_at).toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · Rs {ctx.pendingRequest.amount.toLocaleString()} · {ctx.pendingRequest.plan} plan
                </p>
                <p className="text-xs text-muted-foreground mt-2">Admin usually approves within minutes during business hours. We&apos;ll auto-refresh every 30 seconds.</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={manualRefresh} disabled={refreshing} className="w-full">
              {refreshing ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Checking…</> : <><RefreshCw className="w-3.5 h-3.5 mr-2" /> I&apos;ve been approved — check now</>}
            </Button>
          </div>
        )}

        {/* Plan picker (hidden if a pending request exists or suspended) */}
        {!isSuspended && !ctx.pendingRequest && (
          <>
            <div className="bg-card border border-border rounded-lg p-5 sm:p-6 space-y-4">
              <p className="text-sm font-semibold">Choose your plan</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {DEFAULT_PLANS.map((plan) => {
                  const livePrice = ctx.planPrices[plan.key] ?? plan.price;
                  const merged = { ...plan, price: livePrice };
                  const isSelected = selectedPlan?.key === plan.key;
                  return (
                    <button
                      key={plan.key}
                      onClick={() => setSelectedPlan(merged)}
                      className={`text-left border rounded-lg p-4 transition-all ${
                        isSelected ? 'border-gold bg-gold/5 ring-2 ring-gold/30' : 'border-border hover:border-gold/50'
                      }`}
                    >
                      <p className="font-semibold">{plan.name}</p>
                      <p className="text-lg font-bold mt-1">
                        Rs {livePrice.toLocaleString()}
                        <span className="text-xs font-normal text-muted-foreground">/mo</span>
                      </p>
                      <ul className="mt-3 space-y-1">
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
            </div>

            {/* Bank details + submit */}
            {selectedPlan && (
              <div className="bg-card border border-border rounded-lg p-5 sm:p-6 space-y-4">
                <p className="text-sm font-semibold">Payment details</p>
                <div className="bg-gold/5 border border-gold/20 rounded-lg p-3">
                  <p className="text-sm font-semibold">Amount: Rs {selectedPlan.price.toLocaleString()} / month</p>
                </div>

                <div className="space-y-2 text-sm">
                  {([
                    ['Bank', BANK_DETAILS.bankName, false],
                    ['Account Title', BANK_DETAILS.accountTitle, false],
                    ['Account Number', BANK_DETAILS.accountNumber, true],
                    ['JazzCash', BANK_DETAILS.jazzcash, true],
                  ] as const).map(([label, value, copyable]) => (
                    <div key={label} className="flex items-center justify-between gap-3 p-3 bg-secondary/30 rounded-lg">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className={`font-medium break-all ${copyable ? 'font-mono' : ''}`}>{value}</p>
                      </div>
                      {copyable && (
                        <button onClick={() => copy(value, label)} className="p-2 hover:bg-secondary rounded shrink-0">
                          <Copy className="w-4 h-4 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="bg-secondary/30 border border-border rounded-lg p-4 space-y-1 text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground text-sm">How to activate</p>
                  <p>1. Send the amount to the bank account or JazzCash number above</p>
                  <p>2. Tap &quot;Submit payment&quot; below and upload the screenshot</p>
                  <p>3. Admin approves within minutes during business hours</p>
                </div>

                <Button
                  onClick={() => setModalOpen(true)}
                  className="w-full bg-gold text-black hover:bg-gold/90 font-semibold h-11"
                >
                  Submit payment
                </Button>
              </div>
            )}
          </>
        )}
      </main>

      {selectedPlan && (
        <PaymentSubmitModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          plan={selectedPlan}
          onSubmitted={load}
        />
      )}
    </div>
  );
}
