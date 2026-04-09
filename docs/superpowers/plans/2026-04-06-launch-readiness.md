# BrBr Launch Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make brbr.pk launch-ready with legal pages, trust signals, SEO basics, branded emails, error pages, and PWA fixes.

**Architecture:** Extract the homepage header/footer into a shared `PublicLayout` component, then build 5 new public pages, 2 error pages, SEO files, email templates, and a data notice toast. All public pages use the same dark chrome header/footer. No new dependencies needed.

**Tech Stack:** Next.js 16, React 19, Tailwind 4, Lucide icons, react-hot-toast (already installed)

**Spec:** `docs/superpowers/specs/2026-04-06-launch-readiness-design.md`

---

## File Structure

```
src/
├── app/
│   ├── page.tsx                          # MODIFY — remove inline header/footer, wrap in PublicLayout
│   ├── layout.tsx                        # MODIFY — add og:image + favicon meta
│   ├── not-found.tsx                     # CREATE — custom 404 page
│   ├── error.tsx                         # CREATE — custom error page
│   ├── sitemap.ts                        # CREATE — static sitemap
│   ├── privacy/page.tsx                  # CREATE — privacy policy
│   ├── terms/page.tsx                    # CREATE — terms of service
│   ├── refund/page.tsx                   # CREATE — refund policy
│   ├── contact/page.tsx                  # CREATE — contact/support page
│   └── about/page.tsx                    # CREATE — about page
├── components/
│   ├── public-layout.tsx                 # CREATE — shared header + footer
│   └── data-notice.tsx                   # CREATE — first-visit cookie toast
├── lib/
│   ├── email-layout.ts                   # CREATE — branded email wrapper
│   └── email-templates.ts               # MODIFY — add welcome, password reset, reformat udhaar
public/
├── robots.txt                            # CREATE
├── og-image.svg                          # CREATE — OG image source (SVG)
├── manifest.json                         # MODIFY — fix colors
├── favicon.svg                           # CREATE — browser tab icon
├── apple-touch-icon.svg                  # CREATE — iOS home screen icon
└── icons/
    └── icon-192.svg                      # EXISTS — update colors to match design system
.env.example                              # CREATE
```

Note on icons: We'll use SVG favicons (supported by all modern browsers) instead of generating PNGs, since we don't have an image conversion tool installed. The manifest icons remain SVG-compatible or we'll create simple SVG versions.

---

### Task 1: PublicLayout Component

**Files:**
- Create: `src/components/public-layout.tsx`

This is the foundation everything else depends on. Extract the dark chrome header and build the new 4-column footer.

- [ ] **Step 1: Create PublicLayout component**

```tsx
// src/components/public-layout.tsx
'use client';

import Link from 'next/link';
import { Scissors } from 'lucide-react';

interface PublicLayoutProps {
  children: React.ReactNode;
  showHomeNav?: boolean;
}

export function PublicLayout({ children, showHomeNav = false }: PublicLayoutProps) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* ── Header ── */}
      <nav className="sticky top-0 z-50 bg-[#161616] border-b border-[#222]">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center">
          <Link href="/" className="flex items-center gap-2 font-heading font-bold text-lg tracking-tight text-[#EFEFEF] touch-target">
            <Scissors className="w-5 h-5 text-gold" />
            BRBR
          </Link>

          {showHomeNav ? (
            <div className="hidden md:flex items-center gap-8 ml-12 text-sm">
              <a href="#features" className="text-[#EFEFEF]/50 hover:text-[#EFEFEF] transition-colors py-3">Features</a>
              <a href="#why-us" className="text-[#EFEFEF]/50 hover:text-[#EFEFEF] transition-colors py-3">Why Choose Us</a>
              <a href="#pricing" className="text-[#EFEFEF]/50 hover:text-[#EFEFEF] transition-colors py-3">Pricing</a>
              <a href="#reviews" className="text-[#EFEFEF]/50 hover:text-[#EFEFEF] transition-colors py-3">Reviews</a>
              <a href="#faq" className="text-[#EFEFEF]/50 hover:text-[#EFEFEF] transition-colors py-3">FAQs</a>
            </div>
          ) : (
            <div className="hidden md:flex items-center gap-8 ml-12 text-sm">
              <Link href="/about" className="text-[#EFEFEF]/50 hover:text-[#EFEFEF] transition-colors py-3">About</Link>
              <Link href="/contact" className="text-[#EFEFEF]/50 hover:text-[#EFEFEF] transition-colors py-3">Contact</Link>
            </div>
          )}

          <div className="ml-auto">
            <Link href="/login" className="bg-gold text-black px-5 py-2.5 text-sm font-bold hover:bg-gold/90 transition-colors touch-target inline-flex items-center">
              Start Free Trial
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Content ── */}
      <main className="flex-1">{children}</main>

      {/* ── Footer ── */}
      <footer className="bg-[#161616] border-t border-[#222] pt-10 pb-6">
        <div className="max-w-6xl mx-auto px-5">
          {/* 4-column grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <Scissors className="w-4 h-4 text-gold" />
                <span className="font-heading font-bold text-base text-[#EFEFEF] tracking-tight">BRBR</span>
              </div>
              <p className="text-[11px] text-[#EFEFEF]/40 leading-relaxed max-w-[200px]">
                Pakistan&apos;s Smart Salon System. Bookings, billing, staff, inventory — all in one place.
              </p>
            </div>

            {/* Product */}
            <div>
              <p className="text-[10px] font-bold tracking-[0.1em] text-[#EFEFEF]/60 uppercase mb-3">Product</p>
              <div className="flex flex-col gap-1">
                <Link href="/#features" className="text-xs text-[#EFEFEF]/50 hover:text-[#EFEFEF] transition-colors py-1.5">Features</Link>
                <Link href="/#pricing" className="text-xs text-[#EFEFEF]/50 hover:text-[#EFEFEF] transition-colors py-1.5">Pricing</Link>
                <Link href="/login" className="text-xs text-[#EFEFEF]/50 hover:text-[#EFEFEF] transition-colors py-1.5">Login</Link>
              </div>
            </div>

            {/* Company */}
            <div>
              <p className="text-[10px] font-bold tracking-[0.1em] text-[#EFEFEF]/60 uppercase mb-3">Company</p>
              <div className="flex flex-col gap-1">
                <Link href="/about" className="text-xs text-[#EFEFEF]/50 hover:text-[#EFEFEF] transition-colors py-1.5">About</Link>
                <Link href="/contact" className="text-xs text-[#EFEFEF]/50 hover:text-[#EFEFEF] transition-colors py-1.5">Contact</Link>
              </div>
            </div>

            {/* Legal */}
            <div>
              <p className="text-[10px] font-bold tracking-[0.1em] text-[#EFEFEF]/60 uppercase mb-3">Legal</p>
              <div className="flex flex-col gap-1">
                <Link href="/privacy" className="text-xs text-[#EFEFEF]/50 hover:text-[#EFEFEF] transition-colors py-1.5">Privacy Policy</Link>
                <Link href="/terms" className="text-xs text-[#EFEFEF]/50 hover:text-[#EFEFEF] transition-colors py-1.5">Terms of Service</Link>
                <Link href="/refund" className="text-xs text-[#EFEFEF]/50 hover:text-[#EFEFEF] transition-colors py-1.5">Refund Policy</Link>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="border-t border-[#222] pt-4 flex flex-col md:flex-row items-center justify-between gap-3">
            <p className="text-[10px] text-[#EFEFEF]/30">© 2025 BrBr. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <a href="#" className="text-[10px] text-[#EFEFEF]/30 hover:text-[#EFEFEF] transition-colors py-2">LinkedIn</a>
              <a href="#" className="text-[10px] text-[#EFEFEF]/30 hover:text-[#EFEFEF] transition-colors py-2">Instagram</a>
              <a href="#" className="text-[10px] text-[#EFEFEF]/30 hover:text-[#EFEFEF] transition-colors py-2">Facebook</a>
              <a href="#" className="text-[10px] text-[#EFEFEF]/30 hover:text-[#EFEFEF] transition-colors py-2">Twitter</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/user1/brbr && npx next build --no-lint 2>&1 | tail -5`
Expected: No errors referencing `public-layout.tsx` (component not imported yet, so no build impact)

- [ ] **Step 3: Commit**

```bash
git add src/components/public-layout.tsx
git commit -m "feat: add PublicLayout component with dark chrome header and 4-column footer"
```

---

### Task 2: Refactor Homepage to Use PublicLayout

**Files:**
- Modify: `src/app/page.tsx`

Remove the inline nav and footer from the homepage. Wrap content in PublicLayout.

- [ ] **Step 1: Remove inline nav from page.tsx**

Replace the opening `<div>` through the closing `</nav>` (lines 119-140 area) with the PublicLayout wrapper. Add the import at the top. Remove the `Scissors` import if it's only used in nav/footer (check first — it's also used in hero CTAs, so keep it).

The file currently starts the return with:
```tsx
return (
    <div className="min-h-screen bg-white">
      {/* ── Nav Bar ── */}
      <nav className="sticky top-0 z-50 bg-[#161616] border-b border-[#222]">
        ...
      </nav>
```

Change to:
```tsx
return (
    <PublicLayout showHomeNav>
```

Add import at top of file:
```tsx
import { PublicLayout } from '@/components/public-layout';
```

- [ ] **Step 2: Remove inline footer from page.tsx**

Replace the footer section and closing `</div>` at the bottom:
```tsx
      {/* ── Footer ── */}
      <footer className="bg-[#161616] border-t border-[#222] py-8">
        ...
      </footer>
    </div>
```

With just:
```tsx
    </PublicLayout>
```

- [ ] **Step 3: Verify the homepage renders**

Run: `cd /Users/user1/brbr && npx next build --no-lint 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "refactor: homepage uses PublicLayout, removes inline header/footer"
```

---

### Task 3: Legal Pages (Privacy, Terms, Refund)

**Files:**
- Create: `src/app/privacy/page.tsx`
- Create: `src/app/terms/page.tsx`
- Create: `src/app/refund/page.tsx`

All three follow the same pattern: PublicLayout wrapper, prose content with headings, last-updated date. Written in plain language for Pakistani salon owners.

- [ ] **Step 1: Create Privacy Policy page**

```tsx
// src/app/privacy/page.tsx
import { PublicLayout } from '@/components/public-layout';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — BrBr',
  description: 'How BrBr collects, stores, and protects your salon data.',
};

export default function PrivacyPage() {
  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto px-5 py-16 md:py-24">
        <p className="text-[11px] text-[#1A1A1A]/40 mb-2">Last updated: April 6, 2026</p>
        <h1 className="font-heading text-3xl md:text-4xl font-bold text-[#1A1A1A] mb-8">Privacy Policy</h1>

        <div className="space-y-8 text-sm text-[#1A1A1A]/70 leading-relaxed">
          <section>
            <h2 className="font-heading text-lg font-bold text-[#1A1A1A] mb-3">Who we are</h2>
            <p>BrBr is a salon management platform operated by Inparlor Technologies Pvt Ltd, registered in Pakistan. This policy explains what data we collect, why, and how we protect it.</p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-bold text-[#1A1A1A] mb-3">What we collect</h2>
            <p className="mb-3">When you use BrBr, we collect the following information:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>Salon information:</strong> Salon name, branch details, business type, services offered, pricing</li>
              <li><strong>Owner information:</strong> Name, phone number, email address</li>
              <li><strong>Staff information:</strong> Names, phone numbers, 4-digit PINs, roles, commission rates, attendance</li>
              <li><strong>Client information:</strong> Names, phone numbers, appointment history, billing history, outstanding balances (udhaar)</li>
              <li><strong>Transaction data:</strong> Bills, payment methods (cash, JazzCash, EasyPaisa, card), amounts, tips</li>
              <li><strong>Inventory data:</strong> Products, stock levels, supplier information, purchase orders</li>
            </ul>
          </section>

          <section>
            <h2 className="font-heading text-lg font-bold text-[#1A1A1A] mb-3">Why we collect it</h2>
            <p>We collect this data only to operate the BrBr service — to let you manage appointments, billing, staff, and inventory. We do not use your data for advertising, profiling, or any purpose other than running your salon management system.</p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-bold text-[#1A1A1A] mb-3">How we store it</h2>
            <p className="mb-3">Your data is stored on servers operated by Supabase Inc. These servers are located outside Pakistan. All data is encrypted during transfer using TLS (the same security used by banks).</p>
            <p>We use session cookies to keep you logged in. These cookies are essential for the service to work and cannot be disabled.</p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-bold text-[#1A1A1A] mb-3">Who can see your data</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>You and your authorized staff</strong> — based on the role and access level you assign to each staff member</li>
              <li><strong>Inparlor Technologies support team</strong> — only when you contact us for help, and only the data needed to resolve your issue</li>
            </ul>
            <p className="mt-3 font-semibold text-[#1A1A1A]">We never sell your data to anyone. We do not share your data with FBR or any government body. Your business data is yours.</p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-bold text-[#1A1A1A] mb-3">How long we keep it</h2>
            <p>Your data remains in the system while your account is active. If you delete your account, all your data is permanently removed within 90 days.</p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-bold text-[#1A1A1A] mb-3">Questions</h2>
            <p>If you have questions about your data or want to request deletion, email us at <a href="mailto:support@brbr.pk" className="text-gold hover:underline">support@brbr.pk</a>.</p>
          </section>
        </div>
      </div>
    </PublicLayout>
  );
}
```

- [ ] **Step 2: Create Terms of Service page**

```tsx
// src/app/terms/page.tsx
import { PublicLayout } from '@/components/public-layout';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — BrBr',
  description: 'Terms and conditions for using BrBr salon management system.',
};

export default function TermsPage() {
  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto px-5 py-16 md:py-24">
        <p className="text-[11px] text-[#1A1A1A]/40 mb-2">Last updated: April 6, 2026</p>
        <h1 className="font-heading text-3xl md:text-4xl font-bold text-[#1A1A1A] mb-8">Terms of Service</h1>

        <div className="space-y-8 text-sm text-[#1A1A1A]/70 leading-relaxed">
          <section>
            <h2 className="font-heading text-lg font-bold text-[#1A1A1A] mb-3">The service</h2>
            <p>BrBr is a cloud-based salon management system provided by Inparlor Technologies Pvt Ltd. It includes appointment booking, point-of-sale billing, staff management, inventory tracking, and reporting tools.</p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-bold text-[#1A1A1A] mb-3">Your account</h2>
            <p>You are responsible for keeping your account credentials secure. As the salon owner, you are responsible for managing staff access levels and PINs. Any actions taken by staff using their assigned PINs are your responsibility.</p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-bold text-[#1A1A1A] mb-3">Free trial</h2>
            <p>New accounts start with a 14-day free trial. No credit card or payment information is required. When the trial ends, your account is paused — we will never charge you without your explicit consent.</p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-bold text-[#1A1A1A] mb-3">Billing</h2>
            <p>After the trial, BrBr is billed monthly in Pakistani Rupees (PKR). Prices are listed on our pricing page. We will notify you before any price changes take effect.</p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-bold text-[#1A1A1A] mb-3">Cancellation</h2>
            <p>You can cancel your subscription at any time. When you cancel, you keep access to BrBr until the end of your current billing cycle. After that, your account is paused but your data is preserved for 90 days in case you want to come back.</p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-bold text-[#1A1A1A] mb-3">Availability</h2>
            <p>We work hard to keep BrBr available at all times, but we cannot guarantee 100% uptime. Scheduled maintenance will be announced in advance. We are not liable for any losses caused by temporary unavailability.</p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-bold text-[#1A1A1A] mb-3">Your data</h2>
            <p>You own all the data you put into BrBr — salon information, client records, billing history, everything. We own the BrBr software. See our <a href="/privacy" className="text-gold hover:underline">Privacy Policy</a> for details on how we handle your data.</p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-bold text-[#1A1A1A] mb-3">Account suspension</h2>
            <p>We may suspend or terminate accounts that are used for illegal activity, abuse of the platform, or non-payment after multiple reminders. We will always try to contact you before taking action.</p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-bold text-[#1A1A1A] mb-3">Limitation of liability</h2>
            <p>BrBr is provided &ldquo;as is.&rdquo; We are not liable for any indirect, incidental, or consequential damages arising from your use of the service. Our total liability is limited to the amount you paid us in the last 3 months.</p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-bold text-[#1A1A1A] mb-3">Governing law</h2>
            <p>These terms are governed by the laws of Pakistan. Any disputes will be resolved in the courts of Pakistan.</p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-bold text-[#1A1A1A] mb-3">Changes</h2>
            <p>We may update these terms from time to time. We will notify you of significant changes via email or an in-app notification. Continued use of BrBr after changes take effect means you accept the updated terms.</p>
          </section>
        </div>
      </div>
    </PublicLayout>
  );
}
```

- [ ] **Step 3: Create Refund Policy page**

```tsx
// src/app/refund/page.tsx
import { PublicLayout } from '@/components/public-layout';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Refund Policy — BrBr',
  description: 'BrBr refund and cancellation policy.',
};

export default function RefundPage() {
  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto px-5 py-16 md:py-24">
        <p className="text-[11px] text-[#1A1A1A]/40 mb-2">Last updated: April 6, 2026</p>
        <h1 className="font-heading text-3xl md:text-4xl font-bold text-[#1A1A1A] mb-8">Refund Policy</h1>

        <div className="space-y-8 text-sm text-[#1A1A1A]/70 leading-relaxed">
          <section>
            <h2 className="font-heading text-lg font-bold text-[#1A1A1A] mb-3">Free trial</h2>
            <p>Every BrBr account starts with a 14-day free trial. No payment is taken during the trial. If the trial ends and you decide not to continue, nothing happens — no charge, no penalty.</p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-bold text-[#1A1A1A] mb-3">After you subscribe</h2>
            <p>BrBr is billed monthly. We do not offer refunds for partial months. If you cancel on day 10 of a 30-day cycle, you keep full access for the remaining 20 days.</p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-bold text-[#1A1A1A] mb-3">How to cancel</h2>
            <p>You can cancel your subscription from the Settings page in your dashboard, or by contacting us on WhatsApp or email. Cancellation takes effect at the end of your current billing cycle.</p>
          </section>

          <section>
            <h2 className="font-heading text-lg font-bold text-[#1A1A1A] mb-3">Disputes</h2>
            <p>If you believe you were charged incorrectly, contact us within 30 days:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>WhatsApp: <a href="https://wa.me/923001234567" className="text-gold hover:underline">+92 300 123 4567</a></li>
              <li>Email: <a href="mailto:support@brbr.pk" className="text-gold hover:underline">support@brbr.pk</a></li>
            </ul>
            <p className="mt-3">We will investigate and resolve billing disputes within 7 business days.</p>
          </section>
        </div>
      </div>
    </PublicLayout>
  );
}
```

- [ ] **Step 4: Verify all three pages build**

Run: `cd /Users/user1/brbr && npx next build --no-lint 2>&1 | tail -10`
Expected: Build succeeds, routes `/privacy`, `/terms`, `/refund` appear in output

- [ ] **Step 5: Commit**

```bash
git add src/app/privacy/page.tsx src/app/terms/page.tsx src/app/refund/page.tsx
git commit -m "feat: add privacy policy, terms of service, and refund policy pages"
```

---

### Task 4: Contact Page

**Files:**
- Create: `src/app/contact/page.tsx`

- [ ] **Step 1: Create Contact page**

```tsx
// src/app/contact/page.tsx
import { PublicLayout } from '@/components/public-layout';
import { MessageCircle, Mail, Clock } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact — BrBr',
  description: 'Get in touch with BrBr support via WhatsApp or email.',
};

export default function ContactPage() {
  return (
    <PublicLayout>
      <div className="max-w-2xl mx-auto px-5 py-16 md:py-24">
        <h1 className="font-heading text-3xl md:text-4xl font-bold text-[#1A1A1A] mb-2">Get in Touch</h1>
        <p className="text-sm text-[#1A1A1A]/50 mb-10">We usually reply within a few hours during business hours.</p>

        <div className="space-y-4">
          {/* WhatsApp */}
          <a
            href="https://wa.me/923001234567"
            target="_blank"
            rel="noopener noreferrer"
            className="block border border-[#E8E8E8] p-6 hover:border-[#1A1A1A]/20 transition-colors"
          >
            <div className="flex items-center gap-3 mb-2">
              <MessageCircle className="w-5 h-5 text-green-500" />
              <span className="font-heading font-bold text-base text-[#1A1A1A]">WhatsApp</span>
            </div>
            <p className="text-sm text-[#1A1A1A]/50 mb-3">Quick help, billing questions, and setup assistance.</p>
            <span className="text-sm font-semibold text-[#1A1A1A]">+92 300 123 4567</span>
          </a>

          {/* Email */}
          <a
            href="mailto:support@brbr.pk"
            className="block border border-[#E8E8E8] p-6 hover:border-[#1A1A1A]/20 transition-colors"
          >
            <div className="flex items-center gap-3 mb-2">
              <Mail className="w-5 h-5 text-gold" />
              <span className="font-heading font-bold text-base text-[#1A1A1A]">Email</span>
            </div>
            <p className="text-sm text-[#1A1A1A]/50 mb-3">Formal requests, data questions, and billing disputes.</p>
            <span className="text-sm font-semibold text-[#1A1A1A]">support@brbr.pk</span>
          </a>

          {/* Hours */}
          <div className="border border-[#E8E8E8] bg-[#FAFAFA] p-6">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="w-5 h-5 text-[#1A1A1A]/40" />
              <span className="font-heading font-bold text-base text-[#1A1A1A]">Business Hours</span>
            </div>
            <p className="text-sm text-[#1A1A1A]/50">Monday — Saturday, 10am — 7pm PKT</p>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/contact/page.tsx
git commit -m "feat: add contact page with WhatsApp and email support channels"
```

---

### Task 5: About Page

**Files:**
- Create: `src/app/about/page.tsx`

- [ ] **Step 1: Create About page**

```tsx
// src/app/about/page.tsx
import { PublicLayout } from '@/components/public-layout';
import { Scissors } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About — BrBr',
  description: 'BrBr is built for Pakistani salons, by people who understand your business.',
};

export default function AboutPage() {
  return (
    <PublicLayout>
      {/* Dark hero */}
      <section className="bg-[#161616] border-b border-[#222]">
        <div className="max-w-3xl mx-auto px-5 pt-16 pb-14 md:pt-24 md:pb-20">
          <p className="text-[10px] font-bold tracking-[0.15em] text-gold uppercase mb-3">About BrBr</p>
          <h1 className="font-heading text-3xl md:text-4xl font-bold text-[#EFEFEF] leading-tight mb-4">
            Built for Pakistani salons, by people who understand your business
          </h1>
          <p className="text-base text-[#EFEFEF]/50 max-w-lg leading-relaxed">
            Every salon owner in Pakistan runs their business on WhatsApp, a calculator, and a notebook. We built BrBr to replace all three.
          </p>
        </div>
      </section>

      {/* Story */}
      <div className="max-w-3xl mx-auto px-5 py-16 md:py-24">
        <section className="mb-16">
          <h2 className="font-heading text-xl font-bold text-[#1A1A1A] mb-4">Why we built this</h2>
          <div className="space-y-4 text-sm text-[#1A1A1A]/60 leading-relaxed">
            <p>
              Walk into any salon in Pakistan and you will see the same thing. A register notebook with scribbled numbers. A calculator with worn-out buttons. A WhatsApp group where bookings get lost between memes and good morning messages.
            </p>
            <p>
              Salon owners are running real businesses — paying staff, tracking commissions, managing inventory, handling udhaar — but they are doing it all by hand. Not because they want to, but because the software that exists was not built for them. It does not support JazzCash. It does not understand udhaar. It does not block Jummah prayer time.
            </p>
            <p>
              BrBr is different. We built it from day one for Pakistani salons. Phone number and PIN login, because your staff does not have email. Cash and JazzCash side by side, because that is how your customers pay. Udhaar tracking with limits, because that is how trust works in this business.
            </p>
          </div>
        </section>

        {/* Stats */}
        <div className="border border-[#E8E8E8] flex divide-x divide-[#E8E8E8] mb-16">
          {[
            { value: '200+', label: 'Salons' },
            { value: '15+', label: 'Cities' },
            { value: '50k+', label: 'Appointments' },
          ].map((stat) => (
            <div key={stat.label} className="flex-1 py-5 text-center">
              <span className="block font-heading text-2xl font-bold text-gold">{stat.value}</span>
              <span className="block text-[10px] text-[#1A1A1A]/40 mt-1 uppercase tracking-wider">{stat.label}</span>
            </div>
          ))}
        </div>

        {/* Team */}
        <section>
          <h2 className="font-heading text-xl font-bold text-[#1A1A1A] mb-6">The Team</h2>
          <div className="flex flex-wrap gap-6">
            <div className="text-center">
              <div className="w-20 h-20 bg-gold/10 border border-gold/20 flex items-center justify-center mb-3">
                <Scissors className="w-6 h-6 text-gold" />
              </div>
              <p className="text-sm font-semibold text-[#1A1A1A]">Founder</p>
              <p className="text-[11px] text-[#1A1A1A]/40">CEO</p>
            </div>
          </div>
        </section>
      </div>
    </PublicLayout>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/about/page.tsx
git commit -m "feat: add about page with origin story, stats, and team section"
```

---

### Task 6: Error Pages (404 and Error)

**Files:**
- Create: `src/app/not-found.tsx`
- Create: `src/app/error.tsx`

- [ ] **Step 1: Create 404 page**

```tsx
// src/app/not-found.tsx
import Link from 'next/link';
import { Scissors } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <nav className="bg-[#161616] border-b border-[#222]">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center">
          <Link href="/" className="flex items-center gap-2 font-heading font-bold text-lg tracking-tight text-[#EFEFEF]">
            <Scissors className="w-5 h-5 text-gold" />
            BRBR
          </Link>
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-5">
        <div className="text-center">
          <h1 className="font-heading text-7xl md:text-8xl font-bold text-gold mb-4">404</h1>
          <p className="text-lg text-[#1A1A1A]/60 mb-8">This page doesn&apos;t exist.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/dashboard" className="bg-[#1A1A1A] text-white px-6 py-3 text-sm font-semibold hover:bg-[#333] transition-colors touch-target inline-flex items-center">
              Go to Dashboard
            </Link>
            <Link href="/" className="border border-[#D4D4D4] text-[#1A1A1A] px-6 py-3 text-sm font-semibold hover:border-[#1A1A1A] transition-colors touch-target inline-flex items-center">
              Go Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create error page**

```tsx
// src/app/error.tsx
'use client';

import Link from 'next/link';
import { Scissors } from 'lucide-react';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <nav className="bg-[#161616] border-b border-[#222]">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center">
          <Link href="/" className="flex items-center gap-2 font-heading font-bold text-lg tracking-tight text-[#EFEFEF]">
            <Scissors className="w-5 h-5 text-gold" />
            BRBR
          </Link>
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-5">
        <div className="text-center">
          <h1 className="font-heading text-3xl md:text-4xl font-bold text-[#1A1A1A] mb-3">Something went wrong</h1>
          <p className="text-sm text-[#1A1A1A]/50 mb-8 max-w-md mx-auto">An unexpected error occurred. Try again, or contact us if the problem continues.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <button onClick={reset} className="bg-[#1A1A1A] text-white px-6 py-3 text-sm font-semibold hover:bg-[#333] transition-colors touch-target">
              Try Again
            </button>
            <a href="https://wa.me/923001234567" target="_blank" rel="noopener noreferrer" className="border border-[#D4D4D4] text-[#1A1A1A] px-6 py-3 text-sm font-semibold hover:border-[#1A1A1A] transition-colors touch-target inline-flex items-center">
              Contact Support
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/not-found.tsx src/app/error.tsx
git commit -m "feat: add custom 404 and error pages with BrBr branding"
```

---

### Task 7: SEO Files (robots.txt, sitemap, OG image)

**Files:**
- Create: `public/robots.txt`
- Create: `src/app/sitemap.ts`
- Create: `public/og-image.svg`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Create robots.txt**

```
User-agent: *
Allow: /
Disallow: /dashboard/
Disallow: /admin/
Disallow: /api/
Sitemap: https://brbr.pk/sitemap.xml
```

- [ ] **Step 2: Create sitemap.ts**

```tsx
// src/app/sitemap.ts
import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://brbr.pk';

  return [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    { url: `${baseUrl}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/contact`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/privacy`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/terms`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/refund`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/login`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
  ];
}
```

- [ ] **Step 3: Create OG image as SVG**

```svg
<!-- public/og-image.svg -->
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#161616"/>
  <text x="600" y="280" text-anchor="middle" font-family="Inter, sans-serif" font-weight="700" font-size="72" fill="#F0B000">✂ BRBR</text>
  <text x="600" y="360" text-anchor="middle" font-family="Inter, sans-serif" font-weight="400" font-size="28" fill="#EFEFEF" opacity="0.5">Pakistan's Smart Salon System</text>
  <text x="600" y="410" text-anchor="middle" font-family="Inter, sans-serif" font-weight="400" font-size="18" fill="#EFEFEF" opacity="0.3">Bookings · Billing · Staff · Inventory</text>
</svg>
```

- [ ] **Step 4: Add OG image to root layout metadata**

In `src/app/layout.tsx`, update the `metadata` export to add the `openGraph.images` array and twitter card:

```tsx
openGraph: {
  title: "BrBr — Pakistan's Smart Salon POS System",
  description: 'Bookings, Payments, Staff, Inventory — all in one place',
  siteName: 'BrBr',
  images: [{ url: '/og-image.svg', width: 1200, height: 630, alt: "BrBr — Pakistan's Smart Salon System" }],
},
twitter: {
  card: 'summary_large_image',
  title: "BrBr — Pakistan's Smart Salon POS System",
  description: 'Bookings, Payments, Staff, Inventory — all in one place',
  images: ['/og-image.svg'],
},
```

- [ ] **Step 5: Commit**

```bash
git add public/robots.txt src/app/sitemap.ts public/og-image.svg src/app/layout.tsx
git commit -m "feat: add robots.txt, sitemap, OG image, and social meta tags"
```

---

### Task 8: PWA Icon Fixes

**Files:**
- Create: `public/favicon.svg`
- Create: `public/apple-touch-icon.svg`
- Modify: `public/icons/icon-192.svg`
- Modify: `public/manifest.json`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Create favicon.svg**

A simple SVG favicon with the scissors/BrBr mark on dark background:

```svg
<!-- public/favicon.svg -->
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="#161616"/>
  <text x="16" y="22" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="14" fill="#F0B000">B</text>
</svg>
```

- [ ] **Step 2: Create apple-touch-icon.svg**

```svg
<!-- public/apple-touch-icon.svg -->
<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
  <rect width="180" height="180" fill="#161616"/>
  <text x="90" y="105" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="48" fill="#F0B000">BrBr</text>
</svg>
```

- [ ] **Step 3: Update icon-192.svg colors**

Update the existing `public/icons/icon-192.svg` to use the correct design system colors:

Replace `fill="#1A1A2E"` with `fill="#161616"` and `fill="#C9A84C"` with `fill="#F0B000"` and `stroke="#C9A84C"` with `stroke="#F0B000"`.

- [ ] **Step 4: Fix manifest.json**

Update `public/manifest.json`:
- Change `background_color` from `#F8F7F4` to `#F2F2F2`
- Change `theme_color` from `#1A1A2E` to `#1A1A1A`
- Change icon type from `image/png` to `image/svg+xml` and paths to `.svg`

```json
{
  "name": "BrBr — Pakistan ka Smart Salon System",
  "short_name": "BrBr",
  "description": "Salon & Barber POS System for Pakistan",
  "start_url": "/dashboard",
  "display": "standalone",
  "background_color": "#F2F2F2",
  "theme_color": "#1A1A1A",
  "orientation": "any",
  "icons": [
    {
      "src": "/icons/icon-192.svg",
      "sizes": "192x192",
      "type": "image/svg+xml"
    },
    {
      "src": "/icons/icon-192.svg",
      "sizes": "512x512",
      "type": "image/svg+xml"
    }
  ]
}
```

- [ ] **Step 5: Add favicon and apple-touch-icon to layout.tsx**

In the root layout, add icon links inside the metadata export. Find the existing `metadata` object and add:

```tsx
icons: {
  icon: '/favicon.svg',
  apple: '/apple-touch-icon.svg',
},
```

- [ ] **Step 6: Commit**

```bash
git add public/favicon.svg public/apple-touch-icon.svg public/icons/icon-192.svg public/manifest.json src/app/layout.tsx
git commit -m "fix: PWA icons, favicon, apple-touch-icon, and manifest colors"
```

---

### Task 9: Email Layout and Templates

**Files:**
- Create: `src/lib/email-layout.ts`
- Modify: `src/lib/email-templates.ts`

- [ ] **Step 1: Create branded email layout**

```tsx
// src/lib/email-layout.ts

export function wrapEmailHtml(body: string, previewText: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BrBr</title>
  <style>body{margin:0;padding:0;font-family:Inter,-apple-system,sans-serif;}</style>
  <!--[if mso]><style>body,table,td{font-family:Arial,sans-serif !important;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#F2F2F2;">
  <!-- Preview text -->
  <div style="display:none;max-height:0;overflow:hidden;">${previewText}</div>
  
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F2F2F2;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background-color:#161616;padding:20px 24px;text-align:left;">
              <span style="color:#F0B000;font-size:20px;font-weight:700;letter-spacing:-0.02em;">✂ BRBR</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background-color:#FFFFFF;padding:32px 24px;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#161616;padding:20px 24px;">
              <p style="margin:0 0 8px 0;font-size:12px;color:#EFEFEF80;">Need help? We are here for you.</p>
              <p style="margin:0;font-size:12px;">
                <a href="https://wa.me/923001234567" style="color:#F0B000;text-decoration:none;">WhatsApp</a>
                <span style="color:#EFEFEF30;"> · </span>
                <a href="mailto:support@brbr.pk" style="color:#F0B000;text-decoration:none;">support@brbr.pk</a>
              </p>
              <p style="margin:16px 0 0 0;font-size:10px;color:#EFEFEF30;">© 2025 BrBr by Inparlor Technologies Pvt Ltd</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function emailButton(text: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td style="background-color:#F0B000;padding:12px 24px;">
        <a href="${url}" style="color:#000000;font-size:14px;font-weight:700;text-decoration:none;display:inline-block;">${text}</a>
      </td>
    </tr>
  </table>`;
}
```

- [ ] **Step 2: Add welcome and password reset email functions to email-templates.ts**

Add these functions to the bottom of `src/lib/email-templates.ts`:

```tsx
import { wrapEmailHtml, emailButton } from './email-layout';

export function welcomeEmail(salonName: string, dashboardUrl: string): string {
  const body = `
    <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:700;color:#1A1A1A;">Welcome to BrBr!</h1>
    <p style="margin:0 0 20px 0;font-size:14px;color:#666666;line-height:1.6;">Your salon <strong style="color:#1A1A1A;">${salonName}</strong> is live on BrBr. Here is how to get started:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
      <tr><td style="padding:6px 0;font-size:14px;color:#1A1A1A;">
        <span style="color:#F0B000;font-weight:700;">1.</span> Add your services and set prices
      </td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#1A1A1A;">
        <span style="color:#F0B000;font-weight:700;">2.</span> Invite your staff — they log in with phone + PIN
      </td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#1A1A1A;">
        <span style="color:#F0B000;font-weight:700;">3.</span> Book your first appointment
      </td></tr>
    </table>
    ${emailButton('Open Your Dashboard', dashboardUrl)}
    <p style="margin:0;font-size:12px;color:#999999;">Your 14-day free trial has started. No card needed.</p>
  `;
  return wrapEmailHtml(body, `Your salon ${salonName} is live on BrBr`);
}

export function passwordResetEmail(resetUrl: string): string {
  const body = `
    <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:700;color:#1A1A1A;">Reset your password</h1>
    <p style="margin:0 0 4px 0;font-size:14px;color:#666666;line-height:1.6;">Someone requested a password reset for your BrBr account. Click below to set a new password.</p>
    <p style="margin:0 0 20px 0;font-size:12px;color:#999999;">If you did not request this, you can safely ignore this email.</p>
    ${emailButton('Reset Password', resetUrl)}
    <p style="margin:0;font-size:12px;color:#999999;">This link expires in 1 hour.</p>
  `;
  return wrapEmailHtml(body, 'Reset your BrBr password');
}
```

- [ ] **Step 3: Wrap existing udhaar reminder in branded layout**

In `src/lib/email-templates.ts`, add a function that takes the existing udhaar template variables and wraps the content in the branded layout:

```tsx
export function udhaarReminderEmail(clientName: string, salonName: string, amount: string): string {
  const body = `
    <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:700;color:#1A1A1A;">Payment Reminder</h1>
    <p style="margin:0 0 20px 0;font-size:14px;color:#666666;line-height:1.6;">
      Dear <strong style="color:#1A1A1A;">${clientName}</strong>,
    </p>
    <p style="margin:0 0 4px 0;font-size:14px;color:#666666;line-height:1.6;">
      This is a friendly reminder that you have an outstanding balance at <strong style="color:#1A1A1A;">${salonName}</strong>:
    </p>
    <p style="margin:16px 0;font-size:28px;font-weight:700;color:#F0B000;">Rs ${amount}</p>
    <p style="margin:0 0 20px 0;font-size:14px;color:#666666;line-height:1.6;">
      Please clear it on your next visit or contact us to arrange payment.
    </p>
    <p style="margin:0;font-size:12px;color:#999999;">Thank you for your continued patronage.</p>
  `;
  return wrapEmailHtml(body, `Payment reminder: Rs ${amount} outstanding at ${salonName}`);
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/email-layout.ts src/lib/email-templates.ts
git commit -m "feat: add branded email layout with welcome, password reset, and udhaar templates"
```

---

### Task 10: Data Notice Toast

**Files:**
- Create: `src/components/data-notice.tsx`
- Modify: `src/app/page.tsx` (add DataNotice component)

- [ ] **Step 1: Create DataNotice component**

```tsx
// src/components/data-notice.tsx
'use client';

import { useEffect } from 'react';
import toast from 'react-hot-toast';
import Link from 'next/link';

export function DataNotice() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem('brbr-data-notice')) return;

    const id = toast(
      (t) => (
        <div className="flex items-center gap-3 text-xs">
          <span>BrBr uses cookies to keep you logged in.</span>
          <Link href="/privacy" className="text-gold font-semibold hover:underline shrink-0" onClick={() => toast.dismiss(t.id)}>
            Privacy Policy
          </Link>
          <button onClick={() => { localStorage.setItem('brbr-data-notice', '1'); toast.dismiss(t.id); }} className="text-[#1A1A1A]/40 hover:text-[#1A1A1A] shrink-0 ml-1">
            ✕
          </button>
        </div>
      ),
      { duration: Infinity, position: 'bottom-center', style: { background: '#1A1A1A', color: '#EFEFEF', borderRadius: '0', border: '1px solid #222', fontSize: '13px' } }
    );

    return () => toast.dismiss(id);
  }, []);

  return null;
}
```

- [ ] **Step 2: Add DataNotice to homepage**

In `src/app/page.tsx`, add the import and include `<DataNotice />` right after the opening `<PublicLayout showHomeNav>` tag:

```tsx
import { DataNotice } from '@/components/data-notice';
```

And inside the return, after `<PublicLayout showHomeNav>`:
```tsx
<DataNotice />
```

- [ ] **Step 3: Add DataNotice to login page**

Read `src/app/login/page.tsx`, add the same import and `<DataNotice />` component inside the page's return (at the top of the rendered content, before any visible elements).

- [ ] **Step 4: Commit**

```bash
git add src/components/data-notice.tsx src/app/page.tsx src/app/login/page.tsx
git commit -m "feat: add first-visit data notice toast on homepage and login"
```

---

### Task 11: .env.example

**Files:**
- Create: `.env.example`

- [ ] **Step 1: Create .env.example**

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# App
NEXT_PUBLIC_APP_URL=https://brbr.pk
NEXT_PUBLIC_APP_NAME=BrBr
NEXT_PUBLIC_DEMO_MODE=false

# Email (for transactional emails — optional at launch)
# EMAIL_FROM=hello@brbr.pk
# RESEND_API_KEY=your-resend-key

# Support (used in email templates and contact page)
# SUPPORT_WHATSAPP=923001234567
# SUPPORT_EMAIL=support@brbr.pk
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: add .env.example with required and optional env vars"
```

---

### Task 12: Final Build Verification

- [ ] **Step 1: Run full build**

Run: `cd /Users/user1/brbr && npx next build --no-lint 2>&1 | tail -20`

Expected: Build succeeds. All new routes appear in the output:
- `/privacy`
- `/terms`
- `/refund`
- `/contact`
- `/about`
- `/sitemap.xml`

- [ ] **Step 2: Verify in browser**

Start the dev server and manually check:
1. Homepage renders with new footer (4 columns)
2. Footer links to `/privacy`, `/terms`, `/refund`, `/contact`, `/about` all work
3. Non-homepage pages show "About" and "Contact" in the nav instead of anchor links
4. 404 page renders at any invalid URL (e.g., `/asdfasdf`)
5. Privacy, Terms, Refund pages render with correct content
6. Contact page shows WhatsApp and email cards
7. About page shows dark hero, story, stats, team
8. Data notice toast appears on first homepage visit, doesn't reappear after dismissal

- [ ] **Step 3: Commit any fixes needed**

If any issues found in Step 2, fix and commit each fix individually.
