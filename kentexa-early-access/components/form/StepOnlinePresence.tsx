'use client';

import type { UseFormReturn } from 'react-hook-form';
import Input from '@/components/ui/Input';
import type { RegistrationFormValues } from '@/lib/formSchema';

interface StepProps {
  form: UseFormReturn<RegistrationFormValues>;
}

export default function StepOnlinePresence({ form }: StepProps) {
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <div>
      <h2 className="mb-1 text-xl font-semibold text-gray-900 dark:text-white">Your online presence</h2>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        Optional — helps us cross-link your existing pages once you&apos;re live on Kentexa.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Website"
          placeholder="https://example.com"
          error={errors.website?.message}
          {...register('website')}
        />
        <Input
          label="Facebook"
          placeholder="Page name or URL"
          error={errors.facebook?.message}
          {...register('facebook')}
        />
        <Input
          label="Instagram"
          placeholder="@handle or URL"
          error={errors.instagram?.message}
          {...register('instagram')}
        />
        <Input
          label="TikTok"
          placeholder="@handle or URL"
          error={errors.tiktok?.message}
          {...register('tiktok')}
        />
      </div>
    </div>
  );
}
