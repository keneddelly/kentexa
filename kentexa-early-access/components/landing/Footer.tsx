'use client';

import { useLanguage } from '@/lib/i18n';

export default function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="border-t border-gray-200 py-8 dark:border-gray-800">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-gray-500 dark:text-gray-400 sm:flex-row">
        <span>
          © {new Date().getFullYear()} Kentexa. {t('footer_rights')}
        </span>
        <span>{t('footer_tagline')}</span>
      </div>
    </footer>
  );
}
