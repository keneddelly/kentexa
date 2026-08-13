'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { quickRegistrationSchema, type QuickRegistrationFormValues } from '@/lib/formSchema';
import { AccountType } from '@/lib/types';
import { ApiError, quickRegister } from '@/lib/apiClient';
import Button from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useLanguage } from '@/lib/i18n';

const ROLE_ICONS: Record<AccountType, string> = {
  [AccountType.SELLER]: '🛍',
  [AccountType.BUSINESS]: '🏢',
  [AccountType.SERVICE_PROVIDER]: '🔧',
  [AccountType.TRANSPORTER]: '🚚',
  [AccountType.AGENT]: '🤝',
};

const ROLE_LABEL_KEYS: Record<AccountType, string> = {
  [AccountType.SELLER]: 'quick_role_seller',
  [AccountType.BUSINESS]: 'quick_role_business',
  [AccountType.SERVICE_PROVIDER]: 'quick_role_service_provider',
  [AccountType.TRANSPORTER]: 'quick_role_transporter',
  [AccountType.AGENT]: 'quick_role_agent',
};

// Same order as the campaign brief: Muuzaji, Biashara, Mtoa Huduma,
// Msafirishaji, Agent.
const ROLE_ORDER: AccountType[] = [
  AccountType.SELLER,
  AccountType.BUSINESS,
  AccountType.SERVICE_PROVIDER,
  AccountType.TRANSPORTER,
  AccountType.AGENT,
];

export default function QuickRegisterForm() {
  const router = useRouter();
  const { t } = useLanguage();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    watch,
    setValue,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<QuickRegistrationFormValues>({
    resolver: zodResolver(quickRegistrationSchema),
    mode: 'onBlur',
  });

  const selectedRole = watch('accountType');

  const onSubmit = async (values: QuickRegistrationFormValues) => {
    setIsSubmitting(true);
    try {
      const result = await quickRegister({
        accountType: values.accountType,
        ownerName: values.ownerName.trim(),
        whatsapp: values.whatsapp.trim(),
      });
      router.push(`/success/${result.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 429) {
          toast.error(t('toast_too_many_attempts'));
        } else {
          err.messages.forEach((m) => toast.error(m));
        }
      } else {
        toast.error(t('toast_generic_error'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <div>
        <h2 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">
          {t('quick_role_heading')}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {ROLE_ORDER.map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => setValue('accountType', role, { shouldValidate: true })}
              className={[
                'flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-4 text-center transition-all',
                selectedRole === role
                  ? 'border-primary bg-primary/5 shadow-sm dark:border-primary-light dark:bg-primary-light/10'
                  : 'border-gray-200 hover:border-primary/40 dark:border-gray-700 dark:hover:border-primary-light/40',
              ].join(' ')}
            >
              <span className="text-2xl">{ROLE_ICONS[role]}</span>
              <span className="text-xs font-semibold text-gray-800 dark:text-gray-100">
                {t(ROLE_LABEL_KEYS[role])}
              </span>
            </button>
          ))}
        </div>
        {errors.accountType && (
          <p className="mt-2 text-xs text-red-500">{t(errors.accountType.message as string)}</p>
        )}
      </div>

      <Input
        label={t('quick_name_label')}
        placeholder={t('quick_name_placeholder')}
        required
        error={errors.ownerName ? t(errors.ownerName.message as string) : undefined}
        {...register('ownerName')}
      />

      <Input
        type="tel"
        inputMode="tel"
        label={t('quick_whatsapp_label')}
        placeholder={t('quick_whatsapp_placeholder')}
        required
        error={errors.whatsapp ? t(errors.whatsapp.message as string) : undefined}
        {...register('whatsapp')}
      />

      <Button type="submit" size="lg" fullWidth isLoading={isSubmitting}>
        {t('quick_submit')}
      </Button>
    </form>
  );
}
