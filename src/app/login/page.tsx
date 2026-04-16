'use client';

import { useState, useEffect } from 'react';
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
import { signSession, resolveUserRole, isSuperAdminEmail, resolveAdminRole } from '@/app/actions/auth';
import { isAdminRole } from '@/lib/admin-roles';
import {
  DEMO_SALON, DEMO_BRANCH, DEMO_STAFF_OWNER, DEMO_STAFF_STYLIST, DEMO_STAFF_RECEPTIONIST,
  DEMO_SALON_GENTS, DEMO_BRANCH_GENTS, DEMO_BRANCH_GENTS_2,
  DEMO_GENTS_OWNER, DEMO_GENTS_BARBER_SENIOR, DEMO_GENTS_BARBER_JUNIOR, DEMO_GENTS_HELPER,
  DEMO_STAFF_SUPERADMIN,
  DEMO_PARTNER_ROYAL,
} from '@/lib/demo-data';
import type { Salon, Branch, Staff, SalonPartner } from '@/types/database';

const IS_DEV = process.env.NODE_ENV === 'development';

function setSessionCookie(role: string) {
  document.cookie = `icut-session=1; path=/; max-age=${60 * 60 * 24}; SameSite=Strict`;
  document.cookie = `icut-role=${role}; path=/; max-age=${60 * 60 * 24}; SameSite=Strict`;
}

type AuthMode = 'login' | 'signup';

export default function LoginPage() {
  const router = useRouter();
  const { t, language, setLanguage } = useLanguage();
  const { setSalon, setBranches, setCurrentBranch, setCurrentStaff, setCurrentPartner, setIsOwner, setIsPartner } = useAppStore();

  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Redirect already-authenticated users to their dashboard. Trust the iCut
  // session cookie (set by signSession) as the source of truth — Zustand
  // persists in localStorage and can outlive the actual session (e.g. after
  // a password reset by a different identity in the same browser, the iCut
  // cookie is gone but Zustand still says "you're a super admin"). If the
  // cookie is missing, we wipe the stale store and stay on the login form.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const hasIcutSession = document.cookie.split('; ').includes('icut-session=1');
    const store = useAppStore.getState();
    const persistedRoles = store.salon || store.currentStaff || store.currentPartner || store.isSuperAdmin || store.isSalesAgent;
    if (!hasIcutSession) {
      if (persistedRoles) store.reset();
      return;
    }
    if (persistedRoles) {
      router.replace(
        store.isSuperAdmin ? '/admin' :
        store.isSalesAgent ? '/agent/leads' :
        '/dashboard',
      );
    }
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
        setSessionCookie(adminRole);
        await signSession({
          salonId: 'super-admin',
          staffId: data.user.id,
          role: adminRole,
          branchId: '',
          name: data.user.email || email,
        });
        router.push('/admin');
        return;
      }

      if (result.type === 'sales_agent' && result.agent) {
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
        setSessionCookie('sales_agent');
        await signSession({
          salonId: '',
          staffId: data.user.id,
          role: 'sales_agent',
          branchId: '',
          name: result.agent.name,
          agentId: result.agent.id,
          isDemo: !!result.agent.is_demo,
        });
        router.push('/agent/leads');
        return;
      }

      if (result.type === 'none') {
        if (superAdmin) {
          setSessionCookie('super_admin');
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
          setSessionCookie('owner');
          await signSession({
            salonId: result.salon.id,
            staffId: data.user.id,
            role: 'owner',
            branchId: mainBranch?.id || '',
            name: 'Owner',
          });
        } else if (result.type === 'partner') {
          setCurrentPartner(result.partner);
          setIsPartner(true);
          setIsOwner(false);
          setCurrentStaff(null);
          useAppStore.getState().setIsSuperAdmin(false);
          setSessionCookie('partner');
          await signSession({
            salonId: result.salon.id,
            staffId: result.partner!.id,
            role: 'partner',
            branchId: mainBranch?.id || '',
            name: result.partner!.name,
          });
        } else if (result.type === 'staff') {
          setCurrentStaff(result.staff);
          setCurrentPartner(null);
          setIsOwner(false);
          setIsPartner(false);
          useAppStore.getState().setIsSuperAdmin(false);
          setSessionCookie('staff');
          await signSession({
            salonId: result.salon.id,
            staffId: result.staff!.id,
            role: result.staff!.role,
            branchId: result.staff!.branch_id || mainBranch?.id || '',
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
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      if (!data.user) throw new Error('Signup failed. Please try again.');

      // Auto-confirmed: session exists, set cookies and go to setup
      if (data.session) {
        setIsOwner(true);
        setSessionCookie('owner');
        await signSession({
          salonId: '',
          staffId: data.user.id,
          role: 'owner',
          branchId: '',
          name: data.user.email || email,
        });
        toast.success('Account created!');
        // Hard navigation so server-set cookies are attached to the next request
        // and the middleware (proxy.ts) sees icut-session on the /setup load.
        window.location.href = '/setup';
        return;
      }

      toast.success('Check your email to verify your account');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Signup failed';
      toast.error(message);
    } finally {
      setLoading(false);
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
    setSessionCookie('super_admin');
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
    setSessionCookie(isDemoOwner ? 'owner' : 'staff');
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
    setSessionCookie('partner');
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
                minLength={authMode === 'signup' ? 10 : 6}
                className="mt-1.5 border-border bg-white"
              />
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
