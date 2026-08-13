'use client';

import { useLanguage } from '@/lib/i18n';

const WHY_JOIN_ITEMS = [
  { icon: '🚀', titleKey: 'why_early_title', descKey: 'why_early_desc' },
  { icon: '🤖', titleKey: 'why_ai_title', descKey: 'why_ai_desc' },
  { icon: '🌍', titleKey: 'why_network_title', descKey: 'why_network_desc' },
  { icon: '🆓', titleKey: 'why_free_title', descKey: 'why_free_desc' },
] as const;

export default function BenefitsGrid() {
  const { t } = useLanguage();

  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <h2 className="mb-10 text-center text-3xl font-bold text-gray-900 dark:text-white">
        {t('why_join_heading')}
      </h2>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {WHY_JOIN_ITEMS.map(({ icon, titleKey, descKey }) => (
          <div
            key={titleKey}
            className="flex flex-col items-start gap-2 rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
          >
            <span className="text-2xl">{icon}</span>
            <span className="text-xs font-extrabold tracking-wide text-primary dark:text-primary-light">
              {t(titleKey)}
            </span>
            <span className="text-sm text-gray-600 dark:text-gray-300">{t(descKey)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
