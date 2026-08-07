'use client';

import type { UseFormReturn } from 'react-hook-form';
import Input from '@/components/ui/Input';
import LocationCombobox from './LocationCombobox';
import type { RegistrationFormValues } from '@/lib/formSchema';

interface StepProps {
  form: UseFormReturn<RegistrationFormValues>;
}

export default function StepLocation({ form }: StepProps) {
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <div>
      <h2 className="mb-1 text-xl font-semibold text-gray-900 dark:text-white">Where are you located?</h2>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        We use this to connect you with nearby customers.
      </p>

      <LocationCombobox form={form} />
      {(errors.region || errors.district) && (
        <p className="mt-2 text-xs text-red-500">
          {errors.region?.message || errors.district?.message}
        </p>
      )}

      <div className="mt-6 rounded-lg border border-dashed border-gray-300 p-4 dark:border-gray-600">
        <p className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-200">
          Pinpoint coordinates (optional)
        </p>
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
          Filled in automatically once you pick an area above. Only edit these if you need to correct them.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Latitude"
            type="number"
            step="any"
            placeholder="e.g. -6.7924"
            error={errors.latitude?.message}
            {...register('latitude', { valueAsNumber: true })}
          />
          <Input
            label="Longitude"
            type="number"
            step="any"
            placeholder="e.g. 39.2083"
            error={errors.longitude?.message}
            {...register('longitude', { valueAsNumber: true })}
          />
        </div>
      </div>
    </div>
  );
}
