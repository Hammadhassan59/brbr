'use client';

import { useState, useEffect } from 'react';
import { Mail, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import toast from 'react-hot-toast';
import { getPlatformSettings, savePlatformSetting } from '@/app/actions/admin-settings';
import { sendTestEmail } from '@/lib/email-sender';

interface PlanSettings {
  price: string;
  branches: string;
  staff: string;
  displayName: string;
  originalPrice: string;
  pitch: string;
  limits: string;
  popular: boolean;
  features: string; // one feature per line; prefix "~ " means crossed-out
}

interface PlatformSettings {
  platformName: string;
  platformDomain: string;
  supportWhatsApp: string;
  supportEmail: string;
  resendKey: string;
  fromEmail: string;
  fromName: string;
  emailEnabled: boolean;
  enabledTemplates: Record<string, boolean>;
  plans: Record<string, PlanSettings>;
  trialDuration: string;
  gracePeriod: string;
  requirePaymentOnSignup: boolean;
  jazzcashAccount: string;
  bankAccount: string;
  bankName: string;
  accountTitle: string;
}

const DEFAULT_SETTINGS: PlatformSettings = {
  platformName: 'iCut',
  platformDomain: 'icut.pk',
  supportWhatsApp: '', // Set your real WhatsApp number here
  supportEmail: 'support@icut.pk',
  resendKey: '',
  fromEmail: 'notifications@icut.pk',
  fromName: 'iCut',
  emailEnabled: false,
  enabledTemplates: {},
  plans: {
    Basic: {
      price: '2500', branches: '1', staff: '3',
      displayName: 'Starter', originalPrice: '5000', pitch: 'For new and small salons',
      limits: '1 branch · up to 10 staff', popular: false,
      features: [
        'POS + billing',
        'Bookings + walk-in queue',
        'Cash, mobile, card payments',
        'Basic daily report',
        'Commission tracking',
        '~ Inventory',
        '~ Payroll',
      ].join('\n'),
    },
    Growth: {
      price: '5000', branches: '1', staff: 'Unlimited',
      displayName: 'Business', originalPrice: '12000', pitch: 'For growing salons and small chains',
      limits: '3 branches · 10 staff each', popular: true,
      features: [
        'POS + billing',
        'Bookings + walk-in queue',
        'Cash, mobile, card payments',
        'Full daily reports',
        'Commission tracking',
        'Inventory',
        'Payroll + attendance',
      ].join('\n'),
    },
    Pro: {
      price: '9000', branches: '3', staff: 'Unlimited',
      displayName: 'Enterprise', originalPrice: '20000', pitch: 'For salon chains',
      limits: '10 branches · 100 staff', popular: false,
      features: [
        'Everything in Business',
        'Cross-branch reports',
        'Partner/co-owner logins',
        'Priority support',
      ].join('\n'),
    },
  },
  trialDuration: '0',
  gracePeriod: '0',
  requirePaymentOnSignup: true,
  jazzcashAccount: '',
  bankAccount: '',
  bankName: '',
  accountTitle: '',
};

export default function AdminSettingsPage() {
  const [showApiKey, setShowApiKey] = useState(false);
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    getPlatformSettings()
      .then((db) => {
        const g = (db.general ?? {}) as Record<string, unknown>;
        const e = (db.email ?? {}) as Record<string, unknown>;
        const pl = (db.plans ?? {}) as Record<string, unknown>;
        const tr = (db.trial ?? {}) as Record<string, unknown>;
        const py = (db.payment ?? {}) as Record<string, unknown>;

        interface DbPlan {
          price?: number;
          branches?: number;
          staff?: number;
          displayName?: string;
          originalPrice?: number;
          pitch?: string;
          limits?: string;
          popular?: boolean;
          features?: Array<{ text?: string; ok?: boolean } | string>;
        }
        const dbPlans = pl as Record<string, DbPlan>;
        const featuresToText = (feats: DbPlan['features'] | undefined, fallback: string): string => {
          if (!feats || !Array.isArray(feats) || feats.length === 0) return fallback;
          return feats
            .map((f) => {
              if (typeof f === 'string') return f;
              if (f && typeof f === 'object') {
                const txt = String(f.text ?? '').trim();
                if (!txt) return '';
                return f.ok === false ? `~ ${txt}` : txt;
              }
              return '';
            })
            .filter(Boolean)
            .join('\n');
        };
        const hydratePlan = (key: 'basic' | 'growth' | 'pro', adminKey: 'Basic' | 'Growth' | 'Pro'): PlanSettings => {
          const db = dbPlans[key] ?? {};
          const fallback = DEFAULT_SETTINGS.plans[adminKey];
          return {
            price: String(db.price ?? fallback.price),
            branches: String(db.branches ?? fallback.branches),
            staff: db.staff === 0 ? 'Unlimited' : String(db.staff ?? fallback.staff),
            displayName: typeof db.displayName === 'string' && db.displayName ? db.displayName : fallback.displayName,
            originalPrice: String(db.originalPrice ?? fallback.originalPrice),
            pitch: typeof db.pitch === 'string' && db.pitch ? db.pitch : fallback.pitch,
            limits: typeof db.limits === 'string' && db.limits ? db.limits : fallback.limits,
            popular: typeof db.popular === 'boolean' ? db.popular : fallback.popular,
            features: featuresToText(db.features, fallback.features),
          };
        };
        const plans: Record<string, PlanSettings> = {
          Basic: hydratePlan('basic', 'Basic'),
          Growth: hydratePlan('growth', 'Growth'),
          Pro: hydratePlan('pro', 'Pro'),
        };

        setSettings({
          platformName: String(g.platformName ?? DEFAULT_SETTINGS.platformName),
          platformDomain: String(g.platformDomain ?? DEFAULT_SETTINGS.platformDomain),
          supportWhatsApp: String(g.supportWhatsApp ?? DEFAULT_SETTINGS.supportWhatsApp),
          supportEmail: String(g.supportEmail ?? DEFAULT_SETTINGS.supportEmail),
          emailEnabled: Boolean(e.enabled ?? DEFAULT_SETTINGS.emailEnabled),
          fromEmail: String(e.fromEmail ?? DEFAULT_SETTINGS.fromEmail),
          fromName: String(e.fromName ?? DEFAULT_SETTINGS.fromName),
          resendKey: String(e.resendKey ?? DEFAULT_SETTINGS.resendKey),
          enabledTemplates: (e.enabledTemplates as Record<string, boolean>) ?? DEFAULT_SETTINGS.enabledTemplates,
          plans,
          trialDuration: String(tr.durationDays ?? DEFAULT_SETTINGS.trialDuration),
          gracePeriod: String(tr.graceDays ?? DEFAULT_SETTINGS.gracePeriod),
          requirePaymentOnSignup: Boolean(tr.requirePayment ?? DEFAULT_SETTINGS.requirePaymentOnSignup),
          jazzcashAccount: String(py.jazzcashAccount ?? DEFAULT_SETTINGS.jazzcashAccount),
          bankAccount: String(py.bankAccount ?? DEFAULT_SETTINGS.bankAccount),
          bankName: String(py.bankName ?? DEFAULT_SETTINGS.bankName),
          accountTitle: String(py.accountTitle ?? DEFAULT_SETTINGS.accountTitle),
        });
      })
      .catch(() => {
        // fall back to defaults silently
      });
  }, []);

  function update<K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function updatePlan<F extends keyof PlanSettings>(name: string, field: F, value: PlanSettings[F]) {
    setSettings((prev) => ({
      ...prev,
      plans: {
        ...prev.plans,
        [name]: { ...prev.plans[name], [field]: value },
      },
    }));
  }

  function setPopularPlan(name: string) {
    setSettings((prev) => {
      const next: Record<string, PlanSettings> = {};
      for (const [k, v] of Object.entries(prev.plans)) {
        next[k] = { ...v, popular: k === name };
      }
      return { ...prev, plans: next };
    });
  }

  function featuresFromText(text: string): Array<{ text: string; ok: boolean }> {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        if (line.startsWith('~')) return { text: line.slice(1).trim(), ok: false };
        return { text: line, ok: true };
      })
      .filter((f) => f.text.length > 0);
  }

  async function testEmail() {
    if (!settings.resendKey) { toast.error('Enter a Resend API key first'); return; }
    if (!settings.fromEmail) { toast.error('Enter a from email address'); return; }

    const to = window.prompt(
      'Send test email to which address?',
      settings.supportEmail || settings.fromEmail,
    );
    if (!to) return;

    const loadingId = toast.loading(`Sending test to ${to}…`);
    const res = await sendTestEmail({
      to,
      resendKey: settings.resendKey,
      fromEmail: settings.fromEmail,
      fromName: settings.fromName,
    });
    toast.dismiss(loadingId);
    if (res.sent) {
      toast.success(`Test email sent to ${to}`);
    } else {
      toast.error(res.error || 'Send failed');
    }
  }

  async function saveSettings() {
    const toNumber = (v: string, fallback: number) => {
      const n = parseInt(v, 10);
      return isNaN(n) ? fallback : n;
    };
    const staffToNumber = (v: string) => (v === 'Unlimited' ? 0 : toNumber(v, 0));

    try {
      await Promise.all([
        savePlatformSetting('general', {
          platformName: settings.platformName,
          platformDomain: settings.platformDomain,
          supportWhatsApp: settings.supportWhatsApp,
          supportEmail: settings.supportEmail,
        }),
        savePlatformSetting('email', {
          enabled: settings.emailEnabled,
          fromEmail: settings.fromEmail,
          fromName: settings.fromName,
          resendKey: settings.resendKey,
          enabledTemplates: settings.enabledTemplates,
        }),
        savePlatformSetting('plans', {
          basic: {
            price: toNumber(settings.plans.Basic.price, 2500),
            branches: toNumber(settings.plans.Basic.branches, 1),
            staff: staffToNumber(settings.plans.Basic.staff),
            displayName: settings.plans.Basic.displayName,
            originalPrice: toNumber(settings.plans.Basic.originalPrice, 5000),
            pitch: settings.plans.Basic.pitch,
            limits: settings.plans.Basic.limits,
            popular: settings.plans.Basic.popular,
            features: featuresFromText(settings.plans.Basic.features),
          },
          growth: {
            price: toNumber(settings.plans.Growth.price, 5000),
            branches: toNumber(settings.plans.Growth.branches, 1),
            staff: staffToNumber(settings.plans.Growth.staff),
            displayName: settings.plans.Growth.displayName,
            originalPrice: toNumber(settings.plans.Growth.originalPrice, 12000),
            pitch: settings.plans.Growth.pitch,
            limits: settings.plans.Growth.limits,
            popular: settings.plans.Growth.popular,
            features: featuresFromText(settings.plans.Growth.features),
          },
          pro: {
            price: toNumber(settings.plans.Pro.price, 9000),
            branches: toNumber(settings.plans.Pro.branches, 3),
            staff: staffToNumber(settings.plans.Pro.staff),
            displayName: settings.plans.Pro.displayName,
            originalPrice: toNumber(settings.plans.Pro.originalPrice, 20000),
            pitch: settings.plans.Pro.pitch,
            limits: settings.plans.Pro.limits,
            popular: settings.plans.Pro.popular,
            features: featuresFromText(settings.plans.Pro.features),
          },
        }),
        savePlatformSetting('trial', {
          durationDays: toNumber(settings.trialDuration, 14),
          graceDays: toNumber(settings.gracePeriod, 3),
          requirePayment: settings.requirePaymentOnSignup,
        }),
        savePlatformSetting('payment', {
          jazzcashAccount: settings.jazzcashAccount,
          bankAccount: settings.bankAccount,
          bankName: settings.bankName,
          accountTitle: settings.accountTitle,
        }),
      ]);
      toast.success('Platform settings saved to database');
    } catch {
      toast.error('Failed to save settings');
    }
  }

  const tabTrigger = 'text-xs px-3.5 py-2 font-medium transition-all duration-150 border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30';

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="font-heading text-xl font-bold">Platform Settings</h2>
        <Button onClick={saveSettings} className="bg-gold text-black border border-gold w-full sm:w-auto">Save Platform Settings</Button>
      </div>

      <Tabs defaultValue="general">
        <div className="-mx-4 px-4 overflow-x-auto hide-scrollbar lg:mx-0 lg:px-0 lg:overflow-visible">
          <TabsList className="gap-1 h-auto w-max lg:w-auto">
            <TabsTrigger value="general" className={tabTrigger}>General</TabsTrigger>
            <TabsTrigger value="plans" className={tabTrigger}>Subscription Plans</TabsTrigger>
            <TabsTrigger value="payments" className={tabTrigger}>Payments &amp; Trial</TabsTrigger>
            <TabsTrigger value="email" className={tabTrigger}>Email Automation</TabsTrigger>
          </TabsList>
        </div>

        {/* ── General ───────────────────────────────────────────── */}
        <TabsContent value="general" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">General</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Platform-wide identity and the contacts surfaced on public pages.
              </p>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label className="text-xs">Platform Name</Label><Input value={settings.platformName} onChange={(e) => update('platformName', e.target.value)} className="mt-1" /></div>
              <div><Label className="text-xs">Platform Domain</Label><Input value={settings.platformDomain} onChange={(e) => update('platformDomain', e.target.value)} className="mt-1" /></div>
              <div><Label className="text-xs">Support WhatsApp</Label><Input value={settings.supportWhatsApp} onChange={(e) => update('supportWhatsApp', e.target.value)} className="mt-1" /></div>
              <div><Label className="text-xs">Support Email</Label><Input value={settings.supportEmail} onChange={(e) => update('supportEmail', e.target.value)} className="mt-1" /></div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Subscription Plans ────────────────────────────────── */}
        <TabsContent value="plans" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Subscription Plans</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                These values drive the homepage pricing section and the in-app paywall. Marketing copy (display name, pitch, features) only shows on the homepage. Exactly one plan can be marked Most Popular.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(settings.plans).map(([name, plan]) => (
                <div key={name} className="p-3 bg-secondary/50 rounded-lg space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <span className="font-semibold text-sm">{name}</span>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="popularPlan"
                        checked={plan.popular}
                        onChange={() => setPopularPlan(name)}
                      />
                      Most Popular (homepage highlight)
                    </label>
                  </div>

                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-end gap-3">
                    <div><Label className="text-[10px]">Rs/month</Label><Input value={plan.price} onChange={(e) => updatePlan(name, 'price', e.target.value)} className="w-full sm:w-24 h-7 text-xs" /></div>
                    <div><Label className="text-[10px]">Branches</Label><Input value={plan.branches} onChange={(e) => updatePlan(name, 'branches', e.target.value)} className="w-full sm:w-20 h-7 text-xs" /></div>
                    <div><Label className="text-[10px]">Staff</Label><Input value={plan.staff} onChange={(e) => updatePlan(name, 'staff', e.target.value)} className="w-full sm:w-24 h-7 text-xs" /></div>
                    <div><Label className="text-[10px]">Original Rs (strikethrough)</Label><Input value={plan.originalPrice} onChange={(e) => updatePlan(name, 'originalPrice', e.target.value)} className="w-full sm:w-28 h-7 text-xs" /></div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div><Label className="text-[10px]">Display Name (homepage)</Label><Input value={plan.displayName} onChange={(e) => updatePlan(name, 'displayName', e.target.value)} className="h-8 text-xs" /></div>
                    <div><Label className="text-[10px]">Pitch (one line)</Label><Input value={plan.pitch} onChange={(e) => updatePlan(name, 'pitch', e.target.value)} className="h-8 text-xs" /></div>
                    <div><Label className="text-[10px]">Limits line (under price)</Label><Input value={plan.limits} onChange={(e) => updatePlan(name, 'limits', e.target.value)} className="h-8 text-xs" /></div>
                  </div>

                  <div>
                    <Label className="text-[10px]">Features (one per line · prefix with <code>~</code> to cross out)</Label>
                    <textarea
                      value={plan.features}
                      onChange={(e) => updatePlan(name, 'features', e.target.value)}
                      rows={7}
                      className="mt-1 w-full px-2 py-1.5 text-xs border border-border rounded-md bg-background focus:outline-none focus:border-gold font-mono"
                      placeholder={'POS + billing\nBookings\n~ Inventory'}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Payments & Trial ──────────────────────────────────── */}
        <TabsContent value="payments" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Payment Collection</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Bank name</Label><Input value={settings.bankName} onChange={(e) => update('bankName', e.target.value)} className="mt-1" placeholder="e.g. Meezan Bank" /></div>
                  <div><Label className="text-xs">Account title</Label><Input value={settings.accountTitle} onChange={(e) => update('accountTitle', e.target.value)} className="mt-1" placeholder="iCut Technologies" /></div>
                </div>
                <div><Label className="text-xs">Bank account number</Label><Input value={settings.bankAccount} onChange={(e) => update('bankAccount', e.target.value)} className="mt-1" placeholder="02340105566723" /></div>
                <div><Label className="text-xs">JazzCash number</Label><Input value={settings.jazzcashAccount} onChange={(e) => update('jazzcashAccount', e.target.value)} className="mt-1" placeholder="03001234567" /></div>
                <p className="text-[11px] text-muted-foreground">
                  These show up on the public paywall, the tenant&apos;s billing page, and the
                  in-app payment-submit modal. Tenants upload screenshots in-app for super-admin
                  approval — no WhatsApp involved.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Trial Settings</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div><Label className="text-xs">Trial Duration (days)</Label><Input type="number" value={settings.trialDuration} onChange={(e) => update('trialDuration', e.target.value)} className="mt-1 w-full sm:w-24" /></div>
                <div><Label className="text-xs">Grace Period After Trial (days)</Label><Input type="number" value={settings.gracePeriod} onChange={(e) => update('gracePeriod', e.target.value)} className="mt-1 w-full sm:w-24" /></div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div><p className="text-sm font-medium">Require Payment on Signup</p><p className="text-xs text-muted-foreground">If off, users start trial without payment</p></div>
                  <Switch checked={settings.requirePaymentOnSignup} onCheckedChange={(v) => update('requirePaymentOnSignup', v)} />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Email Automation ──────────────────────────────────── */}
        <TabsContent value="email" className="mt-4">
          <Card className="border-blue-500/25">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2"><Mail className="w-4 h-4 text-blue-600" /> Email Automation (Resend)</CardTitle>
                <Switch checked={settings.emailEnabled} onCheckedChange={(v) => update('emailEnabled', v)} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Powers owner-facing emails: signup verification, password reset, plan renewal reminders, and payment status alerts.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <Label className="text-xs">Resend API Key</Label>
                  <div className="relative mt-1">
                    <Input
                      type={showApiKey ? 'text' : 'password'}
                      value={settings.resendKey}
                      onChange={(e) => update('resendKey', e.target.value)}
                      placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxx"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs">From Email</Label>
                    <Input value={settings.fromEmail} onChange={(e) => update('fromEmail', e.target.value)} placeholder="notifications@icut.pk" className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">From Name</Label>
                    <Input value={settings.fromName} onChange={(e) => update('fromName', e.target.value)} placeholder="iCut" className="mt-1" />
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Owner Emails</p>
                <ul className="grid grid-cols-1 lg:grid-cols-2 gap-2 text-sm">
                  <li className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                    <div>
                      <p className="font-medium">Signup verification</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Sent by Supabase Auth when a new owner signs up</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">Supabase</Badge>
                  </li>
                  <li className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                    <div>
                      <p className="font-medium">Password reset</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Sent by Supabase Auth on forgot-password request</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">Supabase</Badge>
                  </li>
                  <li className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                    <div>
                      <p className="font-medium">Plan renewal reminder</p>
                      <p className="text-xs text-muted-foreground mt-0.5">T-7, T-3, and on expiry — daily cron</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">Cron</Badge>
                  </li>
                  <li className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                    <div>
                      <p className="font-medium">Payment approved / denied</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Sent when super admin acts on a payment request</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">Event</Badge>
                  </li>
                </ul>
                <p className="text-xs text-muted-foreground mt-2">All emails go only to the salon owner. No client-facing automation.</p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={testEmail} disabled={!settings.emailEnabled} className="text-xs gap-1">
                  <Mail className="w-3 h-3" /> Send Test Email
                </Button>
                <p className="text-xs text-muted-foreground">Sends a test email to the support inbox</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
