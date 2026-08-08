'use client';

import type { UseFormReturn } from 'react-hook-form';
import { AccountType } from '@/lib/types';
import type { RegistrationFormValues } from '@/lib/formSchema';
import { useLanguage } from '@/lib/i18n';

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

const LABEL_KEYS: Record<AccountType, string> = {
  [AccountType.BUSINESS]: 'account_type_business',
  [AccountType.SELLER]: 'account_type_seller',
  [AccountType.SERVICE_PROVIDER]: 'account_type_service_provider',
  [AccountType.TRANSPORTER]: 'account_type_transporter',
  [AccountType.AGENT]: 'account_type_agent',
};

const DESCRIPTION_KEYS: Record<AccountType, string> = {
  [AccountType.BUSINESS]: 'account_type_desc_business',
  [AccountType.SELLER]: 'account_type_desc_seller',
  [AccountType.SERVICE_PROVIDER]: 'account_type_desc_service_provider',
  [AccountType.TRANSPORTER]: 'account_type_desc_transporter',
  [AccountType.AGENT]: 'account_type_desc_agent',
};

export default function StepAccountType({ form, accountTypeOptions }: StepProps) {
  const { t } = useLanguage();
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
      <h2 className="mb-1 text-xl font-semibold text-gray-900 dark:text-white">
        {t('account_type_heading')}
      </h2>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">{t('account_type_subtitle')}</p>
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
                {t(LABEL_KEYS[type] ?? type)}
              </span>
              <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                {t(DESCRIPTION_KEYS[type] ?? '')}
              </span>
            </span>
          </button>
        ))}
      </div>
      {errors.accountType && (
        <p className="mt-3 text-xs text-red-500">{t(errors.accountType.message as string)}</p>
      )}
    </div>
  );
}
