'use client';

import { useState } from 'react';
import { Mail, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DEFAULT_EMAIL_TEMPLATES } from '@/lib/email-templates';
import toast from 'react-hot-toast';

export default function AdminSettingsPage() {
  const [showApiKey, setShowApiKey] = useState(false);
  const [sendgridKey, setSendgridKey] = useState('');
  const [fromEmail, setFromEmail] = useState('notifications@brbr.pk');
  const [fromName, setFromName] = useState('BrBr');
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [enabledTemplates, setEnabledTemplates] = useState<Record<string, boolean>>({
    winback: true,
    udhaar_reminder: true,
    low_stock_alert: true,
    daily_summary: true,
  });

  function toggleTemplate(id: string) {
    setEnabledTemplates((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function testEmail() {
    if (!sendgridKey) { toast.error('Enter a SendGrid API key first'); return; }
    if (!fromEmail) { toast.error('Enter a from email address'); return; }
    toast.success('Test email sent to support inbox');
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="font-heading text-xl font-bold">Platform Settings</h2>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">General</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div><Label className="text-xs">Platform Name</Label><Input defaultValue="BrBr" className="mt-1" /></div>
          <div><Label className="text-xs">Platform Domain</Label><Input defaultValue="brbr.pk" className="mt-1" /></div>
          <div><Label className="text-xs">Support WhatsApp</Label><Input defaultValue="0300-BRBR-PK" className="mt-1" /></div>
          <div><Label className="text-xs">Support Email</Label><Input defaultValue="support@brbr.pk" className="mt-1" /></div>
        </CardContent>
      </Card>

      {/* ── Email / SendGrid Configuration ── */}
      <Card className="border-blue-500/25">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2"><Mail className="w-4 h-4 text-blue-600" /> Email Automation (SendGrid)</CardTitle>
            <Switch checked={emailEnabled} onCheckedChange={setEmailEnabled} />
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
                value={sendgridKey}
                onChange={(e) => setSendgridKey(e.target.value)}
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
              <Input value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="notifications@brbr.pk" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">From Name</Label>
              <Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="BrBr" className="mt-1" />
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
                      {enabledTemplates[tpl.id] && emailEnabled && (
                        <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-500/25 bg-blue-500/10">Active</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">Subject: {tpl.subject}</p>
                  </div>
                  <Switch
                    checked={enabledTemplates[tpl.id] ?? false}
                    onCheckedChange={() => toggleTemplate(tpl.id)}
                    disabled={!emailEnabled}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={testEmail} disabled={!emailEnabled} className="text-xs gap-1">
              <Mail className="w-3 h-3" /> Send Test Email
            </Button>
            <p className="text-xs text-muted-foreground">Sends a test email to the support inbox</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Subscription Plans</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {[
            { name: 'Basic', price: '2500', branches: '1', staff: '3' },
            { name: 'Growth', price: '5000', branches: '1', staff: 'Unlimited' },
            { name: 'Pro', price: '9000', branches: '3', staff: 'Unlimited' },
          ].map((plan) => (
            <div key={plan.name} className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg">
              <span className="font-medium text-sm w-16">{plan.name}</span>
              <div><Label className="text-[10px]">Rs/month</Label><Input defaultValue={plan.price} className="w-24 h-7 text-xs" /></div>
              <div><Label className="text-[10px]">Branches</Label><Input defaultValue={plan.branches} className="w-20 h-7 text-xs" /></div>
              <div><Label className="text-[10px]">Staff</Label><Input defaultValue={plan.staff} className="w-24 h-7 text-xs" /></div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Trial Settings</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label className="text-xs">Trial Duration (days)</Label><Input type="number" defaultValue="14" className="mt-1 w-24" /></div>
          <div><Label className="text-xs">Grace Period After Trial (days)</Label><Input type="number" defaultValue="3" className="mt-1 w-24" /></div>
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div><p className="text-sm font-medium">Require Payment Method on Signup</p><p className="text-xs text-muted-foreground">If off, users can start trial without payment info</p></div>
            <Switch defaultChecked={false} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Payment Collection</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label className="text-xs">JazzCash Account (for subscription payments)</Label><Input defaultValue="0300-1234567" className="mt-1" /></div>
          <div><Label className="text-xs">Bank Account (HBL)</Label><Input defaultValue="1234-5678-9012" className="mt-1" /></div>
        </CardContent>
      </Card>

      <Button onClick={() => toast.success('Settings saved')} className="bg-gold text-black border border-gold">Save Platform Settings</Button>
    </div>
  );
}
