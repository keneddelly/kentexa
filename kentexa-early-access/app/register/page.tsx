'use client';

import Link from 'next/link';
import QuickRegisterForm from '@/components/form/QuickRegisterForm';
import LanguageToggle from '@/components/LanguageToggle';
import { useLanguage } from '@/lib/i18n';

// Primary registration flow — deliberately short (role, name, WhatsApp) to
// remove signup friction. The old 7-step wizard (components/form/Step*.tsx,
// hooks/useRegistrationForm.ts) is left in place, unrouted, in case a fuller
// upfront flow is wanted again later — it's not deleted, just not the
// default path anymore.
export default function RegisterPage() {
  const { t } = useLanguage();

  return (
    <main className="min-h-screen bg-gray-50 py-10 dark:bg-gray-900">
      <div className="mx-auto max-w-md px-4">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary dark:text-gray-400 dark:hover:text-primary-light"
          >
            {t('back_to_home')}
          </Link>
          <LanguageToggle />
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-8">
          <QuickRegisterForm />
        </div>
      </div>
    </main>
  );
}
