'use client';

/**
 * Email-verification landing page.
 *
 * Supabase's confirmation email links here. Two possible arrival shapes,
 * depending on how Supabase Auth is configured on the project:
 *
 *   1. Token in URL fragment (#access_token=…&type=signup) — the default for
 *      Implicit Flow. The Supabase JS client detects the fragment on load and
 *      exchanges it for a session automatically (`detectSessionInUrl` is true
 *      by default in `@/lib/supabase`). We watch for `SIGNED_IN` /
 *      `USER_UPDATED` events and proceed.
 *
 *   2. Token in query string (?token_hash=…&type=signup) — PKCE/Server flow.
 *      We call `supabase.auth.verifyOtp({ token_hash, type })` explicitly.
 *
 * After verification we read `?next=` (a salon deep link from the register
 * flow, e.g. `/book/[slug]`) and redirect. Default landing is `/account/bookings`.
 *
 * On failure we keep the user here and render an error with a resend button
 * so they can request a fresh link without leaving the page.
 */

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Scissors } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { resendVerificationEmail } from '@/app/actions/consumer-auth';

type Status = 'checking' | 'verified' | 'invalid' | 'error';

function VerifyEmailInner() {
  const search = useSearchParams();
  const nextParam = search?.get('next') ?? '';
  const tokenHash = search?.get('token_hash');
  const type = search?.get('type'); // 'signup' | 'magiclink' | 'recovery' | 'email_change' | 'invite'

  const [status, setStatus] = useState<Status>('checking');
  const [errorMsg, setErrorMsg] = useState('');
  const [resending, setResending] = useState(false);
  const [resendEmail, setResendEmail] = useState('');

  const target = nextParam && nextParam.startsWith('/') ? nextParam : '/account/bookings';

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // PKCE/server-flow path: explicit token_hash in the query string.
      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          // Supabase narrows the type union based on this literal — 'signup'
          // is the path post-registration; we accept 'email_change' too for
          // users changing their address.
          type: (type === 'email_change' ? 'email_change' : 'signup'),
        });
        if (cancelled) return;
        if (error) {
          setStatus('invalid');
          setErrorMsg(error.message);
          return;
        }
        setStatus('verified');
        // Short pause so the user sees the "verified" state before redirect.
        setTimeout(() => {
          if (!cancelled) window.location.href = target;
        }, 800);
        return;
      }

      // Implicit-flow path: Supabase already processed the fragment on load.
      // getSession() returns the exchanged session directly.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        setStatus('verified');
        setTimeout(() => {
          if (!cancelled) window.location.href = target;
        }, 800);
        return;
      }

      // No token_hash, no session — the user probably landed here without
      // clicking the email link.
      setStatus('invalid');
      setErrorMsg('No verification token in this link.');
    }

    run();

    // Fallback listener: if Supabase fires SIGNED_IN after we've already
    // rendered 'invalid' (e.g. the fragment parse arrived late), flip to
    // 'verified' and redirect.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (session && (event === 'SIGNED_IN' || event === 'USER_UPDATED')) {
        setStatus('verified');
        setTimeout(() => {
          if (!cancelled) window.location.href = target;
        }, 800);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [tokenHash, type, target]);

  async function handleResend() {
    if (!resendEmail) return;
    setResending(true);
    try {
      const res = await resendVerificationEmail({ email: resendEmail, next: nextParam });
      if (res.error) {
        setErrorMsg(res.error);
        return;
      }
      setErrorMsg('');
      setStatus('checking');
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="w-full max-w-md space-y-5 text-center">
      {status === 'checking' && (
        <>
          <h2 className="font-heading text-xl font-bold">Verifying your email…</h2>
          <p className="text-sm text-muted-foreground">Hang tight for a moment.</p>
        </>
      )}

      {status === 'verified' && (
        <>
          <h2 className="font-heading text-xl font-bold text-green-600">Email verified</h2>
          <p className="text-sm text-muted-foreground">Redirecting you now…</p>
          <Button
            onClick={() => { window.location.href = target; }}
            className="w-full bg-gold hover:bg-gold/90 text-black font-bold"
          >
            Continue
          </Button>
        </>
      )}

      {(status === 'invalid' || status === 'error') && (
        <>
          <h2 className="font-heading text-xl font-bold">Verification link invalid or expired</h2>
          <p className="text-sm text-muted-foreground">
            {errorMsg || 'Request a new verification email below.'}
          </p>
          <div className="text-left space-y-2">
            <label htmlFor="resend-email" className="text-sm font-medium">Your email</label>
            <input
              id="resend-email"
              type="email"
              value={resendEmail}
              onChange={(e) => setResendEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border rounded-md px-3 py-2 bg-white text-sm"
            />
          </div>
          <Button
            onClick={handleResend}
            disabled={resending || !resendEmail}
            variant="outline"
            className="w-full"
          >
            {resending ? 'Resending…' : 'Resend verification email'}
          </Button>
          <div className="text-xs text-muted-foreground">
            Or{' '}
            <Link
              href={`/sign-in${nextParam ? `?next=${encodeURIComponent(nextParam)}` : ''}`}
              className="underline"
            >
              sign in
            </Link>{' '}
            if you&apos;ve already verified.
          </div>
        </>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <Scissors className="w-8 h-8 text-gold" />
          <h1 className="font-heading text-3xl font-bold">iCut</h1>
        </div>
        <Suspense fallback={<div className="text-sm text-muted-foreground text-center">Loading…</div>}>
          <VerifyEmailInner />
        </Suspense>
      </div>
    </div>
  );
}
