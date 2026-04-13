'use client';

import { useState, useEffect } from 'react';
import { Mail, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DEFAULT_EMAIL_TEMPLATES } from '@/lib/email-templates';
import toast from 'react-hot-toast';

const STORAGE_KEY = 'icut_platform_settings';

interface PlanSettings {
  price: string;
  branches: string;
  staff: string;
}

interface PlatformSettings {
  platformName: string;
  platformDomain: string;
  supportWhatsApp: string;
  supportEmail: string;
  sendgridKey: string;
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
}

const DEFAULT_SETTINGS: PlatformSettings = {
  platformName: 'iCut',
  platformDomain: 'icut.pk',
  supportWhatsApp: '', // Set your real WhatsApp number here
  supportEmail: 'support@icut.pk',
  sendgridKey: '',
  fromEmail: 'notifications@icut.pk',
  fromName: 'iCut',
  emailEnabled: false,
  enabledTemplates: {
    winback: true,
    udhaar_reminder: true,
    low_stock_alert: true,
    daily_summary: true,
  },
  plans: {
    Basic: { price: '2500', branches: '1', staff: '3' },
    Growth: { price: '5000', branches: '1', staff: 'Unlimited' },
    Pro: { price: '9000', branches: '3', staff: 'Unlimited' },
  },
  trialDuration: '14',
  gracePeriod: '3',
  requirePaymentOnSignup: false,
  jazzcashAccount: '',
  bankAccount: '',
};

export default function AdminSettingsPage() {
  const [showApiKey, setShowApiKey] = useState(false);
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<PlatformSettings>;
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      }
    } catch {
      // ignore parse errors, use defaults
    }
  }, []);

  function update<K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function updatePlan(name: string, field: keyof PlanSettings, value: string) {
    setSettings((prev) => ({
      ...prev,
      plans: {
        ...prev.plans,
        [name]: { ...prev.plans[name], [field]: value },
      },
    }));
  }

  function toggleTemplate(id: string) {
    setSettings((prev) => ({
      ...prev,
      enabledTemplates: { ...prev.enabledTemplates, [id]: !prev.enabledTemplates[id] },
    }));
  }

  function testEmail() {
    if (!settings.sendgridKey) { toast.error('Enter a SendGrid API key first'); return; }
    if (!settings.fromEmail) { toast.error('Enter a from email address'); return; }
    toast.error('Email sending not yet connected to backend');
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      toast.success('Platform settings saved');
    } catch {
      toast.error('Failed to save settings');
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="font-heading text-xl font-bold">Platform Settings</h2>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">General</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div><Label className="text-xs">Platform Name</Label><Input value={settings.platformName} onChange={(e) => update('platformName', e.target.value)} className="mt-1" /></div>
          <div><Label className="text-xs">Platform Domain</Label><Input value={settings.platformDomain} onChange={(e) => update('platformDomain', e.target.value)} className="mt-1" /></div>
          <div><Label className="text-xs">Support WhatsApp</Label><Input value={settings.supportWhatsApp} onChange={(e) => update('supportWhatsApp', e.target.value)} className="mt-1" /></div>
          <div><Label className="text-xs">Support Email</Label><Input value={settings.supportEmail} onChange={(e) => update('supportEmail', e.target.value)} className="mt-1" /></div>
        </CardContent>
      </Card>

      {/* ── Email / SendGrid Configuration ── */}
      <Card className="border-blue-500/25">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2"><Mail className="w-4 h-4 text-blue-600" /> Email Automation (SendGrid)</CardTitle>
            <Switch checked={settings.emailEnabled} onCheckedChange={(v) => update('emailEnabled', v)} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Sends automated emails for win-back, udhaar reminders, low stock alerts, and daily summaries to salon owners and clients.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs">SendGrid API Key</Label>
            <div className="relative mt-1">
              <Input
                type={showApiKey ? 'text' : 'password'}
                value={settings.sendgridKey}
                onChange={(e) => update('sendgridKey', e.target.value)}
                placeholder="SG.xxxxxxxxxxxxxxxxxxxxxxxx"
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">From Email</Label>
              <Input value={settings.fromEmail} onChange={(e) => update('fromEmail', e.target.value)} placeholder="notifications@icut.pk" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">From Name</Label>
              <Input value={settings.fromName} onChange={(e) => update('fromName', e.target.value)} placeholder="iCut" className="mt-1" />
            </div>
          </div>

          <div className="pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Email Automations</p>
            <div className="space-y-2">
              {DEFAULT_EMAIL_TEMPLATES.map((tpl) => (
                <div key={tpl.id} className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{tpl.name}</p>
                      {settings.enabledTemplates[tpl.id] && settings.emailEnabled && (
                        <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-500/25 bg-blue-500/10">Active</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">Subject: {tpl.subject}</p>
                  </div>
                  <Switch
                    checked={settings.enabledTemplates[tpl.id] ?? false}
                    onCheckedChange={() => toggleTemplate(tpl.id)}
                    disabled={!settings.emailEnabled}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={testEmail} disabled={!settings.emailEnabled} className="text-xs gap-1">
              <Mail className="w-3 h-3" /> Send Test Email
            </Button>
            <p className="text-xs text-muted-foreground">Sends a test email to the support inbox</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Subscription Plans</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(settings.plans).map(([name, plan]) => (
            <div key={name} className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg">
              <span className="font-medium text-sm w-16">{name}</span>
              <div><Label className="text-[10px]">Rs/month</Label><Input value={plan.price} onChange={(e) => updatePlan(name, 'price', e.target.value)} className="w-24 h-7 text-xs" /></div>
              <div><Label className="text-[10px]">Branches</Label><Input value={plan.branches} onChange={(e) => updatePlan(name, 'branches', e.target.value)} className="w-20 h-7 text-xs" /></div>
              <div><Label className="text-[10px]">Staff</Label><Input value={plan.staff} onChange={(e) => updatePlan(name, 'staff', e.target.value)} className="w-24 h-7 text-xs" /></div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Trial Settings</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label className="text-xs">Trial Duration (days)</Label><Input type="number" value={settings.trialDuration} onChange={(e) => update('trialDuration', e.target.value)} className="mt-1 w-24" /></div>
          <div><Label className="text-xs">Grace Period After Trial (days)</Label><Input type="number" value={settings.gracePeriod} onChange={(e) => update('gracePeriod', e.target.value)} className="mt-1 w-24" /></div>
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div><p className="text-sm font-medium">Require Payment Method on Signup</p><p className="text-xs text-muted-foreground">If off, users can start trial without payment info</p></div>
            <Switch checked={settings.requirePaymentOnSignup} onCheckedChange={(v) => update('requirePaymentOnSignup', v)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Payment Collection</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label className="text-xs">JazzCash Account (for subscription payments)</Label><Input value={settings.jazzcashAccount} onChange={(e) => update('jazzcashAccount', e.target.value)} className="mt-1" /></div>
          <div><Label className="text-xs">Bank Account (HBL)</Label><Input value={settings.bankAccount} onChange={(e) => update('bankAccount', e.target.value)} className="mt-1" /></div>
        </CardContent>
      </Card>

      <Button onClick={saveSettings} className="bg-gold text-black border border-gold">Save Platform Settings</Button>
    </div>
  );
}
