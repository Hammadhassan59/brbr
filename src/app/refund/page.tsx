import { Metadata } from 'next';
import PublicLayout from '@/components/public-layout';

export const metadata: Metadata = {
  title: 'Refund Policy — iCut',
  description: 'iCut refund and cancellation policy.',
};

export default function RefundPage() {
  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto px-5 py-16 md:py-24">
        <h1 className="text-3xl font-bold text-[#1A1A1A] mb-2">Refund Policy</h1>
        <p className="text-sm text-[#1A1A1A]/40 mb-12">Last updated: April 6, 2026</p>

        <div className="space-y-8 text-sm text-[#1A1A1A]/70 leading-relaxed">

          <section>
            <h2 className="text-base font-bold text-[#1A1A1A] mb-3">Free Trial</h2>
            <p>
              iCut offers a <strong>14-day free trial</strong> with no payment required. You can use the full product during your trial period without entering any billing details. If iCut is not the right fit, simply let the trial expire — no action needed.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#1A1A1A] mb-3">After You Subscribe</h2>
            <p>
              iCut subscriptions are billed monthly. We do not offer partial or prorated refunds for unused time within a billing cycle. When you cancel, your access continues until the end of your current paid period, at which point you will not be charged again.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#1A1A1A] mb-3">How to Cancel</h2>
            <p>
              You can cancel your subscription at any time from the <strong>Settings page</strong> inside iCut. You can also cancel by reaching us on{' '}
              <a href="https://wa.me/923001234567" className="text-gold hover:underline" target="_blank" rel="noopener noreferrer">
                WhatsApp +92 300 123 4567
              </a>{' '}
              or by emailing{' '}
              <a href="mailto:support@icut.pk" className="text-gold hover:underline">
                support@icut.pk
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#1A1A1A] mb-3">Disputes</h2>
            <p>
              If you believe you were charged incorrectly or have a billing concern, please contact us within <strong>30 days</strong> of the charge. Reach us on{' '}
              <a href="https://wa.me/923001234567" className="text-gold hover:underline" target="_blank" rel="noopener noreferrer">
                WhatsApp +92 300 123 4567
              </a>{' '}
              or email{' '}
              <a href="mailto:support@icut.pk" className="text-gold hover:underline">
                support@icut.pk
              </a>
              . We will review and resolve your dispute within <strong>7 business days</strong>.
            </p>
          </section>

        </div>
      </div>
    </PublicLayout>
  );
}
