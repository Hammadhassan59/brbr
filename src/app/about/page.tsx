'use client';

import PublicLayout from '@/components/public-layout';
import { useLanguage } from '@/components/providers/language-provider';

export default function AboutPage() {
  const { t } = useLanguage();
  return (
    <PublicLayout>

      {/* Dark hero */}
      <div className="bg-[#161616] border-b border-[#222]">
        <div className="max-w-3xl mx-auto px-5 pt-16 pb-14 md:pt-24 md:pb-20">
          <p className="text-[10px] font-bold tracking-[0.15em] text-gold uppercase mb-4">
            {t('aboutKicker')}
          </p>
          <h1 className="text-2xl md:text-4xl font-bold text-[#EFEFEF] leading-tight mb-5">
            {t('aboutHeroTitle')}
          </h1>
          <p className="text-sm md:text-base text-[#EFEFEF]/50 leading-relaxed max-w-xl">
            {t('aboutHeroSub')}
          </p>
        </div>
      </div>

      {/* White content area */}
      <div className="max-w-3xl mx-auto px-5 py-16 md:py-24">

        {/* Origin story */}
        <section className="mb-16">
          <h2 className="text-xl font-bold text-[#1A1A1A] mb-6">{t('aboutWhyWeBuilt')}</h2>
          <div className="space-y-4 text-sm text-[#1A1A1A]/70 leading-relaxed">
            <p>{t('aboutPara1')}</p>
            <p>{t('aboutPara2')}</p>
            <p>{t('aboutPara3')}</p>
          </div>
        </section>

        {/* Team */}
        <section>
          <h2 className="text-xl font-bold text-[#1A1A1A] mb-6">{t('aboutTeam')}</h2>
          <p className="text-sm text-[#1A1A1A]/70 leading-relaxed">
            {t('aboutTeamDesc')}
          </p>
        </section>

      </div>
    </PublicLayout>
  );
}
