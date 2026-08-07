'use client';

import { useState } from 'react';
import { Controller, type UseFormReturn } from 'react-hook-form';
import Input, { TextArea } from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import type { RegistrationFormValues } from '@/lib/formSchema';
import { AccountType, ONLINE_PLATFORM_OPTIONS, VEHICLE_TYPE_OPTIONS } from '@/lib/types';

interface StepProps {
  form: UseFormReturn<RegistrationFormValues>;
}

const OTHER_PREFIX = 'Other: ';

function YesNoToggle({
  value,
  onChange,
}: {
  value: boolean | undefined;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex gap-2">
      {[
        { key: true, label: 'Yes' },
        { key: false, label: 'No' },
      ].map((opt) => (
        <button
          key={String(opt.key)}
          type="button"
          onClick={() => onChange(opt.key)}
          className={[
            'rounded-lg border-2 px-4 py-2 text-sm font-medium transition-colors',
            value === opt.key
              ? 'border-primary bg-primary/5 text-primary dark:border-primary-light dark:bg-primary-light/10 dark:text-primary-light'
              : 'border-gray-200 text-gray-600 hover:border-primary/40 dark:border-gray-700 dark:text-gray-300',
          ].join(' ')}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function StepAiQuestions({ form }: StepProps) {
  const { register, control, watch, formState: { errors } } = form;
  const [otherText, setOtherText] = useState('');
  const accountType = watch('accountType');

  return (
    <div>
      <h2 className="mb-1 text-xl font-semibold text-gray-900 dark:text-white">Tell us more</h2>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        A couple of quick questions specific to how you'll use Kentexa.
      </p>

      <div className="flex flex-col gap-6">
        <TextArea
          label="What is the biggest challenge you face in your business?"
          rows={3}
          {...register('biggestChallenge')}
        />

        {accountType === AccountType.TRANSPORTER && (
          <>
            <Select
              label="What vehicle do you use?"
              placeholder="Select a vehicle type"
              options={VEHICLE_TYPE_OPTIONS.map((v) => ({ value: v, label: v }))}
              error={errors.vehicleType?.message}
              {...register('vehicleType')}
            />
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Do you have a valid driving license?
              </label>
              <Controller
                name="hasLicense"
                control={control}
                render={({ field }) => (
                  <YesNoToggle value={field.value} onChange={field.onChange} />
                )}
              />
            </div>
            <TextArea
              label="Which routes or areas do you currently cover?"
              placeholder="e.g. Kinondoni to Ilala, city-wide, or specific routes"
              rows={2}
              {...register('coverageAreas')}
            />
          </>
        )}

        {accountType === AccountType.SELLER && (
          <>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Where do you currently sell?
              </label>
              <Controller
                name="currentSellingChannels"
                control={control}
                render={({ field }) => {
                  const values = field.value ?? [];
                  const standardSelected = values.filter((v) => !v.startsWith(OTHER_PREFIX));
                  const toggle = (option: string) => {
                    const next = standardSelected.includes(option)
                      ? standardSelected.filter((v) => v !== option)
                      : [...standardSelected, option];
                    const otherEntry = otherText ? [`${OTHER_PREFIX}${otherText}`] : [];
                    field.onChange([...next, ...otherEntry]);
                  };
                  return (
                    <div className="flex flex-col gap-3">
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {ONLINE_PLATFORM_OPTIONS.map((option) => (
                          <label
                            key={option}
                            className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:border-primary/40 dark:border-gray-700 dark:text-gray-200"
                          >
                            <input
                              type="checkbox"
                              checked={standardSelected.includes(option)}
                              onChange={() => toggle(option)}
                              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary-light dark:border-gray-600"
                            />
                            {option}
                          </label>
                        ))}
                      </div>
                      <Input
                        label="Other (optional)"
                        placeholder="Any other channel you sell through"
                        value={otherText}
                        onChange={(e) => {
                          const text = e.target.value;
                          setOtherText(text);
                          const otherEntry = text ? [`${OTHER_PREFIX}${text}`] : [];
                          field.onChange([...standardSelected, ...otherEntry]);
                        }}
                      />
                    </div>
                  );
                }}
              />
            </div>
            <Input
              label="How many products do you have ready to list?"
              type="number"
              min={0}
              placeholder="e.g. 12"
              error={errors.readyProductCount?.message}
              {...register('readyProductCount', { valueAsNumber: true })}
            />
          </>
        )}

        {accountType === AccountType.SERVICE_PROVIDER && (
          <>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Do you travel to customers, or do they come to you?
              </label>
              <Controller
                name="travelsToCustomer"
                control={control}
                render={({ field }) => (
                  <YesNoToggle value={field.value} onChange={field.onChange} />
                )}
              />
            </div>
            <Input
              label="How do customers currently book you?"
              placeholder="e.g. Phone call, WhatsApp, walk-in"
              error={errors.currentBookingMethod?.message}
              {...register('currentBookingMethod')}
            />
          </>
        )}

        {accountType === AccountType.AGENT && (
          <>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Do you have a physical shop or location customers can visit?
              </label>
              <Controller
                name="hasPhysicalLocation"
                control={control}
                render={({ field }) => (
                  <YesNoToggle value={field.value} onChange={field.onChange} />
                )}
              />
            </div>
            <Input
              label="What are your operating hours?"
              placeholder="e.g. Mon–Sat, 8am–7pm"
              {...register('operatingHours')}
            />
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Would you be able to handle cash collection on behalf of Kentexa?
              </label>
              <Controller
                name="canHandleCashCollection"
                control={control}
                render={({ field }) => (
                  <YesNoToggle value={field.value} onChange={field.onChange} />
                )}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
