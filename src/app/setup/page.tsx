'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Scissors, ChevronRight, ChevronLeft, Check, Plus, X, Sparkles, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { setupSalon, checkEmailAvailable, lookupAgentByCode } from '@/app/actions/setup';
import { getPasswordError } from '@/lib/schemas/common';
import { useLanguage } from '@/components/providers/language-provider';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { SalonType, StaffRole } from '@/types/database';

const CITIES = [
  'Abbottabad', 'Bahawalpur', 'Bahawalnagar', 'Burewala', 'Chakwal', 'Chiniot',
  'Dera Ghazi Khan', 'Dera Ismail Khan', 'Faisalabad', 'Gilgit', 'Gujranwala',
  'Gujrat', 'Gwadar', 'Hafizabad', 'Haripur', 'Hyderabad', 'Islamabad', 'Jhang',
  'Jhelum', 'Kamoke', 'Karachi', 'Kasur', 'Khanewal', 'Khanpur', 'Kohat',
  'Lahore', 'Larkana', 'Mandi Bahauddin', 'Mansehra', 'Mardan', 'Mingora',
  'Mirpur (AJK)', 'Mirpur Khas', 'Multan', 'Muzaffargarh', 'Muzaffarabad',
  'Nawabshah', 'Okara', 'Pakpattan', 'Peshawar', 'Quetta', 'Rahim Yar Khan',
  'Rawalpindi', 'Sadiqabad', 'Sahiwal', 'Sargodha', 'Sheikhupura', 'Sialkot',
  'Skardu', 'Sukkur', 'Swabi', 'Tando Adam', 'Tando Allahyar', 'Turbat',
  'Vehari', 'Wah Cantonment', 'Other',
];
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const DAY_LABELS: Record<string, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

const GENTS_SERVICES = [
  { name: 'Haircut', category: 'haircut', price: 300, duration: 30 },
  { name: 'Shave', category: 'beard', price: 150, duration: 20 },
  { name: 'Beard Trim', category: 'beard', price: 200, duration: 15 },
  { name: 'Head Massage', category: 'massage', price: 300, duration: 20 },
  { name: 'Hair Color', category: 'color', price: 1500, duration: 60 },
  { name: 'Facial', category: 'facial', price: 1000, duration: 45 },
];

const LADIES_SERVICES = [
  { name: 'Haircut', category: 'haircut', price: 500, duration: 30 },
  { name: 'Hair Color', category: 'color', price: 3000, duration: 90 },
  { name: 'Hair Treatment', category: 'treatment', price: 2000, duration: 60 },
  { name: 'Basic Facial', category: 'facial', price: 1500, duration: 45 },
  { name: 'Waxing (Arms)', category: 'waxing', price: 800, duration: 30 },
  { name: 'Threading', category: 'waxing', price: 150, duration: 10 },
  { name: 'Bridal Makeup', category: 'bridal', price: 25000, duration: 180 },
];

interface ServiceEntry {
  name: string;
  category: string;
  price: number;
  duration: number;
  selected: boolean;
}

interface PartnerEntry {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
}

interface StaffEntry {
  name: string;
  role: StaffRole;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  baseSalary: string;
  commissionType: 'none' | 'percentage' | 'flat';
  commissionRate: string;
}

interface DaySchedule {
  open: string;
  close: string;
  off: boolean;
}

export default function SetupPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { salon, setSalon, setBranches, setCurrentBranch, setIsOwner } = useAppStore();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 2 — Salon Basics
  const [salonName, setSalonName] = useState('');
  const [salonType, setSalonType] = useState<SalonType>('unisex');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [sameAsPhone, setSameAsPhone] = useState(true);
  const [branchName, setBranchName] = useState('');
  const [agentCode, setAgentCode] = useState('');
  const [agentLookup, setAgentLookup] = useState<{ status: 'idle' | 'checking' | 'ok' | 'bad'; name?: string }>({ status: 'idle' });

  // Step 3 — Ownership
  const [ownershipType, setOwnershipType] = useState<'single' | 'multiple'>('single');
  const [partners, setPartners] = useState<PartnerEntry[]>([
    { name: '', email: '', phone: '', password: '', confirmPassword: '' },
  ]);

  // Step 4 — Working Hours
  const [hours, setHours] = useState<Record<string, DaySchedule>>(() => {
    const h: Record<string, DaySchedule> = {};
    DAYS.forEach((d) => {
      h[d] = { open: '09:00', close: '21:00', off: d === 'sun' };
    });
    return h;
  });
  const [jummahBreak, setJummahBreak] = useState(true);
  const [prayerBlocks, setPrayerBlocks] = useState(false);

  // Step 4 — Services
  const [services, setServices] = useState<ServiceEntry[]>([]);
  const [customServiceName, setCustomServiceName] = useState('');
  const [customServicePrice, setCustomServicePrice] = useState('');

  // Step 5 — Staff
  const [staffList, setStaffList] = useState<StaffEntry[]>([
    { name: '', role: 'junior_stylist', email: '', phone: '', password: '', confirmPassword: '', baseSalary: '', commissionType: 'none', commissionRate: '' },
  ]);

  // Derived
  const selectedServices = services.filter((s) => s.selected);
  const validStaff = staffList.filter((s) => s.name && s.email && s.phone.trim() && !getPasswordError(s.password) && s.password === s.confirmPassword);
  const validPartners = partners.filter((p) => p.name && p.email && p.phone.trim() && !getPasswordError(p.password) && p.password === p.confirmPassword);

  // ─── Email availability warnings ───
  // Keyed by lowercase email; true = taken. Surfaced inline below the input.
  const [takenEmails, setTakenEmails] = useState<Record<string, boolean>>({});
  const emailCheckSeq = useRef(0);

  async function verifyEmail(email: string) {
    const key = email.trim().toLowerCase();
    if (!key) return;
    if (key in takenEmails) return; // already checked
    const seq = ++emailCheckSeq.current;
    const res = await checkEmailAvailable(key);
    if (seq !== emailCheckSeq.current) return; // stale
    setTakenEmails((prev) => ({ ...prev, [key]: res.reason === 'taken' }));
  }

  function emailIsTaken(email: string): boolean {
    return takenEmails[email.trim().toLowerCase()] === true;
  }

  async function verifyAgentCode(rawCode: string) {
    const code = rawCode.trim().toUpperCase();
    if (!code) {
      setAgentLookup({ status: 'idle' });
      return;
    }
    setAgentLookup({ status: 'checking' });
    const { data } = await lookupAgentByCode(code);
    setAgentLookup(data ? { status: 'ok', name: data.name } : { status: 'bad' });
  }

  // ─── Draft persistence ───
  // Save wizard state to localStorage on every change; restore on mount; clear on finish.
  const DRAFT_KEY = 'icut-setup-draft-v1';
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(DRAFT_KEY) : null;
      if (raw) {
        const d = JSON.parse(raw);
        if (typeof d.step === 'number' && d.step >= 1 && d.step <= 7) setStep(d.step);
        if (typeof d.salonName === 'string') setSalonName(d.salonName);
        if (d.salonType) setSalonType(d.salonType);
        if (typeof d.city === 'string') setCity(d.city);
        if (typeof d.address === 'string') setAddress(d.address);
        if (typeof d.phone === 'string') setPhone(d.phone);
        if (typeof d.whatsapp === 'string') setWhatsapp(d.whatsapp);
        if (typeof d.sameAsPhone === 'boolean') setSameAsPhone(d.sameAsPhone);
        if (typeof d.branchName === 'string') setBranchName(d.branchName);
        if (typeof d.agentCode === 'string') setAgentCode(d.agentCode);
        if (d.ownershipType) setOwnershipType(d.ownershipType);
        if (Array.isArray(d.partners) && d.partners.length) setPartners(d.partners);
        if (d.hours) setHours(d.hours);
        if (typeof d.jummahBreak === 'boolean') setJummahBreak(d.jummahBreak);
        if (typeof d.prayerBlocks === 'boolean') setPrayerBlocks(d.prayerBlocks);
        if (Array.isArray(d.services)) setServices(d.services);
        if (Array.isArray(d.staffList) && d.staffList.length) setStaffList(d.staffList);
      }
    } catch { /* corrupt draft — ignore */ }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current || typeof window === 'undefined') return;
    const draft = {
      step, salonName, salonType, city, address, phone, whatsapp, sameAsPhone, branchName, agentCode,
      ownershipType, partners, hours, jummahBreak, prayerBlocks, services, staffList,
    };
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* quota */ }
  }, [step, salonName, salonType, city, address, phone, whatsapp, sameAsPhone, branchName, agentCode, ownershipType, partners, hours, jummahBreak, prayerBlocks, services, staffList]);

  function addPartnerRow() {
    setPartners([...partners, { name: '', email: '', phone: '', password: '', confirmPassword: '' }]);
  }

  function updatePartner(index: number, field: keyof PartnerEntry, value: string) {
    const updated = [...partners];
    updated[index] = { ...updated[index], [field]: value };
    setPartners(updated);
  }

  function removePartner(index: number) {
    if (partners.length <= 1) return;
    setPartners(partners.filter((_, i) => i !== index));
  }

  function initServices() {
    const templates = salonType === 'gents' ? GENTS_SERVICES
      : salonType === 'ladies' ? LADIES_SERVICES
      : [...GENTS_SERVICES, ...LADIES_SERVICES];

    const unique = templates.filter((t, i, arr) => arr.findIndex((a) => a.name === t.name) === i);
    setServices(unique.map((s) => ({ ...s, selected: true })));
  }

  function addCustomService() {
    if (!customServiceName || !customServicePrice) return;
    setServices([...services, {
      name: customServiceName,
      category: 'other',
      price: Number(customServicePrice),
      duration: 30,
      selected: true,
    }]);
    setCustomServiceName('');
    setCustomServicePrice('');
  }

  function addStaffRow() {
    setStaffList([...staffList, { name: '', role: 'junior_stylist', email: '', phone: '', password: '', confirmPassword: '', baseSalary: '', commissionType: 'none', commissionRate: '' }]);
  }

  function updateStaff(index: number, field: keyof StaffEntry, value: string) {
    const updated = [...staffList];
    updated[index] = { ...updated[index], [field]: value };
    setStaffList(updated);
  }

  function removeStaff(index: number) {
    if (staffList.length <= 1) return;
    setStaffList(staffList.filter((_, i) => i !== index));
  }

  function handleNext() {
    if (step === 2 && !salonName) { toast.error('Salon name required'); return; }
    if (step === 2 && !phone.trim()) { toast.error('Phone number is required'); return; }
    if (step === 2 && !branchName.trim()) { toast.error('Branch name is required'); return; }
    if (step === 3 && ownershipType === 'multiple' && validPartners.length === 0) { toast.error('Add at least one partner with name, email, phone, and password'); return; }
    if (step === 3 && ownershipType === 'multiple' && partners.some(p => p.email && emailIsTaken(p.email))) {
      toast.error('Fix partner emails that are already registered before continuing');
      return;
    }
    if (step === 4) {
      const invalidDay = DAYS.find(d => !hours[d].off && hours[d].close <= hours[d].open);
      if (invalidDay) {
        toast.error(`${DAY_LABELS[invalidDay]}: closing time must be after opening time`);
        return;
      }
    }
    if (step === 6 && validStaff.length === 0) { toast.error('Add at least 1 staff member'); return; }
    if (step === 6 && staffList.some(s => s.email && emailIsTaken(s.email))) {
      toast.error('Fix staff emails that are already registered before continuing');
      return;
    }
    const nextStep = step + 1;
    setStep(nextStep);
    if (nextStep === 5) initServices();
  }

  async function handleFinish() {
    setLoading(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      const slug = salonName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      // Build working hours
      const workingHours: Record<string, unknown> = {};
      DAYS.forEach((d) => {
        workingHours[d] = {
          open: hours[d].open,
          close: hours[d].close,
          off: hours[d].off,
          ...(d === 'fri' ? { jummah_break: jummahBreak } : {}),
        };
      });

      const result = await setupSalon({
        existingSalonId: salon?.id,
        name: salonName,
        slug,
        type: salonType,
        city,
        address,
        phone,
        whatsapp: sameAsPhone ? phone : whatsapp,
        branchName: branchName.trim(),
        ownerId: user?.id ?? '',
        agentCode: agentCode.trim() || undefined,
        prayerBlockEnabled: prayerBlocks,
        workingHours,
        services: selectedServices.map(s => ({ name: s.name, category: s.category, price: s.price, duration: s.duration })),
        partners: validPartners.map(p => ({ name: p.name, email: p.email, phone: p.phone.trim(), password: p.password })),
        staff: validStaff.map(s => ({
          name: s.name,
          email: s.email,
          phone: s.phone.trim(),
          role: s.role,
          password: s.password,
          baseSalary: Number(s.baseSalary) || 0,
          commissionType: s.commissionType,
          commissionRate: Number(s.commissionRate) || 0,
        })),
      });
      if (result.error) throw new Error(result.error);

      const newSalon = result.data!.salon;
      const newBranch = result.data!.branch;
      setSalon(newSalon);
      setBranches([newBranch]);
      setCurrentBranch(newBranch);
      setIsOwner(true);

      // Re-sign the JWT session with correct salon/branch IDs
      const { signSession } = await import('@/app/actions/auth');
      await signSession({
        salonId: newSalon.id,
        staffId: user?.id ?? '',
        role: 'owner',
        branchId: newBranch.id,
        name: 'Owner',
      });

      toast.success('Salon setup complete! Activate your subscription to continue.');
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      // Hard navigation to the paywall. New salons land in subscription_status
      // 'pending' and stay there until the super admin approves a payment, so
      // /dashboard would just bounce them back here via the proxy gate anyway.
      window.location.href = '/paywall';
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Setup failed';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Progress bar */}
      <div className="sticky top-0 z-50 bg-card border-b">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <Scissors className="w-5 h-5 text-gold" />
            <span className="font-heading font-bold text-lg">iCut</span>
            <span className="text-sm text-muted-foreground ml-auto">Step {step} of 7</span>
            <button
              onClick={() => {
                if (window.confirm('Exit setup? Your progress will be lost.')) {
                  router.push('/login');
                }
              }}
              className="ml-3 text-muted-foreground hover:text-destructive transition-colors"
              aria-label="Exit setup"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="w-full bg-secondary rounded-full h-2">
            <div
              className="bg-gold h-2 rounded-full transition-all duration-500"
              style={{ width: `${(step / 7) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Step 1 — Welcome */}
        {step === 1 && (
          <div className="text-center py-16">
            <div className="w-24 h-24 bg-gold/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Scissors className="w-12 h-12 text-gold" />
            </div>
            <h1 className="font-heading text-3xl font-bold mb-3">{t('welcomeTitle')}</h1>
            <p className="text-muted-foreground text-lg mb-8">{t('welcomeSubtitle')}</p>
            <Button
              size="lg"
              onClick={() => setStep(2)}
              className="bg-gold hover:bg-gold/90 text-black border border-gold px-8"
            >
              {t('startSetup')} <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}

        {/* Step 2 — Salon Basics */}
        {step === 2 && (
          <div className="space-y-6">
            <h2 className="font-heading text-2xl font-bold">{t('salonBasics')}</h2>

            <div>
              <Label>{t('salonName')}</Label>
              <Input value={salonName} onChange={(e) => setSalonName(e.target.value)} placeholder="e.g. Glamour Studio" className="mt-1.5" />
            </div>

            <div>
              <Label>{t('salonType')}</Label>
              <div className="grid grid-cols-3 gap-3 mt-1.5">
                {(['gents', 'ladies', 'unisex'] as SalonType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => setSalonType(type)}
                    className={`p-4 rounded-lg border-2 text-center transition-all ${
                      salonType === type
                        ? 'border-gold bg-gold/5 shadow-sm'
                        : 'border-border hover:border-gold/50'
                    }`}
                  >
                    <div className="flex justify-center mb-1">
                      {type === 'gents' ? <Scissors className="w-6 h-6" /> : type === 'ladies' ? <Sparkles className="w-6 h-6" /> : <Users className="w-6 h-6" />}
                    </div>
                    <div className="text-sm font-medium">
                      {type === 'gents' ? t('gentsSalon') : type === 'ladies' ? t('ladiesSalon') : t('unisexSalon')}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>{t('city')}</Label>
              <Select value={city} onValueChange={(v) => { if (v) setCity(v); }}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select city" /></SelectTrigger>
                <SelectContent>
                  {CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t('address')}</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Full address" className="mt-1.5" />
            </div>

            <div>
              <Label>Branch Name *</Label>
              <Input
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder={city ? `e.g. ${city} Gulberg, ${city} DHA, Main Branch` : 'e.g. Gulberg Branch, DHA Branch, Main Branch'}
                className="mt-1.5"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                You can add more branches later. Give this first branch a unique name so they&apos;re easy to tell apart.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('phone')} *</Label>
                <Input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03XX-XXXXXXX" className="mt-1.5" required />
              </div>
              <div>
                <Label>{t('whatsapp')}</Label>
                <div className="flex items-center gap-2 mt-1.5">
                  {sameAsPhone ? (
                    <Input type="tel" value={phone} disabled className="flex-1" />
                  ) : (
                    <Input type="tel" inputMode="tel" autoComplete="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="03XX-XXXXXXX" className="flex-1" />
                  )}
                </div>
                <label className="flex items-center gap-2 mt-2 text-sm text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={sameAsPhone} onChange={(e) => setSameAsPhone(e.target.checked)} className="rounded" />
                  {t('sameAsPhone')}
                </label>
              </div>
            </div>

            <div>
              <Label>Sales agent code (optional)</Label>
              <Input
                value={agentCode}
                onChange={(e) => { setAgentCode(e.target.value.toUpperCase()); setAgentLookup({ status: 'idle' }); }}
                onBlur={(e) => verifyAgentCode(e.target.value)}
                placeholder="e.g. SA342"
                className="mt-1.5 font-mono uppercase"
                maxLength={6}
              />
              <p className="text-xs text-muted-foreground mt-1">
                If a sales agent referred you, enter their code so they get credit. Leave blank if you signed up directly.
              </p>
              {agentLookup.status === 'checking' && (
                <p className="text-xs text-muted-foreground mt-1">Checking…</p>
              )}
              {agentLookup.status === 'ok' && (
                <p className="text-xs text-green-600 mt-1">✓ Credited to: {agentLookup.name}</p>
              )}
              {agentLookup.status === 'bad' && (
                <p className="text-xs text-amber-600 mt-1">⚠ Code not recognized — you can continue, but no agent will be credited.</p>
              )}
            </div>
          </div>
        )}

        {/* Step 3 — Ownership */}
        {step === 3 && (
          <div className="space-y-6">
            <h2 className="font-heading text-2xl font-bold">Ownership</h2>
            <p className="text-muted-foreground text-sm">Does your salon have one owner or multiple partners/co-owners?</p>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setOwnershipType('single')}
                className={`p-6 rounded-lg border-2 text-center transition-all ${ownershipType === 'single' ? 'border-gold bg-gold/5 shadow-sm' : 'border-border hover:border-gold/50'}`}
              >
                <div className="text-3xl mb-2">1</div>
                <div className="text-sm font-semibold">Single Owner</div>
                <p className="text-xs text-muted-foreground mt-1">Just you running the business</p>
              </button>
              <button
                onClick={() => setOwnershipType('multiple')}
                className={`p-6 rounded-lg border-2 text-center transition-all ${ownershipType === 'multiple' ? 'border-gold bg-gold/5 shadow-sm' : 'border-border hover:border-gold/50'}`}
              >
                <div className="text-3xl mb-2">2+</div>
                <div className="text-sm font-semibold">Multiple Owners</div>
                <p className="text-xs text-muted-foreground mt-1">Partners/co-owners with full access</p>
              </button>
            </div>

            {ownershipType === 'multiple' && (
              <div className="space-y-4 pt-4 border-t">
                <p className="text-sm font-medium">Add your partners/co-owners</p>
                <p className="text-xs text-muted-foreground">Each partner will get their own login with full owner-level access to all branches, reports, and settings.</p>

                {partners.map((partner, i) => (
                  <div key={i} className="p-4 bg-card rounded-lg border space-y-3 relative">
                    {partners.length > 1 && (
                      <button onClick={() => removePartner(i)} className="absolute top-3 right-3 text-muted-foreground hover:text-destructive">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Full Name *</Label>
                        <Input value={partner.name} onChange={(e) => updatePartner(i, 'name', e.target.value)} placeholder="Partner name" className="mt-1" />
                      </div>
                      <div>
                        <Label>Email *</Label>
                        <Input type="email" inputMode="email" autoComplete="email" value={partner.email} onChange={(e) => updatePartner(i, 'email', e.target.value)} onBlur={(e) => verifyEmail(e.target.value)} placeholder="partner@email.com" className="mt-1" />
                        {partner.email && emailIsTaken(partner.email) && (
                          <p className="text-xs text-destructive mt-1">This email is already registered. Use a different email or log in instead.</p>
                        )}
                      </div>
                    </div>
                    <div>
                      <Label>Phone *</Label>
                      <Input type="tel" inputMode="tel" autoComplete="tel" value={partner.phone} onChange={(e) => updatePartner(i, 'phone', e.target.value)} placeholder="03XX-XXXXXXX" className="mt-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Password *</Label>
                        <Input type="password" value={partner.password} onChange={(e) => updatePartner(i, 'password', e.target.value)} minLength={8} placeholder="Min 8 chars" className="mt-1" />
                        {partner.password && getPasswordError(partner.password) && (
                          <p className="text-xs text-destructive mt-1">{getPasswordError(partner.password)}</p>
                        )}
                      </div>
                      <div>
                        <Label>Confirm Password *</Label>
                        <Input type="password" value={partner.confirmPassword} onChange={(e) => updatePartner(i, 'confirmPassword', e.target.value)} className="mt-1" />
                        {partner.password && partner.confirmPassword && partner.password !== partner.confirmPassword && (
                          <p className="text-xs text-destructive mt-1">Passwords don&apos;t match</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                <Button variant="outline" onClick={addPartnerRow} className="w-full">
                  <Plus className="w-4 h-4 mr-2" /> Add Another Partner
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Step 4 — Working Hours */}
        {step === 4 && (
          <div className="space-y-6">
            <h2 className="font-heading text-2xl font-bold">{t('workingHours')}</h2>

            <div className="space-y-3">
              {DAYS.map((day) => (
                <div key={day} className="flex items-center gap-3 p-3 bg-card rounded-lg border">
                  <span className="w-24 text-sm font-medium">{DAY_LABELS[day]}</span>
                  {hours[day].off ? (
                    <span className="flex-1 text-sm text-muted-foreground">Day Off</span>
                  ) : (
                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        type="time"
                        value={hours[day].open}
                        onChange={(e) => setHours({ ...hours, [day]: { ...hours[day], open: e.target.value } })}
                        className="w-32"
                      />
                      <span className="text-muted-foreground">to</span>
                      <Input
                        type="time"
                        value={hours[day].close}
                        onChange={(e) => setHours({ ...hours, [day]: { ...hours[day], close: e.target.value } })}
                        className="w-32"
                      />
                    </div>
                  )}
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={hours[day].off}
                      onCheckedChange={(checked) => setHours({ ...hours, [day]: { ...hours[day], off: checked } })}
                    />
                    <span className="text-muted-foreground">{t('dayOff')}</span>
                  </label>
                </div>
              ))}
            </div>

            <div className="space-y-3 pt-4 border-t">
              <label className="flex items-center gap-3 cursor-pointer">
                <Switch checked={jummahBreak} onCheckedChange={setJummahBreak} />
                <span className="text-sm font-medium">{t('jummahBreak')}</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <Switch checked={prayerBlocks} onCheckedChange={setPrayerBlocks} />
                <span className="text-sm font-medium">{t('prayerBlocks')}</span>
              </label>
            </div>
          </div>
        )}

        {/* Step 5 — Services */}
        {step === 5 && (
          <div className="space-y-6">
            <h2 className="font-heading text-2xl font-bold">{t('yourServices')}</h2>
            <p className="text-muted-foreground text-sm">Select services and set your prices</p>

            <div className="space-y-2">
              {services.map((svc, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-card rounded-lg border">
                  <input
                    type="checkbox"
                    checked={svc.selected}
                    onChange={(e) => {
                      const updated = [...services];
                      updated[i] = { ...updated[i], selected: e.target.checked };
                      setServices(updated);
                    }}
                    className="rounded"
                  />
                  <span className="flex-1 text-sm font-medium">{svc.name}</span>
                  <span className="text-xs text-muted-foreground">{svc.duration}min</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Rs</span>
                    <Input
                      type="number"
                      value={svc.price}
                      onChange={(e) => {
                        const updated = [...services];
                        updated[i] = { ...updated[i], price: Number(e.target.value) };
                        setServices(updated);
                      }}
                      className="w-24 text-right"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-end gap-2 pt-4 border-t">
              <div className="flex-1">
                <Label>Service name</Label>
                <Input value={customServiceName} onChange={(e) => setCustomServiceName(e.target.value)} placeholder="Custom service" className="mt-1" />
              </div>
              <div className="w-28">
                <Label>Price (Rs)</Label>
                <Input type="number" value={customServicePrice} onChange={(e) => setCustomServicePrice(e.target.value)} placeholder="0" className="mt-1" />
              </div>
              <Button variant="outline" onClick={addCustomService} className="touch-target">
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            <button onClick={() => setStep(6)} className="text-sm text-gold hover:underline">
              {t('skipForNow')}
            </button>
          </div>
        )}

        {/* Step 6 — Staff */}
        {step === 6 && (
          <div className="space-y-6">
            <h2 className="font-heading text-2xl font-bold">{t('addFirstStaff')}</h2>

            {staffList.map((staff, i) => (
              <div key={i} className="p-4 bg-card rounded-lg border space-y-3 relative">
                {staffList.length > 1 && (
                  <button onClick={() => removeStaff(i)} className="absolute top-3 right-3 text-muted-foreground hover:text-destructive">
                    <X className="w-4 h-4" />
                  </button>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{t('staffName')}</Label>
                    <Input value={staff.name} onChange={(e) => updateStaff(i, 'name', e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label>{t('staffRole')}</Label>
                    <Select value={staff.role} onValueChange={(v) => { if (v) updateStaff(i, 'role', v); }}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="senior_stylist">Senior Stylist</SelectItem>
                        <SelectItem value="junior_stylist">Junior Stylist</SelectItem>
                        <SelectItem value="receptionist">Receptionist</SelectItem>
                        <SelectItem value="helper">Helper</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Email *</Label>
                  <Input type="email" inputMode="email" autoComplete="email" value={staff.email} onChange={(e) => updateStaff(i, 'email', e.target.value)} onBlur={(e) => verifyEmail(e.target.value)} placeholder="staff@email.com" className="mt-1" />
                  {staff.email && emailIsTaken(staff.email) && (
                    <p className="text-xs text-destructive mt-1">This email is already registered. Use a different email.</p>
                  )}
                </div>
                <div>
                  <Label>Phone *</Label>
                  <Input type="tel" inputMode="tel" autoComplete="tel" value={staff.phone} onChange={(e) => updateStaff(i, 'phone', e.target.value)} placeholder="03XX-XXXXXXX" className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Password *</Label>
                    <Input
                      type="password"
                      value={staff.password}
                      onChange={(e) => updateStaff(i, 'password', e.target.value)}
                      minLength={8}
                      placeholder="Min 8 chars"
                      className="mt-1"
                    />
                    {staff.password && getPasswordError(staff.password) && (
                      <p className="text-xs text-destructive mt-1">{getPasswordError(staff.password)}</p>
                    )}
                  </div>
                  <div>
                    <Label>Confirm Password *</Label>
                    <Input
                      type="password"
                      value={staff.confirmPassword}
                      onChange={(e) => updateStaff(i, 'confirmPassword', e.target.value)}
                      className="mt-1"
                    />
                    {staff.password && staff.confirmPassword && staff.password !== staff.confirmPassword && (
                      <p className="text-xs text-destructive mt-1">Passwords don&apos;t match</p>
                    )}
                  </div>
                </div>
                <div>
                  <Label>Base Salary (PKR / month)</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={staff.baseSalary}
                    onChange={(e) => updateStaff(i, 'baseSalary', e.target.value)}
                    placeholder="e.g. 25000"
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Commission</Label>
                    <Select value={staff.commissionType} onValueChange={(v) => { if (v) updateStaff(i, 'commissionType', v); }}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="percentage">Percentage (%)</SelectItem>
                        <SelectItem value="flat">Flat (PKR)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {staff.commissionType !== 'none' && (
                    <div>
                      <Label>{staff.commissionType === 'percentage' ? 'Rate (%)' : 'Amount per service'}</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={staff.commissionRate}
                        onChange={(e) => updateStaff(i, 'commissionRate', e.target.value)}
                        placeholder={staff.commissionType === 'percentage' ? 'e.g. 10' : 'e.g. 100'}
                        className="mt-1"
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}

            <Button variant="outline" onClick={addStaffRow} className="w-full">
              <Plus className="w-4 h-4 mr-2" /> {t('addAnother')}
            </Button>
          </div>
        )}

        {/* Step 7 — All Set */}
        {step === 7 && (
          <div className="text-center py-16">
            <div className="w-24 h-24 bg-green-500/15 rounded-full flex items-center justify-center mx-auto mb-6">
              <Check className="w-12 h-12 text-green-600" />
            </div>
            <h1 className="font-heading text-3xl font-bold mb-3">{t('allSet')}</h1>
            <p className="text-muted-foreground text-lg mb-2">{t('setupComplete')}</p>
            <p className="text-sm text-muted-foreground mb-8">
              {selectedServices.length} {t('servicesAdded')}, {validStaff.length} {t('staffAdded')}{ownershipType === 'multiple' && validPartners.length > 0 ? `, ${validPartners.length} partner${validPartners.length > 1 ? 's' : ''}` : ''}
            </p>
            <Button
              size="lg"
              onClick={handleFinish}
              disabled={loading}
              className="bg-gold hover:bg-gold/90 text-black border border-gold px-8"
            >
              {loading ? t('loading') : t('openDashboard')} <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}

        {/* Navigation buttons */}
        {step >= 2 && step <= 6 && (
          <div className="flex justify-between mt-8 pt-6 border-t">
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              <ChevronLeft className="w-4 h-4 mr-1" /> {t('back')}
            </Button>
            <Button onClick={handleNext} className="bg-gold hover:bg-gold/90 text-black border border-gold">
              {t('next')} <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
