'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { Scissors, ChevronDown, Check, Lock, Zap, Smartphone, Ticket, Coffee } from 'lucide-react';
import PublicLayout from '@/components/public-layout';
import { DashboardHeroPreview } from './components/dashboard-hero-preview';

// ── Scroll reveal ──
// Uses CSS-only animation. Content is always visible in HTML (no JS dependency).
// On mount, elements below the viewport get the hidden class and animate in on scroll.
function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // If element is already in viewport on mount, skip animation entirely
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight) { setVisible(true); return; }
    // Element is below the fold — set up scroll animation
    setAnimate(true);
    setVisible(false);
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.12 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className={`${animate ? 'transition-all duration-700 ease-out' : ''} ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'} ${className}`}>
      {children}
    </div>
  );
}

// ── Data ──

const PLANS = [
  {
    name: 'Starter', price: '3,000', originalPrice: '5,000', pitch: 'For new and small salons', popular: false,
    limits: '1 branch · up to 10 staff',
    features: [
      { text: 'POS + billing', ok: true }, { text: 'Bookings + walk-in queue', ok: true },
      { text: 'Cash, mobile, card payments', ok: true }, { text: 'Basic daily report', ok: true },
      { text: 'Commission tracking', ok: true }, { text: 'Inventory', ok: false }, { text: 'Payroll', ok: false },
    ],
  },
  {
    name: 'Business', price: '7,500', originalPrice: '12,000', pitch: 'For growing salons and small chains', popular: true,
    limits: '3 branches · 10 staff each',
    features: [
      { text: 'POS + billing', ok: true }, { text: 'Bookings + walk-in queue', ok: true },
      { text: 'Cash, mobile, card payments', ok: true }, { text: 'Full daily reports', ok: true },
      { text: 'Commission tracking', ok: true }, { text: 'Inventory', ok: true }, { text: 'Payroll + attendance', ok: true },
    ],
  },
  {
    name: 'Enterprise', price: '15,000', originalPrice: '20,000', pitch: 'For salon chains', popular: false,
    limits: '10 branches · 100 staff',
    features: [
      { text: 'Everything in Business', ok: true }, { text: 'Cross-branch reports', ok: true },
      { text: 'Partner/co-owner logins', ok: true }, { text: 'Priority support', ok: true },
    ],
  },
];

const TRUST = [
  { icon: Lock, title: '100% Private', desc: 'Your data stays yours. Not shared with anyone.' },
  { icon: Zap, title: 'Works offline', desc: 'Lost connection? Queues and syncs when you\'re back.' },
  { icon: Smartphone, title: 'Phone + PIN login', desc: 'No email. No password. Staff learn in one day.' },
  { icon: Coffee, title: 'Break blocks built in', desc: 'Lunch, prayer, custom. Auto-blocked in calendar.' },
];

const FAQS = [
  { q: 'Do I need a credit card to start?', a: 'No. Use iCut free for 14 days. No payment info required. If it doesn\'t help, don\'t pay.' },
  { q: 'I only take cash and mobile payments. Does that work?', a: 'Yes. iCut supports cash, mobile payments, bank transfer, card, and split payments. Record multiple payment methods in one bill.' },
  { q: 'My staff won\'t use software. It\'s too complicated.', a: 'Your staff logs in with their phone number and a 4-digit PIN. That\'s it. No email, no password. If they can use a phone, they can use iCut.' },
  { q: 'Can I manage multiple branches?', a: 'Yes. Business plan supports 3 branches, Enterprise supports 10. Each branch has its own staff, calendar, inventory, and reports. Switch between them in one tap.' },
  { q: 'What happens to my data if I cancel?', a: 'Your data is kept for 90 days after cancellation. You can export or request deletion anytime. We never sell or share your data.' },
];

const R = '16px';   // card radius
const Ri = '12px';  // inner element radius

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <PublicLayout showHomeNav>
      {/* ══════════════════════════════════════ */}
      {/* HERO                                  */}
      {/* ══════════════════════════════════════ */}
      <section className="relative" style={{ background: '#FAFAF8' }}>
        <div className="max-w-6xl mx-auto px-5 pt-14 md:pt-20">
          {/* Text block — exact spacing */}
          <div className="text-center max-w-2xl mx-auto" style={{ marginBottom: '20px' }}>
            <h1 className="animate-fade-up font-heading text-[2.75rem] md:text-[3.5rem] font-black text-[#1A1A1A]" style={{ lineHeight: 1.08, letterSpacing: '-0.03em', animationDelay: '0.05s' }}>
              Run your salon<br />from <span className="text-gold">one app.</span>
            </h1>
            <p className="animate-fade-up text-[15px] text-[#6B7280] leading-relaxed max-w-lg mx-auto" style={{ animationDelay: '0.1s', marginTop: '16px', marginBottom: '24px' }}>
              Stop losing money to forgotten appointments and handwritten bills.
            </p>
            <div className="animate-fade-up flex flex-wrap gap-4 justify-center items-center" style={{ animationDelay: '0.15s' }}>
              <Link href="/login" className="bg-[#1A1A1A] text-white px-8 py-3.5 text-[15px] font-bold hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5 transition-all inline-flex items-center touch-target shadow-md shadow-black/10" style={{ borderRadius: Ri }}>
                Try Free for 14 Days
              </Link>
              <a href="#features" className="text-[#6B7280] text-[13px] font-medium hover:text-[#1A1A1A] transition-colors inline-flex items-center gap-1.5">
                See what it does <span className="text-[12px]">&rarr;</span>
              </a>
            </div>
          </div>

          {/* Trust strip — social proof at point of decision */}
          <p className="animate-fade-up text-center text-[13px] text-[#6B7280] font-medium tracking-wide" style={{ animationDelay: '0.18s', marginBottom: '28px' }}>
            Trusted by salon owners across 6 cities &nbsp;&middot;&nbsp; No credit card required
          </p>

          {/* Dashboard mockup — THE hero visual, clipped at bottom */}
          <div className="animate-fade-up relative mx-auto" style={{ animationDelay: '0.25s', maxWidth: '95%', aspectRatio: '16/9', overflow: 'hidden', borderRadius: '16px', border: '1.5px solid rgba(0,0,0,0.15)', boxShadow: '0 30px 60px -12px rgba(0,0,0,0.15), 0 18px 36px -18px rgba(0,0,0,0.1)' }}>
            <div className="absolute inset-0">
              {/* App UI */}
              <div className="flex bg-white h-full">
                {/* Sidebar */}
                <div className="hidden md:flex w-[160px] bg-white flex-col shrink-0 py-3 px-2.5 border-r border-[#F0F0F0]">
                  <div className="flex items-center gap-2 px-2 mb-5">
                    <div className="w-6 h-6 bg-gold flex items-center justify-center" style={{ borderRadius: '6px' }}>
                      <Scissors className="w-3 h-3 text-black" />
                    </div>
                    <span className="text-[11px] font-bold text-[#1A1A1A]">iCut</span>
                  </div>
                  <div className="space-y-0.5">
                    {['Dashboard', 'Appointments', 'Clients', 'POS', 'Staff', 'Inventory', 'Reports', 'Settings'].map((label, i) => (
                      <div key={label} className={`px-2.5 py-[6px] text-[10px] font-medium ${i === 0 ? 'bg-gold/25 text-[#1A1A1A]' : 'text-[#B0B0B0]'}`} style={{ borderRadius: '6px' }}>
                        {label}
                      </div>
                    ))}
                  </div>
                  <div className="mt-auto px-2 pt-3 border-t border-[#F0F0F0]">
                    <p className="text-[10px] font-semibold text-[#1A1A1A]">Glow Studio</p>
                    <p className="text-[8px] text-[#B0B0B0]">Main Street</p>
                  </div>
                </div>
                {/* Main content — real dashboard components, scaled down */}
                <div className="flex-1 overflow-hidden" style={{ background: 'hsl(var(--background))', pointerEvents: 'none' }}>
                  <div style={{ width: '182%', transform: 'scale(0.55)', transformOrigin: 'top left' }}>
                    <DashboardHeroPreview />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>


      {/* ══════════════════════════════════════ */}
      {/* FEATURES (Bento 2x2)                  */}
      {/* ══════════════════════════════════════ */}
      <section id="features" className="py-14 md:py-20" style={{ background: '#FAFAF8' }}>
        <div className="max-w-5xl mx-auto px-5">
          <Reveal className="text-center mb-12">
            <p className="text-[11px] font-bold text-gold uppercase tracking-[1.5px] mb-3">What it does</p>
            <h2 className="font-heading text-3xl md:text-[2.5rem] font-black text-[#1A1A1A] tracking-tight mb-3">Everything your salon needs</h2>
            <p className="text-[15px] text-[#888] max-w-md mx-auto">No more spreadsheets, calculators, or chat groups.</p>
          </Reveal>

          {/* Row 1: Appointments (hero feature, full width, dark) */}
          <Reveal className="mb-3.5">
            <div className="relative bg-white p-6 md:p-8 border border-[#E8E8E8] overflow-hidden transition-all duration-300 hover:-translate-y-1" style={{ borderRadius: R, boxShadow: '0 2px 4px rgba(0,0,0,0.04), 0 8px 32px rgba(0,0,0,0.06)' }}>
              <div className="flex flex-col md:flex-row md:items-start gap-6">
                <div className="md:w-[38%] shrink-0">
                  <p className="text-[10px] text-gold uppercase tracking-[1.5px] font-bold mb-2">APPOINTMENTS</p>
                  <p className="text-xl md:text-2xl font-extrabold text-[#1A1A1A] leading-snug mb-3">Per-stylist calendar with break blocks</p>
                  <p className="text-[13px] text-[#888] leading-relaxed mb-4">Every stylist gets their own column. Breaks auto-blocked.</p>
                  <div className="inline-flex items-center gap-1.5 bg-gold/15 border border-gold/25 px-3 py-1.5 rounded-full text-[10px] text-[#B8860B] font-semibold">
                    <Ticket className="w-3 h-3" /> Walk-in Token #4 waiting
                  </div>
                </div>
                <div className="md:flex-1 bg-white border border-[#E0E0E0] p-4 overflow-hidden" style={{ borderRadius: Ri, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
                  {/* Mini topbar */}
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#F0F0F0]">
                    <span className="text-[9px] font-bold text-[#1A1A1A]">Appointments — Today</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[7px] text-[#AAA] font-medium">3 stylists</span>
                      <div className="w-4 h-4 bg-gold flex items-center justify-center" style={{ borderRadius: '4px' }}>
                        <span className="text-[8px] text-black font-bold">+</span>
                      </div>
                    </div>
                  </div>
                  {/* Time column + stylist columns */}
                  <div className="grid gap-1.5 mb-2.5" style={{ gridTemplateColumns: '32px 1fr 1fr 1fr' }}>
                    {/* Header row */}
                    <div />
                    {['Sara', 'Nina', 'Reem'].map((name) => (
                      <div key={name} className="text-center pb-1">
                        <p className="text-[9px] text-[#1A1A1A] font-bold">{name}</p>
                      </div>
                    ))}
                    {/* Time rows */}
                    {[
                      { time: '10:00', slots: ['Haircut', 'Facial', '—'] },
                      { time: '11:00', slots: ['Color', '—', 'Cut'] },
                      { time: '12:00', slots: ['—', 'Wax', 'Cut'] },
                      { time: '1:00', slots: ['Bridal', '—', 'Style'] },
                    ].map((row) => (
                      <div key={row.time} className="contents">
                        <div className="flex items-center">
                          <span className="text-[7px] text-[#BBB] font-mono tabular-nums">{row.time}</span>
                        </div>
                        {row.slots.map((slot, i) => (
                          <div
                            key={i}
                            className={`text-[9px] py-2 text-center font-semibold ${
                              slot === '—'
                                ? 'text-[#DDD] bg-[#FAFAFA] border border-dashed border-[#E8E8E8]'
                                : 'bg-[#1A1A1A] text-white'
                            }`}
                            style={{ borderRadius: '6px' }}
                          >
                            {slot === '—' ? '' : slot}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                  {/* Break block */}
                  <div className="flex items-center gap-1.5 bg-gold/15 border border-gold/30 px-3 py-[6px]" style={{ borderRadius: '8px' }}>
                    <Coffee className="w-3 h-3 text-[#B8860B]" />
                    <span className="text-[9px] text-[#B8860B] font-semibold">Break 12:30 – 1:15</span>
                    <span className="ml-auto text-[7px] text-[#B8860B]/60">All stylists</span>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>

          {/* Row 2: Three equal cards — Billing, Payroll, Credit */}
          <div className="grid md:grid-cols-3 gap-3.5">
            {/* Billing */}
            <Reveal>
              <div className="bg-white p-6 h-full border border-[#E8E8E8] transition-all duration-300 hover:-translate-y-1" style={{ borderRadius: R, boxShadow: '0 2px 4px rgba(0,0,0,0.04), 0 8px 32px rgba(0,0,0,0.06)' }}>
                <p className="text-[10px] text-[#6B7280] uppercase tracking-[1.5px] font-bold mb-2">BILLING</p>
                <p className="text-[16px] font-extrabold text-[#1A1A1A] leading-snug min-h-[44px] mb-3">Tap to bill. Split any way.</p>
                <div className="bg-white border border-[#E0E0E0] p-3 text-[11px]" style={{ borderRadius: Ri, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
                  {/* Mini topbar */}
                  <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-[#F0F0F0]">
                    <span className="text-[8px] font-bold text-[#1A1A1A]">New Bill — Anna M.</span>
                    <span className="text-[7px] text-[#AAA]">Bill #0147</span>
                  </div>
                  <div className="space-y-1.5 mb-2">
                    {[
                      { service: 'Haircut (Sara)', price: '500' },
                      { service: 'Hair Color', price: '3,000' },
                      { service: 'Deep Conditioning', price: '2,000' },
                    ].map((item) => (
                      <div key={item.service} className="flex justify-between items-center">
                        <span className="text-[#555]">{item.service}</span>
                        <span className="font-bold text-[#1A1A1A] tabular-nums">{item.price}</span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-[#E8E8E8] mt-2 pt-2 flex justify-between font-extrabold text-xs">
                    <span className="text-[#1A1A1A]">Total</span>
                    <span className="text-[#1A1A1A] text-[13px]">₨ 5,500</span>
                  </div>
                  <div className="flex gap-1.5 mt-3">
                    {['Cash', 'JazzCash', 'Card', 'Split'].map((m, i) => (
                      <span key={m} className={`flex-1 text-center text-[8px] py-1.5 font-semibold ${i === 0 ? 'bg-[#1A1A1A] text-white' : 'bg-[#FAFAFA] text-[#888] border border-[#E8E8E8]'}`} style={{ borderRadius: '6px' }}>{m}</span>
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>

            {/* Payroll */}
            <Reveal>
              <div className="bg-white p-6 h-full border border-[#E8E8E8] transition-all duration-300 hover:-translate-y-1" style={{ borderRadius: R, boxShadow: '0 2px 4px rgba(0,0,0,0.04), 0 8px 32px rgba(0,0,0,0.06)' }}>
                <p className="text-[10px] text-[#6B7280] uppercase tracking-[1.5px] font-bold mb-2">PAYROLL</p>
                <p className="text-[16px] font-extrabold text-[#1A1A1A] leading-snug min-h-[44px] mb-3">Commissions, attendance, advances.</p>
                <div className="bg-white border border-[#E0E0E0] p-3 text-[11px]" style={{ borderRadius: Ri, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
                  {/* Mini topbar */}
                  <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-[#F0F0F0]">
                    <span className="text-[8px] font-bold text-[#1A1A1A]">Staff Payroll</span>
                    <span className="text-[7px] font-semibold bg-[#FAFAFA] text-[#888] px-1.5 py-0.5 border border-[#E8E8E8]" style={{ borderRadius: '4px' }}>March 2026</span>
                  </div>
                  <div className="space-y-2">
                    {[
                      { name: 'Sara', base: '18K', comm: '8.4K', total: '26,400' },
                      { name: 'Nina', base: '15K', comm: '5.2K', total: '20,200' },
                      { name: 'Reem', base: '15K', comm: '3.1K', total: '18,100' },
                      { name: 'Aisha', base: '12K', comm: '2.8K', total: '14,800' },
                    ].map((s) => (
                      <div key={s.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-[#1A1A1A] text-white text-[7px] font-bold flex items-center justify-center">{s.name[0]}</div>
                          <div>
                            <span className="text-[10px] text-[#1A1A1A] font-semibold">{s.name}</span>
                            <span className="text-[8px] text-[#BBB] ml-1.5">{s.base} + {s.comm}</span>
                          </div>
                        </div>
                        <span className="font-bold text-[#1A1A1A] tabular-nums text-[11px]">{s.total}</span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-[#E8E8E8] mt-2.5 pt-2 flex justify-between items-center">
                    <span className="text-[10px] text-[#888] font-medium">Net Payout</span>
                    <span className="text-[13px] font-extrabold text-gold tabular-nums">₨ 79,500</span>
                  </div>
                </div>
              </div>
            </Reveal>

            {/* Credit (Udhaar) */}
            <Reveal>
              <div className="bg-white p-6 h-full border border-[#E8E8E8] transition-all duration-300 hover:-translate-y-1" style={{ borderRadius: R, boxShadow: '0 2px 4px rgba(0,0,0,0.04), 0 8px 32px rgba(0,0,0,0.06)' }}>
                <p className="text-[10px] text-[#6B7280] uppercase tracking-[1.5px] font-bold mb-2">CREDIT</p>
                <p className="text-[16px] font-extrabold text-[#1A1A1A] leading-snug min-h-[44px] mb-3">Track who owes what</p>
                <div className="bg-white border border-[#E0E0E0] p-3 text-[11px]" style={{ borderRadius: Ri, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
                  {/* Mini topbar */}
                  <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-[#F0F0F0]">
                    <span className="text-[8px] font-bold text-[#1A1A1A]">Udhaar Ledger</span>
                    <span className="text-[7px] text-[#AAA]">3 clients</span>
                  </div>
                  <div className="space-y-3">
                    {[
                      { init: 'AM', name: 'Anna M.', amt: '2,500', limit: '5,000', pct: 50 },
                      { init: 'LK', name: 'Lena K.', amt: '1,800', limit: '3,000', pct: 60 },
                      { init: 'MR', name: 'Mia R.', amt: '4,200', limit: '5,000', pct: 84 },
                    ].map((c) => (
                      <div key={c.init}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-full bg-[#1A1A1A] text-white text-[7px] font-bold flex items-center justify-center">{c.init}</div>
                            <span className="font-semibold text-[#1A1A1A] text-[10px]">{c.name}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-[#1A1A1A] tabular-nums">₨ {c.amt}</span>
                            <span className="text-[8px] text-[#BBB] ml-1">/ {c.limit}</span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-[#F0F0F0] rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-500 ${c.pct > 75 ? 'bg-[#EF4444]' : c.pct > 50 ? 'bg-gold' : 'bg-[#22C55E]'}`} style={{ width: `${c.pct}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-[#E8E8E8] mt-2.5 pt-2 flex justify-between items-center">
                    <span className="text-[10px] text-[#888] font-medium">Total Outstanding</span>
                    <span className="text-[13px] font-extrabold text-[#1A1A1A] tabular-nums">₨ 8,500</span>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>

          {/* Trust points — folded into features */}
          <Reveal className="mt-10">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
              {TRUST.map((item) => (
                <div key={item.title}>
                  <item.icon className="w-5 h-5 text-[#B8860B] mx-auto mb-2" />
                  <p className="text-[13px] font-bold text-[#1A1A1A] mb-0.5">{item.title}</p>
                  <p className="text-[11px] text-[#888] leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══════════════════════════════════════ */}
      {/* HOW IT WORKS — compact strip           */}
      {/* ══════════════════════════════════════ */}
      <section id="how" className="py-12 md:py-16 bg-white">
        <div className="max-w-4xl mx-auto px-5">
          <Reveal>
            <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-12">
              <p className="text-[11px] font-bold text-gold uppercase tracking-[1.5px] shrink-0">How it works</p>
              {[
                { n: '1', text: 'Create your account' },
                { n: '2', text: 'Add staff and services' },
                { n: '3', text: 'Start billing today' },
              ].map((step, i) => (
                <div key={step.n} className="flex items-center gap-3">
                  {i > 0 && <div className="hidden md:block w-8 h-px bg-[#E8E8E8]" />}
                  <div className="w-7 h-7 bg-[#1A1A1A] text-gold text-[12px] font-black flex items-center justify-center shrink-0" style={{ borderRadius: '8px' }}>{step.n}</div>
                  <span className="text-[13px] font-semibold text-[#1A1A1A]">{step.text}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══════════════════════════════════════ */}
      {/* PRICING                               */}
      {/* ══════════════════════════════════════ */}
      <section id="pricing" className="py-24 md:py-32" style={{ background: '#FAFAF8' }}>
        <div className="max-w-5xl mx-auto px-5">
          <Reveal className="text-center mb-14">
            <p className="text-[11px] font-bold text-gold uppercase tracking-[1.5px] mb-3">Plans</p>
            <h2 className="font-heading text-3xl md:text-[2.75rem] font-black text-[#1A1A1A] tracking-tight mb-4">14 days free. No card needed.</h2>
            <p className="text-[16px] text-[#1A1A1A] max-w-lg mx-auto leading-relaxed">Pick a plan after you see results. Cancel anytime.</p>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-5 items-stretch">
            {PLANS.map((plan) => {
              const discount = Math.round((1 - parseInt(plan.price.replace(',', '')) / parseInt(plan.originalPrice.replace(',', ''))) * 100);
              return (
              <Reveal key={plan.name}>
                <div className={`p-7 md:p-8 flex flex-col h-full relative overflow-hidden transition-all duration-300 hover:-translate-y-1 ${
                  plan.popular ? 'bg-[#1A1A1A] text-white md:-my-3 md:py-11' : 'bg-white border border-[#E8E8E8]'
                }`} style={{ borderRadius: R, boxShadow: plan.popular ? '0 12px 40px rgba(0,0,0,0.2)' : '0 2px 4px rgba(0,0,0,0.04), 0 8px 32px rgba(0,0,0,0.06)' }}>
                  {plan.popular && <div className="absolute top-0 left-0 right-0 h-1 bg-gold" />}

                  <div className="flex items-center justify-between mb-1">
                    <p className="text-base font-extrabold">{plan.name}</p>
                    {plan.popular
                      ? <span className="text-[9px] font-bold text-gold bg-gold/15 px-2.5 py-1 rounded-full uppercase tracking-wider">Most Popular</span>
                      : <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">{discount}% off</span>
                    }
                  </div>
                  <p className={`text-[13px] ${plan.popular ? 'text-white/70' : 'text-[#1A1A1A]'}`}>{plan.pitch}</p>

                  {/* Price */}
                  <div className="my-5">
                    <span className={`text-[14px] font-medium line-through ${plan.popular ? 'text-white/40' : 'text-[#1A1A1A]/40'}`}>Rs. {plan.originalPrice}</span>
                    {plan.popular && <span className="text-[9px] font-bold text-gold bg-gold/15 px-2 py-0.5 rounded-full ml-2">{discount}% off</span>}
                    <p className="text-[38px] md:text-[42px] font-black tabular-nums leading-none mt-1">
                      <span className={`text-[16px] font-semibold ${plan.popular ? 'text-white/60' : 'text-[#1A1A1A]'}`}>Rs. </span>{plan.price}
                    </p>
                    <p className={`text-[13px] font-medium mt-1.5 ${plan.popular ? 'text-white/60' : 'text-[#1A1A1A]'}`}>per month · {plan.limits}</p>
                  </div>

                  {/* Features */}
                  <div className={`border-t pt-5 mb-7 flex-1 ${plan.popular ? 'border-white/15' : 'border-[#EBEBEB]'}`}>
                    <ul className="space-y-3">
                      {plan.features.map((f, i) => (
                        <li key={i} className={`flex items-center gap-3 text-[14px] ${!f.ok ? (plan.popular ? 'text-white/25 line-through decoration-white/15' : 'text-[#1A1A1A]/25 line-through decoration-[#1A1A1A]/15') : ''}`}>
                          <Check className={`w-4 h-4 shrink-0 ${f.ok ? 'text-gold' : (plan.popular ? 'text-white/15' : 'text-[#1A1A1A]/20')}`} strokeWidth={2.5} />
                          {f.text}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Link href="/login" className={`block text-center py-3.5 text-[15px] font-bold transition-all touch-target ${
                    plan.popular
                      ? 'bg-gold text-black hover:shadow-lg hover:shadow-gold/25'
                      : 'border-[1.5px] border-[#1A1A1A] text-[#1A1A1A] hover:bg-[#1A1A1A] hover:text-white'
                  }`} style={{ borderRadius: Ri }}>
                    Get Started{plan.popular ? ' →' : ''}
                  </Link>
                </div>
              </Reveal>
            )})}
          </div>

          <p className="mt-8 text-center text-[15px] text-[#1A1A1A]">
            <span className="font-bold">More than 10 branches?</span>{' '}
            <a href="https://wa.me/923001234567?text=I%20need%20a%20custom%20plan" className="text-gold font-bold hover:underline">Talk to us &rarr;</a>
          </p>
        </div>
      </section>

      {/* ══════════════════════════════════════ */}
      {/* FAQ                                   */}
      {/* ══════════════════════════════════════ */}
      <section id="faq" className="py-20 md:py-28 bg-white">
        <div className="max-w-2xl mx-auto px-5">
          <Reveal className="text-center mb-10">
            <p className="text-[11px] font-bold text-gold uppercase tracking-[1.5px] mb-3">Questions</p>
          </Reveal>

          <Reveal>
            <div className="border border-[#E8E8E8] overflow-hidden bg-white" style={{ borderRadius: R }}>
              {FAQS.map((faq, i) => (
                <div key={faq.q} className={i < FAQS.length - 1 ? 'border-b border-[#F0F0F0]' : ''}>
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    aria-expanded={openFaq === i}
                    className="w-full px-6 py-5 text-left flex items-center justify-between hover:bg-[#FAFAFA] transition-colors gap-4"
                  >
                    <span className="text-[15px] font-bold text-[#1A1A1A]">{faq.q}</span>
                    <ChevronDown className={`w-4 h-4 text-[#CCC] shrink-0 transition-transform duration-300 ${openFaq === i ? 'rotate-180' : ''}`} />
                  </button>
                  <div className={`overflow-hidden transition-all duration-300 ${openFaq === i ? 'max-h-96' : 'max-h-0'}`}>
                    <p className="px-6 pb-5 text-[13px] text-[#6B7280] leading-relaxed">{faq.a}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══════════════════════════════════════ */}
      {/* FINAL CTA                             */}
      {/* ══════════════════════════════════════ */}
      <section className="py-20 md:py-28 bg-[#1A1A1A]">
        <div className="max-w-2xl mx-auto px-5 text-center">
          <Reveal>
            <h2 className="font-heading text-3xl md:text-4xl font-black text-white tracking-tight mb-3">Your first bill goes out today.</h2>
            <p className="text-[15px] text-[#6B7280] mb-8">Set up in 5 minutes. Choose a plan that fits your salon.</p>
            <Link href="/login" className="bg-gold text-black px-8 py-4 text-[15px] font-bold hover:shadow-lg hover:shadow-gold/25 hover:-translate-y-0.5 transition-all inline-flex items-center touch-target shadow-md shadow-gold/15" style={{ borderRadius: Ri }}>
              Get Started
            </Link>
          </Reveal>
        </div>
      </section>

    </PublicLayout>
  );
}
