'use client';

import { useLanguage } from '@/lib/i18n';

export default function LanguageToggle() {
  const { lang, setLang } = useLanguage();

  return (
    <div className="inline-flex rounded-lg border border-gray-200 p-0.5 text-sm dark:border-gray-700">
      {(['en', 'sw'] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setLang(option)}
          className={[
            'rounded-md px-3 py-1 font-medium transition-colors',
            lang === option
              ? 'bg-primary text-white'
              : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100',
          ].join(' ')}
        >
          {option === 'en' ? 'EN' : 'SW'}
        </button>
      ))}
    </div>
  );
}
