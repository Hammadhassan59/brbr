'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Users, Send, ExternalLink, Copy, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/app-store';
import { generateWhatsAppLink, encodeMessage } from '@/lib/utils/whatsapp';
import { DEFAULT_TEMPLATES } from '@/lib/whatsapp-templates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import toast from 'react-hot-toast';
import type { Client } from '@/types/database';

type AudienceFilter = 'all' | 'vip' | 'lapsed_30' | 'lapsed_60' | 'udhaar';

export default function CampaignsPage() {
  const { salon } = useAppStore();
  const [showCreate, setShowCreate] = useState(false);
  const [showSendList, setShowSendList] = useState(false);

  // Campaign form
  const [campaignName, setCampaignName] = useState('');
  const [audience, setAudience] = useState<AudienceFilter>('all');
  const [templateId, setTemplateId] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [sentSet, setSentSet] = useState<Set<string>>(new Set());
  const [isBulkSending, setIsBulkSending] = useState(false);
  const [bulkSendIndex, setBulkSendIndex] = useState(0);

  const fetchAudience = useCallback(async () => {
    if (!salon) return;
    setLoadingClients(true);
    let query = supabase.from('clients').select('*').eq('salon_id', salon.id);

    switch (audience) {
      case 'vip': query = query.eq('is_vip', true); break;
      case 'udhaar': query = query.gt('udhaar_balance', 0); break;
      default: break;
    }

    const { data } = await query.order('name');
    if (data) setFilteredClients(data as Client[]);
    setLoadingClients(false);
  }, [salon, audience]);

  useEffect(() => { if (showCreate) fetchAudience(); }, [showCreate, fetchAudience]);

  function getMessage(client: Client): string {
    if (customMessage) {
      return encodeMessage(customMessage, {
        client_name: client.name,
        salon_name: salon?.name || 'BrBr',
        booking_link: `https://brbr.pk/book/${salon?.slug || ''}`,
        udhaar_amount: String(client.udhaar_balance),
      });
    }
    if (templateId) {
      const tpl = DEFAULT_TEMPLATES.find((t) => t.id === templateId);
      if (tpl) {
        return encodeMessage(tpl.bodyEn, {
          client_name: client.name,
          salon_name: salon?.name || 'BrBr',
          booking_link: `https://brbr.pk/book/${salon?.slug || ''}`,
          udhaar_amount: String(client.udhaar_balance),
        });
      }
    }
    return `Hi ${client.name}!`;
  }

  function openWhatsApp(client: Client) {
    if (!client.phone) { toast.error('No phone number'); return; }
    const msg = getMessage(client);
    window.open(generateWhatsAppLink(client.phone, msg), '_blank');
    setSentSet((prev) => new Set([...prev, client.id]));
  }

  function startSending() {
    if (filteredClients.length === 0) { toast.error('No clients in audience'); return; }
    if (!customMessage && !templateId) { toast.error('Select a template or write a message'); return; }
    setSentSet(new Set());
    setIsBulkSending(false);
    setBulkSendIndex(0);
    setShowSendList(true);
  }

  function sendAllSequentially() {
    const clientsWithPhone = filteredClients.filter((c) => c.phone);
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
        const msg = getMessage(client);
        window.open(generateWhatsAppLink(client.phone!, msg), '_blank');
        setSentSet((prev) => new Set([...prev, client.id]));
        setBulkSendIndex(index + 1);
        if (index === clientsWithPhone.length - 1) {
          setIsBulkSending(false);
          toast.success(`Opened ${clientsWithPhone.length} WhatsApp windows`);
        }
      }, index * 2000);
    });
  }

  function copyAllMessages() {
    const clientsWithPhone = filteredClients.filter((c) => c.phone);
    if (clientsWithPhone.length === 0) { toast.error('No clients have phone numbers'); return; }

    const allMessages = clientsWithPhone.map((client) => {
      const msg = getMessage(client);
      return `--- ${client.name} (${client.phone}) ---\n${msg}`;
    }).join('\n\n');

    navigator.clipboard.writeText(allMessages).then(() => {
      toast.success(`Copied messages for ${clientsWithPhone.length} clients to clipboard`);
    }).catch(() => {
      toast.error('Failed to copy to clipboard');
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-xl font-bold">Campaigns</h2>
        <Button onClick={() => setShowCreate(true)} className="bg-gold text-black border border-gold" size="sm"><Plus className="w-4 h-4 mr-1" /> Create Campaign</Button>
      </div>

      <Card>
        <CardContent className="p-8 text-center">
          <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Create a campaign to send messages to your clients.</p>
          <p className="text-xs text-muted-foreground mt-1">Free Mode: WhatsApp links generated for manual sending.</p>
        </CardContent>
      </Card>

      {/* Create Campaign Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Create Campaign</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label className="text-xs">Campaign Name</Label><Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="e.g. Eid Sale 2025" className="mt-1" /></div>

            <div>
              <Label className="text-xs">Audience</Label>
              <Select value={audience} onValueChange={(v) => { if (v) setAudience(v as AudienceFilter); }}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  <SelectItem value="vip">VIP Only</SelectItem>
                  <SelectItem value="lapsed_30">Lapsed (30+ days)</SelectItem>
                  <SelectItem value="lapsed_60">Lapsed (60+ days)</SelectItem>
                  <SelectItem value="udhaar">Udhaar Outstanding</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {loadingClients ? 'Loading...' : `${filteredClients.length} clients selected`}
              </p>
            </div>

            <div>
              <Label className="text-xs">Template (or write custom below)</Label>
              <Select value={templateId} onValueChange={(v) => { if (v) { setTemplateId(v); const tpl = DEFAULT_TEMPLATES.find((t) => t.id === v); if (tpl) setCustomMessage(tpl.bodyEn); } }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select template" /></SelectTrigger>
                <SelectContent>
                  {DEFAULT_TEMPLATES.filter((t) => !['low_stock_alert', 'daily_summary'].includes(t.id)).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Message</Label>
              <Textarea value={customMessage} onChange={(e) => setCustomMessage(e.target.value)} rows={6} className="mt-1 text-sm font-mono" placeholder="Write your message here... Use {client_name}, {salon_name} etc." />
              <div className="flex items-center justify-between mt-1">
                <div className="flex flex-wrap gap-1">
                  {['{client_name}', '{salon_name}', '{booking_link}'].map((v) => (
                    <button key={v} onClick={() => setCustomMessage(customMessage + v)} className="text-[10px] px-1.5 py-0.5 rounded-full border border-gold/30 bg-gold/5 text-gold font-mono">{v}</button>
                  ))}
                </div>
                <span className={`text-[11px] font-mono tabular-nums ${customMessage.length > 1000 ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                  {customMessage.length}/1000
                </span>
              </div>
            </div>

            {/* Preview */}
            {customMessage && filteredClients.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Preview (for {filteredClients[0].name})</p>
                <div className="p-3 bg-[#DCF8C6] rounded-lg text-sm whitespace-pre-wrap border border-green-500/25">
                  {getMessage(filteredClients[0])}
                </div>
              </div>
            )}

            <Button onClick={startSending} className="w-full bg-gold text-black border border-gold" disabled={loadingClients || filteredClients.length === 0}>
              <Send className="w-4 h-4 mr-2" /> Send to {filteredClients.length} clients
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Send List Dialog */}
      <Dialog open={showSendList} onOpenChange={(open) => { if (!isBulkSending) setShowSendList(open); }}>
        <DialogContent className="max-w-md max-h-[85vh]">
          <DialogHeader><DialogTitle>Send Messages — {campaignName || 'Campaign'}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Send individually, send all with delays, or copy all messages for WhatsApp Web broadcast.</p>
          <p className="text-sm font-medium">{sentSet.size}/{filteredClients.length} sent</p>

          {/* Bulk action buttons */}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="text-xs gap-1 flex-1" onClick={copyAllMessages} disabled={isBulkSending}>
              <Copy className="w-3 h-3" /> Copy All Messages
            </Button>
            <Button size="sm" className="text-xs gap-1 flex-1 bg-gold text-black border border-gold" onClick={sendAllSequentially} disabled={isBulkSending}>
              {isBulkSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              {isBulkSending ? `Sending ${bulkSendIndex}/${filteredClients.filter((c) => c.phone).length}...` : 'Send All (2s delay)'}
            </Button>
          </div>

          {/* Progress bar during bulk send */}
          {isBulkSending && (
            <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
              <div
                className="bg-gold h-2 rounded-full transition-all duration-300"
                style={{ width: `${(bulkSendIndex / Math.max(filteredClients.filter((c) => c.phone).length, 1)) * 100}%` }}
              />
            </div>
          )}

          <ScrollArea className="h-[400px]">
            <div className="space-y-1.5">
              {filteredClients.map((client) => {
                const isSent = sentSet.has(client.id);
                return (
                  <div key={client.id} className={`flex items-center gap-2 p-2 rounded-lg text-sm ${isSent ? 'bg-green-500/10' : 'bg-secondary/50'}`}>
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium truncate ${isSent ? 'line-through text-muted-foreground' : ''}`}>{client.name}</p>
                      <p className="text-xs text-muted-foreground">{client.phone || 'No phone'}</p>
                    </div>
                    {isSent ? (
                      <Badge variant="outline" className="text-[10px] text-green-600 border-green-500/25">Sent ✓</Badge>
                    ) : (
                      <Button size="sm" variant="outline" className="text-xs gap-1 shrink-0" onClick={() => openWhatsApp(client)} disabled={!client.phone || isBulkSending}>
                        <ExternalLink className="w-3 h-3" /> Open
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
