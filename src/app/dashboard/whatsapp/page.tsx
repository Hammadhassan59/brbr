'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { MessageCircle, Send, FileText, Zap, Megaphone, Settings, CalendarClock, CreditCard } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import { generateWhatsAppLink, encodeMessage } from '@/lib/utils/whatsapp';
import { formatPKR } from '@/lib/utils/currency';
import { getTodayPKT } from '@/lib/utils/dates';
import { DEFAULT_TEMPLATES } from '@/lib/whatsapp-templates';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import toast from 'react-hot-toast';
import type { Client, Appointment } from '@/types/database';

export default function WhatsAppPage() {
  const { salon, currentBranch } = useAppStore();
  const [todayReminders, setTodayReminders] = useState<(Appointment & { client?: Client })[]>([]);
  const [udhaarClients, setUdhaarClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!salon || !currentBranch) return;
    setLoading(true);
    const today = getTodayPKT();
    const [aptRes, udhRes] = await Promise.all([
      supabase.from('appointments').select('*, client:clients(*)').eq('branch_id', currentBranch.id).eq('appointment_date', today).eq('reminder_sent', false).in('status', ['booked', 'confirmed']),
      supabase.from('clients').select('*').eq('salon_id', salon.id).gt('udhaar_balance', 0).order('udhaar_balance', { ascending: false }),
    ]);
    if (aptRes.data) setTodayReminders(aptRes.data as (Appointment & { client?: Client })[]);
    if (udhRes.data) setUdhaarClients(udhRes.data as Client[]);
    setLoading(false);
  }, [salon, currentBranch]);

  useEffect(() => { fetch(); }, [fetch]);

  function sendReminder(apt: Appointment & { client?: Client }) {
    if (!apt.client?.phone) { toast.error('No phone number'); return; }
    const tpl = DEFAULT_TEMPLATES.find((t) => t.id === 'appointment_reminder')!;
    const msg = encodeMessage(tpl.bodyEn, {
      client_name: apt.client.name,
      time: apt.start_time,
      stylist_name: '',
      salon_name: salon?.name || 'BrBr',
    });
    window.open(generateWhatsAppLink(apt.client.phone, msg), '_blank');
    supabase.from('appointments').update({ reminder_sent: true }).eq('id', apt.id).then(({ error }: { error: unknown }) => {
      if (error) toast.error('Failed to mark reminder as sent');
    });
    toast.success('Reminder opened');
  }

  function sendUdhaarReminder(client: Client) {
    if (!client.phone) return;
    const tpl = DEFAULT_TEMPLATES.find((t) => t.id === 'udhaar_reminder')!;
    const msg = encodeMessage(tpl.bodyEn, {
      client_name: client.name,
      salon_name: salon?.name || 'BrBr',
      udhaar_amount: String(client.udhaar_balance),
    });
    window.open(generateWhatsAppLink(client.phone, msg), '_blank');
  }

  return (
    <div className="space-y-4">
      {/* Status */}
      <Card className="border-amber-500/20 bg-amber-500/10">
        <CardContent className="p-4 flex items-center gap-3">
          <MessageCircle className="w-6 h-6 text-amber-600" />
          <div className="flex-1">
            <p className="font-medium text-amber-600">Free Mode — Manual Sending</p>
            <p className="text-xs text-amber-600">WhatsApp links open wa.me — you tap Send on your phone. Upgrade for auto-send.</p>
          </div>
          <Badge variant="outline" className="text-amber-600 border-amber-500/25">Free</Badge>
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Appointment Reminders', count: todayReminders.length, icon: CalendarClock, color: 'text-blue-600' },
          { label: 'Udhaar Reminders', count: udhaarClients.length, icon: CreditCard, color: 'text-orange-600' },
          { label: 'Templates', count: DEFAULT_TEMPLATES.length, icon: FileText, color: 'text-purple-600' },
        ].map((a) => (
          <Card key={a.label}>
            <CardContent className="p-4 text-center">
              <a.icon className={`w-6 h-6 ${a.color} mx-auto mb-1`} />
              <p className="text-2xl font-bold">{loading ? '—' : a.count}</p>
              <p className="text-[10px] text-muted-foreground">{a.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Appointment reminders */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CalendarClock className="w-4 h-4" /> Today&apos;s Reminders</CardTitle></CardHeader>
          <CardContent>
            {loading ? <div className="h-20 bg-muted rounded animate-pulse" /> : todayReminders.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-4">No reminders pending</p>
            ) : (
              <div className="space-y-2">
                {todayReminders.map((apt) => (
                  <div key={apt.id} className="flex items-center gap-2 p-2 bg-secondary/50 rounded-lg text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{apt.client?.name || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">{apt.start_time} · {apt.client?.phone}</p>
                    </div>
                    <Button size="sm" variant="outline" className="text-xs gap-1 shrink-0" onClick={() => sendReminder(apt)} disabled={!apt.client?.phone}>
                      <Send className="w-3 h-3" /> Send
                    </Button>
                  </div>
                ))}
                {todayReminders.length > 3 && (
                  <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => todayReminders.forEach(sendReminder)}>
                    Send All ({todayReminders.length})
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Udhaar reminders */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CreditCard className="w-4 h-4" /> Udhaar Reminders</CardTitle></CardHeader>
          <CardContent>
            {loading ? <div className="h-20 bg-muted rounded animate-pulse" /> : udhaarClients.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-4">No outstanding udhaar</p>
            ) : (
              <div className="space-y-2">
                {udhaarClients.slice(0, 5).map((c) => (
                  <div key={c.id} className="flex items-center gap-2 p-2 bg-secondary/50 rounded-lg text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{c.name}</p>
                      <p className="text-xs text-red-600 font-medium">{formatPKR(c.udhaar_balance)}</p>
                    </div>
                    <Button size="sm" variant="outline" className="text-xs gap-1 shrink-0" onClick={() => sendUdhaarReminder(c)} disabled={!c.phone}>
                      <Send className="w-3 h-3" /> Send
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      {/* Navigation */}
      <div className="flex flex-wrap gap-2 pt-2">
        <Link href="/dashboard/whatsapp/templates"><Button variant="outline" size="sm" className="gap-1"><FileText className="w-3 h-3" /> Templates</Button></Link>
        <Link href="/dashboard/whatsapp/automation"><Button variant="outline" size="sm" className="gap-1"><Zap className="w-3 h-3" /> Automation</Button></Link>
        <Link href="/dashboard/whatsapp/campaigns"><Button variant="outline" size="sm" className="gap-1"><Megaphone className="w-3 h-3" /> Campaigns</Button></Link>
      </div>
    </div>
  );
}
