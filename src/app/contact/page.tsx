import { Metadata } from 'next';
import { MessageCircle, Mail, Clock } from 'lucide-react';
import PublicLayout from '@/components/public-layout';

export const metadata: Metadata = {
  title: 'Contact — iCut',
  description: 'Get in touch with iCut support via WhatsApp or email.',
};

export default function ContactPage() {
  return (
    <PublicLayout>
      <div className="max-w-2xl mx-auto px-5 py-16 md:py-24">
        <div className="mb-12">
          <h1 className="text-3xl font-bold text-[#1A1A1A] mb-3">Get in Touch</h1>
          <p className="text-sm text-[#1A1A1A]/60 leading-relaxed">
            We usually reply within a few hours during business hours.
          </p>
        </div>

        <div className="space-y-4">

          {/* WhatsApp */}
          <a
            href="https://wa.me/923001234567"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-4 p-6 border border-[#E8E8E8] hover:border-gold/30 hover:bg-gold/5 transition-colors block"
          >
            <div className="mt-0.5 shrink-0">
              <MessageCircle className="w-5 h-5 text-gold" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#1A1A1A] mb-0.5">+92 300 123 4567</p>
              <p className="text-xs text-[#1A1A1A]/50 leading-relaxed">
                Quick help, billing questions, and setup assistance.
              </p>
            </div>
          </a>

          {/* Email */}
          <a
            href="mailto:support@icut.pk"
            className="flex items-start gap-4 p-6 border border-[#E8E8E8] hover:border-gold/30 hover:bg-gold/5 transition-colors block"
          >
            <div className="mt-0.5 shrink-0">
              <Mail className="w-5 h-5 text-gold" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#1A1A1A] mb-0.5">support@icut.pk</p>
              <p className="text-xs text-[#1A1A1A]/50 leading-relaxed">
                Formal requests, data questions, and billing disputes.
              </p>
            </div>
          </a>

          {/* Hours */}
          <div className="flex items-start gap-4 p-6 border border-[#E8E8E8] bg-[#FAFAFA]">
            <div className="mt-0.5 shrink-0">
              <Clock className="w-5 h-5 text-[#1A1A1A]/40" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#1A1A1A] mb-0.5">Business Hours</p>
              <p className="text-xs text-[#1A1A1A]/50 leading-relaxed">
                Monday &mdash; Saturday, 10am &mdash; 7pm PKT
              </p>
            </div>
          </div>

        </div>
      </div>
    </PublicLayout>
  );
}
