'use client';

import Link from 'next/link';
import { useLanguage } from '@/lib/i18n';

export default function CtaBanner() {
  const { t } = useLanguage();

  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <div className="flex flex-col items-center gap-6 rounded-2xl bg-gradient-to-r from-primary to-primary-light p-10 text-center shadow-xl sm:p-16">
        <h2 className="text-2xl font-bold text-white sm:text-3xl">{t('cta_heading')}</h2>
        <p className="max-w-xl text-white/90">{t('cta_sub')}</p>
        <Link
          href="/register"
          className="inline-flex items-center justify-center rounded-lg bg-accent px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-accent/30 transition-transform hover:-translate-y-0.5 hover:bg-accent-dark"
        >
          {t('cta_button')}
        </Link>
      </div>
    </section>
  );
}
