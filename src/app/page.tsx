'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Scissors, ChevronDown, Star, Zap, Shield, Clock, Smartphone, Check } from 'lucide-react';

const PLANS = [
  {
    name: 'Starter',
    price: '2,500',
    pitch: 'For new and small salons',
    popular: false,
    limits: '1 branch, 10 staff',
    features: [
      { text: 'POS + billing', included: true },
      { text: 'Bookings + walk-in queue', included: true },
      { text: 'Cash, JazzCash, EasyPaisa', included: true },
      { text: 'Basic daily report', included: true },
      { text: 'Commission tracking', included: true },
      { text: 'Inventory', included: false },
      { text: 'Payroll', included: false },
      { text: 'Staff logins (phone + PIN)', included: true },
      { text: 'Partner/co-owner logins', included: false },
    ],
  },
  {
    name: 'Business',
    price: '5,000',
    pitch: 'For growing salons and small chains',
    popular: true,
    limits: '3 branches, 10 staff each',
    features: [
      { text: 'POS + billing', included: true },
      { text: 'Bookings + walk-in queue', included: true },
      { text: 'Cash, JazzCash, EasyPaisa', included: true },
      { text: 'Full daily reports', included: true },
      { text: 'Commission tracking', included: true },
      { text: 'Inventory', included: true },
      { text: 'Payroll', included: true },
      { text: 'Staff logins (phone + PIN)', included: true },
      { text: 'Partner/co-owner logins', included: true },
    ],
  },
  {
    name: 'Enterprise',
    price: '10,000',
    pitch: 'For salon chains',
    popular: false,
    limits: '10 branches, 100 staff',
    features: [
      { text: 'POS + billing', included: true },
      { text: 'Bookings + walk-in queue', included: true },
      { text: 'Cash, JazzCash, EasyPaisa', included: true },
      { text: 'Cross-branch reports', included: true },
      { text: 'Commission tracking', included: true },
      { text: 'Inventory', included: true },
      { text: 'Payroll', included: true },
      { text: 'Staff logins (phone + PIN)', included: true },
      { text: 'Partner/co-owner logins', included: true },
    ],
  },
];

const FEATURES = [
  {
    title: 'One screen for your whole day',
    desc: 'Every stylist gets a column. See who\'s free, who\'s booked, and who\'s running late. No asking around. Walk-ins get a token number. Friday Jummah prayer blocks automatically.',
    bullets: ['Per-stylist column calendar', 'Walk-in token queue for Eid rush', 'WhatsApp confirmations sent automatically', 'Jummah and prayer time blocks built in'],
  },
  {
    title: 'POS that speaks your language',
    desc: 'Cash, JazzCash, EasyPaisa, card, udhaar. Split any way you want. Every rupee tracked.',
    bullets: ['Tap-to-bill faster than a calculator', 'Split payments across any method', 'Udhaar tracking with per-client limits'],
  },
  {
    title: 'Payroll without the calculator',
    desc: 'Commission, tips, advances, late penalties. All calculated automatically. Month-end is one screen.',
    bullets: ['Percentage or flat commission per service', 'PIN check-in attendance', 'Advance tracking with auto-deduction'],
  },
];

const WHY_CHOOSE = [
  { icon: Zap, title: 'Set up in 5 minutes', desc: 'Phone, PIN, salon name. Your first bill goes out today.', stat: '5 min', statLabel: 'setup' },
  { icon: Shield, title: 'Your data is private', desc: 'Encrypted. Not connected to FBR. We never share your data.', stat: '100%', statLabel: 'private' },
  { icon: Clock, title: 'Works offline', desc: 'Load-shedding? BrBr queues everything and syncs when you\'re back.', stat: '0', statLabel: 'bills lost' },
  { icon: Smartphone, title: 'WhatsApp built in', desc: 'Receipts, booking confirmations, and reminders. Sent automatically.', stat: '1 tap', statLabel: 'receipts' },
];

const REVIEWS = [
  { name: 'Ahmed Raza', location: 'Islamabad', text: 'I used to sit with a calculator for 2 hours every month doing commission. Now I open the payroll page and it\'s done. Usman gets 25%, Bilal gets Rs 50 flat. BrBr just knows.' },
  { name: 'Sana Fatima', location: 'Karachi', text: 'December mein 40 brides thi. Pehle sab WhatsApp pe hota tha. Double bookings, missed messages. This year, zero double bookings. Clients get automatic confirmations.' },
  { name: 'Usman Ali', location: 'Lahore', text: 'The daily report comes to my WhatsApp at 9 PM. Cash, JazzCash, EasyPaisa, udhaar. Everything separate. My accountant said "finally someone made your hisab kitab easy."' },
  { name: 'Farah Naz', location: 'Rawalpindi', text: 'My staff can barely use a phone. But they learned BrBr in one day. Phone number and PIN, that\'s it. Now they check in, take bookings, even do bills themselves.' },
];

const FAQS = [
  { q: 'Do I need a credit card to start?', a: 'No. Sign up with your phone number. Use BrBr free for 14 days. If it doesn\'t help your business, don\'t pay.' },
  { q: 'I only take cash and JazzCash. Does that work?', a: 'Yes. BrBr supports cash, JazzCash, EasyPaisa, bank transfer, card, and split payments. If your customer pays Rs 500 cash and Rs 300 JazzCash, you record both in one bill.' },
  { q: 'My staff won\'t use software. It\'s too complicated.', a: 'Your staff logs in with their phone number and a 4-digit PIN. That\'s it. No email, no password. If they can use WhatsApp, they can use BrBr.' },
];

function ImagePlaceholder({ className = '', label = 'Image' }: { className?: string; label?: string }) {
  return (
    <div className={`bg-[#E8E8E8] border border-[#D4D4D4] flex items-center justify-center ${className}`}>
      <div className="text-center">
        <div className="w-10 h-10 mx-auto mb-2 border border-[#D4D4D4] bg-white/60 flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="2" y="4" width="16" height="12" rx="1" stroke="#999" strokeWidth="1.5"/><circle cx="7" cy="9" r="2" stroke="#999" strokeWidth="1.5"/><path d="M2 14l4-3 3 2 4-4 5 5" stroke="#999" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <span className="text-xs text-[#999]">{label}</span>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-white">
      {/* ── Nav Bar ── */}
      <nav className="sticky top-0 z-50 bg-[#161616] border-b border-[#222]">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center">
          <Link href="/" className="flex items-center gap-2 font-heading font-bold text-lg tracking-tight text-[#EFEFEF] touch-target">
            <Scissors className="w-5 h-5 text-gold" />
            BRBR
          </Link>
          <div className="hidden md:flex items-center gap-8 ml-12 text-sm">
            <a href="#features" className="text-[#EFEFEF]/50 hover:text-[#EFEFEF] transition-colors py-3">Features</a>
            <a href="#why-us" className="text-[#EFEFEF]/50 hover:text-[#EFEFEF] transition-colors py-3">Why Choose Us</a>
            <a href="#pricing" className="text-[#EFEFEF]/50 hover:text-[#EFEFEF] transition-colors py-3">Pricing</a>
            <a href="#reviews" className="text-[#EFEFEF]/50 hover:text-[#EFEFEF] transition-colors py-3">Reviews</a>
            <a href="#faq" className="text-[#EFEFEF]/50 hover:text-[#EFEFEF] transition-colors py-3">FAQs</a>
          </div>
          <div className="ml-auto">
            <Link href="/login" className="bg-gold text-black px-5 py-2.5 text-sm font-bold hover:bg-gold/90 transition-colors touch-target inline-flex items-center">
              Start Free Trial
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="bg-white">
        <div className="max-w-6xl mx-auto px-5 pt-16 pb-20 md:pt-24 md:pb-28">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#F5F5F5] text-[#1A1A1A]/70 text-xs font-medium border border-[#E8E8E8] mb-6">
                <span className="text-gold">&#9733;</span>
                Pakistan&apos;s #1 Salon POS
                <span className="text-[#1A1A1A]/40">→</span>
              </div>
              <h1 className="font-heading text-4xl md:text-5xl lg:text-[3.5rem] font-bold leading-[1.1] text-[#1A1A1A] mb-5 text-balance">
                One app for your register, khata, and WhatsApp chaos
              </h1>
              <p className="text-base text-[#1A1A1A]/50 mb-8 max-w-md leading-relaxed">
                Bookings, billing, staff commission, inventory, udhaar tracking. All in one place. Works with cash, JazzCash, and EasyPaisa.
              </p>
              <div className="flex flex-wrap gap-3 mb-8">
                <Link href="/login" className="bg-[#1A1A1A] text-white px-6 py-3.5 text-sm font-semibold hover:bg-[#333] transition-colors inline-flex items-center gap-2 touch-target">
                  <Scissors className="w-4 h-4" /> Try Free for 14 Days
                </Link>
                <a href="#features" className="bg-white text-[#1A1A1A] px-6 py-3.5 text-sm font-semibold border border-[#D4D4D4] hover:border-[#1A1A1A] transition-colors inline-flex items-center gap-2 touch-target">
                  Watch Demo
                </a>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  {[...'ASUF'].map((letter, i) => (
                    <div key={i} className="w-8 h-8 bg-gold/15 text-gold font-bold text-xs flex items-center justify-center border-2 border-white rounded-full">
                      {letter}
                    </div>
                  ))}
                </div>
                <div className="text-sm">
                  <span className="font-semibold text-[#1A1A1A]">200+</span>
                  <span className="text-[#1A1A1A]/50"> salons across Pakistan</span>
                </div>
              </div>
            </div>
            <ImagePlaceholder className="aspect-[4/3] md:aspect-square" label="App Preview" />
          </div>
        </div>
      </section>

      {/* ── Logo Bar ── */}
      <section className="border-y border-[#E8E8E8] bg-[#FAFAFA]">
        <div className="max-w-6xl mx-auto px-5 py-8">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-[#1A1A1A]/40 uppercase text-center mb-6">
            Trusted by salons partnered with
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-14">
            {['Partner 1', 'Partner 2', 'Partner 3', 'Partner 4', 'Partner 5'].map((name) => (
              <div key={name} className="w-24 h-8 bg-[#E8E8E8] border border-[#D4D4D4] flex items-center justify-center">
                <span className="text-[10px] text-[#999]">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features Section ── */}
      <section id="features" className="bg-white py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-5">
          <h2 className="font-heading text-2xl md:text-3xl font-bold text-center text-[#1A1A1A] mb-14">
            Features
          </h2>

          {/* Feature 1 — Large */}
          <div className="border border-[#E8E8E8] p-6 md:p-10 mb-6">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <h3 className="font-heading text-xl md:text-2xl font-bold text-[#1A1A1A] mb-4">
                  {FEATURES[0].title}
                </h3>
                <p className="text-sm text-[#1A1A1A]/50 leading-relaxed mb-5">
                  {FEATURES[0].desc}
                </p>
                <ul className="space-y-2">
                  {FEATURES[0].bullets.map((b) => (
                    <li key={b} className="flex items-center gap-2.5 text-sm text-[#1A1A1A]/70">
                      <span className="w-1.5 h-1.5 bg-gold shrink-0" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
              <ImagePlaceholder className="aspect-[4/3]" label="Calendar View" />
            </div>
          </div>

          {/* Feature 2 + 3 — Side by side */}
          <div className="grid md:grid-cols-2 gap-6">
            {FEATURES.slice(1).map((f) => (
              <div key={f.title} className="border border-[#E8E8E8] p-6">
                <h3 className="font-heading text-lg font-bold text-[#1A1A1A] mb-3">
                  {f.title}
                </h3>
                <p className="text-sm text-[#1A1A1A]/50 leading-relaxed mb-4">
                  {f.desc}
                </p>
                <ImagePlaceholder className="aspect-[3/2] mb-4" label="Feature Screenshot" />
                <ul className="space-y-1.5">
                  {f.bullets.map((b) => (
                    <li key={b} className="flex items-center gap-2 text-xs text-[#1A1A1A]/60">
                      <span className="w-1 h-1 bg-gold shrink-0" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why Choose Us ── */}
      <section id="why-us" className="bg-[#FAFAFA] border-y border-[#E8E8E8] py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-5">
          <h2 className="font-heading text-2xl md:text-3xl font-bold text-center text-[#1A1A1A] mb-14">
            Why Choose Us
          </h2>
          <div className="grid md:grid-cols-2 gap-5">
            {WHY_CHOOSE.map((item) => (
              <div key={item.title} className="border border-[#E8E8E8] bg-white p-6 md:p-8 flex gap-6 items-center">
                <div className="shrink-0 w-24 text-center">
                  <span className="block font-heading font-bold text-3xl text-gold leading-none">{item.stat}</span>
                  <span className="block text-[10px] text-[#1A1A1A]/40 mt-1.5 tracking-wide uppercase">{item.statLabel}</span>
                </div>
                <div className="border-l border-[#E8E8E8] pl-6">
                  <div className="flex items-center gap-2.5 mb-2">
                    <item.icon className="w-4 h-4 text-gold" />
                    <h4 className="font-heading font-bold text-base text-[#1A1A1A]">{item.title}</h4>
                  </div>
                  <p className="text-sm text-[#1A1A1A]/50 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="bg-white py-20 md:py-28">
        <div className="max-w-5xl mx-auto px-5">
          <h2 className="font-heading text-2xl md:text-3xl font-bold text-center text-[#1A1A1A] mb-3">
            Pricing
          </h2>
          <p className="text-sm text-[#1A1A1A]/50 text-center mb-14">
            All plans include a 14-day free trial. No card required.
          </p>
          <div className="grid md:grid-cols-3 gap-5">
            {PLANS.map((plan) => (
              <div key={plan.name} className={`border p-6 md:p-8 relative ${plan.popular ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white' : 'border-[#E8E8E8] bg-white'}`}>
                {plan.popular && <div className="absolute top-0 left-0 right-0 h-1 bg-gold" />}
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-heading text-base font-bold">{plan.name}</h3>
                  {plan.popular && <span className="text-[9px] font-bold text-gold tracking-widest uppercase">Most Popular</span>}
                </div>
                <p className="text-2xl font-heading font-bold tabular-nums">
                  Rs {plan.price}<span className={`text-xs font-normal ${plan.popular ? 'text-white/40' : 'text-[#1A1A1A]/40'}`}>/mo</span>
                </p>
                <p className={`text-[11px] mb-4 ${plan.popular ? 'text-white/50' : 'text-[#1A1A1A]/50'}`}>{plan.pitch}</p>
                <p className={`text-xs font-semibold mb-5 pb-5 border-b ${plan.popular ? 'border-white/10' : 'border-[#E8E8E8]'}`}>{plan.limits}</p>
                <ul className="space-y-2.5 mb-8">
                  {plan.features.map((f) => (
                    <li key={f.text} className={`flex items-center gap-2.5 text-sm ${!f.included ? (plan.popular ? 'text-white/25 line-through' : 'text-[#1A1A1A]/25 line-through') : ''}`}>
                      <Check className={`w-3.5 h-3.5 shrink-0 ${f.included ? 'text-gold' : (plan.popular ? 'text-white/20' : 'text-[#1A1A1A]/20')}`} />
                      {f.text}
                    </li>
                  ))}
                </ul>
                <Link href="/login" className={`block text-center py-3 text-sm font-semibold transition-colors border touch-target btn ${
                  plan.popular
                    ? 'bg-gold text-black border-gold hover:bg-gold/90'
                    : 'border-[#D4D4D4] text-[#1A1A1A] hover:border-[#1A1A1A]'
                }`}>
                  Start 14-Day Trial
                </Link>
              </div>
            ))}
          </div>
          <div className="mt-6 border border-gold/20 bg-gold/5 py-4 px-6 flex items-center justify-center gap-3">
            <span className="text-[10px] font-bold tracking-widest uppercase text-gold bg-gold/10 px-2 py-1">Coming Soon</span>
            <p className="text-sm text-[#1A1A1A]/70">WhatsApp automation. Receipts, booking confirmations, and reminders sent automatically.</p>
          </div>
          <div className="mt-4 text-center border border-[#E8E8E8] py-5 px-6">
            <p className="text-sm text-[#1A1A1A]/70">
              <span className="font-semibold text-[#1A1A1A]">More than 10 branches?</span>{' '}
              We do custom plans for large chains. <a href="https://wa.me/923001234567?text=I%20need%20a%20custom%20plan" className="text-gold font-semibold hover:underline">Talk to us on WhatsApp</a>
            </p>
          </div>
        </div>
      </section>

      {/* ── Reviews ── */}
      <section id="reviews" className="bg-white py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-5">
          <h2 className="font-heading text-2xl md:text-3xl font-bold text-center text-[#1A1A1A] mb-14">
            Reviews
          </h2>
          <div className="grid md:grid-cols-4 gap-5">
            {REVIEWS.map((r) => (
              <div key={r.name} className="border border-[#E8E8E8] p-5">
                <div className="flex gap-0.5 mb-3">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} className="w-3.5 h-3.5 text-gold fill-gold" />
                  ))}
                </div>
                <p className="text-sm text-[#1A1A1A]/60 leading-relaxed mb-5">
                  &ldquo;{r.text}&rdquo;
                </p>
                <div className="flex items-center gap-3 pt-4 border-t border-[#E8E8E8]">
                  <div className="w-8 h-8 bg-gold/15 text-gold font-bold text-xs flex items-center justify-center rounded-full">
                    {r.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#1A1A1A]">{r.name}</p>
                    <p className="text-[11px] text-[#1A1A1A]/40">{r.location}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="bg-[#FAFAFA] border-y border-[#E8E8E8] py-20 md:py-28">
        <div className="max-w-3xl mx-auto px-5">
          <h2 className="font-heading text-2xl md:text-3xl font-bold text-[#1A1A1A] mb-8">
            FAQ
          </h2>
          <div className="border border-[#E8E8E8] divide-y divide-[#E8E8E8]">
            {FAQS.map((faq, i) => (
              <div key={faq.q} className="bg-white">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full px-5 py-4 text-left text-sm font-medium flex items-center justify-between hover:bg-[#FAFAFA] transition-colors"
                >
                  <span className="flex items-center gap-3">
                    <span className="w-5 h-5 border border-[#E8E8E8] flex items-center justify-center text-[#1A1A1A]/40 text-xs shrink-0">
                      {openFaq === i ? '−' : '+'}
                    </span>
                    {faq.q}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-[#1A1A1A]/40 transition-transform duration-200 shrink-0 ml-4 ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4 pl-13 text-sm text-[#1A1A1A]/60 leading-relaxed">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="bg-white py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-5">
          <div className="border border-[#E8E8E8] bg-[#FAFAFA] p-8 md:p-14">
            <div className="grid md:grid-cols-2 gap-10 items-center">
              <div>
                <h2 className="font-heading text-2xl md:text-3xl font-bold text-[#1A1A1A] mb-4">
                  Your salon is already a good business. BrBr just makes the hisab kitab easy.
                </h2>
                <p className="text-sm text-[#1A1A1A]/50 mb-8 leading-relaxed">
                  14 days free. No card needed. Set up in 5 minutes. If it doesn&apos;t help, don&apos;t pay.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link href="/login" className="bg-[#1A1A1A] text-white px-6 py-3.5 text-sm font-semibold hover:bg-[#333] transition-colors inline-flex items-center gap-2 touch-target">
                    <Scissors className="w-4 h-4" /> Start Free Trial
                  </Link>
                  <Link href="/login" className="bg-white text-[#1A1A1A] px-6 py-3.5 text-sm font-semibold border border-[#D4D4D4] hover:border-[#1A1A1A] transition-colors inline-flex items-center gap-2 touch-target">
                    Book a Demo
                  </Link>
                </div>
              </div>
              <ImagePlaceholder className="aspect-[4/3]" label="App Mockup" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-[#E8E8E8] py-8">
        <div className="max-w-6xl mx-auto px-5 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-[#1A1A1A]/40">
            © 2025 BrBr. All Rights Reserved.
          </p>
          <div className="flex items-center gap-2 text-xs text-[#1A1A1A]/40">
            <a href="#" className="hover:text-[#1A1A1A] transition-colors px-2 py-3">LinkedIn</a>
            <a href="#" className="hover:text-[#1A1A1A] transition-colors px-2 py-3">Instagram</a>
            <a href="#" className="hover:text-[#1A1A1A] transition-colors px-2 py-3">Facebook</a>
            <a href="#" className="hover:text-[#1A1A1A] transition-colors px-2 py-3">Twitter</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
