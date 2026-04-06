import Link from 'next/link';
import { Scissors } from 'lucide-react';

interface PublicLayoutProps {
  children: React.ReactNode;
  showHomeNav?: boolean; // default false
}

export default function PublicLayout({ children, showHomeNav = false }: PublicLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-[#161616] border-b border-[#222]">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 font-heading font-bold text-lg tracking-tight text-[#EFEFEF] touch-target"
          >
            <Scissors className="w-5 h-5 text-gold" />
            BRBR
          </Link>

          {/* Nav links */}
          <div className="hidden md:flex items-center gap-8 ml-12 text-sm">
            {showHomeNav ? (
              <>
                <a href="#features" className="text-[#EFEFEF]/50 hover:text-[#EFEFEF] transition-colors py-3">Features</a>
                <a href="#why-us" className="text-[#EFEFEF]/50 hover:text-[#EFEFEF] transition-colors py-3">Why Choose Us</a>
                <a href="#pricing" className="text-[#EFEFEF]/50 hover:text-[#EFEFEF] transition-colors py-3">Pricing</a>
                <a href="#reviews" className="text-[#EFEFEF]/50 hover:text-[#EFEFEF] transition-colors py-3">Reviews</a>
                <a href="#faq" className="text-[#EFEFEF]/50 hover:text-[#EFEFEF] transition-colors py-3">FAQs</a>
              </>
            ) : (
              <>
                <Link href="/about" className="text-[#EFEFEF]/50 hover:text-[#EFEFEF] transition-colors py-3">About</Link>
                <Link href="/contact" className="text-[#EFEFEF]/50 hover:text-[#EFEFEF] transition-colors py-3">Contact</Link>
              </>
            )}
          </div>

          {/* CTA */}
          <div className="ml-auto">
            <Link
              href="/login"
              className="bg-gold text-black px-5 py-2.5 text-sm font-bold hover:bg-gold/90 transition-colors touch-target inline-flex items-center"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </header>

      {/* ── Page content ── */}
      <main className="flex-1">
        {children}
      </main>

      {/* ── Footer ── */}
      <footer className="bg-[#161616] border-t border-[#222]">
        {/* 4-column grid */}
        <div className="max-w-6xl mx-auto px-5 py-12 md:py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
            {/* Column 1 — Brand (full width on mobile) */}
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <Scissors className="w-4 h-4 text-gold" />
                <span className="font-heading font-bold text-base text-[#EFEFEF] tracking-tight">BRBR</span>
              </div>
              <p className="text-xs text-[#EFEFEF]/40 leading-relaxed">
                Pakistan&apos;s Smart Salon System — bookings, billing, staff commission, udhaar, and JazzCash. All in one place.
              </p>
            </div>

            {/* Column 2 — Product */}
            <div>
              <h4 className="text-sm font-bold text-[#EFEFEF]/60 tracking-[0.12em] uppercase mb-4">Product</h4>
              <ul className="space-y-0.5">
                <li>
                  <Link href="/#features" className="text-sm text-[#EFEFEF]/40 hover:text-[#EFEFEF] transition-colors block py-2.5">Features</Link>
                </li>
                <li>
                  <Link href="/#pricing" className="text-sm text-[#EFEFEF]/40 hover:text-[#EFEFEF] transition-colors block py-2.5">Pricing</Link>
                </li>
                <li>
                  <Link href="/login" className="text-sm text-[#EFEFEF]/40 hover:text-[#EFEFEF] transition-colors block py-2.5">Login</Link>
                </li>
              </ul>
            </div>

            {/* Column 3 — Company */}
            <div>
              <h4 className="text-sm font-bold text-[#EFEFEF]/60 tracking-[0.12em] uppercase mb-4">Company</h4>
              <ul className="space-y-0.5">
                <li>
                  <Link href="/about" className="text-sm text-[#EFEFEF]/40 hover:text-[#EFEFEF] transition-colors block py-2.5">About</Link>
                </li>
                <li>
                  <Link href="/contact" className="text-sm text-[#EFEFEF]/40 hover:text-[#EFEFEF] transition-colors block py-2.5">Contact</Link>
                </li>
              </ul>
            </div>

            {/* Column 4 — Legal */}
            <div>
              <h4 className="text-sm font-bold text-[#EFEFEF]/60 tracking-[0.12em] uppercase mb-4">Legal</h4>
              <ul className="space-y-0.5">
                <li>
                  <Link href="/privacy" className="text-sm text-[#EFEFEF]/40 hover:text-[#EFEFEF] transition-colors block py-2.5">Privacy Policy</Link>
                </li>
                <li>
                  <Link href="/terms" className="text-sm text-[#EFEFEF]/40 hover:text-[#EFEFEF] transition-colors block py-2.5">Terms of Service</Link>
                </li>
                <li>
                  <Link href="/refund" className="text-sm text-[#EFEFEF]/40 hover:text-[#EFEFEF] transition-colors block py-2.5">Refund Policy</Link>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-[#222]">
          <div className="max-w-6xl mx-auto px-5 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-[#EFEFEF]/40">
              &copy; {new Date().getFullYear()} BrBr. All Rights Reserved.
            </p>
            <div className="flex items-center gap-1 text-xs text-[#EFEFEF]/40">
              <a href="#" className="hover:text-[#EFEFEF] transition-colors px-3 py-3.5">LinkedIn</a>
              <a href="#" className="hover:text-[#EFEFEF] transition-colors px-3 py-3.5">Instagram</a>
              <a href="#" className="hover:text-[#EFEFEF] transition-colors px-3 py-3.5">Facebook</a>
              <a href="#" className="hover:text-[#EFEFEF] transition-colors px-3 py-3.5">Twitter</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
