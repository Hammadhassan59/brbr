# WhatsApp Compose Sheet — Design Spec

**Date:** 2026-04-10
**Status:** Approved

## Summary

A single, reusable WhatsApp Compose bottom sheet that replaces all scattered inline WhatsApp buttons across the dashboard. The owner picks a recipient (auto-filled from context or searched manually), selects a message template, optionally edits, and taps "Open in WhatsApp" which opens `wa.me` with the pre-filled message. No automation — the owner always sends manually inside WhatsApp.

## Decisions

| Decision | Choice |
|---|---|
| UI pattern | Bottom sheet (slides up) |
| Templates at launch | All 7: reminder, udhaar, receipt, birthday, no-show, thank you, custom |
| Replace vs alongside | Replace all existing inline WhatsApp buttons |
| State management | Context + hook (`WhatsAppComposeProvider` + `useWhatsAppCompose`) |
| Recipient selection | Context auto-fill + manual search/type override |

## Architecture

### New Files

- `src/components/whatsapp-compose/provider.tsx` — context, provider, hook
- `src/components/whatsapp-compose/sheet.tsx` — bottom sheet UI component
- `src/components/whatsapp-compose/templates.ts` — 7 message templates

### Modified Files

- `src/app/dashboard/layout.tsx` — wrap children with `WhatsAppComposeProvider`
- `src/app/dashboard/appointments/components/appointment-detail.tsx` — replace inline WhatsApp
- `src/app/dashboard/clients/components/client-card.tsx` — replace inline WhatsApp
- `src/app/dashboard/clients/[id]/page.tsx` — replace inline WhatsApp
- `src/app/dashboard/pos/components/checkout-confirmation.tsx` — replace inline WhatsApp
- `src/app/dashboard/reports/clients/page.tsx` — replace inline WhatsApp
- `src/app/dashboard/staff/payroll/page.tsx` — replace inline WhatsApp
- `src/app/dashboard/components/alerts-panel.tsx` — wire no-show alert

### Component Tree

```
dashboard/layout.tsx
  └─ <WhatsAppComposeProvider>
       └─ ...all dashboard children
       └─ <WhatsAppComposeSheet />    ← renders once, always mounted
```

## Hook API

```typescript
interface WhatsAppComposeOptions {
  recipient?: {
    name: string
    phone: string       // any PK format — normalized internally
  }
  template?: TemplateKey
  variables?: Record<string, string>
}

const { open } = useWhatsAppCompose()

// With full context:
open({
  recipient: { name: 'Ayesha', phone: '0321-1234567' },
  template: 'appointment_reminder',
  variables: { time: '2:00 PM', staff_name: 'Sadia' },
})

// No recipient — owner picks manually:
open({ template: 'custom' })

// Minimal — opens with empty sheet:
open({})
```

All fields optional:
- **No recipient** — shows search/manual entry field
- **No template** — defaults to `custom` (free text)
- **No variables** — template shows raw placeholders

## Bottom Sheet UI

```
┌──────────────────────────────────────────┐
│  ─────  (drag handle)                    │
│                                          │
│  Send WhatsApp Message          [  X  ]  │
│                                          │
│  To:                                     │
│  ┌──────────────────────────────────────┐│
│  │ Ayesha Khan  ·  0321-1234567    [X] ││
│  └──────────────────────────────────────┘│
│     or when empty:                       │
│  ┌──────────────────────────────────────┐│
│  │ Search client or type number...      ││
│  └──────────────────────────────────────┘│
│                                          │
│  Template:                               │
│  [Reminder] [Udhaar] [Receipt]           │
│  [Birthday] [No-show] [Thanks] [Custom]  │
│                                          │
│  Message:                                │
│  ┌──────────────────────────────────────┐│
│  │ Reminder: Your appointment is at     ││
│  │ 2:00 PM. Sadia is waiting for you!  ││
│  └──────────────────────────────────────┘│
│  120 characters                          │
│                                          │
│  ┌──────────────────────────────────────┐│
│  │       Open in WhatsApp               ││
│  └──────────────────────────────────────┘│
└──────────────────────────────────────────┘
```

### Behavior

- Template chips are pill-shaped buttons. Tapping one fills the textarea with the substituted message.
- Selecting a different template overwrites the textarea (with confirmation if owner has made manual edits).
- "Open in WhatsApp" calls `window.open(generateWhatsAppLink(phone, message), '_blank')` and closes the sheet.
- Button disabled until both phone and message are non-empty.
- Character count shown below textarea (informational, no hard limit).
- Sheet slides up from bottom with 200ms ease-out animation.
- Design system: gold button, black text, no shadows, square corners, solid borders, 44px touch targets.

## Message Templates

```typescript
type TemplateKey =
  | 'appointment_reminder'
  | 'udhaar_reminder'
  | 'receipt'
  | 'birthday'
  | 'no_show'
  | 'thank_you'
  | 'custom'
```

| Key | Chip Label | Message | Required Variables |
|---|---|---|---|
| `appointment_reminder` | Reminder | "Reminder: Your appointment is at {time}. {staff_name} is waiting for you! — {salon_name}" | time, staff_name, salon_name |
| `udhaar_reminder` | Udhaar | "Dear {name}, your outstanding balance is Rs {amount}. Please clear it on your next visit. Thank you! — {salon_name}" | name, amount, salon_name |
| `receipt` | Receipt | Full formatted receipt (reuse existing `getReceiptText()` pattern from checkout) | bill_number, date, items, total, payment_method, salon_name, salon_address |
| `birthday` | Birthday | "Happy Birthday {name}! Visit {salon_name} today for a special treat. We'd love to see you!" | name, salon_name |
| `no_show` | No-show | "Hi {name}, we missed you at your {time} appointment today. Would you like to reschedule? — {salon_name}" | name, time, salon_name |
| `thank_you` | Thanks | "Thank you for visiting {salon_name}, {name}! We hope you loved your experience. See you next time!" | name, salon_name |
| `custom` | Custom | "" (empty — owner types freely) | none |

**Notes:**
- `{salon_name}` auto-filled from `useAppStore().salon.name` — never typed by owner.
- `receipt` template takes pre-formatted string directly rather than variable substitution. The existing `getReceiptText()` logic in `checkout-confirmation.tsx` must be extracted into `templates.ts` as a shared `formatReceiptMessage()` function so both checkout and the compose sheet can use it.
- English-only for now. Urdu translations can be added to `translations.ts` later.

## Client Search

When recipient field is empty or cleared:

- Debounced 300ms query against `clients` table filtered by `salon_id`
- Searches by `name` (ilike) and `phone` (startsWith)
- Top 5 matches shown in dropdown: "Name · 0321-XXXXXXX"
- Selecting a match fills the recipient
- Raw phone number (starts with `0`, 11+ digits, no client match) shows: "Send to 03XX-XXXXXXX" — accepted with name "Unknown"
- Query runs client-side via existing `supabase` anon client (read-only)
- Empty input shows no dropdown

**Edge cases:**
- Client with no phone → not shown in results
- Client with `whatsapp` field differing from `phone` → prefer `whatsapp`, fall back to `phone`
- Blacklisted clients → still shown (owner may need to contact about udhaar)

## Integration Points

| Location | Current | New |
|---|---|---|
| **Appointment detail** | `sendReminder()` → hardcoded msg → `window.open` | `open({ recipient, template: 'appointment_reminder', variables: { time, staff_name, salon_name } })` |
| **Client card** | "Hi {name}!" → `window.open` | `open({ recipient, template: 'custom', variables: { name } })` |
| **Client profile** | Udhaar reminder → `window.open` | `open({ recipient, template: 'udhaar_reminder', variables: { name, amount, salon_name } })` |
| **Checkout** | `sendWhatsAppReceipt()` → format receipt → `window.open` | `open({ recipient, template: 'receipt', variables: { ...receiptData } })` |
| **Udhaar report** | Single `window.open` + bulk `sendUdhaarAllSequentially()` (tab spam) | Single: same as client profile. Bulk: compose sheet opens once per client sequentially |
| **Payroll** | Salary slip → `window.open` | `open({ recipient: { name: staff.name, phone: staff.phone }, template: 'custom' })` |
| **Alerts panel** | Framework exists, no WhatsApp wired | No-show alert: `open({ template: 'no_show' })` without recipient — owner picks via search |

**Bulk udhaar flow:** Instead of opening multiple browser tabs, the compose sheet opens once per client. Owner reviews, sends, closes, clicks "Next" to open for next client.

## Testing

### Pure function tests (`test/whatsapp-templates.test.ts`)
- Each template substitutes variables correctly
- Missing variables leave placeholder as-is
- `receipt` template formats bill data correctly
- `salon_name` auto-fills from context

### Hook/provider tests (`test/whatsapp-compose.test.tsx`)
- `open()` sets state and shows sheet
- `open()` with recipient pre-fills the field
- `open()` with template pre-fills the textarea
- `open()` without recipient shows search input
- Selecting a different template overwrites message (with confirmation if edited)
- "Open in WhatsApp" button disabled when phone or message empty
- "Open in WhatsApp" calls `window.open` with correct URL
- Closing sheet resets state

### Component rendering tests
- Template chips render all 7 options
- Client search shows results and accepts selection
- Raw phone number input accepted when no client match
- Prefers `whatsapp` field over `phone` field
- Character count updates as message changes
