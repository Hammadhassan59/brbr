'use client';

/**
 * Consumer login — the marketplace-side sign-in form. Separate from the
 * owner/staff login at `src/app/login/page.tsx` (which issues the custom
 * `icut-token` JWT); this one authenticates via Supabase Auth cookies written
 * by auth-helpers-nextjs.
 *
 * On success we redirect to `?next=` if present (so post-register verification
 * flows or deep links resume where they left off), else to `/account/bookings`
 * which is the default consumer landing.
 */

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Scissors } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loginConsumer } from '@/app/actions/consumer-auth';

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search?.get('next') ?? '';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await loginConsumer({ email, password });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      // Hard navigation so server components (e.g. account layouts) pick up
      // the freshly-written sb-*-auth-token cookies on first render. Without
      // this, a soft router.push would render from the pre-login cookie jar.
      const target = next && next.startsWith('/') ? next : '/account/bookings';
      window.location.href = target;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  const registerHref = next ? `/sign-up?next=${encodeURIComponent(next)}` : '/sign-up';

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4">
      <div className="text-center mb-2">
        <h2 className="font-heading text-2xl font-bold">Welcome back</h2>
        <p className="text-sm text-muted-foreground mt-1">Sign in to your iCut account.</p>
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
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="mt-1.5 bg-white"
        />
      </div>

      <Button
        type="submit"
        disabled={loading}
        className="w-full bg-gold hover:bg-gold/90 text-black font-bold h-11"
      >
        {loading ? 'Signing in…' : 'Sign in'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        New to iCut?{' '}
        <Link href={registerHref} className="text-gold hover:underline font-medium">
          Create an account
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <Scissors className="w-8 h-8 text-gold" />
          <h1 className="font-heading text-3xl font-bold">iCut</h1>
        </div>
        <Suspense fallback={<div className="text-sm text-muted-foreground text-center">Loading…</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
