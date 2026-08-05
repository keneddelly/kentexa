'use client';

import { useState } from 'react';
import { Controller, type UseFormReturn } from 'react-hook-form';
import { TextArea } from '@/components/ui/Input';
import Input from '@/components/ui/Input';
import type { RegistrationFormValues } from '@/lib/formSchema';
import { ONLINE_PLATFORM_OPTIONS } from '@/lib/types';

interface StepProps {
  form: UseFormReturn<RegistrationFormValues>;
}

const OTHER_PREFIX = 'Other: ';

export default function StepAiQuestions({ form }: StepProps) {
  const { register, control } = form;
  const [otherText, setOtherText] = useState('');

  return (
    <div>
      <h2 className="mb-1 text-xl font-semibold text-gray-900 dark:text-white">A few quick questions</h2>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        Optional — your answers help us build the right AI tools for Tanzanian businesses.
      </p>

      <div className="flex flex-col gap-6">
        <TextArea
          label="What is the biggest challenge you face in your business?"
          rows={3}
          {...register('biggestChallenge')}
        />

        <TextArea
          label="How do customers usually find you today?"
          rows={3}
          {...register('howCustomersFindYou')}
        />

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
            Which online platforms do you currently use?
          </label>
          <Controller
            name="onlinePlatformsUsed"
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
                    placeholder="Any other platform you use"
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

        <TextArea
          label="What feature would you most like to see on Kentexa?"
          rows={3}
          {...register('desiredKentexaFeature')}
        />

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
            Would you use AI tools to help run your business?
          </label>
          <Controller
            name="wouldUseAi"
            control={control}
            render={({ field }) => {
              const current: 'yes' | 'no' | 'not_sure' =
                field.value === true ? 'yes' : field.value === false ? 'no' : 'not_sure';
              const options: { key: 'yes' | 'no' | 'not_sure'; label: string }[] = [
                { key: 'yes', label: 'Yes' },
                { key: 'no', label: 'No' },
                { key: 'not_sure', label: 'Not sure' },
              ];
              return (
                <div className="flex gap-2">
                  {options.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() =>
                        field.onChange(opt.key === 'yes' ? true : opt.key === 'no' ? false : undefined)
                      }
                      className={[
                        'rounded-lg border-2 px-4 py-2 text-sm font-medium transition-colors',
                        current === opt.key
                          ? 'border-primary bg-primary/5 text-primary dark:border-primary-light dark:bg-primary-light/10 dark:text-primary-light'
                          : 'border-gray-200 text-gray-600 hover:border-primary/40 dark:border-gray-700 dark:text-gray-300',
                      ].join(' ')}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              );
            }}
          />
        </div>
      </div>
    </div>
  );
}
