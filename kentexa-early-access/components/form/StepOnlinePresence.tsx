'use client';

import type { UseFormReturn } from 'react-hook-form';
import Input from '@/components/ui/Input';
import type { RegistrationFormValues } from '@/lib/formSchema';
import { useLanguage } from '@/lib/i18n';

interface StepProps {
  form: UseFormReturn<RegistrationFormValues>;
}

export default function StepOnlinePresence({ form }: StepProps) {
  const { t } = useLanguage();
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <div>
      <h2 className="mb-1 text-xl font-semibold text-gray-900 dark:text-white">
        {t('online_presence_heading')}
      </h2>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">{t('online_presence_subtitle')}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label={t('website_label')}
          placeholder="https://example.com"
          error={errors.website?.message ? t(errors.website.message) : undefined}
          {...register('website')}
        />
        <Input
          label={t('facebook_label')}
          placeholder={t('facebook_placeholder')}
          error={errors.facebook?.message ? t(errors.facebook.message) : undefined}
          {...register('facebook')}
        />
        <Input
          label={t('instagram_label')}
          placeholder={t('handle_or_url_placeholder')}
          error={errors.instagram?.message ? t(errors.instagram.message) : undefined}
          {...register('instagram')}
        />
        <Input
          label={t('tiktok_label')}
          placeholder={t('handle_or_url_placeholder')}
          error={errors.tiktok?.message ? t(errors.tiktok.message) : undefined}
          {...register('tiktok')}
        />
      </div>
    </div>
  );
}
