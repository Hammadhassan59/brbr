'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Scissors, Menu, X } from 'lucide-react';

interface PublicLayoutProps {
  children: React.ReactNode;
  showHomeNav?: boolean;
}

export default function PublicLayout({ children, showHomeNav = false }: PublicLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinks = showHomeNav
    ? [
        { href: '#features', label: 'What It Does' },
        { href: '#how', label: 'How It Works' },
        { href: '#pricing', label: 'Plans' },
        { href: '#faq', label: 'Questions' },
      ]
    : [
        { href: '/about', label: 'About' },
        { href: '/contact', label: 'Contact' },
      ];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#fdf8f4' }}>
      {/* ── Floating pill header ── */}
      <header className="sticky top-4 z-50 mx-auto px-5" style={{ maxWidth: '72rem', width: '100%' }}>
        <div className="flex items-center backdrop-blur-xl mx-auto relative" style={{ maxWidth: '95%', background: 'rgba(255,255,255,0.85)', borderRadius: '999px', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 4px 20px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)', padding: '8px 8px 8px 20px' }}>
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 bg-[#1A1A1A] flex items-center justify-center" style={{ borderRadius: '8px' }}>
              <Scissors className="w-3.5 h-3.5 text-gold" />
            </div>
            <span className="font-heading font-black text-[15px] text-[#1A1A1A] tracking-tight">iCut</span>
          </Link>

          {/* Nav links — desktop */}
          <div className="hidden md:flex items-center gap-0 mx-auto text-[13px]" style={{ letterSpacing: '-0.01em', fontWeight: 450 }}>
            {navLinks.map((link) =>
              link.href.startsWith('#') ? (
                <a key={link.href} href={link.href} className="text-[#6B7280] hover:bg-black/[0.04] transition-colors px-4 py-3" style={{ borderRadius: '8px' }}>{link.label}</a>
              ) : (
                <Link key={link.href} href={link.href} className="text-[#6B7280] hover:bg-black/[0.04] transition-colors px-4 py-3" style={{ borderRadius: '8px' }}>{link.label}</Link>
              )
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden ml-auto mr-2 w-8 h-8 flex items-center justify-center text-[#1A1A1A]"
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>

          {/* CTA */}
          <Link
            href="/login"
            className="bg-[#1A1A1A] text-white text-[13px] font-semibold rounded-full hover:bg-[#333] transition-all shrink-0 inline-flex items-center"
            style={{ padding: '10px 20px' }}
          >
            Start Free
          </Link>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div className="md:hidden mt-2 mx-auto backdrop-blur-xl overflow-hidden" style={{ maxWidth: '95%', background: 'rgba(255,255,255,0.95)', borderRadius: '16px', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
            <div className="py-2">
              {navLinks.map((link) =>
                link.href.startsWith('#') ? (
                  <a key={link.href} href={link.href} onClick={() => setMenuOpen(false)} className="block px-5 py-3 text-[15px] font-medium text-[#1A1A1A] hover:bg-black/[0.04] transition-colors">{link.label}</a>
                ) : (
                  <Link key={link.href} href={link.href} onClick={() => setMenuOpen(false)} className="block px-5 py-3 text-[15px] font-medium text-[#1A1A1A] hover:bg-black/[0.04] transition-colors">{link.label}</Link>
                )
              )}
            </div>
          </div>
        )}
      </header>

      {/* ── Page content ── */}
      <main className="flex-1">
        {children}
      </main>

      {/* ── Footer ── */}
      <footer className="bg-[#1A1A1A]">
        <div className="max-w-6xl mx-auto px-5 py-12 md:py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 bg-white/10 rounded-lg flex items-center justify-center">
                  <Scissors className="w-3.5 h-3.5 text-gold" />
                </div>
                <span className="font-heading font-extrabold text-base text-white tracking-tight">iCut</span>
              </div>
              <p className="text-xs text-white/45 leading-relaxed">
                Pakistan&apos;s Smart Salon System — bookings, billing, staff commission, udhaar, and JazzCash. All in one place.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="text-[11px] font-bold text-white/50 tracking-[0.15em] uppercase mb-4">Product</h4>
              <ul className="space-y-0.5">
                <li><Link href="/#features" className="text-[13px] text-white/50 hover:text-white transition-colors block py-2">Features</Link></li>
                <li><Link href="/#pricing" className="text-[13px] text-white/50 hover:text-white transition-colors block py-2">Pricing</Link></li>
                <li><Link href="/login" className="text-[13px] text-white/50 hover:text-white transition-colors block py-2">Login</Link></li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="text-[11px] font-bold text-white/50 tracking-[0.15em] uppercase mb-4">Company</h4>
              <ul className="space-y-0.5">
                <li><Link href="/about" className="text-[13px] text-white/50 hover:text-white transition-colors block py-2">About</Link></li>
                <li><Link href="/contact" className="text-[13px] text-white/50 hover:text-white transition-colors block py-2">Contact</Link></li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-[11px] font-bold text-white/50 tracking-[0.15em] uppercase mb-4">Legal</h4>
              <ul className="space-y-0.5">
                <li><Link href="/privacy" className="text-[13px] text-white/50 hover:text-white transition-colors block py-2">Privacy Policy</Link></li>
                <li><Link href="/terms" className="text-[13px] text-white/50 hover:text-white transition-colors block py-2">Terms of Service</Link></li>
                <li><Link href="/refund" className="text-[13px] text-white/50 hover:text-white transition-colors block py-2">Refund Policy</Link></li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/5">
          <div className="max-w-6xl mx-auto px-5 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-white/20">
              &copy; {new Date().getFullYear()} iCut by Inparlor Technologies Pvt Ltd
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
