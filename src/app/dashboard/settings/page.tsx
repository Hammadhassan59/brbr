'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, X, Scissors, Sparkles, Users, MapPin, Pencil, Trash2, Copy, CreditCard, Check, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { updateSalon, updateBranchWorkingHours, createService, updateService, deleteService, createBranch, updateBranch, deleteBranch } from '@/app/actions/settings';
import { getPublicPlatformConfig } from '@/app/actions/admin-settings';
import { PaymentSubmitModal } from '@/components/payment-submit-modal';
import { ProfileCard } from '@/components/profile-card';
import { useAppStore } from '@/store/app-store';
import { useLanguage } from '@/components/providers/language-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import toast from 'react-hot-toast';
import { showActionError, handleSubscriptionError } from '@/components/paywall-dialog';
import type { Salon, Branch, WorkingHours, DayHours, Service, ServiceCategory } from '@/types/database';

const SERVICE_CATEGORIES: { value: ServiceCategory; label: string }[] = [
  { value: 'haircut', label: 'Haircut' },
  { value: 'color', label: 'Color' },
  { value: 'treatment', label: 'Treatment' },
  { value: 'facial', label: 'Facial' },
  { value: 'waxing', label: 'Waxing' },
  { value: 'bridal', label: 'Bridal' },
  { value: 'nails', label: 'Nails' },
  { value: 'massage', label: 'Massage' },
  { value: 'beard', label: 'Beard' },
  { value: 'other', label: 'Other' },
];

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const DAY_LABELS: Record<string, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

export default function SettingsPage() {
  const { salon, setSalon, currentBranch, setCurrentBranch, isOwner, isPartner } = useAppStore();
  const canManage = isOwner || isPartner;
  const { language, setLanguage } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchStats, setBranchStats] = useState<Record<string, { staffCount: number; todayRevenue: number; todayAppointments: number }>>({});

  // Salon profile
  const [salonName, setSalonName] = useState('');
  const [salonType, setSalonType] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');

  // Working hours
  const [hours, setHours] = useState<Record<string, { open: string; close: string; off: boolean }>>({});
  const [jummahBreak, setJummahBreak] = useState(true);
  const [prayerBlockEnabled, setPrayerBlockEnabled] = useState(false);

  // Tax & billing
  const [gstEnabled, setGstEnabled] = useState(false);
  const [gstNumber, setGstNumber] = useState('');
  const [gstRate, setGstRate] = useState('');

  // Payment methods
  const [jazzcashNumber, setJazzcashNumber] = useState('');
  const [easypaisaNumber, setEasypaisaNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankTitle, setBankTitle] = useState('');

  // Privacy / Ladies
  const [privacyMode, setPrivacyMode] = useState(false);

  // Screen wake lock
  const [keepAwake, setKeepAwake] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('icut-keep-awake') === 'true';
    }
    return false;
  });

  const fetchData = useCallback(async () => {
    if (!salon) return;
    setLoading(true);
    const [branchRes, svcRes] = await Promise.all([
      supabase.from('branches').select('*').eq('salon_id', salon.id).order('is_main', { ascending: false }),
      supabase.from('services').select('*').eq('salon_id', salon.id).order('sort_order'),
    ]);

    setSalonName(salon.name);
    setSalonType(salon.type);
    setCity(salon.city || '');
    setAddress(salon.address || '');
    setPhone(salon.phone || '');
    setWhatsapp(salon.whatsapp || '');
    setGstEnabled(salon.gst_enabled);
    setGstNumber(salon.gst_number || '');
    setGstRate(String(salon.gst_rate || ''));
    setPrayerBlockEnabled(salon.prayer_block_enabled);
    setJazzcashNumber(salon.jazzcash_number || '');
    setEasypaisaNumber(salon.easypaisa_number || '');
    setBankName(salon.bank_name || '');
    setBankAccount(salon.bank_account || '');
    setBankTitle(salon.bank_title || '');
    setPrivacyMode(salon.privacy_mode || false);

    if (branchRes.data) {
      const branchList = branchRes.data as Branch[];
      setBranches(branchList);
      const main = branchList[0];
      if (main?.working_hours) {
        const wh = main.working_hours as WorkingHours;
        const h: Record<string, { open: string; close: string; off: boolean }> = {};
        DAYS.forEach((d) => { h[d] = { open: wh[d].open, close: wh[d].close, off: wh[d].off }; });
        setHours(h);
        setJummahBreak(!!(wh.fri as DayHours & { jummah_break?: boolean }).jummah_break);
      }

      // Fetch per-branch stats
      const today = new Date().toISOString().slice(0, 10);
      const branchIds = branchList.map((b) => b.id);
      const [staffRes, billsRes, aptsRes] = await Promise.all([
        supabase.from('staff').select('branch_id').eq('salon_id', salon.id).eq('is_active', true),
        supabase.from('bills').select('branch_id, total_amount').eq('salon_id', salon.id).gte('created_at', today + 'T00:00:00').lt('created_at', today + 'T23:59:59'),
        supabase.from('appointments').select('branch_id').eq('salon_id', salon.id).eq('appointment_date', today),
      ]);
      const stats: Record<string, { staffCount: number; todayRevenue: number; todayAppointments: number }> = {};
      branchIds.forEach((id) => { stats[id] = { staffCount: 0, todayRevenue: 0, todayAppointments: 0 }; });
      staffRes.data?.forEach((s: { branch_id: string | null }) => { if (s.branch_id && stats[s.branch_id]) stats[s.branch_id].staffCount++; });
      billsRes.data?.forEach((b: { branch_id: string | null; total_amount: number }) => { if (b.branch_id && stats[b.branch_id]) stats[b.branch_id].todayRevenue += b.total_amount; });
      aptsRes.data?.forEach((a: { branch_id: string | null }) => { if (a.branch_id && stats[a.branch_id]) stats[a.branch_id].todayAppointments++; });
      setBranchStats(stats);
    }
    if (svcRes.data) setServices(svcRes.data as Service[]);
    setLoading(false);
  }, [salon]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Screen wake lock — persist to localStorage
  useEffect(() => {
    localStorage.setItem('icut-keep-awake', String(keepAwake));
    let wakeLock: WakeLockSentinel | null = null;
    if (keepAwake && 'wakeLock' in navigator) {
      (navigator as Navigator & { wakeLock: { request: (type: string) => Promise<WakeLockSentinel> } }).wakeLock.request('screen').then((wl) => { wakeLock = wl; }).catch(() => {});
    }
    return () => { wakeLock?.release(); };
  }, [keepAwake]);

  async function saveSalonProfile() {
    if (!salon) return;
    if (!salonName.trim()) { toast.error('Salon name is required'); return; }
    const parsedGstRate = Number(gstRate) || 0;
    if (gstEnabled && (parsedGstRate < 0 || parsedGstRate > 100)) { toast.error('GST rate must be 0–100%'); return; }
    setSaving(true);
    try {
      const { data, error } = await updateSalon({
        name: salonName.trim(), type: salonType, city, address, phone, whatsapp,
        gst_enabled: gstEnabled, gst_number: gstNumber || null, gst_rate: parsedGstRate,
        prayer_block_enabled: prayerBlockEnabled,
        privacy_mode: privacyMode,
      });
      if (showActionError(error)) return;
      setSalon(data as Salon);
      toast.success('Salon profile saved');
    } catch (err: unknown) { if (handleSubscriptionError(err)) return; toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setSaving(false); }
  }

  async function saveWorkingHours() {
    if (!currentBranch) return;
    // Validate close > open for working days
    for (const d of DAYS) {
      if (hours[d]?.off) continue;
      const open = hours[d]?.open || '09:00';
      const close = hours[d]?.close || '21:00';
      if (close <= open) { toast.error(`${DAY_LABELS[d]}: closing time must be after opening time`); return; }
    }
    setSaving(true);
    try {
      const wh: Record<string, unknown> = {};
      DAYS.forEach((d) => {
        wh[d] = { open: hours[d]?.open || '09:00', close: hours[d]?.close || '21:00', off: hours[d]?.off || false, ...(d === 'fri' ? { jummah_break: jummahBreak } : {}) };
      });
      // Save branch working hours + salon-level prayer block setting in parallel
      const [branchRes, salonRes] = await Promise.all([
        updateBranchWorkingHours(currentBranch.id, wh),
        salon ? updateSalon({ prayer_block_enabled: prayerBlockEnabled }) : Promise.resolve({ data: null, error: null }),
      ]);
      if (showActionError(branchRes.error)) return;
      if (showActionError(salonRes.error)) return;
      setCurrentBranch(branchRes.data as Branch);
      if (salonRes.data) setSalon(salonRes.data as Salon);
      toast.success('Working hours saved');
    } catch (err: unknown) { if (handleSubscriptionError(err)) return; toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setSaving(false); }
  }

  async function savePaymentSettings() {
    if (!salon) return;
    setSaving(true);
    try {
      const { data, error } = await updateSalon({
        jazzcash_number: jazzcashNumber || null,
        easypaisa_number: easypaisaNumber || null,
        bank_name: bankName || null,
        bank_account: bankAccount || null,
        bank_title: bankTitle || null,
      });
      if (showActionError(error)) return;
      setSalon(data as Salon);
      toast.success('Payment settings saved');
    } catch (err: unknown) { if (handleSubscriptionError(err)) return; toast.error(err instanceof Error ? err.message : 'Failed'); }
    finally { setSaving(false); }
  }

  async function toggleServiceActive(id: string, active: boolean) {
    await updateService(id, { is_active: active });
    setServices(services.map((s) => s.id === id ? { ...s, is_active: active } : s));
    toast.success(active ? 'Service activated' : 'Service deactivated');
  }

  async function updateServicePrice(id: string, price: number) {
    await updateService(id, { base_price: price });
    setServices(services.map((s) => s.id === id ? { ...s, base_price: price } : s));
  }

  if (loading) return <div className="space-y-6"><div className="h-12 bg-muted rounded-lg animate-pulse" /><div className="h-64 bg-muted rounded-lg animate-pulse" /></div>;

  return (
    <div className="space-y-6">
      <Tabs defaultValue={canManage ? 'profile' : 'display'}>
        <div className="bg-card border border-border rounded-lg p-2 sm:p-4 overflow-x-auto">
          <TabsList className="bg-transparent h-auto gap-1.5 p-0 flex-nowrap w-max min-w-full">
            {canManage && <TabsTrigger value="profile" className="whitespace-nowrap text-xs px-3.5 py-2 font-medium transition-all duration-150 border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30">Salon Profile</TabsTrigger>}
            {canManage && <TabsTrigger value="hours" className="whitespace-nowrap text-xs px-3.5 py-2 font-medium transition-all duration-150 border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30">Working Hours</TabsTrigger>}
            {canManage && <TabsTrigger value="services" className="whitespace-nowrap text-xs px-3.5 py-2 font-medium transition-all duration-150 border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30">Services</TabsTrigger>}
            {canManage && <TabsTrigger value="payment" className="whitespace-nowrap text-xs px-3.5 py-2 font-medium transition-all duration-150 border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30">Payments</TabsTrigger>}
            {canManage && <TabsTrigger value="tax" className="whitespace-nowrap text-xs px-3.5 py-2 font-medium transition-all duration-150 border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30">Tax & Billing</TabsTrigger>}
            {isOwner && <TabsTrigger value="branches" className="whitespace-nowrap text-xs px-3.5 py-2 font-medium transition-all duration-150 border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30">Branches</TabsTrigger>}
            {isOwner && <TabsTrigger value="subscription" className="whitespace-nowrap text-xs px-3.5 py-2 font-medium transition-all duration-150 border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30">Subscription</TabsTrigger>}
            <TabsTrigger value="account" className="whitespace-nowrap text-xs px-3.5 py-2 font-medium transition-all duration-150 border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30">Profile</TabsTrigger>
            <TabsTrigger value="display" className="whitespace-nowrap text-xs px-3.5 py-2 font-medium transition-all duration-150 border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30">Display</TabsTrigger>
          </TabsList>
        </div>

        {/* Salon Profile */}
        {canManage && <TabsContent value="profile" className="mt-4">
          <div className="bg-card border border-border rounded-lg p-4 sm:p-6 space-y-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Salon Information</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><Label>Salon Name</Label><Input value={salonName} onChange={(e) => setSalonName(e.target.value)} className="mt-1" /></div>
            <div>
              <Label>Salon Type</Label>
              <div className="flex gap-2 mt-1">
                {['gents', 'ladies', 'unisex'].map((t) => (
                  <button key={t} onClick={() => setSalonType(t)} className={`flex-1 py-2.5 border text-sm font-medium transition-all duration-150 ${salonType === t ? 'border-gold bg-gold text-black' : 'border-border hover:border-gold/30'}`}>
                    {t === 'gents' ? <><Scissors className="w-4 h-4 inline-block mr-1.5" />Gents</> : t === 'ladies' ? <><Sparkles className="w-4 h-4 inline-block mr-1.5" />Ladies</> : <><Users className="w-4 h-4 inline-block mr-1.5" />Unisex</>}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><Label>City</Label><Input value={city} onChange={(e) => setCity(e.target.value)} className="mt-1" /></div>
            <div><Label>Address</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1" /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><Label>Phone</Label><Input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" /></div>
            <div><Label>WhatsApp</Label><Input type="tel" inputMode="tel" autoComplete="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="mt-1" /></div>
          </div>
          <div>
            <Label>Language</Label>
            <div className="flex gap-2 mt-1">
              <button onClick={() => setLanguage('en')} className={`px-4 py-2.5 border text-sm font-medium transition-all duration-150 ${language === 'en' ? 'border-gold bg-gold text-black' : 'border-border hover:border-gold/30'}`}>English</button>
              <button onClick={() => setLanguage('ur')} className={`px-4 py-2.5 border text-sm font-medium transition-all duration-150 ${language === 'ur' ? 'border-gold bg-gold text-black' : 'border-border hover:border-gold/30'}`}>اردو</button>
            </div>
          </div>

          {salonType === 'ladies' && (
            <div className="bg-secondary/30 p-4 border border-border flex items-center justify-between">
              <div><p className="text-sm font-medium">Privacy Mode</p><p className="text-xs text-muted-foreground">Hide client photos & last names for non-owner staff</p></div>
              <Switch checked={privacyMode} onCheckedChange={setPrivacyMode} className="" />
            </div>
          )}

          <Button onClick={saveSalonProfile} disabled={saving} className="w-full sm:w-auto bg-gold hover:bg-gold/90 text-black font-bold h-11">{saving ? 'Saving...' : 'Save Profile'}</Button>
          </div>
        </TabsContent>}

        {/* Working Hours */}
        {canManage && <TabsContent value="hours" className="mt-4">
          <div className="bg-card border border-border rounded-lg p-4 sm:p-6 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Weekly Schedule</p>
          {DAYS.map((day) => (
            <div key={day} className="border-border flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 bg-card border">
              <div className="flex items-center justify-between gap-3 sm:contents">
                <span className="sm:w-24 text-sm font-medium">{DAY_LABELS[day]}</span>
                <label className="flex items-center gap-2 text-sm sm:order-last">
                  <Switch checked={hours[day]?.off || false} onCheckedChange={(checked) => setHours({ ...hours, [day]: { ...hours[day], off: checked } })} className="" />
                  <span className="text-muted-foreground text-xs">Off</span>
                </label>
              </div>
              {hours[day]?.off ? <span className="flex-1 text-sm text-muted-foreground">Day Off</span> : (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Input type="time" value={hours[day]?.open || '09:00'} onChange={(e) => setHours({ ...hours, [day]: { ...hours[day], open: e.target.value } })} className="flex-1 sm:flex-none sm:w-32 min-w-0" />
                  <span className="text-muted-foreground text-xs sm:text-sm">to</span>
                  <Input type="time" value={hours[day]?.close || '21:00'} onChange={(e) => setHours({ ...hours, [day]: { ...hours[day], close: e.target.value } })} className="flex-1 sm:flex-none sm:w-32 min-w-0" />
                </div>
              )}
            </div>
          ))}
          <div className="space-y-3 pt-4 border-t">
            <label className="bg-secondary/30 p-4 border border-border flex items-center gap-3 cursor-pointer"><Switch checked={jummahBreak} onCheckedChange={setJummahBreak} className="" /><span className="text-sm">Jummah Break (12:30 - 2:00 PM)</span></label>
            <label className="bg-secondary/30 p-4 border border-border flex items-center gap-3 cursor-pointer"><Switch checked={prayerBlockEnabled} onCheckedChange={setPrayerBlockEnabled} className="" /><span className="text-sm">Auto-block prayer times on calendar</span></label>
          </div>
          <Button onClick={saveWorkingHours} disabled={saving} className="w-full sm:w-auto bg-gold hover:bg-gold/90 text-black font-bold h-11">{saving ? 'Saving...' : 'Save Hours'}</Button>
          </div>
        </TabsContent>}

        {/* Services */}
        {canManage && <TabsContent value="services" className="mt-4 space-y-3">
          <ServiceManager
            services={services}
            salonId={salon?.id || ''}
            onToggle={toggleServiceActive}
            onPriceChange={updateServicePrice}
            onAdded={(svc) => setServices([...services, svc])}
            onUpdated={(svc) => setServices(services.map((s) => s.id === svc.id ? svc : s))}
            onRemoved={(id) => setServices(services.filter((s) => s.id !== id))}
          />
        </TabsContent>}

        {/* Payment Methods */}
        {canManage && <TabsContent value="payment" className="mt-4">
          <div className="bg-card border border-border rounded-lg p-4 sm:p-6 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment Methods</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="border-border"><CardContent className="p-4 space-y-3">
              <p className="text-sm font-medium">Cash</p>
              <p className="text-xs text-muted-foreground">Always enabled</p>
            </CardContent></Card>
            <Card className="border-border"><CardContent className="p-4 space-y-3">
              <p className="text-sm font-medium">JazzCash</p>
              <div><Label className="text-xs">Account Number</Label><Input value={jazzcashNumber} onChange={(e) => setJazzcashNumber(e.target.value)} placeholder="03XX-XXXXXXX" className="mt-1" /></div>
            </CardContent></Card>
            <Card className="border-border"><CardContent className="p-4 space-y-3">
              <p className="text-sm font-medium">EasyPaisa</p>
              <div><Label className="text-xs">Account Number</Label><Input value={easypaisaNumber} onChange={(e) => setEasypaisaNumber(e.target.value)} placeholder="03XX-XXXXXXX" className="mt-1" /></div>
            </CardContent></Card>
            <Card className="border-border sm:col-span-2"><CardContent className="p-4 space-y-3">
              <p className="text-sm font-medium">Bank Transfer (IBFT)</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><Label className="text-xs">Bank Name</Label><Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="HBL" className="mt-1" /></div>
                <div><Label className="text-xs">Account #</Label><Input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} className="mt-1" /></div>
                <div><Label className="text-xs">Account Title</Label><Input value={bankTitle} onChange={(e) => setBankTitle(e.target.value)} className="mt-1" /></div>
              </div>
            </CardContent></Card>
          </div>
          <Button onClick={savePaymentSettings} disabled={saving} className="w-full sm:w-auto bg-gold hover:bg-gold/90 text-black font-bold h-11">{saving ? 'Saving...' : 'Save Payment Settings'}</Button>
          </div>
        </TabsContent>}

        {/* Tax & Billing */}
        {canManage && <TabsContent value="tax" className="mt-4">
          <div className="bg-card border border-border rounded-lg p-4 sm:p-6 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tax Configuration</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-secondary/30 p-4 border border-border flex items-center justify-between">
              <div><p className="text-sm font-medium">GST / Sales Tax</p><p className="text-xs text-muted-foreground">Enable tax on bills</p></div>
              <Switch checked={gstEnabled} onCheckedChange={setGstEnabled} className="" />
            </div>
            {gstEnabled && (
              <>
                <div />
                <div><Label className="text-xs">GST Number</Label><Input value={gstNumber} onChange={(e) => setGstNumber(e.target.value)} className="mt-1" /></div>
                <div><Label className="text-xs">GST Rate (%)</Label><Input type="number" value={gstRate} onChange={(e) => setGstRate(e.target.value)} className="mt-1" /></div>
              </>
            )}
          </div>
          <Button onClick={saveSalonProfile} disabled={saving} className="w-full sm:w-auto bg-gold hover:bg-gold/90 text-black font-bold h-11">{saving ? 'Saving...' : 'Save Tax Settings'}</Button>
          </div>
        </TabsContent>}

        {/* Branches */}
        {isOwner && <TabsContent value="branches" className="mt-4">
          <BranchManager
            branches={branches}
            salonId={salon?.id || ''}
            currentBranchId={currentBranch?.id || ''}
            branchStats={branchStats}
            ownerName={salon?.name || ''}
            onAdded={(branch) => {
              setBranches([...branches, branch]);
              const { setBranches: setStoreBranches } = useAppStore.getState();
              setStoreBranches([...branches, branch]);
            }}
            onUpdated={(branch) => {
              const updated = branches.map((b) => b.id === branch.id ? branch : b);
              setBranches(updated);
              const { setBranches: setStoreBranches } = useAppStore.getState();
              setStoreBranches(updated);
              if (currentBranch?.id === branch.id) setCurrentBranch(branch);
            }}
            onRemoved={(id) => {
              const updated = branches.filter((b) => b.id !== id);
              setBranches(updated);
              const { setBranches: setStoreBranches } = useAppStore.getState();
              setStoreBranches(updated);
            }}
          />
        </TabsContent>}

        {/* Subscription */}
        {isOwner && <TabsContent value="subscription" className="mt-4">
          <SubscriptionTab salon={salon} branches={branches} />
        </TabsContent>}

        {/* Profile (email / password / name / phone) */}
        <TabsContent value="account" className="mt-4">
          <ProfileCard />
        </TabsContent>

        {/* Display */}
        <TabsContent value="display" className="mt-4">
          <div className="bg-card border border-border rounded-lg p-4 sm:p-6 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Display Preferences</p>
          <div className="bg-secondary/30 p-4 border border-border flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1"><p className="text-sm font-medium break-words">Keep Screen Awake</p><p className="text-xs text-muted-foreground break-words">Prevent tablet from sleeping (front desk mode)</p></div>
            <Switch checked={keepAwake} onCheckedChange={setKeepAwake} className="shrink-0" />
          </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}


// ───────────────────────────────────────
// Service Manager sub-component
// ───────────────────────────────────────

function ServiceManager({
  services, salonId, onToggle, onPriceChange, onAdded, onUpdated, onRemoved,
}: {
  services: Service[];
  salonId: string;
  onToggle: (id: string, active: boolean) => void;
  onPriceChange: (id: string, price: number) => void;
  onAdded: (svc: Service) => void;
  onUpdated: (svc: Service) => void;
  onRemoved: (id: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ServiceCategory>('haircut');
  const [duration, setDuration] = useState('30');
  const [price, setPrice] = useState('');

  function resetForm() {
    setName(''); setPrice(''); setDuration('30'); setCategory('haircut');
    setEditingId(null); setShowForm(false);
  }

  function startEdit(svc: Service) {
    setEditingId(svc.id);
    setName(svc.name);
    setCategory(svc.category);
    setDuration(String(svc.duration_minutes));
    setPrice(String(svc.base_price));
    setShowForm(true);
  }

  async function saveService() {
    if (!name.trim()) { toast.error('Service name is required'); return; }
    if (!price || isNaN(Number(price)) || Number(price) <= 0) { toast.error('Enter a valid price'); return; }
    if (duration && (isNaN(Number(duration)) || Number(duration) < 5 || Number(duration) > 480)) { toast.error('Duration must be 5–480 minutes'); return; }

    setSaving(true);
    try {
      if (editingId) {
        const { data, error } = await updateService(editingId, {
          name: name.trim(),
          category,
          duration_minutes: Number(duration) || 30,
          base_price: Number(price),
        });
        if (showActionError(error)) return;
        onUpdated(data as Service);
        toast.success(`"${name.trim()}" updated`);
      } else {
        const { data, error } = await createService({
          name: name.trim(),
          category,
          durationMinutes: Number(duration) || 30,
          basePrice: Number(price),
          sortOrder: services.length + 1,
        });
        if (showActionError(error)) return;
        onAdded(data as Service);
        toast.success(`"${name.trim()}" added`);
      }
      resetForm();
    } catch (err: unknown) {
      if (handleSubscriptionError(err)) return;
      toast.error(err instanceof Error ? err.message : 'Failed to save service');
    } finally {
      setSaving(false);
    }
  }

  async function removeService(svc: Service) {
    if (!confirm(`Remove "${svc.name}"? This cannot be undone.`)) return;
    try {
      const { error } = await deleteService(svc.id);
      if (showActionError(error)) return;
      onRemoved(svc.id);
      toast.success(`"${svc.name}" removed`);
      if (editingId === svc.id) resetForm();
    } catch (err: unknown) {
      if (handleSubscriptionError(err)) return;
      toast.error(err instanceof Error ? err.message : 'Failed to remove');
    }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{services.length} services</p>
        <Button size="sm" onClick={() => { if (showForm) resetForm(); else setShowForm(true); }} variant={showForm ? 'outline' : 'default'} className={showForm ? '' : 'bg-gold hover:bg-gold/90 text-black font-bold'}>
          {showForm ? <><X className="w-4 h-4 mr-1" /> Cancel</> : <><Plus className="w-4 h-4 mr-1" /> Add Service</>}
        </Button>
      </div>

      {showForm && (
        <Card className="border-border border-gold/30 bg-gold/5">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-medium">{editingId ? 'Edit Service' : 'New Service'}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Service Name *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Haircut, Facial, Waxing" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Category</Label>
                <Select value={category} onValueChange={(v) => { if (v) setCategory(v as ServiceCategory); }}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SERVICE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Duration (minutes)</Label>
                <Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} className="mt-1" inputMode="numeric" />
              </div>
              <div>
                <Label className="text-xs">Price (Rs) *</Label>
                <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" className="mt-1" inputMode="numeric" />
              </div>
            </div>
            <Button onClick={saveService} disabled={saving} size="sm" className="w-full sm:w-auto bg-gold hover:bg-gold/90 text-black font-bold h-11">
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Service'}
            </Button>
          </CardContent>
        </Card>
      )}

      {services.map((svc) => (
        <div key={svc.id} className={`border-border flex flex-wrap items-center gap-2 sm:gap-3 p-3 bg-card border ${editingId === svc.id ? 'ring-2 ring-gold/40' : ''}`}>
          <Switch checked={svc.is_active} onCheckedChange={(v) => onToggle(svc.id, v)} className="shrink-0" />
          <div className="flex-1 min-w-0 basis-[60%] sm:basis-auto">
            <span className={`text-sm font-medium break-words ${!svc.is_active ? 'line-through text-muted-foreground' : ''}`}>{svc.name}</span>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-xs text-muted-foreground capitalize">{svc.category}</span>
              <span className="text-xs text-muted-foreground">{svc.duration_minutes}min</span>
            </div>
          </div>
          <Input type="number" value={svc.base_price} onChange={(e) => onPriceChange(svc.id, Number(e.target.value))} className="w-20 sm:w-24 h-8 text-xs text-right" inputMode="numeric" />
          <Button variant="ghost" size="sm" className="h-8 text-xs px-2" onClick={() => startEdit(svc)}>Edit</Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs px-2 text-destructive hover:text-destructive" onClick={() => removeService(svc)}>Remove</Button>
        </div>
      ))}
    </>
  );
}


// ───────────────────────────────────────
// Branch Manager sub-component
// ───────────────────────────────────────

function BranchManager({
  branches, salonId, currentBranchId, branchStats, ownerName, onAdded, onUpdated, onRemoved,
}: {
  branches: Branch[];
  salonId: string;
  currentBranchId: string;
  branchStats: Record<string, { staffCount: number; todayRevenue: number; todayAppointments: number }>;
  ownerName: string;
  onAdded: (branch: Branch) => void;
  onUpdated: (branch: Branch) => void;
  onRemoved: (id: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchPhone, setBranchPhone] = useState('');

  function resetForm() {
    setName(''); setBranchAddress(''); setBranchPhone('');
    setEditingId(null); setShowForm(false);
  }

  function startEdit(branch: Branch) {
    setEditingId(branch.id);
    setName(branch.name);
    setBranchAddress(branch.address || '');
    setBranchPhone(branch.phone || '');
    setShowForm(true);
  }

  async function saveBranch() {
    if (!name.trim()) { toast.error('Branch name is required'); return; }
    setSaving(true);
    try {
      if (editingId) {
        const { data, error } = await updateBranch(editingId, {
          name: name.trim(),
          address: branchAddress,
          phone: branchPhone,
        });
        if (showActionError(error)) return;
        onUpdated(data as Branch);
        toast.success(`"${name.trim()}" updated`);
      } else {
        const { data, error } = await createBranch({
          name: name.trim(),
          address: branchAddress,
          phone: branchPhone,
        });
        if (showActionError(error)) return;
        onAdded(data as Branch);
        toast.success(`"${name.trim()}" created`);
      }
      resetForm();
    } catch (err: unknown) {
      if (handleSubscriptionError(err)) return;
      toast.error(err instanceof Error ? err.message : 'Failed to save branch');
    } finally {
      setSaving(false);
    }
  }

  async function removeBranch(branch: Branch) {
    if (branch.is_main) { toast.error('Cannot delete the main branch'); return; }
    if (!confirm(`Delete "${branch.name}"? This cannot be undone.`)) return;
    try {
      const { error } = await deleteBranch(branch.id);
      if (showActionError(error)) return;
      onRemoved(branch.id);
      toast.success(`"${branch.name}" deleted`);
      if (editingId === branch.id) resetForm();
    } catch (err: unknown) {
      if (handleSubscriptionError(err)) return;
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{branches.length} {branches.length === 1 ? 'branch' : 'branches'}</p>
        <Button size="sm" onClick={() => { if (showForm) resetForm(); else setShowForm(true); }} variant={showForm ? 'outline' : 'default'} className={showForm ? '' : 'bg-gold hover:bg-gold/90 text-black font-bold'}>
          {showForm ? <><X className="w-4 h-4 mr-1" /> Cancel</> : <><Plus className="w-4 h-4 mr-1" /> Add Branch</>}
        </Button>
      </div>

      {showForm && (
        <Card className="border-border border-gold/30 bg-gold/5">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-medium">{editingId ? 'Edit Branch' : 'New Branch'}</p>
            <div>
              <Label className="text-xs">Branch Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gulberg Branch" className="mt-1" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Address</Label>
                <Input value={branchAddress} onChange={(e) => setBranchAddress(e.target.value)} placeholder="Street address" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Phone</Label>
                <Input value={branchPhone} onChange={(e) => setBranchPhone(e.target.value)} placeholder="03XX-XXXXXXX" className="mt-1" />
              </div>
            </div>
            <Button onClick={saveBranch} disabled={saving} size="sm" className="w-full sm:w-auto bg-gold hover:bg-gold/90 text-black font-bold h-11">
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Branch'}
            </Button>
          </CardContent>
        </Card>
      )}

      {branches.map((branch) => {
        const stats = branchStats[branch.id];
        return (
          <Card key={branch.id} className={`border-border ${editingId === branch.id ? 'ring-2 ring-gold/40' : ''}`}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-gold/10 flex items-center justify-center shrink-0">
                  <MapPin className="w-5 h-5 text-gold" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{branch.name}</span>
                    {branch.is_main && <span className="text-[10px] px-1.5 py-0.5 bg-gold/20 text-gold font-medium">Main</span>}
                    {branch.id === currentBranchId && <span className="text-[10px] px-1.5 py-0.5 bg-green-500/20 text-green-600 font-medium">Active</span>}
                  </div>
                  {branch.address && <p className="text-xs text-muted-foreground mt-0.5">{branch.address}</p>}
                  {branch.phone && <p className="text-xs text-muted-foreground">{branch.phone}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => startEdit(branch)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  {!branch.is_main && (
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => removeBranch(branch)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              {stats && (
                <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-border">
                  <div>
                    <p className="text-xs text-muted-foreground">Staff</p>
                    <p className="text-sm font-medium">{stats.staffCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Today</p>
                    <p className="text-sm font-medium">{stats.todayAppointments} appts</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Revenue</p>
                    <p className="text-sm font-medium">Rs {stats.todayRevenue.toLocaleString()}</p>
                  </div>
                </div>
              )}
              <div className="mt-2 pt-2 border-t border-border">
                <p className="text-[11px] text-muted-foreground">Owner: <span className="text-foreground">{ownerName}</span></p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}


// ───────────────────────────────────────
// Subscription Tab sub-component
// ───────────────────────────────────────

// Fallback used only if platform_settings is unreachable. The live values
// come from getPublicPlatformConfig() so admin price/feature edits in
// /admin/settings show up here instantly — same source as the homepage,
// /paywall, and /dashboard/billing.
const PLANS_FALLBACK = [
  { key: 'basic', name: 'Basic', price: 2500, branches: 1, staff: 3, features: ['1 branch', 'Up to 3 staff', 'All features'] },
  { key: 'growth', name: 'Growth', price: 5000, branches: 1, staff: 0, features: ['1 branch', 'Unlimited staff', 'All features'] },
  { key: 'pro', name: 'Pro', price: 9000, branches: 3, staff: 0, features: ['Up to 3 branches', 'Unlimited staff', 'Priority support'] },
];

// Bank/JC/EasyPaisa toggles + account details are loaded live from
// platform_settings on mount (see SubscriptionTab). The constant here is a
// fallback shape used before the fetch resolves.
const BANK_DEFAULTS = {
  bankEnabled: true,
  bankName: '',
  accountTitle: '',
  accountNumber: '',
  jazzcashEnabled: true,
  jazzcash: '',
  easypaisaEnabled: false,
  easypaisa: '',
  supportWhatsapp: '',
};

function copyText(text: string, label: string) {
  navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`));
}

function SubscriptionTab({ salon, branches }: { salon: Salon | null; branches: Branch[] }) {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [plans, setPlans] = useState(PLANS_FALLBACK);
  const [bank, setBank] = useState(BANK_DEFAULTS);
  const [modalOpen, setModalOpen] = useState(false);
  const isActive = salon?.subscription_status === 'active';
  const currentPlan = salon?.subscription_plan || 'none';

  // Fetch live plan prices + bank/JC + supportWhatsApp from platform_settings
  // on mount. Same source the homepage, /paywall, and /dashboard/billing use.
  useEffect(() => {
    let cancelled = false;
    getPublicPlatformConfig()
      .then((cfg) => {
        if (cancelled) return;
        setPlans(PLANS_FALLBACK.map((p) => {
          const live = cfg.plans[p.key as 'basic' | 'growth' | 'pro'];
          return live ? { ...p, name: live.displayName || p.name, price: live.price || p.price } : p;
        }));
        setBank({
          bankEnabled: cfg.payment.bankEnabled,
          bankName: cfg.payment.bankName,
          accountTitle: cfg.payment.accountTitle,
          accountNumber: cfg.payment.bankAccount,
          jazzcashEnabled: cfg.payment.jazzcashEnabled,
          jazzcash: cfg.payment.jazzcashAccount,
          easypaisaEnabled: cfg.payment.easypaisaEnabled,
          easypaisa: cfg.payment.easypaisaAccount,
          supportWhatsapp: cfg.supportWhatsApp,
        });
      })
      .catch(() => { /* fall back to defaults */ });
    return () => { cancelled = true; };
  }, []);

  const selectedPlanObj = plans.find((p) => p.key === selectedPlan);

  return (
    <div className="bg-card border border-border rounded-lg p-4 sm:p-6 space-y-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Subscription</p>

      {/* Current status */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-secondary/30 p-4 border border-border rounded-lg">
          <p className="text-xs text-muted-foreground">Current Plan</p>
          <p className="text-lg font-bold capitalize mt-1">{currentPlan === 'none' ? 'No Plan' : currentPlan}</p>
        </div>
        <div className="bg-secondary/30 p-4 border border-border rounded-lg">
          <p className="text-xs text-muted-foreground">Status</p>
          <p className={`text-lg font-bold capitalize mt-1 ${
            isActive ? 'text-green-600' : 'text-red-600'
          }`}>
            {salon?.subscription_status === 'pending' ? 'Not Subscribed'
              : salon?.subscription_status === 'expired' ? 'Expired'
              : salon?.subscription_status === 'suspended' ? 'Suspended'
              : 'Active'}
          </p>
        </div>
        <div className="bg-secondary/30 p-4 border border-border rounded-lg">
          <p className="text-xs text-muted-foreground">
            {isActive ? 'Renews On' : 'Usage'}
          </p>
          <p className="text-lg font-bold mt-1">
            {isActive && salon?.subscription_expires_at
              ? new Date(salon.subscription_expires_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })
              : `${branches.length} branch${branches.length !== 1 ? 'es' : ''}`}
          </p>
        </div>
      </div>

      {/* Read-only notice */}
      {!isActive && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4 flex items-start gap-3">
          <Lock className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-700">Your account is in read-only mode</p>
            <p className="text-xs text-red-600/80 mt-0.5">
              {salon?.subscription_status === 'suspended'
                ? 'Your account has been suspended. Contact support to reactivate.'
                : 'Subscribe to a plan below to unlock all features. Your data is safe.'}
            </p>
          </div>
        </div>
      )}

      {/* Plan selection */}
      {salon?.subscription_status !== 'suspended' && (
        <div className="border border-border rounded-lg p-4 sm:p-5 space-y-3">
          <p className="text-sm font-semibold">{isActive ? 'Plans' : 'Choose a Plan'}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {plans.map((plan) => {
              const isCurrent = currentPlan === plan.key && isActive;
              const isSelected = selectedPlan === plan.key;
              return (
                <button
                  key={plan.key}
                  onClick={() => !isCurrent && setSelectedPlan(isSelected ? null : plan.key)}
                  className={`text-left border rounded-lg p-4 transition-all ${
                    isCurrent ? 'border-gold bg-gold/5'
                    : isSelected ? 'border-gold bg-gold/5 ring-2 ring-gold/30'
                    : 'border-border hover:border-gold/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{plan.name}</p>
                    {isCurrent && (
                      <span className="text-[10px] font-medium bg-gold/20 text-gold px-1.5 py-0.5 rounded">Active</span>
                    )}
                    {!isCurrent && (
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        isSelected ? 'border-gold bg-gold' : 'border-border'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 text-black" />}
                      </div>
                    )}
                  </div>
                  <p className="text-lg font-bold mt-1">
                    Rs {plan.price.toLocaleString()}
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
      )}

      {/* Bank details (shown after plan selection) */}
      {selectedPlan && (
        <div className="border border-border rounded-lg p-4 sm:p-5 space-y-4">
          <p className="text-sm font-semibold flex items-center gap-1.5">
            <CreditCard className="w-4 h-4 text-gold" />
            Payment Details
          </p>

          <div className="bg-gold/5 border border-gold/20 rounded-lg p-3">
            <p className="text-sm font-semibold">
              Amount: Rs {plans.find((p) => p.key === selectedPlan)?.price.toLocaleString()}/month
            </p>
          </div>

          {/* Each method shows only when enabled in /admin/settings AND has
              a value. Bank renders as multiple rows; mobile money as one. */}
          <div className="space-y-3 text-sm">
            {bank.bankEnabled && bank.bankName && (
              <div className="flex items-center justify-between gap-3 p-3 bg-secondary/30 rounded-lg">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Bank</p>
                  <p className="font-medium break-words">{bank.bankName}</p>
                </div>
              </div>
            )}
            {bank.bankEnabled && bank.accountTitle && (
              <div className="flex items-center justify-between gap-3 p-3 bg-secondary/30 rounded-lg">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Account Title</p>
                  <p className="font-medium break-words">{bank.accountTitle}</p>
                </div>
              </div>
            )}
            {bank.bankEnabled && bank.accountNumber && (
              <div className="flex items-center justify-between gap-3 p-3 bg-secondary/30 rounded-lg">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Account Number</p>
                  <p className="font-medium font-mono break-all">{bank.accountNumber}</p>
                </div>
                <button aria-label="Copy account number" onClick={() => copyText(bank.accountNumber, 'Account number')} className="p-2 -mr-1 shrink-0 hover:bg-secondary rounded">
                  <Copy className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            )}
            {bank.jazzcashEnabled && bank.jazzcash && (
              <div className="flex items-center justify-between gap-3 p-3 bg-secondary/30 rounded-lg">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">JazzCash</p>
                  <p className="font-medium font-mono break-all">{bank.jazzcash}</p>
                </div>
                <button aria-label="Copy JazzCash number" onClick={() => copyText(bank.jazzcash, 'JazzCash number')} className="p-2 -mr-1 shrink-0 hover:bg-secondary rounded">
                  <Copy className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            )}
            {bank.easypaisaEnabled && bank.easypaisa && (
              <div className="flex items-center justify-between gap-3 p-3 bg-secondary/30 rounded-lg">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">EasyPaisa</p>
                  <p className="font-medium font-mono break-all">{bank.easypaisa}</p>
                </div>
                <button aria-label="Copy EasyPaisa number" onClick={() => copyText(bank.easypaisa, 'EasyPaisa number')} className="p-2 -mr-1 shrink-0 hover:bg-secondary rounded">
                  <Copy className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            )}
            {!bank.bankEnabled && !bank.jazzcashEnabled && !bank.easypaisaEnabled && (
              <p className="text-xs text-muted-foreground p-3">No payment methods are enabled. Please contact support.</p>
            )}
          </div>

          <div className="bg-secondary/30 border border-border rounded-lg p-4 space-y-1 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground text-sm">How to activate:</p>
            <p>1. Transfer the amount to the bank account or JazzCash number above</p>
            <p>2. Click &ldquo;Submit payment&rdquo; below and upload your screenshot</p>
            <p>3. Super admin reviews and activates your subscription</p>
          </div>

          <Button
            onClick={() => setModalOpen(true)}
            className="w-full bg-gold text-black hover:bg-gold/90 font-semibold h-11"
          >
            Submit payment
          </Button>
        </div>
      )}

      {/* Contact support (for suspended accounts) */}
      {salon?.subscription_status === 'suspended' && (
        <div className="bg-secondary/30 p-4 border border-border rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Account suspended</p>
            <p className="text-xs text-muted-foreground">Contact us on WhatsApp to reactivate</p>
          </div>
          {bank.supportWhatsapp && (
            <a
              href={`https://wa.me/${bank.supportWhatsapp}?text=${encodeURIComponent(`Hi, my iCut account "${salon?.name ?? ''}" has been suspended. Please help.`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold bg-gold text-black px-4 py-2 rounded-md hover:bg-gold/90 transition-all shrink-0 text-center"
            >
              Contact Support
            </a>
          )}
        </div>
      )}

      {selectedPlanObj && (
        <PaymentSubmitModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          plan={{
            key: selectedPlanObj.key as 'basic' | 'growth' | 'pro',
            name: selectedPlanObj.name,
            price: selectedPlanObj.price,
            branches: selectedPlanObj.branches,
            staff: selectedPlanObj.staff,
            features: selectedPlanObj.features,
          }}
          onSubmitted={() => { /* page reloads on next render via existing flow */ }}
        />
      )}
    </div>
  );
}


