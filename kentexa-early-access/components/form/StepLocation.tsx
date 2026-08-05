'use client';

import type { UseFormReturn } from 'react-hook-form';
import Input from '@/components/ui/Input';
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Region"
          required
          placeholder="e.g. Dar es Salaam"
          error={errors.region?.message}
          {...register('region')}
        />
        <Input
          label="District"
          required
          placeholder="e.g. Kinondoni"
          error={errors.district?.message}
          {...register('district')}
        />
        <Input
          label="Ward"
          placeholder="e.g. Msasani"
          error={errors.ward?.message}
          {...register('ward')}
        />
      </div>

      <div className="mt-6 rounded-lg border border-dashed border-gray-300 p-4 dark:border-gray-600">
        <p className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-200">
          Pinpoint location (optional)
        </p>
        {/*
          A real map picker (e.g. Google Maps / Mapbox) could replace these
          plain numeric inputs later — integrating an SDK is explicitly
          optional for this build, so we just capture raw lat/lng values.
        */}
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
