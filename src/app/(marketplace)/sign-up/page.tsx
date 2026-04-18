'use client';

/**
 * Consumer registration — the marketplace-side companion to `src/app/login/page.tsx`
 * (owner auth). Mirrors the owner page's layout skeleton (gold CTA, email/
 * password inputs) but targets the consumer auth transport: Supabase Auth with
 * email verification instead of the custom iCut JWT.
 *
 * After submit, Supabase sends a confirmation link to the provided email. The
 * consumer clicks through to `/verify-email`, which finalizes the session and
 * forwards to `?next=` (e.g. `/book/[slug]`) if provided.
 */

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Scissors } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { registerConsumer, resendVerificationEmail } from '@/app/actions/consumer-auth';

function RegisterForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search?.get('next') ?? '';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  // When true the form swaps to a "check your inbox" confirmation with a
  // resend button. Keeps the user on the same route so ?next= survives.
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await registerConsumer({ name, email, password, phone, next });
      if (res.error !== null) {
        toast.error(res.error);
        return;
      }
      // needsVerification=true is the expected prod path. The alternate path
      // (needsVerification=false) happens in dev when Supabase email-confirm
      // is off — jump straight to the next route.
      if (res.data.needsVerification) {
        setSubmittedEmail(email);
        toast.success('Check your inbox to verify your email');
      } else {
        router.replace(next || '/account/bookings');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!submittedEmail) return;
    const res = await resendVerificationEmail({ email: submittedEmail, next });
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Verification email resent');
  }

  if (submittedEmail) {
    return (
      <div className="w-full max-w-md space-y-5 text-center">
        <div>
          <h2 className="font-heading text-2xl font-bold">Check your email</h2>
          <p className="text-sm text-muted-foreground mt-2">
            We sent a verification link to <span className="font-medium">{submittedEmail}</span>.
            Click it to finish setting up your account.
          </p>
        </div>
        <Button
          onClick={handleResend}
          variant="outline"
          className="w-full"
        >
          Resend verification email
        </Button>
        <p className="text-xs text-muted-foreground">
          Wrong email? <button type="button" onClick={() => setSubmittedEmail(null)} className="underline">Go back</button>
        </p>
      </div>
    );
  }

  const loginHref = next ? `/sign-in?next=${encodeURIComponent(next)}` : '/sign-in';

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4">
      <div className="text-center mb-2">
        <h2 className="font-heading text-2xl font-bold">Create your account</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Book services at salons and at home.
        </p>
      </div>

      <div>
        <Label htmlFor="name">Full name</Label>
        <Input
          id="name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Ayesha Khan"
          required
          minLength={2}
          className="mt-1.5 bg-white"
        />
      </div>

      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          className="mt-1.5 bg-white"
        />
      </div>

      <div>
        <Label htmlFor="phone">Phone</Label>
        <Input
          id="phone"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="03XXXXXXXXX or +923XXXXXXXXX"
          // Allow both PK mobile formats. Server action re-validates via the
          // canonical PhoneSchema — this pattern is a hint, not the gate.
          pattern="^(?:03\d{9}|\+923\d{9})$"
          required
          className="mt-1.5 bg-white"
        />
      </div>

      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Min 10 characters"
          required
          minLength={10}
          className="mt-1.5 bg-white"
        />
      </div>

      <Button
        type="submit"
        disabled={loading}
        className="w-full bg-gold hover:bg-gold/90 text-black font-bold h-11"
      >
        {loading ? 'Creating account…' : 'Create account'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href={loginHref} className="text-gold hover:underline font-medium">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <Scissors className="w-8 h-8 text-gold" />
          <h1 className="font-heading text-3xl font-bold">iCut</h1>
        </div>
        {/* Suspense boundary: useSearchParams() requires it in Next 16 app router. */}
        <Suspense fallback={<div className="text-sm text-muted-foreground text-center">Loading…</div>}>
          <RegisterForm />
        </Suspense>
      </div>
    </div>
  );
}
