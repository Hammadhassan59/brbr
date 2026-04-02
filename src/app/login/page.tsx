'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Scissors } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/components/providers/language-provider';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DEMO_SALON, DEMO_BRANCH, DEMO_STAFF_OWNER, DEMO_STAFF_STYLIST, DEMO_STAFF_RECEPTIONIST,
  DEMO_SALON_GENTS, DEMO_BRANCH_GENTS, DEMO_BRANCH_GENTS_2,
  DEMO_GENTS_OWNER, DEMO_GENTS_BARBER_SENIOR, DEMO_GENTS_BARBER_JUNIOR, DEMO_GENTS_HELPER,
  DEMO_STAFF_SUPERADMIN,
  DEMO_PARTNER_ROYAL,
} from '@/lib/demo-data';
import type { Salon, Branch, Staff, SalonPartner } from '@/types/database';

const IS_DEV = process.env.NODE_ENV === 'development';
const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes

function setSessionCookie(role: string) {
  document.cookie = `brbr-session=1; path=/; max-age=${60 * 60 * 24}; SameSite=Strict`;
  document.cookie = `brbr-role=${role}; path=/; max-age=${60 * 60 * 24}; SameSite=Strict`;
}

type LoginMode = 'owner' | 'staff';
type OwnerMode = 'login' | 'signup';
type StaffStep = 'phone' | 'pin';

export default function LoginPage() {
  const router = useRouter();
  const { t, language, setLanguage } = useLanguage();
  const { setSalon, setBranches, setCurrentBranch, setCurrentStaff, setCurrentPartner, setIsPartner } = useAppStore();

  const [mode, setMode] = useState<LoginMode>('owner');
  const [ownerMode, setOwnerMode] = useState<OwnerMode>('login');
  const [loading, setLoading] = useState(false);

  // Owner state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Staff/Partner state
  const [phone, setPhone] = useState('');
  const [staffStep, setStaffStep] = useState<StaffStep>('phone');
  const [matchedStaff, setMatchedStaff] = useState<Staff | null>(null);
  const [matchedPartner, setMatchedPartner] = useState<SalonPartner | null>(null);
  const [pin, setPin] = useState('');

  // Rate limiting for PIN attempts
  const pinAttempts = useRef(0);
  const lockoutUntil = useRef<number>(0);
  const [isLockedOut, setIsLockedOut] = useState(false);

  async function loadBranches(salonId: string): Promise<Branch[]> {
    const { data } = await supabase
      .from('branches')
      .select('*')
      .eq('salon_id', salonId)
      .order('is_main', { ascending: false });
    return (data || []) as Branch[];
  }

  async function handleOwnerLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const { data: salon } = await supabase
        .from('salons')
        .select('*')
        .eq('owner_id', data.user.id)
        .single();

      if (!salon) {
        router.push('/setup');
        return;
      }

      setSalon(salon);
      const allBranches = await loadBranches(salon.id);
      setBranches(allBranches);
      const mainBranch = allBranches.find((b: Branch) => b.is_main) || allBranches[0];
      if (mainBranch) setCurrentBranch(mainBranch);

      setSessionCookie('owner');

      if (!salon.setup_complete) {
        router.push('/setup');
      } else {
        router.push('/dashboard');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleOwnerSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      if (!data.user) throw new Error('Signup failed. Please try again.');

      toast.success('Account created! Setting up your salon...');
      router.push('/setup');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Signup failed';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function handlePhoneLookup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/staff-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });

      if (!res.ok) {
        toast.error('Phone number not found');
        return;
      }

      const data = await res.json();
      if (data.type === 'staff') {
        setMatchedStaff({ ...data.person, phone } as Staff);
        setMatchedPartner(null);
      } else {
        setMatchedPartner({ ...data.person, phone } as SalonPartner);
        setMatchedStaff(null);
      }
      setStaffStep('pin');
    } catch {
      toast.error('Phone number not found');
    } finally {
      setLoading(false);
    }
  }

  async function handlePinSubmit() {
    if (pin.length !== 4) return;

    // Check lockout
    if (lockoutUntil.current > Date.now()) {
      const remainSec = Math.ceil((lockoutUntil.current - Date.now()) / 1000);
      toast.error(`Too many attempts. Try again in ${remainSec}s`);
      setPin('');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/staff-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, pin }),
      });

      const data = await res.json();

      if (!res.ok) {
        pinAttempts.current++;
        if (pinAttempts.current >= MAX_PIN_ATTEMPTS) {
          lockoutUntil.current = Date.now() + LOCKOUT_DURATION_MS;
          setIsLockedOut(true);
          setTimeout(() => setIsLockedOut(false), LOCKOUT_DURATION_MS);
          toast.error('Too many failed attempts. Locked for 5 minutes.');
        } else {
          toast.error(data.error || `Incorrect PIN (${MAX_PIN_ATTEMPTS - pinAttempts.current} attempts remaining)`);
        }
        setPin('');
        return;
      }

      pinAttempts.current = 0;

      if (data.type === 'partner') {
        setCurrentPartner(data.partner);
        setIsPartner(true);
        setCurrentStaff(null);
        setSessionCookie('partner');
        toast.success(`Welcome, ${data.partner.name} (Owner)`);
      } else {
        setCurrentStaff(data.staff);
        setCurrentPartner(null);
        setIsPartner(false);
        setSessionCookie('staff');
      }

      if (data.salon) {
        setSalon(data.salon);
        setBranches(data.branches || []);
        const mainBranch = data.branches?.find((b: Branch) => b.is_main) || data.branches?.[0];
        if (mainBranch) setCurrentBranch(mainBranch);
      }

      router.push('/dashboard');
    } catch {
      toast.error('Login failed');
    } finally {
      setLoading(false);
    }
  }

  function handlePinInput(digit: string) {
    if (pin.length >= 4) return;
    const newPin = pin + digit;
    setPin(newPin);
    if (newPin.length === 4) {
      setTimeout(() => handlePinSubmit(), 200);
    }
  }

  function demoLoginSuperAdmin() {
    if (!IS_DEV) return;
    const { setIsSuperAdmin } = useAppStore.getState();
    setIsSuperAdmin(true);
    setCurrentStaff(DEMO_STAFF_SUPERADMIN);
    setSalon(null);
    setBranches([]);
    setCurrentBranch(null);
    setCurrentPartner(null);
    setIsPartner(false);
    setSessionCookie('super_admin');
    toast.success('Super Admin mode activated');
    router.push('/admin');
  }

  function demoLoginAs(salonData: Salon, branchData: Branch, staffData: Staff, allBranches?: Branch[]) {
    if (!IS_DEV) return;
    const { setIsSuperAdmin } = useAppStore.getState();
    setIsSuperAdmin(false);
    setSalon(salonData);
    setBranches(allBranches || [branchData]);
    setCurrentBranch(branchData);
    setCurrentStaff(staffData);
    setCurrentPartner(null);
    setIsPartner(false);
    setSessionCookie('staff');
    toast.success(`Logged in as ${staffData.name} (${staffData.role.replace('_', ' ')}) — ${salonData.name}`);
    router.push('/dashboard');
  }

  function demoLoginAsPartner(salonData: Salon, partnerData: SalonPartner, allBranches: Branch[]) {
    if (!IS_DEV) return;
    const { setIsSuperAdmin } = useAppStore.getState();
    setIsSuperAdmin(false);
    setSalon(salonData);
    setBranches(allBranches);
    const mainBranch = allBranches.find((b) => b.is_main) || allBranches[0];
    setCurrentBranch(mainBranch);
    setCurrentStaff(null);
    setCurrentPartner(partnerData);
    setIsPartner(true);
    setSessionCookie('partner');
    toast.success(`Logged in as ${partnerData.name} (Owner) — ${salonData.name}`);
    router.push('/dashboard');
  }

  function resetStaffLogin() {
    setStaffStep('phone');
    setMatchedStaff(null);
    setMatchedPartner(null);
    setPin('');
    setPhone('');
  }

  const matchedPerson = matchedStaff || matchedPartner;
  const matchedLabel = matchedStaff ? matchedStaff.role.replace('_', ' ') : 'Owner';

  const royalBranches = [DEMO_BRANCH_GENTS, DEMO_BRANCH_GENTS_2];

  return (
    <div className="min-h-screen flex">
      {/* Left branding panel — hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#1A1A1A] text-white flex-col items-center justify-center p-12 relative overflow-hidden border-r border-[#2A2A2A]">
        <div className="relative z-10 text-center">
          <div className="flex items-center justify-center gap-3 mb-6">
            <Scissors className="w-10 h-10 text-gold" />
            <h1 className="font-heading text-4xl font-bold tracking-tight">BRBR</h1>
          </div>
          <p className="text-sm text-gold font-heading tracking-widest uppercase mb-2">{t('tagline')}</p>
          <p className="text-muted-foreground text-xs">brbr.pk</p>
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
          <h1 className="font-heading text-3xl font-bold text-navy">BrBr</h1>
        </div>

        <div className="w-full max-w-md">
          {/* Mode toggle */}
          <div className="flex rounded-lg bg-secondary p-1 mb-8">
            <button
              className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-all ${
                mode === 'owner'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setMode('owner')}
            >
              {t('ownerLogin')}
            </button>
            <button
              className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-all ${
                mode === 'staff'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => { setMode('staff'); resetStaffLogin(); }}
            >
              {t('staffLogin')}
            </button>
          </div>

          {/* Owner Login / Signup Form */}
          {mode === 'owner' && (
            <form onSubmit={ownerMode === 'login' ? handleOwnerLogin : handleOwnerSignup} className="space-y-4 animate-fade-up">
              <div>
                <Label htmlFor="email">{t('email')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="owner@salon.com"
                  required
                  className="mt-1.5"
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">{t('password')}</Label>
                  {ownerMode === 'login' && (
                    <button
                      type="button"
                      className="text-xs text-gold hover:underline"
                      onClick={async () => {
                        if (!email.trim()) {
                          toast.error('Enter your email first');
                          return;
                        }
                        try {
                          const { error } = await supabase.auth.resetPasswordForEmail(email);
                          if (error) throw error;
                          toast.success('Password reset email sent');
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
                  minLength={6}
                  className="mt-1.5"
                />
              </div>
              <Button type="submit" className="w-full bg-gold hover:bg-gold/90 text-black border border-gold" disabled={loading}>
                {loading ? t('loading') : ownerMode === 'login' ? t('login') : 'Create Account'}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                {ownerMode === 'login' ? (
                  <>New here? <button type="button" onClick={() => setOwnerMode('signup')} className="text-gold hover:underline font-medium">Create an account</button></>
                ) : (
                  <>Already have an account? <button type="button" onClick={() => setOwnerMode('login')} className="text-gold hover:underline font-medium">Log in</button></>
                )}
              </p>
            </form>
          )}

          {/* Staff Login — Phone Step */}
          {mode === 'staff' && staffStep === 'phone' && (
            <form onSubmit={handlePhoneLookup} className="space-y-4 animate-fade-up">
              <div>
                <Label htmlFor="phone">{t('phoneNumber')}</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="03XX-XXXXXXX"
                  required
                  className="mt-1.5 text-lg"
                />
                <p className="text-xs text-muted-foreground mt-1">Staff or Partner phone number</p>
              </div>
              <Button type="submit" className="w-full bg-gold hover:bg-gold/90 text-black border border-gold" disabled={loading}>
                {loading ? t('loading') : t('next')}
              </Button>
            </form>
          )}

          {/* Staff/Partner Login — PIN Step */}
          {mode === 'staff' && staffStep === 'pin' && matchedPerson && (
            <div className="space-y-6 animate-fade-up">
              {/* Person info */}
              <div className="text-center">
                <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-3 bg-gold/20 text-gold">
                  {matchedPerson.name.charAt(0)}
                </div>
                <p className="text-lg font-semibold">{matchedPerson.name}</p>
                <p className="text-sm text-muted-foreground capitalize">{matchedLabel}</p>
                <button
                  onClick={resetStaffLogin}
                  className="text-xs text-gold hover:underline mt-1"
                >
                  {t('wrongPerson')}
                </button>
              </div>

              {/* PIN display */}
              <div className="flex justify-center gap-3 mb-4">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`w-4 h-4 rounded-full ${
                      pin.length > i ? 'bg-gold' : 'bg-border'
                    }`}
                    style={pin.length > i ? { animation: 'pin-dot-fill 200ms cubic-bezier(0.34, 1.56, 0.64, 1) both' } : undefined}
                  />
                ))}
              </div>

              {/* PIN pad */}
              <div className="grid grid-cols-3 gap-3 max-w-[280px] mx-auto">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((key) => (
                  <button
                    key={key || 'empty'}
                    type="button"
                    disabled={!key || loading || isLockedOut}
                    onClick={() => {
                      if (key === 'del') setPin(pin.slice(0, -1));
                      else if (key) handlePinInput(key);
                    }}
                    className={`h-16 rounded-xl text-xl font-semibold transition-all duration-100 touch-target ${
                      !key
                        ? 'invisible'
                        : key === 'del'
                          ? 'bg-secondary text-muted-foreground hover:bg-secondary/80 active:scale-[0.92] text-base'
                          : 'bg-card border border-border hover:bg-secondary active:scale-[0.92] active:bg-gold/10 shadow-sm'
                    }`}
                    {...(key === 'del' ? { 'aria-label': 'Delete' } : {})}
                  >
                    {key === 'del' ? '←' : key}
                  </button>
                ))}
              </div>
            </div>
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
                    <p className="text-sm font-semibold">BrBr Super Admin</p>
                    <p className="text-[10px] text-muted-foreground">Platform panel: all salons, all users, analytics, platform settings</p>
                  </div>
                  <span className="text-[10px] bg-red-500/15 text-red-600 px-2 py-0.5 rounded-full font-medium">Super</span>
                </button>
              </div>

              {/* Glamour Studio */}
              <div>
                <p className="text-[10px] font-semibold text-pink-500 uppercase tracking-wider mb-1.5">Glamour Studio — Ladies Salon, Lahore</p>
                <div className="space-y-1.5">
                  <button onClick={() => demoLoginAs(DEMO_SALON, DEMO_BRANCH, DEMO_STAFF_OWNER, [DEMO_BRANCH])} className="w-full flex items-center gap-3 p-2.5 rounded-lg border-2 border-gold/30 bg-gold/5 hover:bg-gold/10 transition-all text-left">
                    <div className="w-9 h-9 rounded-full bg-gold/20 text-gold font-bold flex items-center justify-center shrink-0 text-xs">FK</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">Fatima Khan</p>
                      <p className="text-[10px] text-muted-foreground">Manager — Full access: dashboard, POS, reports, staff, inventory, settings</p>
                    </div>
                    <span className="text-[10px] bg-gold/20 text-gold px-2 py-0.5 rounded-full font-medium shrink-0">Manager</span>
                  </button>
                  <button onClick={() => demoLoginAs(DEMO_SALON, DEMO_BRANCH, DEMO_STAFF_STYLIST, [DEMO_BRANCH])} className="w-full flex items-center gap-3 p-2.5 rounded-lg border hover:border-purple-500/25 hover:bg-purple-500/10 transition-all text-left">
                    <div className="w-9 h-9 rounded-full bg-purple-500/15 text-purple-600 font-bold flex items-center justify-center shrink-0 text-xs">SA</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">Sadia Ahmed</p>
                      <p className="text-[10px] text-muted-foreground">Senior Stylist — My dashboard + appointments only (30% commission)</p>
                    </div>
                    <span className="text-[10px] bg-purple-500/15 text-purple-600 px-2 py-0.5 rounded-full font-medium shrink-0">Stylist</span>
                  </button>
                  <button onClick={() => demoLoginAs(DEMO_SALON, DEMO_BRANCH, DEMO_STAFF_RECEPTIONIST, [DEMO_BRANCH])} className="w-full flex items-center gap-3 p-2.5 rounded-lg border hover:border-teal-500/25 hover:bg-teal-500/10 transition-all text-left">
                    <div className="w-9 h-9 rounded-full bg-teal-500/15 text-teal-600 font-bold flex items-center justify-center shrink-0 text-xs">ZB</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">Zainab Bibi</p>
                      <p className="text-[10px] text-muted-foreground">Receptionist — Appointments, clients, POS (no staff/inventory/reports)</p>
                    </div>
                    <span className="text-[10px] bg-teal-500/15 text-teal-600 px-2 py-0.5 rounded-full font-medium shrink-0">Reception</span>
                  </button>
                </div>
              </div>

              {/* Royal Barbers */}
              <div>
                <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wider mb-1.5">Royal Barbers — Gents Salon, Islamabad (2 branches)</p>
                <div className="space-y-1.5">
                  <button onClick={() => demoLoginAs(DEMO_SALON_GENTS, DEMO_BRANCH_GENTS, DEMO_GENTS_OWNER, royalBranches)} className="w-full flex items-center gap-3 p-2.5 rounded-lg border-2 border-gold/30 bg-gold/5 hover:bg-gold/10 transition-all text-left">
                    <div className="w-9 h-9 rounded-full bg-gold/20 text-gold font-bold flex items-center justify-center shrink-0 text-xs">AR</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">Ahmed Raza</p>
                      <p className="text-[10px] text-muted-foreground">Owner — Full access, can switch between F-7 Markaz & Blue Area branches</p>
                    </div>
                    <span className="text-[10px] bg-gold/20 text-gold px-2 py-0.5 rounded-full font-medium shrink-0">Owner</span>
                  </button>
                  <button onClick={() => demoLoginAsPartner(DEMO_SALON_GENTS, DEMO_PARTNER_ROYAL, royalBranches)} className="w-full flex items-center gap-3 p-2.5 rounded-lg border-2 border-gold/30 bg-gold/5 hover:bg-gold/10 transition-all text-left">
                    <div className="w-9 h-9 rounded-full bg-gold/20 text-gold font-bold flex items-center justify-center shrink-0 text-xs">IM</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">Imran Malik</p>
                      <p className="text-[10px] text-muted-foreground">Co-Owner — Full access to all branches, reports, settings (PIN: 9999)</p>
                    </div>
                    <span className="text-[10px] bg-gold/20 text-gold px-2 py-0.5 rounded-full font-medium shrink-0">Owner</span>
                  </button>
                  <button onClick={() => demoLoginAs(DEMO_SALON_GENTS, DEMO_BRANCH_GENTS, DEMO_GENTS_BARBER_SENIOR, royalBranches)} className="w-full flex items-center gap-3 p-2.5 rounded-lg border hover:border-purple-500/25 hover:bg-purple-500/10 transition-all text-left">
                    <div className="w-9 h-9 rounded-full bg-purple-500/15 text-purple-600 font-bold flex items-center justify-center shrink-0 text-xs">UG</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">Usman Ghani</p>
                      <p className="text-[10px] text-muted-foreground">Senior Barber — My dashboard + appointments (25% commission)</p>
                    </div>
                    <span className="text-[10px] bg-purple-500/15 text-purple-600 px-2 py-0.5 rounded-full font-medium shrink-0">Sr. Barber</span>
                  </button>
                  <button onClick={() => demoLoginAs(DEMO_SALON_GENTS, DEMO_BRANCH_GENTS, DEMO_GENTS_BARBER_JUNIOR, royalBranches)} className="w-full flex items-center gap-3 p-2.5 rounded-lg border hover:border-indigo-500/25 hover:bg-indigo-500/10 transition-all text-left">
                    <div className="w-9 h-9 rounded-full bg-indigo-500/15 text-indigo-600 font-bold flex items-center justify-center shrink-0 text-xs">BS</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">Bilal Saeed</p>
                      <p className="text-[10px] text-muted-foreground">Junior Barber — My dashboard + appointments (Rs 50/service flat)</p>
                    </div>
                    <span className="text-[10px] bg-indigo-500/15 text-indigo-600 px-2 py-0.5 rounded-full font-medium shrink-0">Jr. Barber</span>
                  </button>
                  <button onClick={() => demoLoginAs(DEMO_SALON_GENTS, DEMO_BRANCH_GENTS, DEMO_GENTS_HELPER, royalBranches)} className="w-full flex items-center gap-3 p-2.5 rounded-lg border hover:border-gray-500/25 hover:bg-gray-500/5 transition-all text-left">
                    <div className="w-9 h-9 rounded-full bg-gray-500/10 text-gray-500 font-bold flex items-center justify-center shrink-0 text-xs">HA</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">Hamza Ali</p>
                      <p className="text-[10px] text-muted-foreground">Helper — Dashboard only, no other access (Rs 8,000 salary)</p>
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
