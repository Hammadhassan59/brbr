# BrBr Launch Readiness — Design Spec

**Date:** 2026-04-06
**Goal:** Make brbr.pk ready for public launch by adding legal pages, trust signals, SEO basics, branded emails, error pages, and PWA fixes.
**Market:** Pakistan only
**Entity:** Inparlor Technologies Pvt Ltd
**Support channels:** WhatsApp + email

---

## 1. New Pages

### 1.1 Privacy Policy — `/privacy`

Static page using shared PublicLayout (dark chrome header/footer).

**Content outline:**
- **Who we are:** Inparlor Technologies Pvt Ltd, Pakistan
- **What we collect:** Salon name, owner phone/email, staff names/phone/PIN, client names/phone, appointment data, billing data, inventory data
- **Why:** To operate the BrBr service
- **Storage:** Supabase (hosted by Supabase Inc., servers outside Pakistan — disclosed). Encrypted in transit (TLS). Session cookies for auth
- **Access:** Only the salon owner and authorized staff via role-based access. Inparlor Technologies staff for support only. No data sold to third parties. Not shared with FBR or any government body
- **Data retention:** Data kept while subscription active. 90 days after account deletion, all data permanently removed
- **Contact:** support email for data questions

**Tone:** Plain language, not legalese. Short paragraphs, clear headings. Last-updated date at top.

### 1.2 Terms of Service — `/terms`

Static page using shared PublicLayout.

**Content outline:**
- **The service:** Cloud-based salon management SaaS
- **Account responsibility:** Owner responsible for staff access, PINs, data accuracy
- **Free trial:** 14 days, no card required. Auto-expires, no surprise billing
- **Billing:** Monthly subscription in PKR
- **Cancellation:** Cancel anytime, access continues until end of billing cycle
- **Uptime:** Best-effort, no SLA guarantee
- **IP:** BrBr owns the software, customer owns their data
- **Termination:** Accounts can be suspended for abuse, non-payment, or illegal activity
- **Liability:** Standard limitation of liability (not liable for indirect damages)
- **Governing law:** Laws of Pakistan

### 1.3 Refund Policy — `/refund`

Static page using shared PublicLayout.

**Content outline:**
- 14-day free trial, no payment taken
- After trial, monthly billing. No refunds for partial months
- Cancel mid-cycle: keep access until cycle ends
- Disputes: contact support via WhatsApp or email

### 1.4 Contact Page — `/contact`

Static page using shared PublicLayout.

**Layout:** Centered, two stacked cards:
- **WhatsApp card:** Icon, phone number, "Quick help, billing, setup assistance"
- **Email card:** Icon, email address, "Formal requests, data questions, billing disputes"
- Business hours: Mon-Sat, 10am-7pm PKT

No contact form. No company info block. No right column.

### 1.5 About Page — `/about`

Static page using shared PublicLayout.

**Layout:**
- **Dark hero** (extending from nav): "Built for Pakistani salons, by people who understand your business"
- **Origin story:** 2-3 paragraphs. Why BrBr exists, the insight about WhatsApp/calculator/notebook workflows
- **Stats bar:** 200+ salons, 15+ cities, 50k+ appointments (bordered, 3-column)
- **Team section:** Placeholder grid with gold avatar squares. Name + role. Expandable later

No company registration block. Entity name only appears in legal pages.

---

## 2. Error Pages

### 2.1 Custom 404 — `src/app/not-found.tsx`

- Dark chrome header (shared PublicLayout header only, no footer needed)
- White content area centered vertically
- Large "404" in gold
- Message: "This page doesn't exist"
- Two buttons: "Go to Dashboard" + "Go Home"

### 2.2 Custom Error — `src/app/error.tsx`

- Client component (Next.js requirement)
- Same dark chrome header
- Message: "Something went wrong"
- "Try again" button (calls `reset()`) + "Contact support on WhatsApp" link

---

## 3. SEO & PWA

### 3.1 robots.txt — `public/robots.txt`

```
User-agent: *
Allow: /
Disallow: /dashboard/
Disallow: /admin/
Disallow: /api/
Sitemap: https://brbr.pk/sitemap.xml
```

### 3.2 Sitemap — `src/app/sitemap.ts`

Next.js metadata API. Static routes only:
- `/` (homepage)
- `/about`
- `/contact`
- `/privacy`
- `/terms`
- `/refund`
- `/login`

No dashboard or admin routes. Weekly changefreq, priority 1.0 for homepage, 0.8 for others.

### 3.3 OG Image — `public/og-image.png`

Static 1200x630 image:
- Dark background (#161616)
- BrBr logo (scissors icon + wordmark) in gold
- Tagline: "Pakistan's Smart Salon System"
- Used for WhatsApp, Facebook, Twitter link previews

Generated as a static SVG converted to PNG via the build process, or hand-crafted as a simple SVG with text elements exported to PNG. No runtime generation needed — this is a static asset.

Add to root layout metadata:
```tsx
openGraph: {
  images: [{ url: '/og-image.png', width: 1200, height: 630 }],
}
```

### 3.4 PWA Icon Fixes

**Generate from existing SVG (`public/icons/icon-192.svg`):**
- `public/favicon.ico` — 32x32, scissors on dark background
- `public/apple-touch-icon.png` — 180x180
- `public/icons/icon-192.png` — 192x192
- `public/icons/icon-512.png` — 512x512

**Fix manifest.json:**
- `background_color`: `#F8F7F4` → `#F2F2F2`
- `theme_color`: `#1A1A2E` → `#1A1A1A`
- Icon entries reference correct PNG paths

**Add to root layout `<head>`:**
```tsx
<link rel="icon" href="/favicon.ico" sizes="32x32" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
```

---

## 4. Email Templates

### 4.1 Shared Email Layout — `src/lib/email-layout.ts`

Function `wrapEmailHtml(body: string, previewText: string): string`

Returns complete HTML email with:
- Dark header strip (#161616) with gold BrBr wordmark
- White body area, max-width 560px
- Dark footer with support links (WhatsApp + email) and unsubscribe placeholder
- All styles inline (email client compatibility)
- No external images (fast on Pakistani mobile networks)

### 4.2 Welcome Email

- **From:** BrBr <hello@brbr.pk>
- **Subject:** "Welcome to BrBr — let's set up your salon"
- **Body:** "Your salon [name] is live on BrBr." Three quick-start bullets:
  1. Add your services
  2. Invite your staff (phone + PIN)
  3. Book your first appointment
- Gold CTA button: "Open Your Dashboard"
- WhatsApp support link at bottom

Function: `welcomeEmail(salonName: string, dashboardUrl: string): string`

### 4.3 Password Reset Email

- **Subject:** "Reset your BrBr password"
- **Body:** "Someone requested a password reset. Click below to set a new password. If you didn't request this, ignore this email."
- Gold CTA button: "Reset Password"
- Expires in 1 hour

Function: `passwordResetEmail(resetUrl: string): string`

### 4.4 Udhaar Reminder (reformat existing)

Wrap the existing `email-templates.ts` udhaar template in the branded layout. No content changes, just visual formatting.

---

## 5. Data Notice (First-Visit Toast)

- Shows on first visit to landing page (`/`) and login page (`/login`)
- Uses react-hot-toast (already installed)
- Message: "BrBr uses cookies to keep you logged in." + link to `/privacy`
- Dismissible. Sets `localStorage.setItem('brbr-data-notice', '1')` on dismiss
- Gold accent on the privacy link
- Does NOT show inside dashboard (user already logged in)
- Not a blocking banner. Not a modal. Just a toast.

---

## 6. Shared Public Layout

### 6.1 Component — `src/components/public-layout.tsx`

Extracts the homepage header and footer into a reusable wrapper.

**Header (from current homepage):**
- Dark chrome (#161616), sticky, z-50
- BrBr logo (scissors + wordmark) left-aligned
- Nav links: Features, Why Choose Us, Pricing, Reviews, FAQs (only shown on homepage, hidden on other pages since they're anchor links)
- "Start Free Trial" gold CTA right-aligned
- On non-homepage pages, nav shows: About, Contact (text links, not anchor links)

**Props:**
```tsx
interface PublicLayoutProps {
  children: React.ReactNode;
  showHomeNav?: boolean; // true on homepage (anchor links), false elsewhere
}
```

**Footer (new 4-column design):**
- Dark chrome (#161616)
- Column 1: BrBr brand + tagline
- Column 2 (Product): Features, Pricing, Login
- Column 3 (Company): About, Contact
- Column 4 (Legal): Privacy Policy, Terms of Service, Refund Policy
- Bottom bar: Copyright + social links
- Mobile: brand stacks on top, links collapse to 3-column grid
- All links use `touch-target`-friendly padding (py-3 px-2)

### 6.2 Pages Using PublicLayout

| Page | Route | showHomeNav |
|------|-------|-------------|
| Homepage | `/` | true |
| About | `/about` | false |
| Contact | `/contact` | false |
| Privacy Policy | `/privacy` | false |
| Terms of Service | `/terms` | false |
| Refund Policy | `/refund` | false |

Login page keeps its own layout (split dark/white design with demo accounts).

### 6.3 Homepage Refactor

The current `page.tsx` has the header and footer inline. Refactor to use PublicLayout:
- Remove inline nav and footer from `page.tsx`
- Wrap in `<PublicLayout showHomeNav>`
- Hero, features, pricing, etc. stay as-is

---

## 7. `.env.example`

Create `/.env.example` with all required env vars documented:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# App
NEXT_PUBLIC_APP_URL=https://brbr.pk
NEXT_PUBLIC_APP_NAME=BrBr
NEXT_PUBLIC_DEMO_MODE=false

# Email (for transactional emails)
# EMAIL_FROM=hello@brbr.pk
# RESEND_API_KEY=your-resend-key

# Support
# SUPPORT_WHATSAPP=923001234567
# SUPPORT_EMAIL=support@brbr.pk
```

Commented lines are optional/future. Uncommented lines are required.

---

## 8. Deliverables Summary

| # | Deliverable | Type | Route/Path |
|---|-------------|------|------------|
| 1 | Privacy Policy | Page | `/privacy` |
| 2 | Terms of Service | Page | `/terms` |
| 3 | Refund Policy | Page | `/refund` |
| 4 | Contact | Page | `/contact` |
| 5 | About | Page | `/about` |
| 6 | Custom 404 | Page | `not-found.tsx` |
| 7 | Custom Error | Page | `error.tsx` |
| 8 | PublicLayout | Component | `src/components/public-layout.tsx` |
| 9 | Homepage refactor | Refactor | `src/app/page.tsx` |
| 10 | Footer (new) | Component | Part of PublicLayout |
| 11 | robots.txt | SEO | `public/robots.txt` |
| 12 | Sitemap | SEO | `src/app/sitemap.ts` |
| 13 | OG Image | SEO | `public/og-image.png` |
| 14 | Favicon + icons | PWA | `public/favicon.ico`, `apple-touch-icon.png`, icon PNGs |
| 15 | Manifest fix | PWA | `public/manifest.json` |
| 16 | Email layout | Email | `src/lib/email-layout.ts` |
| 17 | Welcome email | Email | `src/lib/email-templates.ts` |
| 18 | Password reset email | Email | `src/lib/email-templates.ts` |
| 19 | Udhaar email reformat | Email | `src/lib/email-templates.ts` |
| 20 | Data notice toast | Feature | `src/components/data-notice.tsx` |
| 21 | .env.example | Config | `/.env.example` |

---

## Out of Scope

These are real gaps but not needed for launch day:
- Payment gateway integration (Stripe, JazzCash API)
- Error monitoring (Sentry)
- Automated tests / CI pipeline
- Analytics (Mixpanel, GA)
- Database backup strategy
- Newsletter / email marketing
- Blog
- Changelog
