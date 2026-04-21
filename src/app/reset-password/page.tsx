'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Scissors } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { destroySession } from '@/app/actions/auth';
import { isAuthUserSalesAgent } from '@/app/actions/sales-agents';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getPasswordError, getAgentPasswordError, AGENT_MIN_PASSWORD_LENGTH } from '@/lib/schemas/common';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [validSession, setValidSession] = useState(false);
  const [isAgent, setIsAgent] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  // When the user clicks the reset link, Supabase redirects here with a
  // recovery token in the URL fragment. The JS client automatically exchanges
  // that fragment for a session with PASSWORD_RECOVERY type. We wait for the
  // session to appear before showing the form.
  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getSession();
      const has = !!data.session;
      setValidSession(has);
      if (has && data.session?.user.id) {
        const { isAgent: agent } = await isAuthUserSalesAgent(data.session.user.id);
        setIsAgent(agent);
      }
      setReady(true);
    }
    init();
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        setValidSession(true);
        if (session?.user.id) {
          const { isAgent: agent } = await isAuthUserSalesAgent(session.user.id);
          setIsAgent(agent);
        }
        setReady(true);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const validate = isAgent ? getAgentPasswordError : getPasswordError;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pwErr = validate(password);
    if (pwErr) { toast.error(pwErr); return; }
    if (password !== confirm) {
      toast.error('Passwords do not match');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      // Full session reset: the user who triggered the reset link may have been
      // a totally different identity in this browser (e.g. a super admin who
      // just created the agent). Without clearing every session surface, the
      // /login auto-redirect will trust stale Zustand and send them back to
      // the wrong dashboard. destroySession() clears the HttpOnly icut-token
      // JWT AND any leftover legacy icut-session / icut-role / icut-sub
      // cookies — no client-side document.cookie clears needed.
      await supabase.auth.signOut();
      await destroySession().catch(() => {});
      useAppStore.getState().reset();
      toast.success('Password updated — please log in with your new password');
      // Hard navigation so the next /login render starts from a fully clean
      // localStorage + cookie state, not a React state we just mutated.
      window.location.href = '/login';
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <Scissors className="w-8 h-8 text-gold" />
          <h1 className="font-heading text-3xl font-bold">iCut</h1>
        </div>

        {!ready ? (
          <div className="text-center text-muted-foreground text-sm">Checking reset link…</div>
        ) : !validSession ? (
          <div className="text-center space-y-4">
            <h2 className="font-heading text-xl font-bold">Reset link expired</h2>
            <p className="text-sm text-muted-foreground">
              This password reset link is invalid or has expired. Request a new one from the login page.
            </p>
            <Button onClick={() => router.push('/login')} className="bg-gold hover:bg-gold/90 text-black font-bold">
              Back to login
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <h2 className="font-heading text-xl font-bold text-center">Set a new password</h2>
            <div>
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={isAgent ? AGENT_MIN_PASSWORD_LENGTH : 10}
                required
                className="mt-1.5"
                placeholder={isAgent ? `Min ${AGENT_MIN_PASSWORD_LENGTH} characters` : 'Min 10 characters'}
              />
            </div>
            <div>
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={isAgent ? AGENT_MIN_PASSWORD_LENGTH : 8}
                required
                className="mt-1.5"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {isAgent
                  ? `Min ${AGENT_MIN_PASSWORD_LENGTH} characters. Keep it simple and easy to remember.`
                  : 'Min 8 characters, with an uppercase letter, a number, and a special character.'}
              </p>
              {password && confirm && password !== confirm && (
                <p className="text-xs text-destructive mt-1">Passwords do not match</p>
              )}
            </div>
            <Button
              type="submit"
              disabled={saving || !!validate(password) || password !== confirm}
              className="w-full bg-gold hover:bg-gold/90 text-black font-bold"
            >
              {saving ? 'Updating…' : 'Update password'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
