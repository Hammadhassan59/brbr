'use client';

import Link from 'next/link';
import { useLanguage } from '@/components/providers/language-provider';
import type { TranslationKey } from '@/lib/i18n/translations';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  text: TranslationKey;
  ctaLabel?: TranslationKey;
  ctaHref?: string;
}

export function EmptyState({ icon: Icon, text, ctaLabel, ctaHref }: EmptyStateProps) {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center bg-gold/10 border border-gold/30">
        <Icon className="w-6 h-6 text-gold" />
      </div>
      <p className="mt-3 font-bold text-sm">{t(text)}</p>
      {ctaLabel && ctaHref && (
        <Link
          href={ctaHref}
          className="mt-4 bg-gold hover:bg-gold/90 px-5 py-2.5 text-xs font-bold text-black min-h-[44px] flex items-center"
        >
          {t(ctaLabel)}
        </Link>
      )}
    </div>
  );
}
