'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ChevronRight, Send, UserPlus, Clock, CreditCard, Copy, Loader2 } from 'lucide-react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import toast from 'react-hot-toast';
import type { Client } from '@/types/database';

export default function ClientReportPage() {
  const { salon } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [showUdhaarDialog, setShowUdhaarDialog] = useState(false);
  const [udhaarSentSet, setUdhaarSentSet] = useState<Set<string>>(new Set());
  const [isBulkSending, setIsBulkSending] = useState(false);
  const [bulkSendIndex, setBulkSendIndex] = useState(0);

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

  function getUdhaarMessage(c: Client): string {
    return `Dear ${c.name}, your outstanding balance is ${formatPKR(c.udhaar_balance)}. Please clear it on your next visit. Thank you! — BrBr`;
  }

  function sendUdhaarAll() {
    setUdhaarSentSet(new Set());
    setIsBulkSending(false);
    setBulkSendIndex(0);
    setShowUdhaarDialog(true);
  }

  function sendUdhaarAllSequentially() {
    const clientsWithPhone = udhaarClients.filter((c) => c.phone);
    if (clientsWithPhone.length === 0) { toast.error('No clients have phone numbers'); return; }

    if (clientsWithPhone.length > 5) {
      const confirmed = window.confirm(
        `This will open ${clientsWithPhone.length} browser tabs one at a time with a 2-second delay between each. Continue?`
      );
      if (!confirmed) return;
    }

    setIsBulkSending(true);
    setBulkSendIndex(0);

    clientsWithPhone.forEach((client, index) => {
      setTimeout(() => {
        window.open(generateWhatsAppLink(client.phone!, getUdhaarMessage(client)), '_blank');
        setUdhaarSentSet((prev) => new Set([...prev, client.id]));
        setBulkSendIndex(index + 1);
        if (index === clientsWithPhone.length - 1) {
          setIsBulkSending(false);
          toast.success(`Opened ${clientsWithPhone.length} WhatsApp windows`);
        }
      }, index * 2000);
    });
  }

  function copyAllUdhaarMessages() {
    const clientsWithPhone = udhaarClients.filter((c) => c.phone);
    if (clientsWithPhone.length === 0) { toast.error('No clients have phone numbers'); return; }

    const allMessages = clientsWithPhone.map((c) => {
      return `--- ${c.name} (${c.phone}) — ${formatPKR(c.udhaar_balance)} ---\n${getUdhaarMessage(c)}`;
    }).join('\n\n');

    navigator.clipboard.writeText(allMessages).then(() => {
      toast.success(`Copied messages for ${clientsWithPhone.length} clients`);
    }).catch(() => {
      toast.error('Failed to copy to clipboard');
    });
  }

  function sendSingleUdhaar(c: Client) {
    if (!c.phone) return;
    window.open(generateWhatsAppLink(c.phone, getUdhaarMessage(c)), '_blank');
    setUdhaarSentSet((prev) => new Set([...prev, c.id]));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/dashboard/reports" className="hover:text-foreground">Reports</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-foreground font-medium">Clients</span>
      </div>

      <div className="calendar-card bg-card border border-border shadow-sm p-4">
        <h2 className="font-heading text-xl font-bold">Client Report</h2>
      </div>

      <Tabs defaultValue="new">
        <TabsList className="h-auto gap-1 flex-wrap">
          <TabsTrigger value="new" className="calendar-card text-xs gap-1 bg-secondary/50 border border-border text-muted-foreground data-[state=active]:bg-gold data-[state=active]:text-black data-[state=active]:shadow-sm"><UserPlus className="w-3 h-3" /> New ({newClients.length})</TabsTrigger>
          <TabsTrigger value="udhaar" className="calendar-card text-xs gap-1 bg-secondary/50 border border-border text-muted-foreground data-[state=active]:bg-gold data-[state=active]:text-black data-[state=active]:shadow-sm"><CreditCard className="w-3 h-3" /> Udhaar ({udhaarClients.length})</TabsTrigger>
        </TabsList>

        {/* New Clients */}
        <TabsContent value="new" className="mt-4">
          <Card className="calendar-card shadow-sm border-border">
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
          <Card className="calendar-card shadow-sm border-border border-red-500/20 bg-red-500/10">
            <CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-xs text-muted-foreground uppercase tracking-wider text-red-600">Total Outstanding</p><p className="text-3xl font-heading font-bold text-red-600">{formatPKR(totalUdhaar)}</p></div>
              <Button size="sm" variant="outline" className="text-xs gap-1 border-red-500/25 text-red-600" onClick={sendUdhaarAll}><Send className="w-3 h-3" /> Send All Reminders</Button>
            </CardContent>
          </Card>

          <Card className="calendar-card shadow-sm border-border">
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
                          window.open(generateWhatsAppLink(c.phone, getUdhaarMessage(c)), '_blank');
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

      {/* Udhaar Reminder Dialog */}
      <Dialog open={showUdhaarDialog} onOpenChange={(open) => { if (!isBulkSending) setShowUdhaarDialog(open); }}>
        <DialogContent className="max-w-md max-h-[85vh]">
          <DialogHeader><DialogTitle>Send Udhaar Reminders</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Send individually, send all with delays, or copy all messages for WhatsApp Web broadcast.</p>
          <p className="text-sm font-medium">{udhaarSentSet.size}/{udhaarClients.length} sent</p>

          {/* Bulk action buttons */}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="text-xs gap-1 flex-1" onClick={copyAllUdhaarMessages} disabled={isBulkSending}>
              <Copy className="w-3 h-3" /> Copy All Messages
            </Button>
            <Button size="sm" className="text-xs gap-1 flex-1 bg-gold text-black border border-gold" onClick={sendUdhaarAllSequentially} disabled={isBulkSending}>
              {isBulkSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              {isBulkSending ? `Sending ${bulkSendIndex}/${udhaarClients.filter((c) => c.phone).length}...` : 'Send All (2s delay)'}
            </Button>
          </div>

          {/* Progress bar during bulk send */}
          {isBulkSending && (
            <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
              <div
                className="bg-gold h-2 rounded-full transition-all duration-300"
                style={{ width: `${(bulkSendIndex / Math.max(udhaarClients.filter((c) => c.phone).length, 1)) * 100}%` }}
              />
            </div>
          )}

          <ScrollArea className="h-[400px]">
            <div className="space-y-1.5">
              {udhaarClients.map((c) => {
                const isSent = udhaarSentSet.has(c.id);
                return (
                  <div key={c.id} className={`flex items-center gap-2 p-2 rounded-lg text-sm ${isSent ? 'bg-green-500/10' : 'bg-secondary/50'}`}>
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium truncate ${isSent ? 'line-through text-muted-foreground' : ''}`}>{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.phone || 'No phone'} — <span className="text-red-600 font-bold">{formatPKR(c.udhaar_balance)}</span></p>
                    </div>
                    {isSent ? (
                      <Badge variant="outline" className="text-[10px] text-green-600 border-green-500/25">Sent</Badge>
                    ) : (
                      <Button size="sm" variant="outline" className="text-xs gap-1 shrink-0" onClick={() => sendSingleUdhaar(c)} disabled={!c.phone || isBulkSending}>
                        <Send className="w-3 h-3" /> Send
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
