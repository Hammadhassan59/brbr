import { Metadata } from 'next';
import PublicLayout from '@/components/public-layout';

export const metadata: Metadata = {
  title: 'About — iCut',
  description: 'iCut is built for Pakistani salons, by people who understand your business.',
};

export default function AboutPage() {
  return (
    <PublicLayout>

      {/* Dark hero */}
      <div className="bg-[#161616] border-b border-[#222]">
        <div className="max-w-3xl mx-auto px-5 pt-16 pb-14 md:pt-24 md:pb-20">
          <p className="text-[10px] font-bold tracking-[0.15em] text-gold uppercase mb-4">
            ABOUT ICUT
          </p>
          <h1 className="text-2xl md:text-4xl font-bold text-[#EFEFEF] leading-tight mb-5">
            Built for Pakistani salons, by people who understand your business
          </h1>
          <p className="text-sm md:text-base text-[#EFEFEF]/50 leading-relaxed max-w-xl">
            Every salon owner in Pakistan runs their business on WhatsApp, a calculator, and a notebook. We built iCut to replace all three.
          </p>
        </div>
      </div>

      {/* White content area */}
      <div className="max-w-3xl mx-auto px-5 py-16 md:py-24">

        {/* Origin story */}
        <section className="mb-16">
          <h2 className="text-xl font-bold text-[#1A1A1A] mb-6">Why we built this</h2>
          <div className="space-y-4 text-sm text-[#1A1A1A]/70 leading-relaxed">
            <p>
              Pakistani salon owners are some of the hardest-working entrepreneurs in the country. A typical day involves tracking walk-ins by hand, calculating staff commissions on a calculator, managing udhaar in a notebook, and answering booking requests on WhatsApp at midnight. The tools available were either too expensive, too complicated, or built for a completely different market.
            </p>
            <p>
              We built iCut from the ground up for the way Pakistani salons actually work — phone number login with a staff PIN instead of email and password, JazzCash and EasyPaisa built in from day one, Jummah prayer blocks in the appointment calendar, and udhaar tracking for loyal clients who pay at the end of the month. No complex setup. No lengthy onboarding. A new staff member can be trained in under five minutes.
            </p>
            <p>
              iCut is made by Inparlor Technologies Pvt Ltd. We are a small team focused on one thing: making salon owners&apos; lives a little easier, one appointment at a time.
            </p>
          </div>
        </section>

        {/* Team */}
        <section>
          <h2 className="text-xl font-bold text-[#1A1A1A] mb-6">The Team</h2>
          <p className="text-sm text-[#1A1A1A]/70 leading-relaxed">
            iCut is built by a small team at Inparlor Technologies Pvt Ltd. We talk to salon owners every week and ship what they actually need.
          </p>
        </section>

      </div>
    </PublicLayout>
  );
}
