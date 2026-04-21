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
        <p className="text-sm text-[#1A1A1A]/40 mb-12">Last updated: April 21, 2026</p>

        <div className="space-y-8 text-sm text-[#1A1A1A]/70 leading-relaxed">

          <section>
            <h2 className="text-base font-bold text-[#1A1A1A] mb-3">7-Day Money-Back Guarantee</h2>
            <p>
              iCut does not offer free trials. Instead, every paid subscription is covered by a <strong>7-day refund window</strong>. If iCut is not the right fit for your salon, email us within <strong>7 days of your first payment</strong> and we will refund your subscription in full — no questions asked.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#1A1A1A] mb-3">After the 7-Day Window</h2>
            <p>
              iCut subscriptions are billed monthly. After the 7-day refund window closes, we do not offer partial or prorated refunds for unused time within a billing cycle. When you cancel, your access continues until the end of your current paid period, at which point you will not be charged again.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#1A1A1A] mb-3">How to Request a Refund</h2>
            <p>
              Email us at{' '}
              <a href="mailto:contact@icut.pk" className="text-gold hover:underline">
                contact@icut.pk
              </a>{' '}
              or message us on{' '}
              <a href="https://wa.me/923009402802" className="text-gold hover:underline" target="_blank" rel="noopener noreferrer">
                WhatsApp +92 300 9402802
              </a>{' '}
              with your salon name, the email you used to sign up, and a short note about why you&apos;re requesting a refund. Refunds are processed to the original payment method within <strong>7 business days</strong> of the request.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#1A1A1A] mb-3">How to Cancel</h2>
            <p>
              You can cancel your subscription at any time from the <strong>Settings page</strong> inside iCut, or by contacting us on{' '}
              <a href="https://wa.me/923009402802" className="text-gold hover:underline" target="_blank" rel="noopener noreferrer">
                WhatsApp +92 300 9402802
              </a>{' '}
              or{' '}
              <a href="mailto:contact@icut.pk" className="text-gold hover:underline">
                contact@icut.pk
              </a>
              . Cancelling after the 7-day window does not trigger a refund, but stops all future billing.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#1A1A1A] mb-3">Billing Disputes</h2>
            <p>
              If you believe you were charged incorrectly or have a billing concern outside of the standard refund window, please contact us within <strong>30 days</strong> of the charge. We will review and resolve your dispute within <strong>7 business days</strong>.
            </p>
          </section>

        </div>
      </div>
    </PublicLayout>
  );
}
