'use client';

import Link from 'next/link';
import { useLanguage } from '@/components/providers/language-provider';
import type { TranslationKey } from '@/lib/i18n/translations';

interface EmptyStateProps {
  icon: string;
  text: TranslationKey;
  ctaLabel?: TranslationKey;
  ctaHref?: string;
}

export function EmptyState({ icon, text, ctaLabel, ctaHref }: EmptyStateProps) {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center border-2 border-muted-foreground/30 text-xl">
        {icon}
      </div>
      <p className="mt-3 font-bold text-sm">{t(text)}</p>
      {ctaLabel && ctaHref && (
        <Link
          href={ctaHref}
          className="mt-4 bg-[#C8A028] px-5 py-2.5 text-xs font-bold text-black min-h-[44px] flex items-center"
        >
          {t(ctaLabel)}
        </Link>
      )}
    </div>
  );
}
