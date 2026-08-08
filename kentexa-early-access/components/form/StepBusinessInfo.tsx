'use client';

import { useEffect } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import Input, { TextArea } from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import PhoneOtpVerification from './PhoneOtpVerification';
import { REQUIRE_PHONE_VERIFICATION, type RegistrationFormValues } from '@/lib/formSchema';
import { AccountType, BusinessCategory, formatEnumLabel } from '@/lib/types';
import { useLanguage } from '@/lib/i18n';

interface StepProps {
  form: UseFormReturn<RegistrationFormValues>;
  businessCategoryOptions?: string[];
}

// Business Category (Electronics/Fashion/etc.) doesn't apply to every role —
// these two get a sensible default set silently instead of being asked.
const AUTO_CATEGORY: Partial<Record<AccountType, BusinessCategory>> = {
  [AccountType.TRANSPORTER]: BusinessCategory.AUTOMOTIVE,
  [AccountType.AGENT]: BusinessCategory.PROFESSIONAL_SERVICES,
};

// "Products or Services" is a required field for every role, but the actual
// question asked is worded differently depending on account type.
const PRODUCTS_SERVICES_COPY: Partial<
  Record<AccountType, { labelKey: string; placeholderKey: string }>
> = {
  [AccountType.SELLER]: {
    labelKey: 'products_services_label_seller',
    placeholderKey: 'products_services_placeholder_seller',
  },
  [AccountType.SERVICE_PROVIDER]: {
    labelKey: 'products_services_label_service_provider',
    placeholderKey: 'products_services_placeholder_service_provider',
  },
  [AccountType.TRANSPORTER]: {
    labelKey: 'products_services_label_transporter',
    placeholderKey: 'products_services_placeholder_transporter',
  },
  [AccountType.AGENT]: {
    labelKey: 'products_services_label_agent',
    placeholderKey: 'products_services_placeholder_agent',
  },
};

export default function StepBusinessInfo({ form, businessCategoryOptions }: StepProps) {
  const { t } = useLanguage();
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = form;
  const accountType = watch('accountType');

  const categoryOptions = (
    businessCategoryOptions && businessCategoryOptions.length > 0
      ? businessCategoryOptions
      : Object.values(BusinessCategory)
  ).map((c) => ({ value: c, label: t(`business_category_${c}`) || formatEnumLabel(c) }));

  const autoCategory = accountType ? AUTO_CATEGORY[accountType] : undefined;
  const showCategoryField = !autoCategory;

  // Silently fill the category for roles that skip the question, so the
  // (still required) field validates without showing an ill-fitting dropdown.
  useEffect(() => {
    if (autoCategory) setValue('businessCategory', autoCategory, { shouldValidate: true });
  }, [autoCategory, setValue]);

  const productsCopy = accountType ? PRODUCTS_SERVICES_COPY[accountType] : undefined;
  const productsLabel = productsCopy ? t(productsCopy.labelKey) : t('products_services_label');
  const productsPlaceholder = productsCopy
    ? t(productsCopy.placeholderKey)
    : t('products_services_placeholder');

  return (
    <div>
      <h2 className="mb-1 text-xl font-semibold text-gray-900 dark:text-white">
        {t('business_info_heading')}
      </h2>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">{t('business_info_subtitle')}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label={t('owner_name_label')}
          required
          placeholder={t('owner_name_placeholder')}
          error={errors.ownerName?.message ? t(errors.ownerName.message) : undefined}
          {...register('ownerName')}
        />
        <Input
          label={t('business_name_label')}
          required
          placeholder={t('business_name_placeholder')}
          error={errors.businessName?.message ? t(errors.businessName.message) : undefined}
          {...register('businessName')}
        />
        <div className="flex flex-col gap-2">
          <Input
            label={t('phone_label')}
            required
            placeholder={t('phone_placeholder')}
            error={errors.phone?.message ? t(errors.phone.message) : undefined}
            {...register('phone')}
          />
          {REQUIRE_PHONE_VERIFICATION && <PhoneOtpVerification form={form} />}
        </div>
        <Input
          label={t('whatsapp_label')}
          placeholder={t('whatsapp_placeholder')}
          error={errors.whatsapp?.message ? t(errors.whatsapp.message) : undefined}
          {...register('whatsapp')}
        />
        <Input
          label={t('email_label')}
          type="email"
          placeholder={t('email_placeholder')}
          error={errors.email?.message ? t(errors.email.message) : undefined}
          {...register('email')}
        />
        {showCategoryField ? (
          <Select
            label={t('business_category_label')}
            required
            placeholder={t('business_category_placeholder')}
            options={categoryOptions}
            error={errors.businessCategory?.message ? t(errors.businessCategory.message) : undefined}
            {...register('businessCategory')}
          />
        ) : null}
        <Input
          label={t('years_in_business_label')}
          type="number"
          min={0}
          placeholder={t('years_in_business_placeholder')}
          error={errors.yearsInBusiness?.message ? t(errors.yearsInBusiness.message) : undefined}
          {...register('yearsInBusiness', { valueAsNumber: true })}
        />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4">
        <TextArea
          label={t('business_description_label')}
          required
          placeholder={t('business_description_placeholder')}
          error={errors.businessDescription?.message ? t(errors.businessDescription.message) : undefined}
          {...register('businessDescription')}
        />
        <TextArea
          label={productsLabel}
          required
          placeholder={productsPlaceholder}
          error={errors.productsOrServices?.message ? t(errors.productsOrServices.message) : undefined}
          {...register('productsOrServices')}
        />
      </div>
    </div>
  );
}
