'use client';

import { useLanguage } from '@/lib/i18n';

// Replaces the old live numeric StatsCounter ("5+ Biashara", "0+ Watoa
// Huduma", …) on the primary landing page — this early, a near-empty
// counter reads as "nobody's here yet" instead of social proof. This is a
// static, non-numeric section instead: what Kentexa is recruiting, not how
// many have joined so far. StatsCounter.tsx itself is left intact for reuse
// once there are real numbers worth showing.
const CATEGORIES: { icon: string; labelKey: string }[] = [
  { icon: '🛍', labelKey: 'founding_sellers' },
  { icon: '🔧', labelKey: 'founding_service_providers' },
  { icon: '🚚', labelKey: 'founding_transporters' },
  { icon: '🤝', labelKey: 'founding_agents' },
];

export default function FoundingCategories() {
  const { t } = useLanguage();

  return (
    <section className="bg-primary py-14 dark:bg-primary-dark">
      <div className="mx-auto max-w-6xl px-6 text-center">
        <h2 className="text-xl font-extrabold tracking-wide text-white sm:text-2xl">
          {t('founding_heading')}
        </h2>
        <p className="mt-2 text-sm text-white/80">{t('founding_message')}</p>

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {CATEGORIES.map(({ icon, labelKey }) => (
            <div
              key={labelKey}
              className="flex flex-col items-center gap-2 rounded-xl bg-white/10 px-4 py-5"
            >
              <span className="text-3xl">{icon}</span>
              <span className="text-sm font-semibold text-white">{t(labelKey)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
