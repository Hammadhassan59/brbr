'use client';

import { useLanguage } from '@/components/providers/language-provider';
import type { StaffRole } from '@/types/database';

interface StaffWelcomeProps {
  name: string;
  role: StaffRole;
  salonName: string;
  onDismiss?: () => void;
}

const ROLE_LABELS: Record<StaffRole, string> = {
  owner: 'Owner',
  manager: 'Manager',
  receptionist: 'Receptionist',
  senior_stylist: 'Senior Stylist',
  junior_stylist: 'Junior Stylist',
  helper: 'Helper',
};

const ROLE_CAPABILITIES: Record<StaffRole, string[]> = {
  owner: ['Full dashboard & reports', 'Staff & client management', 'POS & appointments'],
  manager: ['Full dashboard & reports', 'Staff & client management', 'POS & appointments'],
  receptionist: ['Appointments & walk-ins', 'Client management', 'POS & checkout'],
  senior_stylist: ['Your appointments', 'Your earnings & commissions', 'Your daily schedule'],
  junior_stylist: ['Your appointments', 'Your earnings & commissions', 'Your daily schedule'],
  helper: ['Your appointments', 'Your daily schedule', 'Client check-in'],
};

export function StaffWelcome({ name, role, salonName, onDismiss }: StaffWelcomeProps) {
  const { t } = useLanguage();

  const roleLabel = ROLE_LABELS[role] ?? role;
  const capabilities = ROLE_CAPABILITIES[role] ?? [];

  const greeting = t('welcomeGreeting').replace('{name}', name);
  const roleAt = t('roleAt').replace('{role}', roleLabel).replace('{salon}', salonName);

  return (
    <div className="border-2 border-[#C8A028] p-6 text-center">
      <h2 className="text-lg font-bold">{greeting}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{roleAt}</p>

      {capabilities.length > 0 && (
        <ul className="mt-4 space-y-2 text-left">
          {capabilities.map((cap) => (
            <li key={cap} className="flex items-center gap-2 text-sm">
              <span className="text-[#C8A028]">✓</span>
              <span>{cap}</span>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={onDismiss}
        className="mt-6 bg-[#C8A028] px-5 py-2.5 text-xs font-bold text-black min-h-[44px]"
      >
        {t('letsGo')}
      </button>
    </div>
  );
}
