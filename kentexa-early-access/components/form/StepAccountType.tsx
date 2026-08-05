'use client';

import type { UseFormReturn } from 'react-hook-form';
import { AccountType, formatEnumLabel } from '@/lib/types';
import type { RegistrationFormValues } from '@/lib/formSchema';

interface StepProps {
  form: UseFormReturn<RegistrationFormValues>;
  accountTypeOptions?: string[];
}

const ICONS: Record<AccountType, string> = {
  [AccountType.BUSINESS]: '🏢',
  [AccountType.SELLER]: '🛍️',
  [AccountType.SERVICE_PROVIDER]: '🛠️',
  [AccountType.TRANSPORTER]: '🚚',
  [AccountType.AGENT]: '🤝',
};

const DESCRIPTIONS: Record<AccountType, string> = {
  [AccountType.BUSINESS]: 'Register a shop, company, or organization',
  [AccountType.SELLER]: 'Sell products directly to customers',
  [AccountType.SERVICE_PROVIDER]: 'Offer skilled services like repair, beauty, or health',
  [AccountType.TRANSPORTER]: 'Move goods and parcels around Tanzania',
  [AccountType.AGENT]: 'Help onboard and support other businesses',
};

export default function StepAccountType({ form, accountTypeOptions }: StepProps) {
  const {
    watch,
    setValue,
    formState: { errors },
  } = form;
  const selected = watch('accountType');
  const options = (accountTypeOptions && accountTypeOptions.length > 0
    ? accountTypeOptions
    : Object.values(AccountType)) as AccountType[];

  return (
    <div>
      <h2 className="mb-1 text-xl font-semibold text-gray-900 dark:text-white">What best describes you?</h2>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        Choose the account type that fits how you plan to use Kentexa.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {options.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setValue('accountType', type, { shouldValidate: true })}
            className={[
              'flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all',
              selected === type
                ? 'border-primary bg-primary/5 shadow-sm dark:border-primary-light dark:bg-primary-light/10'
                : 'border-gray-200 hover:border-primary/40 dark:border-gray-700 dark:hover:border-primary-light/40',
            ].join(' ')}
          >
            <span className="text-2xl">{ICONS[type] ?? '⭐'}</span>
            <span>
              <span className="block font-semibold text-gray-900 dark:text-white">
                {formatEnumLabel(type)}
              </span>
              <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                {DESCRIPTIONS[type] ?? ''}
              </span>
            </span>
          </button>
        ))}
      </div>
      {errors.accountType && (
        <p className="mt-3 text-xs text-red-500">{errors.accountType.message as string}</p>
      )}
    </div>
  );
}
