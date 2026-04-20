'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Scissors } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/components/providers/language-provider';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { DataNotice } from '@/components/data-notice';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signSession, resolveUserRole, isSuperAdminEmail, resolveAdminRole, getSessionInfo } from '@/app/actions/auth';
import { getPasswordError } from '@/lib/schemas/common';
import { isAdminRole } from '@/lib/admin-roles';
import {
  DEMO_SALON, DEMO_BRANCH, DEMO_STAFF_OWNER, DEMO_STAFF_STYLIST, DEMO_STAFF_RECEPTIONIST,
  DEMO_SALON_GENTS, DEMO_BRANCH_GENTS, DEMO_BRANCH_GENTS_2,
  DEMO_GENTS_OWNER, DEMO_GENTS_BARBER_SENIOR, DEMO_GENTS_BARBER_JUNIOR, DEMO_GENTS_HELPER,
  DEMO_STAFF_SUPERADMIN,
  DEMO_PARTNER_ROYAL,
} from '@/lib/demo-data';
import { DEMO_SALON_ID, DEMO_BRANCH_ID } from '@/lib/demo-salon-constants';
import type { Salon, Branch, Staff, SalonPartner } from '@/types/database';

const IS_DEV = process.env.NODE_ENV === 'development';

// The proxy now verifies the HttpOnly icut-token JWT for session + role +
// subscription state. We no longer write icut-session / icut-role client-side
// — they were non-HttpOnly and any XSS could forge "icut-role=super_admin".
// signSession (server action) is the only session writer.

type AuthMode = 'login' | 'signup' | 'verify';

function friendlyAuthError(raw: string): string {
  const msg = raw || '';
  if (/already.*registered|already.*exists|already.*been registered/i.test(msg)) {
    return 'This email is already registered. Try signing in instead — or use a different email.';
  }
  if (/password.*at least|password.*short|password.*weak|password.*required|password.*must contain/i.test(msg)) {
    return 'Password must be at least 8 characters and include an uppercase letter, a number, and a special character.';
  }
  if (/invalid.*email|valid.*email|email.*format/i.test(msg)) {
    return 'Please enter a valid email address.';
  }
  if (/rate.?limit|too many/i.test(msg)) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (/invalid.*token|expired|otp.*expired|otp.*invalid|token.*not.*found/i.test(msg)) {
    return 'That code is invalid or expired. Check your email for the latest code, or tap Resend.';
  }
  return msg || 'Something went wrong. Please try again.';
}

export default function LoginPage() {
  const router = useRouter();
  const { t, language, setLanguage } = useLanguage();
  const { setSalon, setBranches, setCurrentBranch, setCurrentStaff, setCurrentPartner, setIsOwner, setIsPartner } = useAppStore();

  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // OTP email verification state (used when authMode === 'verify').
  const [otpCode, setOtpCode] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick down the resend cooldown once per second. Cleared on unmount.
  useEffect(() => {
    if (resendCooldown <= 0) {
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
      return;
    }
    if (!cooldownTimerRef.current) {
      cooldownTimerRef.current = setInterval(() => {
        setResendCooldown((s) => Math.max(0, s - 1));
      }, 1000);
    }
    return () => {
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
    };
  }, [resendCooldown]);

  // Redirect already-authenticated users to their dashboard. The iCut JWT is
  // HttpOnly so the client can't read it directly; we ask the server via
  // getSessionInfo() instead. Zustand persists in localStorage and can outlive
  // the actual session (e.g. after a password reset by a different identity
  // in the same browser, the JWT is gone but Zustand still says "you're a
  // super admin"). If the server says "no session", wipe the stale store and
  // stay on the login form.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const info = await getSessionInfo();
      if (cancelled) return;
      const store = useAppStore.getState();
      const persistedRoles = store.salon || store.currentStaff || store.currentPartner || store.isSuperAdmin || store.isSalesAgent;
      if (!info) {
        if (persistedRoles) store.reset();
        return;
      }
      // Owners/partners without a salonId never finished setup — send them
      // to /setup, not /dashboard. Without this, /dashboard's layout sees an
      // empty Zustand store, bounces to /login, and the loop starts here
      // because /login immediately redirects back to /dashboard.
      const needsSetup = (info.role === 'owner' || info.role === 'partner') && !info.salonId;
      router.replace(
        info.role === 'super_admin' || info.role === 'technical_support' || info.role === 'customer_support' || info.role === 'leads_team' ? '/admin' :
        info.role === 'sales_agent' ? '/agent/leads' :
        needsSetup ? '/setup' :
        '/dashboard',
      );
    })();
    return () => { cancelled = true; };
  }, [router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const [result, superAdmin, adminRole] = await Promise.all([
        resolveUserRole(data.user.id, data.user.email || email),
        isSuperAdminEmail(data.user.email || email),
        resolveAdminRole(data.user.email || email),
      ]);

      const { setIsSuperAdmin } = useAppStore.getState();
      if (superAdmin) setIsSuperAdmin(true);

      // Sub-admin (technical_support / customer_support / leads_team): they
      // sit outside the owner/staff/agent/super_admin tree. Land them on
      // /admin which renders only what their role can access.
      if (adminRole && isAdminRole(adminRole) && adminRole !== 'super_admin') {
        const store = useAppStore.getState();
        store.setIsSuperAdmin(true); // re-use the super_admin Zustand bit so admin layout shows
        store.setIsSalesAgent(false);
        store.setIsOwner(false);
        store.setIsPartner(false);
        store.setSalon(null);
        store.setCurrentStaff(null);
        store.setCurrentPartner(null);
        await signSession({
          salonId: 'super-admin',
          staffId: data.user.id,
          role: adminRole,
          primaryBranchId: '',
          branchId: '',
          branchIds: [],
          permissions: { '*': true },
          name: data.user.email || email,
        });
        router.push('/admin');
        return;
      }

      if (result.type === 'sales_agent' && result.agent) {
        // Demo agent path: land them in the shared demo salon as a synthetic
        // owner so they can showcase the full product. Real demo data lives
        // in DB (seeded by migration 032 + reset cron), so we don't have to
        // pre-populate Zustand from Supabase queries — just mirror the owner
        // shape with the demo salon id and let the dashboard layout's
        // getDashboardBootstrap() fetch fill in the rest.
        if (result.agent.is_demo) {
          const { setIsSalesAgent, setAgentId, setIsSuperAdmin } = useAppStore.getState();
          setIsSuperAdmin(false);
          setIsSalesAgent(false);
          setAgentId(null);
          setIsPartner(false);
          setCurrentStaff(null);
          setCurrentPartner(null);
          // Minimal client-side placeholder; the real salon row is loaded from
          // the server on /dashboard mount. Shape matches `Salon` closely
          // enough for the layout's optional chains.
          setSalon({
            id: DEMO_SALON_ID,
            name: 'Demo Salon',
            subscription_status: 'active',
          } as unknown as Salon);
          setBranches([]);
          setCurrentBranch(null);
          setIsOwner(true);
          // branchIds + permissions resolved by signSession from the DB
          // (owner => all branches, permissions => { "*": true }).
          await signSession({
            salonId: DEMO_SALON_ID,
            staffId: data.user.id,
            role: 'owner',
            primaryBranchId: DEMO_BRANCH_ID,
            name: `${result.agent.name} (demo)`,
            isDemo: true,
            agentId: result.agent.id,
          });
          router.push('/dashboard');
          return;
        }

        // Real sales agent — lands on /agent/leads.
        const { setIsSalesAgent, setAgentId, setIsSuperAdmin } = useAppStore.getState();
        setIsSuperAdmin(false);
        setIsOwner(false);
        setIsPartner(false);
        setCurrentStaff(null);
        setCurrentPartner(null);
        setSalon(null);
        setBranches([]);
        setCurrentBranch(null);
        setIsSalesAgent(true);
        setAgentId(result.agent.id);
        await signSession({
          salonId: '',
          staffId: data.user.id,
          role: 'sales_agent',
          primaryBranchId: '',
          branchIds: [],
          permissions: { '*': true },
          name: result.agent.name,
          agentId: result.agent.id,
          isDemo: false,
        });
        router.push('/agent/leads');
        return;
      }

      if (result.type === 'none') {
        if (superAdmin) {
          await signSession({ salonId: 'super-admin', staffId: data.user.id, role: 'super_admin', branchId: '', name: 'Super Admin' });
          router.push('/admin');
          return;
        }
        // New user with no salon — go to setup
        router.push('/setup');
        return;
      }

      if (result.salon) {
        setSalon(result.salon);
        setBranches(result.branches);
        const mainBranch = result.branches.find((b: Branch) => b.is_main) || result.branches[0];
        if (mainBranch) setCurrentBranch(mainBranch);

        if (result.type === 'owner') {
          setCurrentStaff(null);
          setCurrentPartner(null);
          setIsOwner(true);
          setIsPartner(false);
          useAppStore.getState().setIsSuperAdmin(false);
          // Owners see every branch in the salon. We pass the explicit list +
          // full-access permissions here (rather than letting signSession
          // re-query) because we already loaded result.branches above — saves
          // one roundtrip per login.
          await signSession({
            salonId: result.salon.id,
            staffId: data.user.id,
            role: 'owner',
            primaryBranchId: mainBranch?.id || '',
            branchIds: result.branches.map((b: Branch) => b.id),
            permissions: { '*': true },
            name: 'Owner',
          });
        } else if (result.type === 'partner') {
          setCurrentPartner(result.partner);
          setIsPartner(true);
          setIsOwner(false);
          setCurrentStaff(null);
          useAppStore.getState().setIsSuperAdmin(false);
          // Partners have the same cross-branch reach as owners.
          await signSession({
            salonId: result.salon.id,
            staffId: result.partner!.id,
            role: 'partner',
            primaryBranchId: mainBranch?.id || '',
            branchIds: result.branches.map((b: Branch) => b.id),
            permissions: { '*': true },
            name: result.partner!.name,
          });
        } else if (result.type === 'staff') {
          setCurrentStaff(result.staff);
          setCurrentPartner(null);
          setIsOwner(false);
          setIsPartner(false);
          useAppStore.getState().setIsSuperAdmin(false);
          // Read the staff's multi-branch grants from staff_branches (shipped
          // in migration 036). The signSession call will fall back to
          // [primaryBranchId] if the table/columns aren't populated yet.
          //
          const staffRow = result.staff!;
          const primary = staffRow.primary_branch_id || mainBranch?.id || '';
          await signSession({
            salonId: result.salon.id,
            staffId: result.staff!.id,
            role: result.staff!.role,
            primaryBranchId: primary,
            // branchIds + permissions resolved by signSession from
            // staff_branches + role_presets + staff.permissions_override.
            name: result.staff!.name,
          });
        }

        router.push('/dashboard');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    const pwErr = getPasswordError(password);
    if (pwErr) { toast.error(pwErr); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      if (!data.user) throw new Error('Signup failed. Please try again.');

      // Supabase user-enumeration protection: when email confirmations are
      // required AND the email already exists, signUp returns a fake user row
      // with identities=[] and no session. The row might belong to either
      // (a) a fully-confirmed user — really "already registered"
      // (b) an UNCONFIRMED user who gave up mid-verify on a prior attempt
      //
      // We can't tell which from the signUp response, so we call resend:
      // GoTrue resends the confirmation code for unconfirmed users and
      // errors ('User already registered'/'email_exists') for confirmed
      // ones. That lets abandoned signups resume seamlessly instead of
      // getting stuck behind a misleading "already registered" toast.
      if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        const { error: resendErr } = await supabase.auth.resend({ type: 'signup', email });
        if (resendErr) {
          toast.error(friendlyAuthError(resendErr.message));
          return;
        }
        setAuthMode('verify');
        setOtpCode('');
        setResendCooldown(30);
        toast.success(`We sent a 6-digit code to ${email}`);
        return;
      }

      // Legacy path: if GoTrue still has GOTRUE_MAILER_AUTOCONFIRM=true, it
      // returns a session immediately. Mint the iCut JWT and forward to
      // /setup. This branch becomes dead once AUTOCONFIRM is flipped off.
      if (data.session) {
        setIsOwner(true);
        await signSession({
          salonId: '',
          staffId: data.user.id,
          role: 'owner',
          branchId: '',
          name: data.user.email || email,
        });
        toast.success('Account created!');
        window.location.href = '/setup';
        return;
      }

      // Normal path (confirmations required): flip to the OTP code-entry
      // screen. GoTrue has already sent a 6-digit code via Resend SMTP.
      setAuthMode('verify');
      setOtpCode('');
      setResendCooldown(30);
      toast.success(`We sent a 6-digit code to ${email}`);
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : '';
      toast.error(friendlyAuthError(raw));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    const code = otpCode.trim();
    if (!/^\d{6}$/.test(code)) {
      toast.error('Enter the 6-digit code from your email.');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'signup',
      });
      if (error) throw error;
      if (!data.session || !data.user) {
        throw new Error('Verification did not return a session. Please try again.');
      }
      setIsOwner(true);
      await signSession({
        salonId: '',
        staffId: data.user.id,
        role: 'owner',
        branchId: '',
        name: data.user.email || email,
      });
      toast.success('Email verified!');
      window.location.href = '/setup';
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : '';
      toast.error(friendlyAuthError(raw));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email });
      if (error) throw error;
      setResendCooldown(30);
      toast.success('Sent a new code. Check your inbox.');
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : '';
      toast.error(friendlyAuthError(raw));
    }
  }

  // --- Demo helpers (dev only) ---

  async function demoLoginSuperAdmin() {
    if (!IS_DEV) return;
    const { setIsSuperAdmin } = useAppStore.getState();
    setIsSuperAdmin(true);
    setIsOwner(false);
    setCurrentStaff(DEMO_STAFF_SUPERADMIN);
    setSalon(null);
    setBranches([]);
    setCurrentBranch(null);
    setCurrentPartner(null);
    setIsPartner(false);
    await signSession({ salonId: 'super-admin', staffId: DEMO_STAFF_SUPERADMIN.id, role: 'super_admin', branchId: '', name: 'Super Admin' });
    toast.success('Super Admin mode activated');
    router.push('/admin');
  }

  async function demoLoginAs(salonData: Salon, branchData: Branch, staffData: Staff, allBranches?: Branch[]) {
    if (!IS_DEV) return;
    const { setIsSuperAdmin } = useAppStore.getState();
    setIsSuperAdmin(false);
    const isDemoOwner = staffData.role === 'owner';
    setIsOwner(isDemoOwner);
    setSalon(salonData);
    setBranches(allBranches || [branchData]);
    setCurrentBranch(branchData);
    setCurrentStaff(staffData);
    setCurrentPartner(null);
    setIsPartner(false);
    await signSession({ salonId: salonData.id, staffId: staffData.id, role: staffData.role, branchId: branchData.id, name: staffData.name });
    toast.success(`Logged in as ${staffData.name} (${staffData.role.replace('_', ' ')}) — ${salonData.name}`);
    router.push('/dashboard');
  }

  async function demoLoginAsPartner(salonData: Salon, partnerData: SalonPartner, allBranches: Branch[]) {
    if (!IS_DEV) return;
    const { setIsSuperAdmin } = useAppStore.getState();
    setIsSuperAdmin(false);
    setIsOwner(false);
    setSalon(salonData);
    setBranches(allBranches);
    const mainBranch = allBranches.find((b) => b.is_main) || allBranches[0];
    setCurrentBranch(mainBranch);
    setCurrentStaff(null);
    setCurrentPartner(partnerData);
    setIsPartner(true);
    await signSession({ salonId: salonData.id, staffId: partnerData.id, role: 'partner', branchId: mainBranch?.id || '', name: partnerData.name });
    toast.success(`Logged in as ${partnerData.name} (Owner) — ${salonData.name}`);
    router.push('/dashboard');
  }

  const royalBranches = [DEMO_BRANCH_GENTS, DEMO_BRANCH_GENTS_2];

  return (
    <div className="min-h-screen flex">
      <DataNotice />
      {/* Left branding panel — hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#1A1A1A] text-white flex-col items-center justify-center p-12 relative overflow-hidden border-r border-[#2A2A2A]">
        <div className="relative z-10 text-center">
          <div className="flex items-center justify-center gap-3 mb-6">
            <Scissors className="w-10 h-10 text-gold" />
            <h1 className="font-heading text-4xl font-bold tracking-tight">iCut</h1>
          </div>
          <p className="text-sm text-gold font-heading tracking-widest uppercase mb-2">{t('tagline')}</p>
          <p className="text-muted-foreground text-xs">icut.pk</p>
        </div>
      </div>

      {/* Right login form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 bg-background">
        {/* Language toggle */}
        <div className="absolute top-4 right-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLanguage(language === 'en' ? 'ur' : 'en')}
            aria-label="Switch language"
          >
            {language === 'en' ? 'اردو' : 'EN'}
          </Button>
        </div>

        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2 mb-8">
          <Scissors className="w-8 h-8 text-gold" />
          <h1 className="font-heading text-3xl font-bold text-navy">iCut</h1>
        </div>

        <div className="w-full max-w-md">
          {authMode === 'verify' ? (
            <form onSubmit={handleVerify} className="space-y-5 animate-fade-up">
              <div className="text-center mb-2">
                <div className="w-12 h-12 mx-auto rounded-full bg-gold/15 flex items-center justify-center mb-3">
                  <Scissors className="w-6 h-6 text-gold" />
                </div>
                <h2 className="font-heading text-2xl font-bold tracking-tight">Check your email</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>
                </p>
              </div>
              <div>
                <Label htmlFor="otp">Verification code</Label>
                <Input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  pattern="\d{6}"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  required
                  autoFocus
                  className="mt-1.5 border-border bg-white text-center text-2xl tracking-[0.4em] font-mono"
                />
                <p className="text-xs text-muted-foreground mt-1">The code expires in 10 minutes.</p>
              </div>
              <Button type="submit" className="w-full bg-gold hover:bg-gold/90 text-black border border-gold" disabled={loading || otpCode.length !== 6}>
                {loading ? 'Verifying…' : 'Verify & continue'}
              </Button>
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCooldown > 0}
                  className="text-gold hover:underline font-medium disabled:text-muted-foreground disabled:hover:no-underline disabled:cursor-not-allowed"
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                </button>
                <button
                  type="button"
                  onClick={() => { setAuthMode('signup'); setOtpCode(''); setResendCooldown(0); }}
                  className="text-muted-foreground hover:underline"
                >
                  Use different email
                </button>
              </div>
            </form>
          ) : (
          <form onSubmit={authMode === 'login' ? handleLogin : handleSignup} className="space-y-4 animate-fade-up">
            <div>
              <Label htmlFor="email">{t('email')}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="mt-1.5 border-border bg-white"
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t('password')}</Label>
                {authMode === 'login' && (
                  <button
                    type="button"
                    className="text-xs text-gold hover:underline"
                    onClick={async () => {
                      if (!email.trim()) {
                        toast.error('Enter your email first');
                        return;
                      }
                      try {
                        const origin = typeof window !== 'undefined' ? window.location.origin : 'https://icut.pk';
                        const { error } = await supabase.auth.resetPasswordForEmail(email, {
                          redirectTo: `${origin}/reset-password`,
                        });
                        if (error) throw error;
                        toast.success('Password reset email sent — check your inbox');
                      } catch (err: unknown) {
                        toast.error(err instanceof Error ? err.message : 'Failed to send reset email');
                      }
                    }}
                  >
                    {t('forgotPassword')}
                  </button>
                )}
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={authMode === 'signup' ? 8 : 6}
                className="mt-1.5 border-border bg-white"
              />
              {authMode === 'signup' && (
                <p className="text-xs text-muted-foreground mt-1">Min 8 characters, with an uppercase letter, a number, and a special character.</p>
              )}
            </div>
            <Button type="submit" className="w-full bg-gold hover:bg-gold/90 text-black border border-gold" disabled={loading}>
              {loading ? t('loading') : authMode === 'login' ? t('login') : 'Create Account'}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {authMode === 'login' ? (
                <>New here? <button type="button" onClick={() => setAuthMode('signup')} className="text-gold hover:underline font-medium">Create an account</button></>
              ) : (
                <>Already have an account? <button type="button" onClick={() => setAuthMode('login')} className="text-gold hover:underline font-medium">Log in</button></>
              )}
            </p>
          </form>
          )}

          {/* Demo Accounts — development only */}
          {IS_DEV && <div className="mt-8 pt-6 border-t border-dashed">
            <p className="text-xs text-muted-foreground text-center mb-3">Quick Demo Access (no Supabase required)</p>
            <div className="space-y-5">

              {/* Super Admin */}
              <div>
                <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wider mb-1.5">Platform Admin</p>
                <button onClick={demoLoginSuperAdmin} className="w-full flex items-center gap-3 p-3 rounded-lg border-2 border-red-400/40 bg-red-500/10 hover:bg-red-500/15 transition-all text-left">
                  <div className="w-10 h-10 rounded-full bg-red-500/15 text-red-600 font-bold flex items-center justify-center shrink-0 text-xs">SA</div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">iCut Super Admin</p>
                    <p className="text-[10px] text-muted-foreground">Platform panel: all salons, all users, analytics, platform settings</p>
                  </div>
                  <span className="text-[10px] bg-red-500/15 text-red-600 px-2 py-0.5 rounded-full font-medium">Super</span>
                </button>
              </div>

              {/* Royal Barbers — all roles share one salon so data is visible across roles */}
              <div>
                <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wider mb-1.5">Royal Barbers — Islamabad (2 branches)</p>
                <div className="space-y-1.5">
                  <button onClick={() => demoLoginAs(DEMO_SALON_GENTS, DEMO_BRANCH_GENTS, DEMO_GENTS_OWNER, royalBranches)} className="w-full flex items-center gap-3 p-2.5 rounded-lg border-2 border-gold/30 bg-gold/5 hover:bg-gold/10 transition-all text-left">
                    <div className="w-9 h-9 rounded-full bg-gold/20 text-gold font-bold flex items-center justify-center shrink-0 text-xs">AR</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">Ahmed Raza</p>
                      <p className="text-[10px] text-muted-foreground">Owner — Full access, multi-branch</p>
                    </div>
                    <span className="text-[10px] bg-gold/20 text-gold px-2 py-0.5 rounded-full font-medium shrink-0">Owner</span>
                  </button>
                  <button onClick={() => demoLoginAsPartner(DEMO_SALON_GENTS, DEMO_PARTNER_ROYAL, royalBranches)} className="w-full flex items-center gap-3 p-2.5 rounded-lg border-2 border-gold/30 bg-gold/5 hover:bg-gold/10 transition-all text-left">
                    <div className="w-9 h-9 rounded-full bg-gold/20 text-gold font-bold flex items-center justify-center shrink-0 text-xs">IM</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">Imran Malik</p>
                      <p className="text-[10px] text-muted-foreground">Co-Owner — Full access</p>
                    </div>
                    <span className="text-[10px] bg-gold/20 text-gold px-2 py-0.5 rounded-full font-medium shrink-0">Owner</span>
                  </button>
                  <button onClick={() => demoLoginAs(DEMO_SALON_GENTS, DEMO_BRANCH_GENTS, DEMO_STAFF_OWNER, royalBranches)} className="w-full flex items-center gap-3 p-2.5 rounded-lg border-2 border-gold/30 bg-gold/5 hover:bg-gold/10 transition-all text-left">
                    <div className="w-9 h-9 rounded-full bg-gold/20 text-gold font-bold flex items-center justify-center shrink-0 text-xs">FK</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">Fatima Khan</p>
                      <p className="text-[10px] text-muted-foreground">Manager — Full access</p>
                    </div>
                    <span className="text-[10px] bg-gold/20 text-gold px-2 py-0.5 rounded-full font-medium shrink-0">Manager</span>
                  </button>
                  <button onClick={() => demoLoginAs(DEMO_SALON_GENTS, DEMO_BRANCH_GENTS, DEMO_STAFF_STYLIST, royalBranches)} className="w-full flex items-center gap-3 p-2.5 rounded-lg border hover:border-purple-500/25 hover:bg-purple-500/10 transition-all text-left">
                    <div className="w-9 h-9 rounded-full bg-purple-500/15 text-purple-600 font-bold flex items-center justify-center shrink-0 text-xs">SA</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">Sadia Ahmed</p>
                      <p className="text-[10px] text-muted-foreground">Senior Stylist — Appointments only</p>
                    </div>
                    <span className="text-[10px] bg-purple-500/15 text-purple-600 px-2 py-0.5 rounded-full font-medium shrink-0">Stylist</span>
                  </button>
                  <button onClick={() => demoLoginAs(DEMO_SALON_GENTS, DEMO_BRANCH_GENTS, DEMO_STAFF_RECEPTIONIST, royalBranches)} className="w-full flex items-center gap-3 p-2.5 rounded-lg border hover:border-teal-500/25 hover:bg-teal-500/10 transition-all text-left">
                    <div className="w-9 h-9 rounded-full bg-teal-500/15 text-teal-600 font-bold flex items-center justify-center shrink-0 text-xs">ZB</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">Zainab Bibi</p>
                      <p className="text-[10px] text-muted-foreground">Receptionist — Appointments, clients, POS</p>
                    </div>
                    <span className="text-[10px] bg-teal-500/15 text-teal-600 px-2 py-0.5 rounded-full font-medium shrink-0">Reception</span>
                  </button>
                  <button onClick={() => demoLoginAs(DEMO_SALON_GENTS, DEMO_BRANCH_GENTS, DEMO_GENTS_BARBER_SENIOR, royalBranches)} className="w-full flex items-center gap-3 p-2.5 rounded-lg border hover:border-purple-500/25 hover:bg-purple-500/10 transition-all text-left">
                    <div className="w-9 h-9 rounded-full bg-purple-500/15 text-purple-600 font-bold flex items-center justify-center shrink-0 text-xs">UG</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">Usman Ghani</p>
                      <p className="text-[10px] text-muted-foreground">Senior Barber</p>
                    </div>
                    <span className="text-[10px] bg-purple-500/15 text-purple-600 px-2 py-0.5 rounded-full font-medium shrink-0">Sr. Barber</span>
                  </button>
                  <button onClick={() => demoLoginAs(DEMO_SALON_GENTS, DEMO_BRANCH_GENTS, DEMO_GENTS_BARBER_JUNIOR, royalBranches)} className="w-full flex items-center gap-3 p-2.5 rounded-lg border hover:border-indigo-500/25 hover:bg-indigo-500/10 transition-all text-left">
                    <div className="w-9 h-9 rounded-full bg-indigo-500/15 text-indigo-600 font-bold flex items-center justify-center shrink-0 text-xs">BS</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">Bilal Saeed</p>
                      <p className="text-[10px] text-muted-foreground">Junior Barber</p>
                    </div>
                    <span className="text-[10px] bg-indigo-500/15 text-indigo-600 px-2 py-0.5 rounded-full font-medium shrink-0">Jr. Barber</span>
                  </button>
                  <button onClick={() => demoLoginAs(DEMO_SALON_GENTS, DEMO_BRANCH_GENTS, DEMO_GENTS_HELPER, royalBranches)} className="w-full flex items-center gap-3 p-2.5 rounded-lg border hover:border-gray-500/25 hover:bg-gray-500/5 transition-all text-left">
                    <div className="w-9 h-9 rounded-full bg-gray-500/10 text-gray-500 font-bold flex items-center justify-center shrink-0 text-xs">HA</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">Hamza Ali</p>
                      <p className="text-[10px] text-muted-foreground">Helper — Dashboard only</p>
                    </div>
                    <span className="text-[10px] bg-gray-500/10 text-gray-500 px-2 py-0.5 rounded-full font-medium shrink-0">Helper</span>
                  </button>
                </div>
              </div>
            </div>
          </div>}
        </div>
      </div>
    </div>
  );
}
