'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Send, UserPlus, Clock, CreditCard } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import { formatPKR } from '@/lib/utils/currency';
import { formatPKDate } from '@/lib/utils/dates';
import { generateWhatsAppLink } from '@/lib/utils/whatsapp';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import toast from 'react-hot-toast';
import type { Client } from '@/types/database';

export default function ClientReportPage() {
  const { salon } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);

  const fetch = useCallback(async () => {
    if (!salon) return;
    setLoading(true);
    const { data } = await supabase.from('clients').select('*').eq('salon_id', salon.id).order('created_at', { ascending: false });
    if (data) setClients(data as Client[]);
    setLoading(false);
  }, [salon]);

  useEffect(() => { fetch(); }, [fetch]);

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const newClients = clients.filter((c) => c.created_at.startsWith(thisMonth));
  const udhaarClients = clients.filter((c) => c.udhaar_balance > 0).sort((a, b) => b.udhaar_balance - a.udhaar_balance);
  const totalUdhaar = udhaarClients.reduce((s, c) => s + c.udhaar_balance, 0);

  function sendWinback(client: Client) {
    if (!client.phone) return;
    const msg = `We miss you, ${client.name}! 💕 It has been a while since your last visit to ${salon?.name || 'BrBr'}. Come back and get 10% OFF!`;
    window.open(generateWhatsAppLink(client.phone, msg), '_blank');
  }

  function sendUdhaarAll() {
    udhaarClients.forEach((c) => {
      if (!c.phone) return;
      const msg = `Dear ${c.name}, your outstanding balance is ${formatPKR(c.udhaar_balance)}. Please clear it on your next visit. Thank you! — BrBr`;
      window.open(generateWhatsAppLink(c.phone, msg), '_blank');
    });
    toast.success(`Opened ${udhaarClients.filter((c) => c.phone).length} WhatsApp windows`);
  }

  return (
    <div className="space-y-4">
      <Link href="/dashboard/reports" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Back to Reports
      </Link>
      <h2 className="font-heading text-xl font-bold">Client Report</h2>

      <Tabs defaultValue="new">
        <TabsList className="h-auto gap-1 flex-wrap">
          <TabsTrigger value="new" className="text-xs gap-1"><UserPlus className="w-3 h-3" /> New ({newClients.length})</TabsTrigger>
          <TabsTrigger value="udhaar" className="text-xs gap-1"><CreditCard className="w-3 h-3" /> Udhaar ({udhaarClients.length})</TabsTrigger>
        </TabsList>

        {/* New Clients */}
        <TabsContent value="new" className="mt-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">New Clients This Month</CardTitle></CardHeader>
            <CardContent className="px-0">
              {loading ? <div className="h-20 bg-muted rounded animate-pulse mx-4" /> : newClients.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-6">No new clients this month</p>
              ) : (
                <Table><TableHeader><TableRow><TableHead className="pl-4">Name</TableHead><TableHead>Phone</TableHead><TableHead className="text-right pr-4">Joined</TableHead></TableRow></TableHeader>
                  <TableBody>{newClients.map((c) => (
                    <TableRow key={c.id}><TableCell className="pl-4 font-medium text-sm"><Link href={`/dashboard/clients/${c.id}`} className="hover:text-gold">{c.name}</Link></TableCell><TableCell className="text-sm">{c.phone || '—'}</TableCell><TableCell className="text-right pr-4 text-xs">{formatPKDate(c.created_at)}</TableCell></TableRow>
                  ))}</TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Udhaar */}
        <TabsContent value="udhaar" className="mt-4 space-y-4">
          <Card className="border-red-500/20 bg-red-500/10">
            <CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-xs text-red-600">Total Outstanding</p><p className="text-3xl font-heading font-bold text-red-600">{formatPKR(totalUdhaar)}</p></div>
              <Button size="sm" variant="outline" className="text-xs gap-1 border-red-500/25 text-red-600" onClick={sendUdhaarAll}><Send className="w-3 h-3" /> Send All Reminders</Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="px-0">
              {udhaarClients.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-6">No udhaar outstanding</p>
              ) : (
                <Table><TableHeader><TableRow><TableHead className="pl-4">Client</TableHead><TableHead>Phone</TableHead><TableHead className="text-right">Balance</TableHead><TableHead className="text-center pr-4">Action</TableHead></TableRow></TableHeader>
                  <TableBody>{udhaarClients.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="pl-4 font-medium text-sm"><Link href={`/dashboard/clients/${c.id}`} className="hover:text-gold">{c.name}</Link></TableCell>
                      <TableCell className="text-sm">{c.phone || '—'}</TableCell>
                      <TableCell className="text-right text-sm font-bold text-red-600">{formatPKR(c.udhaar_balance)}</TableCell>
                      <TableCell className="text-center pr-4">
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => {
                          if (!c.phone) return;
                          window.open(generateWhatsAppLink(c.phone, `Dear ${c.name}, your outstanding balance is ${formatPKR(c.udhaar_balance)}. Thank you! — BrBr`), '_blank');
                        }}><Send className="w-3 h-3" /> Remind</Button>
                      </TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
