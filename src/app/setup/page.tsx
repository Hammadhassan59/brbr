'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Scissors, ChevronRight, ChevronLeft, Check, Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/components/providers/language-provider';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { isValidPKPhone } from '@/lib/utils/phone';
import type { SalonType, StaffRole } from '@/types/database';

const CITIES = ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Other'];
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
  pin: string;
  confirmPin: string;
}

interface StaffEntry {
  name: string;
  role: StaffRole;
  phone: string;
  pin: string;
  confirmPin: string;
}

interface DaySchedule {
  open: string;
  close: string;
  off: boolean;
}

export default function SetupPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { salon, setSalon, setCurrentBranch } = useAppStore();

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

  // Step 3 — Ownership
  const [ownershipType, setOwnershipType] = useState<'single' | 'multiple'>('single');
  const [partners, setPartners] = useState<PartnerEntry[]>([
    { name: '', email: '', phone: '', pin: '', confirmPin: '' },
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
    { name: '', role: 'junior_stylist', phone: '', pin: '', confirmPin: '' },
  ]);

  // Derived
  const selectedServices = services.filter((s) => s.selected);
  const validStaff = staffList.filter((s) => s.name && s.pin.length === 4 && s.pin === s.confirmPin);
  const validPartners = partners.filter((p) => p.name && p.phone && p.pin.length === 4 && p.pin === p.confirmPin);

  function addPartnerRow() {
    setPartners([...partners, { name: '', email: '', phone: '', pin: '', confirmPin: '' }]);
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
    setStaffList([...staffList, { name: '', role: 'junior_stylist', phone: '', pin: '', confirmPin: '' }]);
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
    if (step === 2 && phone && !isValidPKPhone(phone)) { toast.error('Invalid phone format — expected 03XX-XXXXXXX'); return; }
    if (step === 3 && ownershipType === 'multiple' && validPartners.length === 0) { toast.error('Add at least one partner with name, phone, and PIN'); return; }
    if (step === 4) {
      const invalidDay = DAYS.find(d => !hours[d].off && hours[d].close <= hours[d].open);
      if (invalidDay) {
        toast.error(`${DAY_LABELS[invalidDay]}: closing time must be after opening time`);
        return;
      }
    }
    if (step === 6 && validStaff.length === 0) { toast.error('Add at least 1 staff member'); return; }
    const nextStep = step + 1;
    setStep(nextStep);
    if (nextStep === 5) initServices();
  }

  async function handleFinish() {
    setLoading(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      const slug = salonName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      // Create salon
      const { data: newSalon, error: salonErr } = await supabase
        .from('salons')
        .upsert({
          ...(salon?.id ? { id: salon.id } : {}),
          name: salonName,
          slug,
          type: salonType,
          city,
          address,
          phone,
          whatsapp: sameAsPhone ? phone : whatsapp,
          owner_id: user?.id,
          setup_complete: true,
          prayer_block_enabled: prayerBlocks,
        })
        .select()
        .single();
      if (salonErr) throw salonErr;

      // Create main branch
      const workingHours: Record<string, unknown> = {};
      DAYS.forEach((d) => {
        workingHours[d] = {
          open: hours[d].open,
          close: hours[d].close,
          off: hours[d].off,
          ...(d === 'fri' ? { jummah_break: jummahBreak } : {}),
        };
      });

      const { data: branch, error: branchErr } = await supabase
        .from('branches')
        .insert({
          salon_id: newSalon.id,
          name: `${city || 'Main'} Branch`,
          address,
          phone,
          is_main: true,
          working_hours: workingHours,
        })
        .select()
        .single();
      if (branchErr) throw branchErr;

      // Create services
      if (selectedServices.length > 0) {
        const { error: svcErr } = await supabase.from('services').insert(
          selectedServices.map((s, i) => ({
            salon_id: newSalon.id,
            name: s.name,
            category: s.category,
            base_price: s.price,
            duration_minutes: s.duration,
            sort_order: i,
          }))
        );
        if (svcErr) throw svcErr;
      }

      // Create partners (if multiple ownership)
      if (ownershipType === 'multiple' && validPartners.length > 0) {
        const { error: partnerErr } = await supabase.from('salon_partners').insert(
          validPartners.map((p) => ({
            salon_id: newSalon.id,
            name: p.name,
            phone: p.phone,
            pin_code: p.pin,
          }))
        );
        if (partnerErr) throw partnerErr;
      }

      // Create staff
      if (validStaff.length > 0) {
        const { error: staffErr } = await supabase.from('staff').insert(
          validStaff.map((s) => ({
            salon_id: newSalon.id,
            branch_id: branch.id,
            name: s.name,
            phone: s.phone,
            role: s.role,
            pin_code: s.pin,
          }))
        );
        if (staffErr) throw staffErr;
      }

      setSalon(newSalon);
      setCurrentBranch(branch);
      toast.success('Salon setup complete!');
      router.push('/dashboard');
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
            <span className="font-heading font-bold text-lg">BrBr</span>
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
                    <div className="text-2xl mb-1">
                      {type === 'gents' ? '✂️' : type === 'ladies' ? '💄' : '🌟'}
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('phone')}</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03XX-XXXXXXX" className="mt-1.5" />
              </div>
              <div>
                <Label>{t('whatsapp')}</Label>
                <div className="flex items-center gap-2 mt-1.5">
                  {sameAsPhone ? (
                    <Input value={phone} disabled className="flex-1" />
                  ) : (
                    <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="03XX-XXXXXXX" className="flex-1" />
                  )}
                </div>
                <label className="flex items-center gap-2 mt-2 text-sm text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={sameAsPhone} onChange={(e) => setSameAsPhone(e.target.checked)} className="rounded" />
                  {t('sameAsPhone')}
                </label>
              </div>
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
                        <Label>Email</Label>
                        <Input type="email" value={partner.email} onChange={(e) => updatePartner(i, 'email', e.target.value)} placeholder="partner@email.com" className="mt-1" />
                      </div>
                    </div>
                    <div>
                      <Label>Phone Number *</Label>
                      <Input value={partner.phone} onChange={(e) => updatePartner(i, 'phone', e.target.value)} placeholder="03XX-XXXXXXX" className="mt-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Set 4-digit PIN *</Label>
                        <Input type="password" maxLength={4} inputMode="numeric" value={partner.pin} onChange={(e) => updatePartner(i, 'pin', e.target.value.replace(/\D/g, ''))} className="mt-1 text-center tracking-widest" />
                      </div>
                      <div>
                        <Label>Confirm PIN *</Label>
                        <Input type="password" maxLength={4} inputMode="numeric" value={partner.confirmPin} onChange={(e) => updatePartner(i, 'confirmPin', e.target.value.replace(/\D/g, ''))} className="mt-1 text-center tracking-widest" />
                        {partner.pin && partner.confirmPin && partner.pin !== partner.confirmPin && (
                          <p className="text-xs text-destructive mt-1">PINs don&apos;t match</p>
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
                  <Label>{t('staffPhone')}</Label>
                  <Input value={staff.phone} onChange={(e) => updateStaff(i, 'phone', e.target.value)} placeholder="03XX-XXXXXXX" className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{t('setPin')}</Label>
                    <Input
                      type="password"
                      maxLength={4}
                      inputMode="numeric"
                      value={staff.pin}
                      onChange={(e) => updateStaff(i, 'pin', e.target.value.replace(/\D/g, ''))}
                      className="mt-1 text-center tracking-widest"
                    />
                  </div>
                  <div>
                    <Label>{t('confirmPin')}</Label>
                    <Input
                      type="password"
                      maxLength={4}
                      inputMode="numeric"
                      value={staff.confirmPin}
                      onChange={(e) => updateStaff(i, 'confirmPin', e.target.value.replace(/\D/g, ''))}
                      className="mt-1 text-center tracking-widest"
                    />
                    {staff.pin && staff.confirmPin && staff.pin !== staff.confirmPin && (
                      <p className="text-xs text-destructive mt-1">PINs don&apos;t match</p>
                    )}
                  </div>
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
