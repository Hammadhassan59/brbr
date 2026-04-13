import { Metadata } from 'next';
import PublicLayout from '@/components/public-layout';

export const metadata: Metadata = {
  title: 'Terms of Service — iCut',
  description: 'Terms and conditions for using iCut salon management system.',
};

export default function TermsPage() {
  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto px-5 py-16 md:py-24">
        <h1 className="text-3xl font-bold text-[#1A1A1A] mb-2">Terms of Service</h1>
        <p className="text-sm text-[#1A1A1A]/40 mb-12">Last updated: April 6, 2026</p>

        <div className="space-y-8 text-sm text-[#1A1A1A]/70 leading-relaxed">

          <section>
            <h2 className="text-base font-bold text-[#1A1A1A] mb-3">The Service</h2>
            <p>
              iCut is a cloud-based salon management system (SaaS) provided by Inparlor Technologies Pvt Ltd. By creating an account, you agree to these terms. If you do not agree, do not use iCut.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#1A1A1A] mb-3">Your Account</h2>
            <p>
              The salon owner is responsible for all activity that happens under their account, including actions taken by staff using their assigned PINs. Keep your credentials secure and notify us immediately if you suspect unauthorized access.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#1A1A1A] mb-3">Free Trial</h2>
            <p>
              New accounts get a <strong>14-day free trial</strong>. No credit card is required. At the end of the trial, your account will automatically expire and you will need to subscribe to continue using iCut. Your data is retained for 90 days after expiry.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#1A1A1A] mb-3">Billing</h2>
            <p>
              iCut is billed monthly in Pakistani Rupees (PKR). Prices are shown on our pricing page. We may update prices with 30 days&apos; notice. Your subscription renews automatically each month until you cancel.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#1A1A1A] mb-3">Cancellation</h2>
            <p>
              You can cancel your subscription at any time from the Settings page or by contacting support. After cancellation, you retain full access until the end of your current billing cycle. Your data is kept for 90 days after that, then deleted. See our{' '}
              <a href="/refund" className="text-gold hover:underline">Refund Policy</a>{' '}
              for details on refunds.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#1A1A1A] mb-3">Availability</h2>
            <p>
              We aim to keep iCut available at all times but do not guarantee any specific uptime (no SLA). We may perform maintenance that causes temporary downtime. We will try to give advance notice for planned outages.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#1A1A1A] mb-3">Your Data</h2>
            <p>
              You own your salon data — your clients, transactions, staff records, and business information. We do not claim any ownership over it. We own the iCut software, its design, and codebase. For details on how we handle your data, see our{' '}
              <a href="/privacy" className="text-gold hover:underline">Privacy Policy</a>.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#1A1A1A] mb-3">Account Suspension</h2>
            <p>
              We may suspend or terminate your account if you use iCut for illegal activity, abuse our systems or support team, or have an outstanding unpaid balance for more than 14 days after your billing date.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#1A1A1A] mb-3">Limitation of Liability</h2>
            <p className="mb-3">
              iCut is provided &ldquo;as-is.&rdquo; We are not liable for indirect, incidental, or consequential damages, including lost business or data loss. Our total liability to you is capped at the amount you paid us in the 3 months before the incident.
            </p>
            <p>
              This does not affect any rights you have under Pakistani consumer law that cannot be excluded.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#1A1A1A] mb-3">Governing Law</h2>
            <p>
              These terms are governed by the laws of Pakistan. Any disputes will be resolved in the courts of Lahore, Pakistan.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#1A1A1A] mb-3">Changes to These Terms</h2>
            <p>
              We may update these terms from time to time. When we do, we will notify you by email and/or an in-app notice. Continued use of iCut after the effective date means you accept the updated terms.
            </p>
          </section>

        </div>
      </div>
    </PublicLayout>
  );
}
