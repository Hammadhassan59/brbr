import Link from 'next/link';
import { Scissors, Check, MessageCircle, Mail, Phone } from 'lucide-react';
import type { PageContent } from '@/lib/seo/page-content';
import type { CityRecord } from '@/lib/seo/cities';
import type { VerticalRecord } from '@/lib/seo/verticals';

/**
 * Shared layout for programmatic SEO city-vertical pages. Distinct copy is
 * driven by PageContent; layout is constant.
 */
export function SEOPage({
  content,
  city,
  vertical,
  jsonLdString,
}: {
  content: PageContent;
  city: CityRecord;
  vertical: VerticalRecord;
  jsonLdString: string;
}) {
  return (
    <div className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString }}
      />

      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Scissors className="w-6 h-6 text-gold" />
            <span className="font-heading text-xl font-bold">iCut</span>
          </Link>
          <Link
            href="/login"
            className="text-sm font-semibold bg-gold hover:bg-gold/90 text-black px-4 py-2 rounded-lg border border-gold"
          >
            Start free trial
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold mb-3">
          {vertical.label} · {city.city}, {city.countryName}
        </p>
        <h1 className="font-heading text-4xl md:text-5xl font-bold tracking-tight mb-6">
          {content.h1}
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-3xl">
          {content.heroIntro}
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/login"
            className="bg-gold hover:bg-gold/90 text-black font-semibold px-6 py-3 rounded-lg border border-gold"
          >
            Start 14-day free trial
          </Link>
          <a
            href="https://wa.me/923009402802"
            className="border border-border hover:bg-muted font-semibold px-6 py-3 rounded-lg flex items-center gap-2"
            rel="nofollow"
          >
            <MessageCircle className="w-4 h-4" /> WhatsApp demo
          </a>
        </div>
      </section>

      {/* Context paragraph */}
      <section className="max-w-5xl mx-auto px-6 py-10 border-t">
        <h2 className="font-heading text-2xl font-bold mb-4">
          Why this matters for {city.city} salons
        </h2>
        <p className="text-base text-foreground/85 leading-relaxed max-w-3xl">
          {content.cityParagraph}
        </p>
      </section>

      {/* Pain points */}
      <section className="max-w-5xl mx-auto px-6 py-10 border-t">
        <h2 className="font-heading text-2xl font-bold mb-6">
          What we see when {city.city} salon owners switch to iCut
        </h2>
        <ul className="space-y-3 max-w-3xl">
          {content.painPoints.map((p, i) => (
            <li key={i} className="flex gap-3">
              <span className="text-destructive mt-1.5">•</span>
              <span className="text-foreground/85 leading-relaxed">{p}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 py-10 border-t">
        <h2 className="font-heading text-2xl font-bold mb-6">
          What you get with iCut {vertical.label}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {content.features.map((f, i) => (
            <div key={i} className="flex gap-3 bg-card border rounded-lg p-4">
              <Check className="w-5 h-5 text-gold shrink-0 mt-0.5" />
              <span className="text-sm text-foreground/90 leading-relaxed">{f}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing + local notes */}
      <section className="max-w-5xl mx-auto px-6 py-10 border-t">
        <h2 className="font-heading text-2xl font-bold mb-6">
          Pricing for {city.city} salons
        </h2>
        <div className="bg-card border rounded-lg p-6 max-w-3xl space-y-4">
          <p className="text-foreground/85 leading-relaxed">{content.pricingNote}</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{content.paymentMethodsNote}</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{content.hoursNote}</p>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-5xl mx-auto px-6 py-10 border-t">
        <h2 className="font-heading text-2xl font-bold mb-6">
          Frequently asked questions about {vertical.label.toLowerCase()} in {city.city}
        </h2>
        <div className="space-y-4 max-w-3xl">
          {content.faqs.map((f, i) => (
            <details key={i} className="bg-card border rounded-lg p-5 group">
              <summary className="font-semibold cursor-pointer list-none flex items-center justify-between">
                <span>{f.q}</span>
                <span className="text-gold text-lg shrink-0 group-open:rotate-45 transition-transform">+</span>
              </summary>
              <p className="mt-3 text-foreground/80 leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA footer */}
      <section className="max-w-5xl mx-auto px-6 py-16 border-t text-center">
        <h2 className="font-heading text-3xl font-bold mb-4">
          Ready to run your {city.city} salon on iCut?
        </h2>
        <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
          Start free. No credit card. Full product access for 14 days.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/login"
            className="bg-gold hover:bg-gold/90 text-black font-bold px-8 py-3 rounded-lg border border-gold"
          >
            Start free trial
          </Link>
          <a
            href="mailto:contact@icut.pk"
            className="border border-border hover:bg-muted font-semibold px-6 py-3 rounded-lg flex items-center gap-2"
          >
            <Mail className="w-4 h-4" /> contact@icut.pk
          </a>
          <a
            href="tel:+923009402802"
            className="border border-border hover:bg-muted font-semibold px-6 py-3 rounded-lg flex items-center gap-2"
          >
            <Phone className="w-4 h-4" /> 0300 9402802
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-card">
        <div className="max-w-5xl mx-auto px-6 py-8 text-sm text-muted-foreground">
          <div className="flex flex-wrap gap-x-6 gap-y-2 mb-4">
            <Link href="/" className="hover:text-foreground">Home</Link>
            <Link href="/login" className="hover:text-foreground">Login</Link>
            <Link href="/about" className="hover:text-foreground">About</Link>
            <Link href="/contact" className="hover:text-foreground">Contact</Link>
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
          </div>
          <p>© iCut — {city.countryName} {city.city}. Serving salons and barbershops across {city.countryName}.</p>
        </div>
      </footer>
    </div>
  );
}
