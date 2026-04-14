'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/components/providers/language-provider';
import { getOnboardingStatus, dismissOnboarding } from '@/app/actions/onboarding';
import type { OnboardingStatus } from '@/types/database';

interface OnboardingBannerProps {
  salonId: string;
}

const CHECKLIST_ITEMS: Array<{ key: keyof OnboardingStatus; labelKey: string }> = [
  { key: 'has_clients', labelKey: 'addFirstClient' },
  { key: 'has_appointments', labelKey: 'bookAppointment' },
  { key: 'has_sale', labelKey: 'completeSale' },
  { key: 'has_payment_methods', labelKey: 'paymentMethods' },
  { key: 'staff_logged_in', labelKey: 'inviteStaff' },
];

export function OnboardingBanner({ salonId: _salonId }: OnboardingBannerProps) {
  const { t } = useLanguage();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    getOnboardingStatus()
      .then((res) => { if (res.data) setStatus(res.data); })
      .catch(() => {});
  }, []);

  async function handleDismiss() {
    await dismissOnboarding().catch(() => {});
    setDismissed(true);
  }

  if (dismissed || !status) return null;

  const completed = CHECKLIST_ITEMS.filter(({ key }) => status[key as keyof OnboardingStatus]).length;

  return (
    <div className="border border-[#C8A028] bg-black p-4">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-bold text-[#C8A028]">{t('gettingStarted')}</p>
        <div className="flex items-center gap-4">
          <span className="text-xs text-muted-foreground">
            {completed}/{CHECKLIST_ITEMS.length} {t('complete')}
          </span>
          <button
            onClick={handleDismiss}
            className="text-xs text-muted-foreground underline min-h-[44px]"
          >
            {t('dismiss')}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {CHECKLIST_ITEMS.map(({ key, labelKey }) => {
          const done = Boolean(status[key as keyof OnboardingStatus]);
          return (
            <div key={key} className="flex items-center gap-3">
              <div className={`flex h-5 w-5 shrink-0 items-center justify-center border text-xs ${done ? 'border-[#C8A028] bg-[#C8A028] text-black' : 'border-zinc-600'}`}>
                {done ? '✓' : ''}
              </div>
              <p className={`text-sm ${done ? 'line-through text-muted-foreground' : ''}`}>
                {t(labelKey as Parameters<typeof t>[0])}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
