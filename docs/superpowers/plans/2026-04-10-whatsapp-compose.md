# WhatsApp Compose Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable WhatsApp Compose bottom sheet that replaces all scattered inline WhatsApp buttons with a single consistent component.

**Architecture:** A `WhatsAppComposeProvider` context wraps the dashboard layout. Any component calls `useWhatsAppCompose().open(options)` to show a bottom sheet where the owner picks a recipient, selects a message template, optionally edits, and taps "Open in WhatsApp". The sheet uses the existing `Sheet` component with `side="bottom"`.

**Tech Stack:** React 19, Next.js 16, Zustand (existing app store for salon name), Base UI Sheet, Supabase client-side queries for client search, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-04-10-whatsapp-compose-design.md`

---

### Task 1: Message Templates

**Files:**
- Create: `src/components/whatsapp-compose/templates.ts`
- Test: `test/whatsapp-templates.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/whatsapp-templates.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { MESSAGE_TEMPLATES, fillTemplate } from '../src/components/whatsapp-compose/templates'
import type { TemplateKey } from '../src/components/whatsapp-compose/templates'

describe('MESSAGE_TEMPLATES', () => {
  it('has exactly 7 templates', () => {
    expect(MESSAGE_TEMPLATES).toHaveLength(7)
  })

  it('includes all required template keys', () => {
    const keys = MESSAGE_TEMPLATES.map(t => t.key)
    expect(keys).toEqual([
      'appointment_reminder', 'udhaar_reminder', 'receipt',
      'birthday', 'no_show', 'thank_you', 'custom',
    ])
  })

  it('every template has label and template string', () => {
    for (const t of MESSAGE_TEMPLATES) {
      expect(t.label).toBeTruthy()
      expect(typeof t.template).toBe('string')
    }
  })

  it('custom template has empty string', () => {
    const custom = MESSAGE_TEMPLATES.find(t => t.key === 'custom')
    expect(custom?.template).toBe('')
  })
})

describe('fillTemplate', () => {
  it('substitutes variables into appointment_reminder', () => {
    const result = fillTemplate('appointment_reminder', {
      time: '2:00 PM', staff_name: 'Sadia', salon_name: 'Glamour Studio',
    })
    expect(result).toBe('Reminder: Your appointment is at 2:00 PM. Sadia is waiting for you! — Glamour Studio')
  })

  it('substitutes variables into udhaar_reminder', () => {
    const result = fillTemplate('udhaar_reminder', {
      name: 'Ali', amount: 'Rs 5,000', salon_name: 'Glamour Studio',
    })
    expect(result).toContain('Ali')
    expect(result).toContain('Rs 5,000')
    expect(result).toContain('Glamour Studio')
  })

  it('substitutes variables into birthday', () => {
    const result = fillTemplate('birthday', { name: 'Ayesha', salon_name: 'Glamour Studio' })
    expect(result).toContain('Happy Birthday Ayesha')
    expect(result).toContain('Glamour Studio')
  })

  it('substitutes variables into no_show', () => {
    const result = fillTemplate('no_show', { name: 'Sara', time: '3:00 PM', salon_name: 'Glamour Studio' })
    expect(result).toContain('Sara')
    expect(result).toContain('3:00 PM')
  })

  it('substitutes variables into thank_you', () => {
    const result = fillTemplate('thank_you', { name: 'Fatima', salon_name: 'Glamour Studio' })
    expect(result).toContain('Fatima')
    expect(result).toContain('Glamour Studio')
  })

  it('returns empty string for custom', () => {
    expect(fillTemplate('custom', {})).toBe('')
  })

  it('leaves unmatched placeholders as-is', () => {
    const result = fillTemplate('appointment_reminder', { time: '2:00 PM', salon_name: 'X' })
    expect(result).toContain('{staff_name}')
  })

  it('returns empty string for unknown template key', () => {
    expect(fillTemplate('nonexistent' as TemplateKey, {})).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/whatsapp-templates.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `src/components/whatsapp-compose/templates.ts`:

```typescript
import { encodeMessage } from '@/lib/utils/whatsapp';

export type TemplateKey =
  | 'appointment_reminder'
  | 'udhaar_reminder'
  | 'receipt'
  | 'birthday'
  | 'no_show'
  | 'thank_you'
  | 'custom';

export interface MessageTemplate {
  key: TemplateKey;
  label: string;
  template: string;
}

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    key: 'appointment_reminder',
    label: 'Reminder',
    template: 'Reminder: Your appointment is at {time}. {staff_name} is waiting for you! — {salon_name}',
  },
  {
    key: 'udhaar_reminder',
    label: 'Udhaar',
    template: 'Dear {name}, your outstanding balance is {amount}. Please clear it on your next visit. Thank you! — {salon_name}',
  },
  {
    key: 'receipt',
    label: 'Receipt',
    template: '', // Receipt is pre-formatted — caller passes the full text via variables.receipt_text
  },
  {
    key: 'birthday',
    label: 'Birthday',
    template: 'Happy Birthday {name}! Visit {salon_name} today for a special treat. We\'d love to see you!',
  },
  {
    key: 'no_show',
    label: 'No-show',
    template: 'Hi {name}, we missed you at your {time} appointment today. Would you like to reschedule? — {salon_name}',
  },
  {
    key: 'thank_you',
    label: 'Thanks',
    template: 'Thank you for visiting {salon_name}, {name}! We hope you loved your experience. See you next time!',
  },
  {
    key: 'custom',
    label: 'Custom',
    template: '',
  },
];

export function fillTemplate(key: TemplateKey, variables: Record<string, string>): string {
  const tmpl = MESSAGE_TEMPLATES.find(t => t.key === key);
  if (!tmpl) return '';
  if (key === 'receipt') return variables.receipt_text ?? '';
  if (!tmpl.template) return '';
  return encodeMessage(tmpl.template, variables);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/whatsapp-templates.test.ts`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/whatsapp-compose/templates.ts test/whatsapp-templates.test.ts
git commit -m "feat(whatsapp): add message templates and fillTemplate utility"
```

---

### Task 2: Context Provider and Hook

**Files:**
- Create: `src/components/whatsapp-compose/provider.tsx`
- Test: `test/whatsapp-compose-provider.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `test/whatsapp-compose-provider.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { WhatsAppComposeProvider, useWhatsAppCompose } from '../src/components/whatsapp-compose/provider'

function TestConsumer() {
  const { isOpen, options, open, close } = useWhatsAppCompose()
  return (
    <div>
      <span data-testid="is-open">{String(isOpen)}</span>
      <span data-testid="recipient">{options?.recipient?.name ?? 'none'}</span>
      <span data-testid="template">{options?.template ?? 'none'}</span>
      <button onClick={() => open({ recipient: { name: 'Ali', phone: '0300-1234567' }, template: 'udhaar_reminder', variables: { name: 'Ali', amount: 'Rs 5,000', salon_name: 'X' } })}>
        open
      </button>
      <button onClick={() => open({})}>open-empty</button>
      <button onClick={close}>close</button>
    </div>
  )
}

describe('WhatsAppComposeProvider', () => {
  it('starts closed', () => {
    render(<WhatsAppComposeProvider><TestConsumer /></WhatsAppComposeProvider>)
    expect(screen.getByTestId('is-open').textContent).toBe('false')
  })

  it('opens with options', async () => {
    render(<WhatsAppComposeProvider><TestConsumer /></WhatsAppComposeProvider>)
    await act(async () => { screen.getByText('open').click() })
    expect(screen.getByTestId('is-open').textContent).toBe('true')
    expect(screen.getByTestId('recipient').textContent).toBe('Ali')
    expect(screen.getByTestId('template').textContent).toBe('udhaar_reminder')
  })

  it('opens with empty options', async () => {
    render(<WhatsAppComposeProvider><TestConsumer /></WhatsAppComposeProvider>)
    await act(async () => { screen.getByText('open-empty').click() })
    expect(screen.getByTestId('is-open').textContent).toBe('true')
    expect(screen.getByTestId('recipient').textContent).toBe('none')
  })

  it('closes and resets', async () => {
    render(<WhatsAppComposeProvider><TestConsumer /></WhatsAppComposeProvider>)
    await act(async () => { screen.getByText('open').click() })
    expect(screen.getByTestId('is-open').textContent).toBe('true')
    await act(async () => { screen.getByText('close').click() })
    expect(screen.getByTestId('is-open').textContent).toBe('false')
    expect(screen.getByTestId('recipient').textContent).toBe('none')
  })

  it('throws when used outside provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<TestConsumer />)).toThrow()
    spy.mockRestore()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/whatsapp-compose-provider.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `src/components/whatsapp-compose/provider.tsx`:

```tsx
'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import type { TemplateKey } from './templates';

export interface WhatsAppComposeOptions {
  recipient?: {
    name: string;
    phone: string;
  };
  template?: TemplateKey;
  variables?: Record<string, string>;
}

interface WhatsAppComposeContextValue {
  isOpen: boolean;
  options: WhatsAppComposeOptions | null;
  open: (opts: WhatsAppComposeOptions) => void;
  close: () => void;
}

const WhatsAppComposeContext = createContext<WhatsAppComposeContextValue | null>(null);

export function WhatsAppComposeProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<WhatsAppComposeOptions | null>(null);

  const open = useCallback((opts: WhatsAppComposeOptions) => {
    setOptions(opts);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setOptions(null);
  }, []);

  return (
    <WhatsAppComposeContext.Provider value={{ isOpen, options, open, close }}>
      {children}
    </WhatsAppComposeContext.Provider>
  );
}

export function useWhatsAppCompose(): WhatsAppComposeContextValue {
  const ctx = useContext(WhatsAppComposeContext);
  if (!ctx) throw new Error('useWhatsAppCompose must be used within WhatsAppComposeProvider');
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/whatsapp-compose-provider.test.tsx`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/whatsapp-compose/provider.tsx test/whatsapp-compose-provider.test.tsx
git commit -m "feat(whatsapp): add WhatsAppComposeProvider context and hook"
```

---

### Task 3: Bottom Sheet UI Component

**Files:**
- Create: `src/components/whatsapp-compose/sheet.tsx`
- Test: `test/whatsapp-compose-sheet.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `test/whatsapp-compose-sheet.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'

vi.mock('@/components/providers/language-provider', () => ({
  useLanguage: () => ({ t: (k: string) => k, language: 'en' as const }),
}))

vi.mock('@/store/app-store', () => ({
  useAppStore: () => ({
    salon: { id: 's1', name: 'Glamour Studio' },
  }),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          or: () => ({
            limit: () => Promise.resolve({ data: [
              { id: 'c1', name: 'Ayesha Khan', phone: '0321-1234567', whatsapp: null, salon_id: 's1' },
              { id: 'c2', name: 'Ali Raza', phone: '0300-9876543', whatsapp: '0333-9876543', salon_id: 's1' },
            ] }),
          }),
        }),
      }),
    }),
  },
}))

// Mock window.open
const mockWindowOpen = vi.fn()
vi.stubGlobal('open', mockWindowOpen)

import { WhatsAppComposeProvider, useWhatsAppCompose } from '../src/components/whatsapp-compose/provider'
import { WhatsAppComposeSheet } from '../src/components/whatsapp-compose/sheet'

function Harness({ autoOpen }: { autoOpen?: Parameters<ReturnType<typeof useWhatsAppCompose>['open']>[0] }) {
  const { open } = useWhatsAppCompose()
  return (
    <>
      <button onClick={() => open(autoOpen ?? {})}>trigger</button>
      <WhatsAppComposeSheet />
    </>
  )
}

function renderSheet(autoOpen?: Parameters<ReturnType<typeof useWhatsAppCompose>['open']>[0]) {
  return render(
    <WhatsAppComposeProvider>
      <Harness autoOpen={autoOpen} />
    </WhatsAppComposeProvider>
  )
}

describe('WhatsAppComposeSheet', () => {
  beforeEach(() => { mockWindowOpen.mockClear() })

  it('is hidden by default', () => {
    renderSheet()
    expect(screen.queryByText('Send WhatsApp Message')).toBeNull()
  })

  it('shows when opened', async () => {
    renderSheet()
    await act(async () => { screen.getByText('trigger').click() })
    expect(screen.getByText('Send WhatsApp Message')).toBeDefined()
  })

  it('pre-fills recipient when provided', async () => {
    renderSheet({ recipient: { name: 'Ayesha Khan', phone: '0321-1234567' } })
    await act(async () => { screen.getByText('trigger').click() })
    expect(screen.getByText(/Ayesha Khan/)).toBeDefined()
  })

  it('shows search input when no recipient', async () => {
    renderSheet()
    await act(async () => { screen.getByText('trigger').click() })
    expect(screen.getByPlaceholderText(/Search client or type number/)).toBeDefined()
  })

  it('renders all 7 template chips', async () => {
    renderSheet()
    await act(async () => { screen.getByText('trigger').click() })
    expect(screen.getByText('Reminder')).toBeDefined()
    expect(screen.getByText('Udhaar')).toBeDefined()
    expect(screen.getByText('Receipt')).toBeDefined()
    expect(screen.getByText('Birthday')).toBeDefined()
    expect(screen.getByText('No-show')).toBeDefined()
    expect(screen.getByText('Thanks')).toBeDefined()
    expect(screen.getByText('Custom')).toBeDefined()
  })

  it('fills textarea when template chip clicked', async () => {
    const user = userEvent.setup()
    renderSheet({
      recipient: { name: 'Test', phone: '0300-1111111' },
      variables: { time: '2:00 PM', staff_name: 'Sadia', salon_name: 'Glamour Studio' },
    })
    await act(async () => { screen.getByText('trigger').click() })
    await user.click(screen.getByText('Reminder'))
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.value).toContain('2:00 PM')
    expect(textarea.value).toContain('Sadia')
  })

  it('disables send button when phone or message empty', async () => {
    renderSheet()
    await act(async () => { screen.getByText('trigger').click() })
    const btn = screen.getByText('Open in WhatsApp')
    expect(btn.closest('button')?.disabled).toBe(true)
  })

  it('calls window.open with correct URL on send', async () => {
    const user = userEvent.setup()
    renderSheet({
      recipient: { name: 'Test', phone: '0321-1234567' },
      template: 'custom',
    })
    await act(async () => { screen.getByText('trigger').click() })
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    await user.type(textarea, 'Hello there')
    await user.click(screen.getByText('Open in WhatsApp'))
    expect(mockWindowOpen).toHaveBeenCalledWith(
      expect.stringContaining('wa.me/923211234567'),
      '_blank'
    )
  })

  it('shows character count', async () => {
    const user = userEvent.setup()
    renderSheet({ recipient: { name: 'T', phone: '0300-1111111' } })
    await act(async () => { screen.getByText('trigger').click() })
    await user.type(screen.getByRole('textbox'), 'Hello')
    expect(screen.getByText('5 characters')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/whatsapp-compose-sheet.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `src/components/whatsapp-compose/sheet.tsx`:

```tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Search, Send } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import { generateWhatsAppLink } from '@/lib/utils/whatsapp';
import { useWhatsAppCompose } from './provider';
import { MESSAGE_TEMPLATES, fillTemplate } from './templates';
import type { TemplateKey } from './templates';

interface SearchResult {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
}

export function WhatsAppComposeSheet() {
  const { isOpen, options, close } = useWhatsAppCompose();
  const { salon } = useAppStore();

  const [recipient, setRecipient] = useState<{ name: string; phone: string } | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateKey>('custom');
  const [message, setMessage] = useState('');
  const [messageEdited, setMessageEdited] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(null);

  // Initialize state when sheet opens
  useEffect(() => {
    if (!isOpen || !options) return;

    if (options.recipient) {
      setRecipient(options.recipient);
    } else {
      setRecipient(null);
    }

    const tmplKey = options.template ?? 'custom';
    setSelectedTemplate(tmplKey);

    const vars = { ...options.variables };
    if (salon?.name && !vars.salon_name) {
      vars.salon_name = salon.name;
    }
    setMessage(fillTemplate(tmplKey, vars));
    setMessageEdited(false);
    setSearchQuery('');
    setSearchResults([]);
    setShowResults(false);
  }, [isOpen, options, salon?.name]);

  // Client search with debounce
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2 || !salon) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      const { data } = await supabase
        .from('clients')
        .select('id, name, phone, whatsapp')
        .eq('salon_id', salon.id)
        .or(`name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%`)
        .limit(5);

      if (data) {
        const withPhone = (data as SearchResult[]).filter(c => c.phone || c.whatsapp);
        setSearchResults(withPhone);
        setShowResults(true);
      }
    }, 300);

    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [searchQuery, salon]);

  function selectClient(client: SearchResult) {
    const phone = client.whatsapp || client.phone || '';
    setRecipient({ name: client.name, phone });
    setSearchQuery('');
    setShowResults(false);
  }

  function acceptRawNumber() {
    const cleaned = searchQuery.replace(/[-\s]/g, '');
    if (cleaned.length >= 11 && cleaned.startsWith('0')) {
      setRecipient({ name: 'Unknown', phone: cleaned });
      setSearchQuery('');
      setShowResults(false);
    }
  }

  function clearRecipient() {
    setRecipient(null);
    setSearchQuery('');
  }

  function selectTemplate(key: TemplateKey) {
    if (messageEdited && message.length > 0) {
      if (!window.confirm('Replace your edited message with this template?')) return;
    }
    setSelectedTemplate(key);
    const vars = { ...options?.variables };
    if (salon?.name && !vars.salon_name) vars.salon_name = salon.name;
    if (recipient?.name && !vars.name) vars.name = recipient.name;
    setMessage(fillTemplate(key, vars));
    setMessageEdited(false);
  }

  function handleMessageChange(value: string) {
    setMessage(value);
    setMessageEdited(true);
  }

  function handleSend() {
    if (!recipient?.phone || !message) return;
    const link = generateWhatsAppLink(recipient.phone, message);
    window.open(link, '_blank');
    close();
  }

  function handleClose() {
    close();
  }

  const canSend = !!(recipient?.phone && message.trim());
  const isRawNumber = searchQuery.replace(/[-\s]/g, '').length >= 11 && searchQuery.replace(/[-\s]/g, '').startsWith('0');

  return (
    <Sheet open={isOpen} onOpenChange={(v) => !v && handleClose()}>
      <SheetContent side="bottom" showCloseButton={false} className="rounded-t-2xl max-h-[85vh] overflow-y-auto px-5 pb-6 pt-3">
        {/* Drag handle */}
        <div className="flex justify-center mb-2">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        <SheetHeader className="p-0 mb-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-base font-semibold">
              <MessageCircle className="w-4 h-4 text-green-500" />
              Send WhatsApp Message
            </SheetTitle>
            <Button variant="ghost" size="icon" onClick={handleClose} className="h-9 w-9">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </SheetHeader>

        {/* Recipient */}
        <div className="mb-4">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">To</label>
          {recipient ? (
            <div className="flex items-center justify-between border border-border rounded-lg px-3 py-2.5">
              <span className="text-sm font-medium">
                {recipient.name} <span className="text-muted-foreground">· {recipient.phone}</span>
              </span>
              <button onClick={clearRecipient} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search client or type number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-gold/50"
              />
              {showResults && searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-10 mt-1 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
                  {searchResults.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => selectClient(c)}
                      className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors flex items-center justify-between"
                    >
                      <span className="font-medium">{c.name}</span>
                      <span className="text-muted-foreground text-xs">{c.whatsapp || c.phone}</span>
                    </button>
                  ))}
                  {isRawNumber && (
                    <button
                      onClick={acceptRawNumber}
                      className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors text-muted-foreground border-t border-border"
                    >
                      Send to <span className="font-medium text-foreground">{searchQuery}</span>
                    </button>
                  )}
                </div>
              )}
              {showResults && searchResults.length === 0 && isRawNumber && (
                <div className="absolute top-full left-0 right-0 z-10 mt-1 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
                  <button
                    onClick={acceptRawNumber}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors text-muted-foreground"
                  >
                    Send to <span className="font-medium text-foreground">{searchQuery}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Template chips */}
        <div className="mb-4">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Template</label>
          <div className="flex flex-wrap gap-2">
            {MESSAGE_TEMPLATES.map((t) => (
              <button
                key={t.key}
                onClick={() => selectTemplate(t.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-150 ${
                  selectedTemplate === t.key
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-background text-foreground border-border hover:border-foreground/30'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Message textarea */}
        <div className="mb-4">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Message</label>
          <Textarea
            value={message}
            onChange={(e) => handleMessageChange(e.target.value)}
            placeholder="Type your message..."
            rows={4}
            className="resize-none text-sm"
          />
          <p className="text-xs text-muted-foreground mt-1">{message.length} characters</p>
        </div>

        {/* Send button */}
        <Button
          onClick={handleSend}
          disabled={!canSend}
          className="w-full h-12 bg-gold hover:bg-gold/90 text-black border border-gold font-semibold gap-2 text-sm transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send className="w-4 h-4" />
          Open in WhatsApp
        </Button>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/whatsapp-compose-sheet.test.tsx`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/whatsapp-compose/sheet.tsx test/whatsapp-compose-sheet.test.tsx
git commit -m "feat(whatsapp): add WhatsApp Compose bottom sheet UI"
```

---

### Task 4: Wire Provider into Dashboard Layout

**Files:**
- Modify: `src/app/dashboard/layout.tsx:314` (the `{children}` render)

- [ ] **Step 1: Add provider import and wrap children**

In `src/app/dashboard/layout.tsx`, add these imports at the top:

```typescript
import { WhatsAppComposeProvider } from '@/components/whatsapp-compose/provider';
import { WhatsAppComposeSheet } from '@/components/whatsapp-compose/sheet';
```

Then change line 314 from:

```tsx
<ErrorBoundary>{children}</ErrorBoundary>
```

to:

```tsx
<WhatsAppComposeProvider>
  <ErrorBoundary>{children}</ErrorBoundary>
  <WhatsAppComposeSheet />
</WhatsAppComposeProvider>
```

- [ ] **Step 2: Run existing tests to verify nothing breaks**

Run: `npx vitest run`
Expected: all existing tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/layout.tsx
git commit -m "feat(whatsapp): wire WhatsAppComposeProvider into dashboard layout"
```

---

### Task 5: Replace Appointment Detail WhatsApp

**Files:**
- Modify: `src/app/dashboard/appointments/components/appointment-detail.tsx`

- [ ] **Step 1: Replace inline WhatsApp with compose hook**

In `appointment-detail.tsx`:

Remove the import of `generateWhatsAppLink`:
```typescript
// DELETE: import { generateWhatsAppLink } from '@/lib/utils/whatsapp';
```

Add import:
```typescript
import { useWhatsAppCompose } from '@/components/whatsapp-compose/provider';
```

Inside the component (line 34, after `const router = useRouter();`), add:
```typescript
const { open: openWhatsApp } = useWhatsAppCompose();
```

Replace the `sendReminder` function (lines 58-63) with:
```typescript
function sendReminder() {
  if (!apt.client?.phone) { toast.error('No phone number'); return; }
  openWhatsApp({
    recipient: { name: apt.client.name, phone: apt.client.phone },
    template: 'appointment_reminder',
    variables: { time: formatTime(apt.start_time), staff_name: apt.staff?.name || '' },
  });
}
```

Also remove `MessageCircle` from the lucide-react import if it's no longer used elsewhere in the file. Check: it's used in the button at line 205 — keep it.

- [ ] **Step 2: Verify the app builds**

Run: `npx next build 2>&1 | head -30` (or `npx vitest run`)
Expected: no type errors

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/appointments/components/appointment-detail.tsx
git commit -m "refactor(whatsapp): appointment detail uses compose sheet"
```

---

### Task 6: Replace Client Card WhatsApp

**Files:**
- Modify: `src/app/dashboard/clients/components/client-card.tsx`

- [ ] **Step 1: Replace inline WhatsApp with compose hook**

In `client-card.tsx`:

Remove the import of `generateWhatsAppLink`:
```typescript
// DELETE: import { generateWhatsAppLink } from '@/lib/utils/whatsapp';
```

Add import:
```typescript
import { useWhatsAppCompose } from '@/components/whatsapp-compose/provider';
```

Inside the component (line 20, after `const router = useRouter();`), add:
```typescript
const { open: openWhatsApp } = useWhatsAppCompose();
```

Replace the onClick handler at lines 94-97 from:
```typescript
onClick={(e) => {
  e.preventDefault();
  e.stopPropagation();
  window.open(generateWhatsAppLink(client.phone!, `Hi ${client.name}!`), '_blank');
}}
```

to:
```typescript
onClick={(e) => {
  e.preventDefault();
  e.stopPropagation();
  openWhatsApp({
    recipient: { name: client.name, phone: client.phone! },
    template: 'custom',
    variables: { name: client.name },
  });
}}
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run`
Expected: all PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/clients/components/client-card.tsx
git commit -m "refactor(whatsapp): client card uses compose sheet"
```

---

### Task 7: Replace Client Profile WhatsApp

**Files:**
- Modify: `src/app/dashboard/clients/[id]/page.tsx`

- [ ] **Step 1: Replace inline WhatsApp with compose hook**

In `clients/[id]/page.tsx`:

Remove the import of `generateWhatsAppLink`:
```typescript
// DELETE: import { generateWhatsAppLink } from '@/lib/utils/whatsapp';
```

Add import:
```typescript
import { useWhatsAppCompose } from '@/components/whatsapp-compose/provider';
```

Inside the component, add after the existing hooks:
```typescript
const { open: openWhatsApp } = useWhatsAppCompose();
```

Replace the `sendUdhaarReminder` function (lines 129-133) with:
```typescript
function sendUdhaarReminder() {
  if (!client?.phone) return;
  openWhatsApp({
    recipient: { name: client.name, phone: client.phone },
    template: 'udhaar_reminder',
    variables: { name: client.name, amount: formatPKR(client.udhaar_balance) },
  });
}
```

Also replace the direct `wa.me` link at line 175. Change:
```tsx
<a href={`https://wa.me/92${client.phone.replace(/[-\s]/g, '').replace(/^0/, '')}`} target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground flex items-center gap-1 hover:text-gold transition-all duration-150">
  <Phone className="w-3 h-3" /> {client.phone}
</a>
```

to:
```tsx
<button
  onClick={() => openWhatsApp({ recipient: { name: client.name, phone: client.phone! }, template: 'custom', variables: { name: client.name } })}
  className="text-sm text-muted-foreground flex items-center gap-1 hover:text-gold transition-all duration-150"
>
  <Phone className="w-3 h-3" /> {client.phone}
</button>
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run`
Expected: all PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/clients/\[id\]/page.tsx
git commit -m "refactor(whatsapp): client profile uses compose sheet"
```

---

### Task 8: Replace Checkout Confirmation WhatsApp

**Files:**
- Modify: `src/app/dashboard/pos/components/checkout-confirmation.tsx`

- [ ] **Step 1: Replace inline WhatsApp with compose hook**

In `checkout-confirmation.tsx`:

Remove the import of `generateWhatsAppLink` (keep `encodeMessage` — it's used by `getReceiptText`):
```typescript
// Change from:
import { generateWhatsAppLink, encodeMessage } from '@/lib/utils/whatsapp';
// To:
import { encodeMessage } from '@/lib/utils/whatsapp';
```

Add import:
```typescript
import { useWhatsAppCompose } from '@/components/whatsapp-compose/provider';
```

Inside the component (after line 55, the destructured props), add:
```typescript
const { open: openWhatsApp } = useWhatsAppCompose();
```

Replace the `sendWhatsAppReceipt` function (lines 83-87) with:
```typescript
function sendWhatsAppReceipt() {
  if (!clientPhone) return;
  openWhatsApp({
    recipient: { name: clientName || 'Customer', phone: clientPhone },
    template: 'receipt',
    variables: { receipt_text: getReceiptText() },
  });
}
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run`
Expected: all PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/pos/components/checkout-confirmation.tsx
git commit -m "refactor(whatsapp): checkout uses compose sheet for receipts"
```

---

### Task 9: Replace Client Report (Udhaar) WhatsApp

**Files:**
- Modify: `src/app/dashboard/reports/clients/page.tsx`

- [ ] **Step 1: Replace inline WhatsApp with compose hook**

In `reports/clients/page.tsx`:

Remove the import of `generateWhatsAppLink`:
```typescript
// DELETE: import { generateWhatsAppLink } from '@/lib/utils/whatsapp';
```

Add import:
```typescript
import { useWhatsAppCompose } from '@/components/whatsapp-compose/provider';
```

Inside the component, add after existing hooks:
```typescript
const { open: openWhatsApp } = useWhatsAppCompose();
```

Replace `sendSingleUdhaar` (lines 100-104) with:
```typescript
function sendSingleUdhaar(c: Client) {
  if (!c.phone) return;
  openWhatsApp({
    recipient: { name: c.name, phone: c.phone },
    template: 'udhaar_reminder',
    variables: { name: c.name, amount: formatPKR(c.udhaar_balance) },
  });
  setUdhaarSentSet((prev) => new Set([...prev, c.id]));
}
```

Replace `sendUdhaarAllSequentially` (lines 58-83) with a sequential compose flow:
```typescript
function sendUdhaarAllSequentially() {
  const clientsWithPhone = udhaarClients.filter((c) => c.phone);
  if (clientsWithPhone.length === 0) { toast.error('No clients have phone numbers'); return; }

  const confirmed = window.confirm(
    `This will open the compose sheet for ${clientsWithPhone.length} clients one at a time. Continue?`
  );
  if (!confirmed) return;

  // Open first client immediately
  if (clientsWithPhone.length > 0) {
    sendSingleUdhaar(clientsWithPhone[0]);
    setBulkSendIndex(1);
    setIsBulkSending(true);
  }
}
```

Note: The bulk "next" flow would need a "Next client" button in the udhaar dialog. For now, the existing dialog already shows the client list — the owner clicks each "Send" button individually. This is the simpler, safer approach. Remove the auto-tab-spam behavior entirely and keep the per-client send buttons.

- [ ] **Step 2: Run tests**

Run: `npx vitest run`
Expected: all PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/reports/clients/page.tsx
git commit -m "refactor(whatsapp): udhaar report uses compose sheet"
```

---

### Task 10: Replace Payroll WhatsApp

**Files:**
- Modify: `src/app/dashboard/staff/payroll/page.tsx`

- [ ] **Step 1: Replace inline WhatsApp with compose hook**

In `staff/payroll/page.tsx`:

Remove the import of `generateWhatsAppLink`:
```typescript
// DELETE: import { generateWhatsAppLink } from '@/lib/utils/whatsapp';
```

Add import:
```typescript
import { useWhatsAppCompose } from '@/components/whatsapp-compose/provider';
```

Inside the component, add after existing hooks:
```typescript
const { open: openWhatsApp } = useWhatsAppCompose();
```

Replace `sendSalarySlip` (lines 180-199) with:
```typescript
function sendSalarySlip(row: PayrollRow) {
  if (!row.staff.phone) return;
  const msg = `*BrBr — Salary Slip*
Staff: ${row.staff.name}
Month: ${new Date(year, month - 1).toLocaleString('default', { month: 'long' })} ${year}
─────────────────
Base Salary:        ${formatPKR(row.baseSalary)}
Commission:         ${formatPKR(row.commission)}
Tips:               ${formatPKR(row.tips)}
─────────────────
Gross Earnings:     ${formatPKR(row.earned)}
Advance Deduction: -${formatPKR(row.advances)}
Late Deductions:   -${formatPKR(row.lateDeductions)}
─────────────────
*NET PAYABLE:       ${formatPKR(row.netPayable)}*

Thank you 🙏 — BrBr Management`;

  openWhatsApp({
    recipient: { name: row.staff.name, phone: row.staff.phone },
    template: 'custom',
    variables: {},
  });
  // Pre-fill with salary slip text — we use custom template and set message via variables
  // Actually, we need the receipt_text pattern here too. Use receipt template:
  openWhatsApp({
    recipient: { name: row.staff.name, phone: row.staff.phone },
    template: 'receipt',
    variables: { receipt_text: msg },
  });
}
```

Wait — the double `openWhatsApp` is wrong. Use the receipt template which accepts pre-formatted text:

```typescript
function sendSalarySlip(row: PayrollRow) {
  if (!row.staff.phone) return;
  const msg = `*BrBr — Salary Slip*
Staff: ${row.staff.name}
Month: ${new Date(year, month - 1).toLocaleString('default', { month: 'long' })} ${year}
─────────────────
Base Salary:        ${formatPKR(row.baseSalary)}
Commission:         ${formatPKR(row.commission)}
Tips:               ${formatPKR(row.tips)}
─────────────────
Gross Earnings:     ${formatPKR(row.earned)}
Advance Deduction: -${formatPKR(row.advances)}
Late Deductions:   -${formatPKR(row.lateDeductions)}
─────────────────
*NET PAYABLE:       ${formatPKR(row.netPayable)}*

Thank you 🙏 — BrBr Management`;

  openWhatsApp({
    recipient: { name: row.staff.name, phone: row.staff.phone },
    template: 'receipt',
    variables: { receipt_text: msg },
  });
}
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run`
Expected: all PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/staff/payroll/page.tsx
git commit -m "refactor(whatsapp): payroll uses compose sheet for salary slips"
```

---

### Task 11: Wire Alerts Panel No-Show Action

**Files:**
- Modify: `src/app/dashboard/components/alerts-panel.tsx`
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Update buildAlerts to include no-show WhatsApp action**

This is already handled — the no-show alert has an action with `href: '/dashboard/appointments'`. We want to keep that link (navigating to appointments makes sense), but we can also add a dedicated "Follow up" entry point from the dashboard page.

Actually, the no-show alert links to the appointments page which is correct. The compose sheet will be available from the appointment detail there. No change needed to `buildAlerts` — the existing flow works: see no-show alert → click "View Appointments" → open appointment detail → send no-show follow-up via compose sheet.

Skip this step — the existing flow covers it.

- [ ] **Step 2: Commit (skip — no changes)**

---

### Task 12: Run Full Test Suite and Build

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: all tests PASS (existing + new)

- [ ] **Step 2: Run build**

Run: `npx next build 2>&1 | tail -20`
Expected: build succeeds with no type errors

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address any build/test issues from WhatsApp compose integration"
```
