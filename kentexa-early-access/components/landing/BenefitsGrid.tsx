'use client';

import { useLanguage } from '@/lib/i18n';

const BENEFIT_KEYS = [
  'benefit_free_profile',
  'benefit_early_access',
  'benefit_ai_tools',
  'benefit_reach',
  'benefit_verified',
  'benefit_marketing',
] as const;

export default function BenefitsGrid() {
  const { t } = useLanguage();

  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <h2 className="mb-10 text-center text-3xl font-bold text-gray-900 dark:text-white">
        {t('benefits_heading')}
      </h2>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {BENEFIT_KEYS.map((key) => (
          <div
            key={key}
            className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary dark:bg-primary-light/20 dark:text-primary-light">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path
                  fillRule="evenodd"
                  d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
            <span className="mt-1 font-medium text-gray-800 dark:text-gray-100">{t(key)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
