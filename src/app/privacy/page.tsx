import { Metadata } from 'next';
import PublicLayout from '@/components/public-layout';

export const metadata: Metadata = {
  title: 'Privacy Policy — BrBr',
  description: 'How BrBr collects, stores, and protects your salon data.',
};

export default function PrivacyPage() {
  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto px-5 py-16 md:py-24">
        <h1 className="text-3xl font-bold text-[#1A1A1A] mb-2">Privacy Policy</h1>
        <p className="text-sm text-[#1A1A1A]/40 mb-12">Last updated: April 6, 2026</p>

        <div className="space-y-8 text-sm text-[#1A1A1A]/70 leading-relaxed">

          <section>
            <h2 className="text-base font-bold text-[#1A1A1A] mb-3">Who We Are</h2>
            <p>
              BrBr is a salon management system built and operated by <strong>Inparlor Technologies Pvt Ltd</strong>, a company registered in Pakistan. When we say &ldquo;BrBr,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our,&rdquo; we mean Inparlor Technologies Pvt Ltd.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#1A1A1A] mb-3">What We Collect</h2>
            <p className="mb-3">When you use BrBr, we collect the following types of information:</p>
            <ul className="list-disc list-inside space-y-1.5 pl-2">
              <li><strong>Salon information</strong> — your salon name, branch details, and business settings</li>
              <li><strong>Owner information</strong> — your name, phone number, and login credentials</li>
              <li><strong>Staff information</strong> — staff names, phone numbers, PINs, roles, and commission rates</li>
              <li><strong>Client information</strong> — client names, phone numbers, udhaar (credit) balances, and visit history</li>
              <li><strong>Transaction data</strong> — service bookings, payments (cash, JazzCash, EasyPaisa), invoices, and financial records</li>
              <li><strong>Inventory data</strong> — product stock, supplier information, and purchase orders</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#1A1A1A] mb-3">Why We Collect It</h2>
            <p>
              We collect this data solely to operate BrBr — to give you bookings, billing, payroll, inventory, and reporting features. We do not collect data for advertising or profiling purposes.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#1A1A1A] mb-3">How We Store It</h2>
            <p className="mb-3">
              Your data is stored on <strong>Supabase</strong>, a cloud database infrastructure provider. Servers may be located outside Pakistan. All data in transit is protected with <strong>TLS encryption</strong>. We use session cookies to keep you logged in securely.
            </p>
            <p>
              We take reasonable precautions to protect your data, but no system is 100% secure. Please use a strong PIN for your staff and keep your account credentials private.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#1A1A1A] mb-3">Who Can See Your Data</h2>
            <p className="mb-3">Your data is visible only to:</p>
            <ul className="list-disc list-inside space-y-1.5 pl-2">
              <li>You (the salon owner) and authorized staff members you have added</li>
              <li>Inparlor support staff, strictly for troubleshooting when you ask for help</li>
            </ul>
            <p className="mt-3">
              <strong>Your data is never sold to third parties and is never shared with FBR or any government authority.</strong>
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#1A1A1A] mb-3">How Long We Keep It</h2>
            <p>
              Your data remains active for as long as your subscription is active. If you cancel, your data is kept for <strong>90 days</strong> after your subscription ends, then deleted. You can request early deletion by contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#1A1A1A] mb-3">Questions?</h2>
            <p>
              If you have any questions about this policy or your data, email us at{' '}
              <a href="mailto:support@brbr.pk" className="text-gold hover:underline">
                support@brbr.pk
              </a>
              . We will respond within 3 business days.
            </p>
          </section>

        </div>
      </div>
    </PublicLayout>
  );
}
