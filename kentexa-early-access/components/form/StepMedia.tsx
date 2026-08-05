'use client';

import { Controller, type UseFormReturn } from 'react-hook-form';
import FileUpload from '@/components/ui/FileUpload';
import type { RegistrationFormValues } from '@/lib/formSchema';

interface StepProps {
  form: UseFormReturn<RegistrationFormValues>;
}

export default function StepMedia({ form }: StepProps) {
  const { control } = form;

  return (
    <div>
      <h2 className="mb-1 text-xl font-semibold text-gray-900 dark:text-white">Add photos</h2>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        Optional, but profiles with photos get more attention. JPEG, PNG or WEBP, up to 5MB each.
      </p>
      <div className="flex flex-col gap-6">
        <Controller
          name="logoUrl"
          control={control}
          render={({ field }) => (
            <FileUpload
              label="Business Logo"
              value={field.value ? [field.value] : []}
              onChange={(urls) => field.onChange(urls[0] ?? '')}
              hint="1 image"
            />
          )}
        />
        <Controller
          name="coverImageUrl"
          control={control}
          render={({ field }) => (
            <FileUpload
              label="Cover Image"
              value={field.value ? [field.value] : []}
              onChange={(urls) => field.onChange(urls[0] ?? '')}
              hint="1 image"
            />
          )}
        />
        <Controller
          name="photoUrls"
          control={control}
          render={({ field }) => (
            <FileUpload
              label="Business Photos"
              multiple
              maxFiles={8}
              value={field.value ?? []}
              onChange={(urls) => field.onChange(urls)}
              hint="Up to 8 images"
            />
          )}
        />
      </div>
    </div>
  );
}
