'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button';
import { trackMetaEvent, trackMetaCustomEvent } from '@/components/MetaPixel';
import { EDIT_TOKEN_ID_KEY, EDIT_TOKEN_KEY } from '@/lib/apiClient';
import { useLanguage } from '@/lib/i18n';

function formatEarlyAccessId(id: string): string {
  const numeric = id.replace(/\D/g, '');
  if (!numeric) return `KTX-EA-${id}`;
  return `KTX-EA-${numeric.padStart(6, '0')}`;
}

export default function SuccessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const isProfileCompleted = searchParams.get('stage') === 'completed';
  const [copied, setCopied] = useState(false);
  const [canTellMore, setCanTellMore] = useState(false);
  const earlyAccessId = formatEarlyAccessId(id);

  useEffect(() => {
    // Reached only after a POST (quick-register or complete-profile)
    // resolved successfully and navigated here — so events fire exactly
    // once, and only on a backend-confirmed save, never on a bare button
    // click. The completed-profile visit fires its own distinct event
    // instead of re-firing CompleteRegistration/EarlyAccessRegistration,
    // which already fired for this id at quick-register time — refiring
    // would double-count the same person as two registrations in Ads
    // Manager.
    if (isProfileCompleted) {
      trackMetaCustomEvent('EarlyAccessProfileCompleted', { content_name: earlyAccessId });
    } else {
      trackMetaEvent('CompleteRegistration', { content_name: earlyAccessId });
      trackMetaCustomEvent('EarlyAccessRegistration', { content_name: earlyAccessId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProfileCompleted]);

  useEffect(() => {
    if (isProfileCompleted) return; // already completed — nothing more to tell
    try {
      const storedToken = window.sessionStorage.getItem(EDIT_TOKEN_KEY);
      const storedId = window.sessionStorage.getItem(EDIT_TOKEN_ID_KEY);
      setCanTellMore(!!storedToken && storedId === id);
    } catch {
      setCanTellMore(false);
    }
  }, [id, isProfileCompleted]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(earlyAccessId);
      setCopied(true);
      toast.success(t('success_copied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy — please copy it manually.');
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-16 dark:bg-gray-900">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-9 w-9 text-green-600 dark:text-green-400">
            <path
              fillRule="evenodd"
              d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
              clipRule="evenodd"
            />
          </svg>
        </div>

        {isProfileCompleted ? (
          <>
            <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">
              {t('success_profile_completed_title')}
            </h1>
            <p className="mt-3 text-gray-700 dark:text-gray-200">{t('success_profile_completed_message')}</p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">{t('success_title')}</h1>
            <p className="mt-3 text-gray-700 dark:text-gray-200">{t('success_message1')}</p>
            <p className="mt-1 text-gray-600 dark:text-gray-300">{t('success_message2')}</p>
          </>
        )}

        <div className="mt-6">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {t('success_id_label')}
          </p>
          <button
            onClick={handleCopy}
            className="w-full rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 px-6 py-4 text-2xl font-extrabold tracking-wider text-primary transition-colors hover:bg-primary/10 dark:border-primary-light/40 dark:bg-primary-light/10 dark:text-primary-light"
          >
            {earlyAccessId}
          </button>
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            {copied ? t('success_copied') : t('success_tap_copy')}
          </p>
        </div>

        {canTellMore && (
          <div className="mt-8 rounded-xl border-2 border-accent/30 bg-accent/5 p-5 dark:border-accent-light/30 dark:bg-accent/10">
            <Link
              href="/register/complete"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3.5 text-base font-bold text-white shadow-lg shadow-accent/30 transition-transform hover:-translate-y-0.5 hover:bg-accent-dark"
            >
              💬 {t('success_tell_more')} <span aria-hidden>→</span>
            </Link>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{t('success_tell_more_sub')}</p>
          </div>
        )}

        <div className="mt-6">
          <Link href="/">
            <Button variant="outline" fullWidth>
              {t('success_back_home')}
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
