'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Search, Send } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import { generateWhatsAppLink } from '@/lib/utils/whatsapp';
import { useWhatsAppCompose } from './provider';
import { MESSAGE_TEMPLATES, fillTemplate } from './templates';
import type { TemplateKey } from './templates';

interface ClientResult {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
}

function isPhoneLike(query: string): boolean {
  const stripped = query.replace(/[-\s]/g, '');
  return stripped.startsWith('0') && stripped.length >= 11;
}

export function WhatsAppComposeSheet() {
  const { isOpen, options, close } = useWhatsAppCompose();
  const salon = useAppStore((s) => s.salon);

  const [recipient, setRecipient] = useState<{ name: string; phone: string } | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateKey>('custom');
  const [message, setMessage] = useState('');
  const [messageEdited, setMessageEdited] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ClientResult[]>([]);
  const [showResults, setShowResults] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  // On open: reset state from options
  useEffect(() => {
    if (!isOpen) return;

    const rec = options?.recipient ?? null;
    const tmpl: TemplateKey = options?.template ?? 'custom';
    const vars = { ...(options?.variables ?? {}), salon_name: salon?.name ?? '' };

    setRecipient(rec);
    setSelectedTemplate(tmpl);
    setMessage(fillTemplate(tmpl, vars));
    setMessageEdited(false);
    setSearchQuery('');
    setSearchResults([]);
    setShowResults(false);
  }, [isOpen, options, salon]);

  // Debounced client search
  useEffect(() => {
    if (!searchQuery || !salon?.id) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    const timer = setTimeout(async () => {
      // ISSUE-008: typed .ilike() calls, no .or() string templating
      const trimmed = searchQuery.trim().slice(0, 100);
      const pattern = `%${trimmed}%`;
      const [nameRes, phoneRes] = await Promise.all([
        supabase.from('clients').select('id, name, phone, whatsapp').eq('salon_id', salon.id).ilike('name', pattern).limit(5),
        supabase.from('clients').select('id, name, phone, whatsapp').eq('salon_id', salon.id).ilike('phone', pattern).limit(5),
      ]);
      const merged = new Map<string, ClientResult>();
      for (const row of (nameRes.data || []) as ClientResult[]) merged.set(row.id, row);
      for (const row of (phoneRes.data || []) as ClientResult[]) merged.set(row.id, row);
      const results = Array.from(merged.values())
        .filter((c) => c.phone || c.whatsapp)
        .slice(0, 5);
      setSearchResults(results);
      setShowResults(true);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, salon]);

  function handleTemplateClick(key: TemplateKey) {
    if (messageEdited && message.trim()) {
      const confirmed = window.confirm('Replace your edited message with this template?');
      if (!confirmed) return;
    }
    const vars = { ...(options?.variables ?? {}), salon_name: salon?.name ?? '' };
    setSelectedTemplate(key);
    setMessage(fillTemplate(key, vars));
    setMessageEdited(false);
  }

  function handleSelectClient(client: ClientResult) {
    const phone = client.whatsapp ?? client.phone ?? '';
    setRecipient({ name: client.name, phone });
    setSearchQuery('');
    setSearchResults([]);
    setShowResults(false);
  }

  function handleSelectRawPhone(phone: string) {
    setRecipient({ name: phone, phone });
    setSearchQuery('');
    setSearchResults([]);
    setShowResults(false);
  }

  function handleSend() {
    if (!recipient?.phone || !message.trim()) return;
    window.open(generateWhatsAppLink(recipient.phone, message), '_blank');
    close();
  }

  const canSend = Boolean(recipient?.phone && message.trim());

  const showPhoneDirect =
    isPhoneLike(searchQuery) &&
    !searchResults.some(
      (r) => (r.phone ?? '').replace(/[-\s]/g, '') === searchQuery.replace(/[-\s]/g, '')
    );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="sm:max-w-md p-0 gap-0">
        {/* Header */}
        <DialogHeader className="flex-row items-center gap-2 px-4 py-3 border-b border-border">
          <MessageCircle className="size-5 text-[var(--color-gold,#C9A84C)]" />
          <DialogTitle className="text-base font-semibold">Send WhatsApp Message</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 px-4 py-4 overflow-y-auto max-h-[70dvh]">
          {/* To: field */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              To
            </label>
            {recipient ? (
              <div className="flex items-center justify-between border border-border px-3 h-11">
                <div className="flex flex-col">
                  <span className="text-sm font-medium leading-tight">{recipient.name}</span>
                  <span className="text-xs text-muted-foreground">{recipient.phone}</span>
                </div>
                <button
                  onClick={() => setRecipient(null)}
                  className="flex items-center justify-center size-8 hover:bg-muted text-muted-foreground"
                  aria-label="Clear recipient"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <div className="flex items-center border border-border px-3 h-11 gap-2">
                  <Search className="size-4 text-muted-foreground shrink-0" />
                  <input
                    ref={searchRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search client or enter phone..."
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    aria-label="Search client"
                  />
                </div>
                {showResults && (
                  <div className="absolute left-0 right-0 top-full z-10 bg-background border border-border border-t-0 shadow-none max-h-48 overflow-y-auto">
                    {searchResults.map((client) => (
                      <button
                        key={client.id}
                        onClick={() => handleSelectClient(client)}
                        className="w-full flex flex-col items-start px-3 py-2.5 text-left hover:bg-muted min-h-[44px]"
                      >
                        <span className="text-sm font-medium">{client.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {client.whatsapp ?? client.phone}
                        </span>
                      </button>
                    ))}
                    {showPhoneDirect && (
                      <button
                        onClick={() => handleSelectRawPhone(searchQuery)}
                        className="w-full flex items-center px-3 py-2.5 text-left hover:bg-muted min-h-[44px] gap-2"
                      >
                        <Send className="size-4 text-muted-foreground shrink-0" />
                        <span className="text-sm">Send to {searchQuery}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Template chips */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Template
            </label>
            <div className="flex flex-wrap gap-2">
              {MESSAGE_TEMPLATES.map((tpl) => {
                const active = selectedTemplate === tpl.key;
                return (
                  <button
                    key={tpl.key}
                    onClick={() => handleTemplateClick(tpl.key)}
                    className={[
                      'px-3 h-8 rounded-full text-sm border transition-colors',
                      active
                        ? 'bg-[var(--color-gold,#C9A84C)] text-black border-[var(--color-gold,#C9A84C)]'
                        : 'bg-background text-foreground border-border hover:bg-muted',
                    ].join(' ')}
                  >
                    {tpl.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Message textarea */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Message
            </label>
            <Textarea
              rows={4}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                setMessageEdited(true);
              }}
              placeholder="Type your message..."
              className="resize-none rounded-none"
              aria-label="Message"
            />
            <p className="text-xs text-muted-foreground mt-1 text-right">
              {message.length} characters
            </p>
          </div>

          {/* Send button */}
          <Button
            disabled={!canSend}
            onClick={handleSend}
            className="w-full h-12 rounded-none bg-[var(--color-gold,#C9A84C)] hover:bg-[var(--color-gold,#C9A84C)]/90 text-black border border-[var(--color-gold,#C9A84C)] disabled:opacity-50"
          >
            <MessageCircle className="size-4" />
            Open in WhatsApp
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
