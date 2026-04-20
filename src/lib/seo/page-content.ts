import type { CityRecord } from './cities';
import type { VerticalRecord } from './verticals';

/**
 * Produces a structured SEO page payload for a (city, vertical) pair.
 * Every section weaves in per-city data so two cities don't produce
 * identical copy. Google treats programmatic pages with genuinely
 * distinct content as legitimate, not doorway spam.
 */

export interface FAQ {
  q: string;
  a: string;
}

export interface PageContent {
  title: string;              // <title>
  description: string;        // meta description
  h1: string;                 // visible headline
  heroIntro: string;
  cityParagraph: string;      // unique per-city paragraph
  painPoints: string[];
  features: string[];
  pricingNote: string;
  paymentMethodsNote: string;
  hoursNote: string;
  faqs: FAQ[];
  canonicalPath: string;
}

function formatList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function cityPhrase(c: CityRecord): string {
  return `${c.city}, ${c.countryName}`;
}

export function generatePageContent(
  city: CityRecord,
  vertical: VerticalRecord,
): PageContent {
  const h1 = vertical.headlineTemplate(city.city);
  const title = `${h1} — iCut`;
  const description = `${vertical.keyword} built for salons and barbershops in ${cityPhrase(city)}. Bookings, billing, commissions, CRM and reports in one product. Starting around ${startingPrice(city)}/month.`;

  const paymentMethodsNote =
    `Checkout supports the payment rails your ${city.city} clients already use: ${formatList(city.paymentMethods)}. The cash drawer reconciles every evening so end-of-day shorts become immediately visible.`;

  const hoursNote =
    `Peak hours in ${city.city} cluster around ${city.peakHours}. iCut\u2019s booking grid handles walk-in overflow during that window without forcing anyone to wait silently.`;

  const pricingNote = pricingNoteFor(city);

  const cityParagraph = buildCityParagraph(city, vertical);

  const faqs = buildFaqs(city, vertical);

  return {
    title,
    description,
    h1,
    heroIntro: vertical.heroIntro(cityPhrase(city)),
    cityParagraph,
    painPoints: vertical.painPoints,
    features: vertical.features,
    pricingNote,
    paymentMethodsNote,
    hoursNote,
    faqs,
    canonicalPath: `/${vertical.route}/${city.slug}`,
  };
}

function startingPrice(c: CityRecord): string {
  // Rough starting-tier pricing converted to local currency. The product
  // bills in PKR; Gulf operators see a converted invoice. Numbers are
  // indicative, not a quote.
  switch (c.currency) {
    case 'PKR': return `Rs ${c.priceTier === 'premium' ? '4,999' : c.priceTier === 'mid' ? '2,999' : '1,999'}`;
    case 'AED': return `AED ${c.priceTier === 'premium' ? '149' : '99'}`;
    case 'SAR': return `SAR ${c.priceTier === 'premium' ? '149' : '99'}`;
    case 'QAR': return `QAR ${c.priceTier === 'premium' ? '149' : '99'}`;
    case 'KWD': return `KWD ${c.priceTier === 'premium' ? '19' : '12'}`;
    case 'BHD': return `BHD ${c.priceTier === 'premium' ? '19' : '12'}`;
    case 'OMR': return `OMR ${c.priceTier === 'premium' ? '19' : '12'}`;
  }
}

function pricingNoteFor(c: CityRecord): string {
  const price = startingPrice(c);
  const tierNote = c.priceTier === 'premium'
    ? 'Premium-market feature set with multi-branch reporting and advanced analytics.'
    : c.priceTier === 'mid'
      ? 'Mid-market plan balancing full billing + CRM + basic multi-branch.'
      : 'Value-tier plan focused on single-branch billing, inventory, and staff.';
  return `Plans start around ${price} per month for a single branch. ${tierNote} No setup fee. First 14 days free.`;
}

function buildCityParagraph(c: CityRecord, v: VerticalRecord): string {
  const bits: string[] = [];

  bits.push(`${c.city} is ${c.country === 'PK' ? 'a' : 'one of'} ${c.countryName}'s ${c.region === 'ICT' || c.region === 'Capital' ? 'federal-capital' : c.region} ${c.country === 'PK' ? 'markets' : 'emirate-level markets'} with ${c.population} residents and ${c.salonCount}.`);

  bits.push(c.context);

  if (v.slug === 'ladies-salon-software') {
    bits.push(`Ladies salons in ${c.city} typically run ${c.country === 'PK' ? 'threading, waxing, facial, hair-colour and bridal packages' : 'a full beauty-room menu from brow threading to bridal henna'}, often with separate rate cards per therapist.`);
  } else if (v.slug === 'barbershop-software') {
    bits.push(`Barbershops in ${c.city} typically see the heaviest walk-in surge around ${c.peakHours.split('\u2013')[0].trim()}, with ${c.country === 'PK' ? 'commission splits between 30\u201350%' : 'commission typically running 25\u201340%'} of each service.`);
  } else if (v.slug === 'salon-pos') {
    bits.push(`For a ${c.priceTier}-tier salon in ${c.city}, the daily billing volume moves across ${formatList(c.paymentMethods.slice(0, 3))} \u2014 iCut handles all of them on one checkout screen.`);
  } else if (v.slug === 'salon-crm') {
    bits.push(`A typical ${c.city} salon loses 30\u201340% of first-time clients by month three. iCut\u2019s CRM flags those drops automatically and triggers ${c.country === 'PK' ? 'WhatsApp' : 'WhatsApp or SMS'} win-back messages before the client is truly gone.`);
  } else {
    bits.push(`For ${c.priceTier}-tier salons in ${c.city}, the day-to-day coverage includes bookings, inventory, staff commission, and a daily P&L \u2014 iCut ships all of those out of the box.`);
  }

  bits.push(`Customer service is in ${c.languages[0]}${c.languages.length > 1 ? ` and ${c.languages[1]}` : ''}, with ${c.country === 'PK' ? 'WhatsApp support at +92 300 9402802' : 'email + WhatsApp support'}.`);

  return bits.join(' ');
}

function buildFaqs(c: CityRecord, v: VerticalRecord): FAQ[] {
  const items: FAQ[] = [];

  items.push({
    q: `Does iCut work for salons in ${c.city}?`,
    a: `Yes. iCut is built for salons and barbershops across ${c.countryName}, including ${c.city}. The product ships in ${c.languages[0]}${c.languages.length > 1 ? ` and ${c.languages[1]}` : ''} and integrates with ${formatList(c.paymentMethods.slice(0, 3))}.`,
  });

  items.push({
    q: `How much does ${v.label.toLowerCase()} cost in ${c.city}?`,
    a: pricingNoteFor(c),
  });

  items.push({
    q: `Which payment methods does iCut support in ${c.city}?`,
    a: `Checkout handles ${formatList(c.paymentMethods)}. You can split a single bill across multiple payment methods (e.g. partial cash + partial JazzCash), and the cash drawer reconciles every evening.`,
  });

  if (v.slug === 'ladies-salon-software') {
    items.push({
      q: `Can iCut handle bridal packages with multiple sittings?`,
      a: `Yes. Bridal packages in ${c.city} typically span trial, engagement, mehndi and baraat sittings \u2014 iCut tracks each stage with a carry-forward balance and sends reminders before each appointment.`,
    });
    items.push({
      q: `Is iCut appropriate for a ladies-only salon?`,
      a: `iCut supports a ladies-only permission model: female staff and female owners can see everything they need; male staff (if any, for admin roles) see no personal client data. Privacy norms in ${c.city} are respected by design.`,
    });
  } else if (v.slug === 'barbershop-software') {
    items.push({
      q: `Does iCut handle walk-ins without forcing appointments?`,
      a: `Yes. The walk-in queue lets the front desk add a ticket in seconds, estimate wait time, and assign the next available barber. Appointments are available too, but walk-ins are the default for most ${c.city} barbershops.`,
    });
    items.push({
      q: `Can iCut track tips and commission for multiple barbers?`,
      a: `Yes. Every service is attributed to the barber who performed it, and commission is calculated automatically at the percentage or flat rate you configure. Tips can be pooled, shared role-weighted, or kept individually.`,
    });
  } else if (v.slug === 'salon-crm') {
    items.push({
      q: `How does iCut\u2019s win-back campaign work?`,
      a: `iCut flags clients who haven\u2019t visited in 45+ days and lets you trigger a WhatsApp message (one-click) with an optional auto-applied discount. The dashboard tracks how many of those messages converted back into a real appointment.`,
    });
    items.push({
      q: `Can I import my existing client list?`,
      a: `Yes. If you have your clients in a spreadsheet, WhatsApp chats, or a previous POS, iCut\u2019s import tool handles CSV, and our ${c.country === 'PK' ? 'support team in Urdu/English' : 'support team'} will help you map fields on the first call.`,
    });
  } else if (v.slug === 'salon-pos') {
    items.push({
      q: `Does iCut work offline when my internet drops?`,
      a: `Yes. iCut\u2019s POS is offline-first: you keep billing during an outage, and everything syncs automatically when connectivity returns. This matters in ${c.city} where momentary outages are common.`,
    });
    items.push({
      q: `Can I track commission per stylist per service?`,
      a: `Yes. Every service line in a bill is attributed to the stylist who performed it. Commission accrues instantly at their configured rate \u2014 no end-of-month reconstruction from memory.`,
    });
  } else {
    items.push({
      q: `Does iCut support multiple branches?`,
      a: `Yes. You can run unlimited branches from one account, with per-branch revenue, staff, inventory, and expenses \u2014 plus a cross-branch owner dashboard that rolls everything up.`,
    });
    items.push({
      q: `How long does setup take?`,
      a: `Most ${c.city} salons are live the same day. Add your branches, services, staff and initial inventory; iCut\u2019s onboarding flow walks you through it in under an hour.`,
    });
  }

  items.push({
    q: `How do I start a free trial?`,
    a: `Sign up at icut.pk/login and pick your plan. The first 14 days are free with no credit card required. For help, WhatsApp +92 300 9402802 or email contact@icut.pk.`,
  });

  return items;
}

export function jsonLd(page: PageContent, origin: string): string {
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: page.faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.a,
      },
    })),
  };
  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'iCut',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      priceCurrency: 'PKR',
      price: '2999',
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      ratingCount: '120',
    },
    url: `${origin}${page.canonicalPath}`,
    description: page.description,
  };
  return JSON.stringify([faqSchema, productSchema]);
}
