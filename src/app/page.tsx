import Link from 'next/link';
import { Scissors, CalendarDays, Banknote, MessageCircle, UserCog, BarChart3, ChevronRight, Star, ChevronDown, Check, ArrowRight } from 'lucide-react';

const PLANS = [
  { name: 'Starter', price: '2,500', sub: 'Less than a single haircut per day', features: ['1 branch, 3 staff', 'Bookings & walk-in queue', 'POS with cash + JazzCash', 'Daily cash report', 'WhatsApp receipts'], popular: false },
  { name: 'Growth', price: '5,000', sub: 'For salons doing Rs 15K+ daily', features: ['1 branch, unlimited staff', 'Everything in Starter', '+ Commission auto-calc', '+ Inventory tracking', '+ Packages & promo codes'], popular: true },
  { name: 'Pro', price: '9,000', sub: 'For multi-branch owners', features: ['Up to 3 branches', 'Everything in Growth', '+ Cross-branch reports', '+ Partner logins', '+ Priority WhatsApp support'], popular: false },
];

const TESTIMONIALS = [
  { name: 'Ahmed Raza', city: 'Islamabad', salon: 'Royal Barbers, F-7', text: 'I used to sit with a calculator for 2 hours every month doing commission. Now I open the payroll page and it\'s done. Usman gets 25%, Bilal gets Rs 50 flat — BrBr just knows.' },
  { name: 'Sana Fatima', city: 'Karachi', salon: 'Glow Studio, DHA', text: 'December mein 40 brides thi. Pehle sab WhatsApp pe hota tha — double bookings, missed messages. This year, zero double bookings. Clients get automatic confirmations.' },
  { name: 'Usman Ali', city: 'Lahore', salon: 'Khan Cuts, Gulberg', text: 'The daily report comes to my WhatsApp at 9 PM. Cash, JazzCash, EasyPaisa, udhaar — everything separate. My accountant said "finally someone made your hisab kitab easy."' },
];

const FAQS = [
  { q: 'Do I need a credit card to start?', a: 'No. Sign up with your phone number. Use BrBr free for 14 days. If it doesn\'t help your business, don\'t pay.' },
  { q: 'I only take cash and JazzCash. Does that work?', a: 'Yes. BrBr supports cash, JazzCash, EasyPaisa, bank transfer, card, and split payments. If your customer pays Rs 500 cash and Rs 300 JazzCash, you record both in one bill.' },
  { q: 'My staff won\'t use software. It\'s too complicated.', a: 'Your staff logs in with their phone number and a 4-digit PIN. That\'s it. No email, no password. If they can use WhatsApp, they can use BrBr.' },
  { q: 'Can I use it in Urdu?', a: 'Yes. One toggle switches the entire interface to Urdu — including WhatsApp messages and receipts sent to clients.' },
  { q: 'Will the government see my data? I\'m worried about tax.', a: 'Your data is private and encrypted. BrBr is not connected to FBR. We don\'t share any salon data with any government body.' },
  { q: 'What happens during Eid rush? Can it handle 80 customers a day?', a: 'BrBr handles unlimited bookings. During Eid, the walk-in queue gives each customer a token number so your staff isn\'t guessing who\'s next.' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* ── BLACK: Navbar ── */}
      <nav className="sticky top-0 z-50 bg-[#1A1A1A] text-white border-b border-[#2A2A2A]">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center">
          <Link href="/" className="flex items-center gap-2 font-heading font-bold text-lg tracking-tight">
            <Scissors className="w-5 h-5 text-gold" />
            BRBR
          </Link>
          <div className="flex items-center gap-3 md:gap-6 ml-4 md:ml-12 text-xs md:text-sm">
            <a href="#features" className="py-3 px-1 md:px-2 text-white/60 hover:text-white transition-colors">Features</a>
            <a href="#pricing" className="py-3 px-1 md:px-2 text-white/60 hover:text-white transition-colors">Pricing</a>
            <a href="#faq" className="py-3 px-1 md:px-2 text-white/60 hover:text-white transition-colors">FAQ</a>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <Link href="/login" className="text-sm py-3 px-2 text-white/60 hover:text-white transition-colors hidden sm:block">Login</Link>
            <Link href="/login" className="bg-gold text-black px-5 py-3 text-sm font-semibold hover:bg-gold/90 transition-colors border border-gold">
              Try Free — 14 Days
            </Link>
          </div>
        </div>
      </nav>

      {/* ── BLACK: Hero ── */}
      <section className="bg-[#1A1A1A] text-white">
        <div className="max-w-6xl mx-auto px-5 pt-20 pb-24 md:pt-28 md:pb-32">
          <div className="grid md:grid-cols-5 gap-12 md:gap-16 items-center">
            <div className="md:col-span-3">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gold/10 text-gold text-xs font-semibold tracking-widest uppercase border border-gold/20 animate-fade-up" style={{ animationDelay: '0ms' }}>
                Made for Pakistani Salons
              </div>
              <h1 className="font-heading text-4xl md:text-5xl lg:text-[3.5rem] font-bold leading-[1.1] mt-6 mb-5 text-balance animate-fade-up" style={{ animationDelay: '100ms' }}>
                One app for your register, your khata, and your WhatsApp chaos
              </h1>
              <p className="text-base text-white/60 mb-8 max-w-lg leading-relaxed animate-fade-up" style={{ animationDelay: '200ms' }}>
                Bookings, billing, staff commission, inventory, udhaar tracking, and daily reports — all in one place. Works with cash, JazzCash, and EasyPaisa. Set up in 5 minutes.
              </p>
              <div className="flex flex-wrap items-center gap-3 mb-10 animate-fade-up" style={{ animationDelay: '300ms' }}>
                <Link href="/login" className="bg-gold text-black px-7 py-3.5 text-sm font-bold hover:bg-gold/90 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg inline-flex items-center gap-2 border border-gold">
                  <Scissors className="w-4 h-4" /> Try Free — 14 Days
                </Link>
                <a href="#features" className="px-5 py-3.5 text-sm font-medium text-white/60 hover:text-white transition-all duration-200 hover:-translate-y-0.5 inline-flex items-center gap-2 border border-[#2A2A2A] hover:border-white/30">
                  See how it works <ArrowRight className="w-4 h-4" />
                </a>
              </div>
              <div className="flex items-center gap-6 text-xs text-white/50 animate-fade-up" style={{ animationDelay: '400ms' }}>
                <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-gold" /> No credit card needed</span>
                <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-gold" /> Urdu + English</span>
                <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-gold" /> Rs 83/day</span>
              </div>
            </div>
            {/* Dashboard mockup */}
            <div className="md:col-span-2 animate-fade-up" style={{ animationDelay: '300ms', animationDuration: '800ms' }}>
              <div className="border border-[#2A2A2A] bg-[#111111] p-4 space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-[#2A2A2A]">
                  <Scissors className="w-4 h-4 text-gold" />
                  <span className="text-xs font-heading font-bold tracking-tight">TODAY</span>
                  <span className="ml-auto text-[10px] text-white/40 font-mono">Wed, 1 Apr</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'REVENUE', value: 'Rs 34,500' },
                    { label: 'DONE', value: '18 of 22' },
                    { label: 'WALK-INS', value: '7' },
                    { label: 'CASH DRAWER', value: 'Rs 18,200' },
                  ].map((stat) => (
                    <div key={stat.label} className="border border-[#2A2A2A] p-2.5">
                      <p className="text-[9px] text-white/40 tracking-wider">{stat.label}</p>
                      <p className="text-sm font-heading font-bold tabular-nums">{stat.value}</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  {[
                    { client: 'Ayesha B.', service: 'Haircut + Blow Dry', time: '3:00 PM' },
                    { client: 'Walk-in #7', service: 'Beard Trim', time: '3:15 PM' },
                    { client: 'Fatima K.', service: 'Full Color', time: '3:30 PM' },
                  ].map((apt) => (
                    <div key={apt.client} className="flex items-center gap-2 px-2 py-1.5 border border-[#2A2A2A] text-[11px]">
                      <div className="w-1.5 h-1.5 bg-gold" />
                      <span className="font-medium">{apt.client}</span>
                      <span className="text-white/40 ml-auto">{apt.service}</span>
                      <span className="text-white/30 font-mono text-[10px]">{apt.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── WHITE: Social proof ── */}
      <div className="bg-white border-b border-[#D4D4D4]">
        <div className="max-w-6xl mx-auto px-5 py-4 flex flex-wrap items-center justify-center gap-x-10 gap-y-2 text-xs text-[#1A1A1A]/50">
          <span className="font-semibold text-[#1A1A1A]/70 tracking-wider uppercase">Used by salons in</span>
          {['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Faisalabad'].map((city) => (
            <span key={city} className="flex items-center gap-1.5">
              <span className="w-1 h-1 bg-gold" />
              {city}
            </span>
          ))}
        </div>
      </div>

      {/* ── WHITE: The real problems ── */}
      <section className="bg-white text-[#1A1A1A] py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-5">
          <div className="grid md:grid-cols-2 gap-12 md:gap-20 items-start">
            <div>
              <h2 className="font-heading text-2xl md:text-3xl font-bold mb-2 scroll-reveal">Every salon owner knows this feeling</h2>
              <p className="text-[#1A1A1A]/50 text-sm mb-8">You&apos;re not running a bad business. You just don&apos;t have the right tools.</p>
              <div className="space-y-4">
                {[
                  { problem: 'The cash never adds up', detail: 'It\'s 10 PM. Register says Rs 18,000. Drawer has Rs 15,400. Two hours later you still don\'t know where Rs 2,600 went.' },
                  { problem: 'Commission day is a fight', detail: 'Month-end. Calculator out. Going through every entry. "I did 45 services, not 38." You have no proof either way.' },
                  { problem: 'WhatsApp is not a booking system', detail: 'Eid is in 3 days. 40 unread messages. You\'ve double-booked the 11 AM slot. The client is already on her way.' },
                ].map((item) => (
                  <div key={item.problem} className="flex gap-4 p-4 border border-[#D4D4D4]">
                    <div className="w-8 h-8 border border-red-200 bg-red-50 text-red-600 flex items-center justify-center shrink-0 text-xs font-bold font-mono">!</div>
                    <div>
                      <p className="font-semibold text-sm mb-1">{item.problem}</p>
                      <p className="text-xs text-[#1A1A1A]/50 leading-relaxed">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="border border-gold/30 bg-gold/5 p-6 md:p-8">
              <p className="font-heading font-bold text-sm mb-5 text-gold tracking-wider uppercase">With BrBr, that&apos;s over</p>
              <div className="space-y-4">
                {[
                  'Every bill is digital. Cash drawer balances automatically. You know exactly where every rupee went.',
                  'Commission calculates itself — percentage or flat, per service, per stylist. No calculator. No arguments.',
                  'Clients book into real time slots. Confirmations go out on WhatsApp automatically. Double bookings are impossible.',
                ].map((point) => (
                  <div key={point} className="flex gap-3">
                    <Check className="w-4 h-4 text-gold shrink-0 mt-0.5" />
                    <p className="text-sm leading-relaxed">{point}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── BLACK: Feature 1 — Calendar ── */}
      <section id="features" className="bg-[#1A1A1A] text-white py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-5">
          <div className="grid md:grid-cols-5 gap-10 md:gap-16 items-center">
            <div className="md:col-span-3 scroll-reveal">
              <div className="flex items-center gap-2 mb-4">
                <CalendarDays className="w-4 h-4 text-gold" />
                <span className="text-[10px] font-semibold tracking-[0.2em] text-gold uppercase">Bookings</span>
              </div>
              <h3 className="font-heading text-xl md:text-2xl font-bold mb-4">
                One screen. Every stylist. The whole day.
              </h3>
              <p className="text-white/60 text-sm mb-6 leading-relaxed max-w-lg">
                Each stylist gets a column. You see who&apos;s free, who&apos;s booked, and who&apos;s running late — without asking anyone. Walk-ins get a token number. Friday Jummah prayer blocks automatically.
              </p>
              <ul className="space-y-2">
                {['Per-stylist column calendar', 'Walk-in token queue for Eid rush', 'WhatsApp confirmation sent automatically', 'Jummah and prayer time blocks built in'].map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-white/80">
                    <Check className="w-3.5 h-3.5 text-gold shrink-0" /> {f}
                  </li>
                ))}
              </ul>
            </div>
            <div className="md:col-span-2 border border-[#2A2A2A] bg-[#111111] p-4">
              <div className="flex gap-2 text-[10px] font-heading font-semibold text-white/40 tracking-wider mb-2 pb-2 border-b border-[#2A2A2A]">
                <span className="w-10 shrink-0">TIME</span>
                <span className="flex-1 text-center">USMAN</span>
                <span className="flex-1 text-center">BILAL</span>
              </div>
              {['10:00', '10:30', '11:00', '11:30', '12:00'].map((time, i) => (
                <div key={time} className="flex gap-2 mb-1">
                  <span className="text-[10px] text-white/30 font-mono w-10 shrink-0 pt-1">{time}</span>
                  <div className={`flex-1 px-2 py-1.5 text-[10px] border ${i === 0 ? 'border-gold/40 bg-gold/10 text-gold font-medium' : i === 2 ? 'border-blue-500/30 bg-blue-500/10 text-blue-400 font-medium' : 'border-transparent'}`}>
                    {i === 0 ? 'Ahmed K. — Haircut' : i === 2 ? 'Walk-in #4 — Shave' : ''}
                  </div>
                  <div className={`flex-1 px-2 py-1.5 text-[10px] border ${i === 1 ? 'border-purple-500/30 bg-purple-500/10 text-purple-400 font-medium' : i === 3 ? 'border-gold/40 bg-gold/10 text-gold font-medium' : 'border-transparent'}`}>
                    {i === 1 ? 'Fahad S. — Color' : i === 3 ? 'Ali R. — Beard Trim' : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── WHITE: Feature 2 — Payments ── */}
      <section className="bg-white text-[#1A1A1A] py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-5">
          <div className="grid md:grid-cols-5 gap-10 md:gap-16 items-center">
            <div className="md:col-span-2 md:order-1 order-2 scroll-reveal">
              <div className="border border-[#1A1A1A] bg-[#1A1A1A] text-white p-4">
                <p className="text-[10px] text-white/40 font-mono mb-3 pb-2 border-b border-[#2A2A2A]">BILL #BB-20260401-014</p>
                <div className="space-y-1.5 text-xs pb-3 mb-3 border-b border-[#2A2A2A]">
                  <div className="flex justify-between"><span className="text-white/60">Premium Haircut</span><span className="tabular-nums">Rs 500</span></div>
                  <div className="flex justify-between"><span className="text-white/60">Beard Styling</span><span className="tabular-nums">Rs 300</span></div>
                  <div className="flex justify-between"><span className="text-white/60">Head Massage</span><span className="tabular-nums">Rs 300</span></div>
                </div>
                <div className="flex justify-between font-bold text-sm mb-3">
                  <span>TOTAL</span><span className="text-gold tabular-nums">Rs 1,100</span>
                </div>
                <div className="flex gap-1.5">
                  {['Cash', 'JazzCash', 'EasyPaisa', 'Card'].map((m, i) => (
                    <span key={m} className={`text-[10px] px-2 py-1 border font-mono ${i === 0 ? 'border-gold bg-gold text-black font-bold' : 'border-[#2A2A2A] text-white/50'}`}>
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="md:col-span-3 md:order-2 order-1 scroll-reveal">
              <div className="flex items-center gap-2 mb-4">
                <Banknote className="w-4 h-4 text-gold" />
                <span className="text-[10px] font-semibold tracking-[0.2em] text-gold uppercase">Billing & Payments</span>
              </div>
              <h3 className="font-heading text-xl md:text-2xl font-bold mb-4">
                Cash, JazzCash, EasyPaisa, udhaar — all tracked
              </h3>
              <p className="text-[#1A1A1A]/60 text-sm mb-6 leading-relaxed max-w-lg">
                Tap to add services. Pick the payment method. Bill is done. If the customer pays Rs 700 cash and Rs 400 JazzCash, record both in one split bill. Udhaar? Set a per-client limit so it doesn&apos;t get out of hand.
              </p>
              <ul className="space-y-2">
                {['Tap-to-bill POS — faster than a calculator', 'Split payments across any methods', 'Udhaar tracking with per-client limits', 'WhatsApp receipt to the client in one tap'].map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm">
                    <Check className="w-3.5 h-3.5 text-gold shrink-0" /> {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── BLACK: Feature 3 — Staff ── */}
      <section className="bg-[#1A1A1A] text-white py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-5">
          <div className="grid md:grid-cols-5 gap-10 md:gap-16 items-center">
            <div className="md:col-span-3 scroll-reveal">
              <div className="flex items-center gap-2 mb-4">
                <UserCog className="w-4 h-4 text-gold" />
                <span className="text-[10px] font-semibold tracking-[0.2em] text-gold uppercase">Staff & Payroll</span>
              </div>
              <h3 className="font-heading text-xl md:text-2xl font-bold mb-4">
                No more month-end calculator sessions
              </h3>
              <p className="text-white/60 text-sm mb-6 leading-relaxed max-w-lg">
                Set Usman at 25% commission. Set Bilal at Rs 50 flat per service. BrBr calculates it every day. At month-end, payroll is one screen — base salary, commission earned, tips, advances deducted, late penalties. Net amount. Done.
              </p>
              <ul className="space-y-2">
                {['Commission per service — percentage or flat', 'PIN check-in attendance', 'Advance tracking with auto-deduction', 'One-screen monthly payroll'].map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-white/80">
                    <Check className="w-3.5 h-3.5 text-gold shrink-0" /> {f}
                  </li>
                ))}
              </ul>
            </div>
            <div className="md:col-span-2 border border-[#2A2A2A] bg-[#111111] p-4">
              <p className="text-[10px] font-heading font-semibold text-white/40 tracking-wider mb-3 pb-2 border-b border-[#2A2A2A]">MARCH PAYROLL — USMAN GHANI</p>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-white/50">Base salary</span><span className="tabular-nums">Rs 20,000</span></div>
                <div className="flex justify-between"><span className="text-white/50">Commission (42 services × 25%)</span><span className="text-green-400 tabular-nums">+ Rs 8,750</span></div>
                <div className="flex justify-between"><span className="text-white/50">Tips collected</span><span className="text-green-400 tabular-nums">+ Rs 1,200</span></div>
                <div className="flex justify-between"><span className="text-white/50">Advance taken on 12th</span><span className="text-red-400 tabular-nums">- Rs 3,000</span></div>
                <div className="flex justify-between"><span className="text-white/50">Late 2 days × Rs 200</span><span className="text-red-400 tabular-nums">- Rs 400</span></div>
                <div className="border-t border-[#2A2A2A] pt-2 mt-2 flex justify-between font-bold">
                  <span>NET PAYABLE</span><span className="text-gold tabular-nums">Rs 26,550</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── WHITE: More features ── */}
      <section className="bg-white text-[#1A1A1A] py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-5">
          <h2 className="font-heading text-2xl md:text-3xl font-bold mb-3 scroll-reveal">Everything else your salon needs</h2>
          <p className="text-[#1A1A1A]/50 text-sm mb-10 max-w-lg scroll-reveal">Built by people who understand how Pakistani salons actually run.</p>
          <div className="grid md:grid-cols-3 gap-px bg-[#D4D4D4] border border-[#D4D4D4]">
            {[
              { icon: MessageCircle, title: 'WhatsApp Automation', desc: 'Booking confirmations, payment receipts, birthday wishes, udhaar reminders, and win-back messages for clients who haven\'t visited in 30 days. English or Urdu.' },
              { icon: BarChart3, title: 'Daily Report to Your Phone', desc: 'Every evening at 9 PM: total revenue, payment breakdown, top services, staff performance, cash vs digital. Sent to your WhatsApp.' },
              { icon: Scissors, title: 'Inventory & Packages', desc: 'Know when shampoo, color, or beard oil is running low before you run out. Create packages like "Groom Special: Haircut + Beard + Facial" with one price.' },
            ].map((f) => (
              <div key={f.title} className="bg-white p-6 flex gap-4 scroll-reveal transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                <div className="w-9 h-9 border border-[#D4D4D4] flex items-center justify-center shrink-0">
                  <f.icon className="w-4 h-4 text-gold" />
                </div>
                <div>
                  <h4 className="font-heading font-semibold text-base mb-1.5">{f.title}</h4>
                  <p className="text-xs text-[#1A1A1A]/50 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BLACK: Pricing ── */}
      <section id="pricing" className="bg-[#1A1A1A] text-white py-20 md:py-28">
        <div className="max-w-5xl mx-auto px-5">
          <div className="text-center mb-12">
            <h2 className="font-heading text-2xl md:text-3xl font-bold mb-3">Cheaper than a haircut per day</h2>
            <p className="text-white/50 text-sm">All prices in PKR/month. Every plan includes 14 days free — no card required.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-px bg-[#2A2A2A] border border-[#2A2A2A]">
            {PLANS.map((plan) => (
              <div key={plan.name} className={`p-6 relative transition-all duration-200 hover:-translate-y-1 hover:shadow-xl ${plan.popular ? 'bg-white text-[#1A1A1A]' : 'bg-[#111111]'}`}>
                {plan.popular && <div className="absolute top-0 left-0 right-0 h-1 bg-gold" />}
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-heading text-base font-bold">{plan.name}</h3>
                  {plan.popular && <span className="text-[9px] font-bold text-gold tracking-widest uppercase">Most Popular</span>}
                </div>
                <p className="text-2xl font-heading font-bold mb-0.5 tabular-nums">
                  Rs {plan.price}<span className={`text-xs font-normal ${plan.popular ? 'text-[#1A1A1A]/40' : 'text-white/40'}`}>/mo</span>
                </p>
                <p className={`text-[11px] mb-5 ${plan.popular ? 'text-[#1A1A1A]/50' : 'text-white/50'}`}>{plan.sub}</p>
                <ul className="space-y-2 mb-6">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs">
                      <Check className="w-3.5 h-3.5 shrink-0 text-gold" /> {f}
                    </li>
                  ))}
                </ul>
                <Link href="/login" className={`block text-center py-2.5 text-sm font-semibold transition-colors border ${
                  plan.popular
                    ? 'bg-gold text-black border-gold hover:bg-gold/90'
                    : 'border-[#2A2A2A] text-white hover:border-gold hover:text-gold'
                }`}>
                  Start 14-Day Trial
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHITE: Testimonials ── */}
      <section className="bg-white text-[#1A1A1A] py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-5">
          <h2 className="font-heading text-2xl md:text-3xl font-bold mb-10 scroll-reveal">Salon owners talk</h2>
          <div className="grid md:grid-cols-3 gap-px bg-[#D4D4D4] border border-[#D4D4D4]">
            {TESTIMONIALS.map((t, i) => (
              <div key={t.name} className={`p-6 scroll-reveal ${i === 0 ? 'bg-[#1A1A1A] text-white' : 'bg-white'}`}>
                <div className="flex gap-0.5 mb-4">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} className="w-3 h-3 text-gold fill-gold" />
                  ))}
                </div>
                <p className={`text-sm leading-relaxed mb-5 ${i === 0 ? 'text-white/70' : 'text-[#1A1A1A]/60'}`}>
                  &ldquo;{t.text}&rdquo;
                </p>
                <div className={`flex items-center gap-3 pt-4 ${i === 0 ? 'border-t border-[#2A2A2A]' : 'border-t border-[#D4D4D4]'}`}>
                  <div className="w-8 h-8 bg-gold/15 text-gold font-bold text-xs flex items-center justify-center rounded-full">
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{t.name}</p>
                    <p className={`text-[11px] ${i === 0 ? 'text-white/40' : 'text-[#1A1A1A]/40'}`}>{t.salon}, {t.city}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── GREY: FAQ ── */}
      <section id="faq" className="bg-[#F2F2F2] text-[#1A1A1A] py-20 md:py-28">
        <div className="max-w-3xl mx-auto px-5">
          <h2 className="font-heading text-2xl md:text-3xl font-bold mb-8">Questions we get asked</h2>
          <div className="border border-[#D4D4D4] divide-y divide-[#D4D4D4]">
            {FAQS.map((faq) => (
              <details key={faq.q} className="group bg-white">
                <summary className="px-5 py-4 cursor-pointer text-sm font-medium flex items-center justify-between list-none select-none hover:bg-[#F2F2F2] transition-colors">
                  {faq.q}
                  <ChevronDown className="w-4 h-4 text-[#1A1A1A]/40 group-open:rotate-180 transition-transform duration-200 shrink-0 ml-4" />
                </summary>
                <div className="px-5 pb-4 text-sm text-[#1A1A1A]/60 leading-relaxed animate-fade-up">{faq.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── BLACK: CTA ── */}
      <section className="bg-[#1A1A1A] text-white py-20 md:py-28">
        <div className="max-w-3xl mx-auto px-5 text-center">
          <h2 className="font-heading text-2xl md:text-3xl font-bold mb-4">
            Your salon is already a good business.<br />BrBr just makes the hisab kitab easy.
          </h2>
          <p className="text-white/50 text-sm mb-8 max-w-lg mx-auto">
            14 days free. No card. Set up in 5 minutes. If it doesn&apos;t help, don&apos;t pay.
          </p>
          <Link href="/login" className="inline-flex items-center gap-2 bg-gold text-black px-8 py-4 text-sm font-bold hover:bg-gold/90 transition-colors border border-gold">
            <Scissors className="w-4 h-4" /> Start Free Trial <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ── BLACK: Footer ── */}
      <footer className="bg-[#1A1A1A] text-white/50 border-t border-[#2A2A2A] py-8">
        <div className="max-w-6xl mx-auto px-5">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Scissors className="w-4 h-4 text-gold" />
              <span className="font-heading font-bold text-sm tracking-tight text-white">BRBR</span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <a href="#features" className="py-2 px-1 hover:text-gold transition-colors">Features</a>
              <a href="#pricing" className="py-2 px-1 hover:text-gold transition-colors">Pricing</a>
              <a href="#faq" className="py-2 px-1 hover:text-gold transition-colors">FAQ</a>
              <Link href="/login" className="py-2 px-1 hover:text-gold transition-colors">Login</Link>
              <span className="text-white/30">·</span>
              <span className="text-[11px] text-white/30">Privacy Policy</span>
              <span className="text-[11px] text-white/30">Terms of Service</span>
            </div>
            <p className="text-[11px]">© 2025 BrBr — brbr.pk</p>
          </div>
        </div>
      </footer>

      {/* WhatsApp float */}
      <a
        href="https://wa.me/923001234567?text=BrBr%20ke%20baare%20mein%20puchna%20tha"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 w-12 h-12 bg-[#25D366] flex items-center justify-center hover:scale-110 transition-transform duration-200 z-50 border border-[#25D366]"
        style={{ animation: 'pulse-gold 2s ease-in-out infinite', '--tw-ring-color': '#25D366' } as React.CSSProperties}
        aria-label="Chat on WhatsApp"
      >
        <MessageCircle className="w-6 h-6 text-white" />
      </a>
    </div>
  );
}
