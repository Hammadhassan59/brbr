'use client';

import { useState } from 'react';
import { Zap, Clock, Send, Mail, MessageCircle } from 'lucide-react';
import { DEFAULT_TEMPLATES } from '@/lib/whatsapp-templates';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';

interface AutomationRule {
  id: string;
  name: string;
  trigger: string;
  timing: string;
  templateId: string;
  enabled: boolean;
  channels: ('whatsapp' | 'email')[];
}

const INITIAL_RULES: AutomationRule[] = [
  { id: '1', name: 'Appointment Confirmation', trigger: 'On booking saved', timing: 'Immediate', templateId: 'appointment_confirmation', enabled: true, channels: ['whatsapp'] },
  { id: '2', name: 'Appointment Reminder', trigger: 'Before appointment', timing: '60 min before', templateId: 'appointment_reminder', enabled: true, channels: ['whatsapp'] },
  { id: '3', name: 'Payment Receipt', trigger: 'On bill paid', timing: 'Immediate', templateId: 'payment_receipt', enabled: true, channels: ['whatsapp'] },
  { id: '5', name: 'Win-Back Message', trigger: 'No visit in 30 days', timing: '30 days', templateId: 'winback', enabled: false, channels: ['whatsapp', 'email'] },
  { id: '6', name: 'Udhaar Reminder', trigger: 'Outstanding udhaar > 7 days', timing: 'Every 7 days', templateId: 'udhaar_reminder', enabled: false, channels: ['whatsapp', 'email'] },
  { id: '7', name: 'Low Stock Alert', trigger: 'Product below threshold', timing: 'Immediate', templateId: 'low_stock_alert', enabled: true, channels: ['whatsapp', 'email'] },
  { id: '8', name: 'Daily Summary', trigger: 'End of day', timing: '10:00 PM', templateId: 'daily_summary', enabled: true, channels: ['whatsapp', 'email'] },
];

const STORAGE_KEY = 'brbr_automation_rules';

function loadSavedRules(): AutomationRule[] {
  if (typeof window === 'undefined') return INITIAL_RULES;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Record<string, boolean>;
      return INITIAL_RULES.map((rule) => ({
        ...rule,
        enabled: parsed[rule.id] !== undefined ? parsed[rule.id] : rule.enabled,
      }));
    }
  } catch { /* ignore */ }
  return INITIAL_RULES;
}

function saveRules(rules: AutomationRule[]) {
  try {
    const enabledMap: Record<string, boolean> = {};
    rules.forEach((r) => { enabledMap[r.id] = r.enabled; });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(enabledMap));
  } catch { /* ignore */ }
}

export default function AutomationPage() {
  const [rules, setRules] = useState<AutomationRule[]>(loadSavedRules);

  function toggleRule(id: string) {
    setRules((prev) => {
      const updated = prev.map((r) => r.id === id ? { ...r, enabled: !r.enabled } : r);
      saveRules(updated);
      const rule = updated.find((r) => r.id === id);
      toast.success(`${rule?.name} ${rule?.enabled ? 'enabled' : 'disabled'} — automation settings updated`);
      return updated;
    });
  }

  function testRule(rule: AutomationRule) {
    const tpl = DEFAULT_TEMPLATES.find((t) => t.id === rule.templateId);
    if (tpl) {
      toast.success(`Test: "${rule.name}" — template ready`);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Zap className="w-5 h-5 text-gold" />
        <h2 className="font-heading text-xl font-bold">Automation Rules</h2>
      </div>

      <p className="text-sm text-muted-foreground">
        In Free Mode, WhatsApp automations generate links for manual sending.
        Email automations (SendGrid) are configured by the platform admin.
      </p>

      <div className="rounded-lg border border-gold/20 bg-gold/5 p-3 text-xs text-muted-foreground">
        Automations will run when WhatsApp Business API is connected. Toggle rules on/off to configure your preferences now.
      </div>

      <div className="space-y-2">
        {rules.map((rule) => {
          const tpl = DEFAULT_TEMPLATES.find((t) => t.id === rule.templateId);
          return (
            <Card key={rule.id}>
              <CardContent className="p-4 flex items-center gap-4">
                <Switch checked={rule.enabled} onCheckedChange={() => toggleRule(rule.id)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{rule.name}</p>
                    {rule.enabled && <Badge variant="outline" className="text-[10px] text-green-600 border-green-500/25 bg-green-500/10">Active</Badge>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> {rule.trigger}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {rule.timing}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {rule.channels.map((ch) => (
                      <Badge key={ch} variant="secondary" className="text-[10px] gap-0.5 py-0">
                        {ch === 'whatsapp' ? <MessageCircle className="w-2.5 h-2.5" /> : <Mail className="w-2.5 h-2.5" />}
                        {ch === 'whatsapp' ? 'WhatsApp' : 'Email'}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant="secondary" className="text-[10px]">{tpl?.name || rule.templateId}</Badge>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => testRule(rule)}>
                    <Send className="w-3 h-3" /> Test
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
