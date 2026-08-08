'use client';

import { Controller, type UseFormReturn } from 'react-hook-form';
import FileUpload from '@/components/ui/FileUpload';
import type { RegistrationFormValues } from '@/lib/formSchema';
import { useLanguage } from '@/lib/i18n';

interface StepProps {
  form: UseFormReturn<RegistrationFormValues>;
}

export default function StepMedia({ form }: StepProps) {
  const { t } = useLanguage();
  const { control } = form;

  return (
    <div>
      <h2 className="mb-1 text-xl font-semibold text-gray-900 dark:text-white">{t('media_heading')}</h2>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">{t('media_subtitle')}</p>
      <div className="flex flex-col gap-6">
        <Controller
          name="logoUrl"
          control={control}
          render={({ field }) => (
            <FileUpload
              label={t('business_logo_label')}
              value={field.value ? [field.value] : []}
              onChange={(urls) => field.onChange(urls[0] ?? '')}
              hint={t('one_image_hint')}
            />
          )}
        />
        <Controller
          name="coverImageUrl"
          control={control}
          render={({ field }) => (
            <FileUpload
              label={t('cover_image_label')}
              value={field.value ? [field.value] : []}
              onChange={(urls) => field.onChange(urls[0] ?? '')}
              hint={t('one_image_hint')}
            />
          )}
        />
        <Controller
          name="photoUrls"
          control={control}
          render={({ field }) => (
            <FileUpload
              label={t('business_photos_label')}
              multiple
              maxFiles={8}
              value={field.value ?? []}
              onChange={(urls) => field.onChange(urls)}
              hint={t('up_to_8_images_hint')}
            />
          )}
        />
      </div>
    </div>
  );
}
