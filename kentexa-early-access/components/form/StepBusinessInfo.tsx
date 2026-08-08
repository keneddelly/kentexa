'use client';

import type { UseFormReturn } from 'react-hook-form';
import Input, { TextArea } from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import PhoneOtpVerification from './PhoneOtpVerification';
import { REQUIRE_PHONE_VERIFICATION, type RegistrationFormValues } from '@/lib/formSchema';
import { BusinessCategory, formatEnumLabel } from '@/lib/types';

interface StepProps {
  form: UseFormReturn<RegistrationFormValues>;
  businessCategoryOptions?: string[];
}

export default function StepBusinessInfo({ form, businessCategoryOptions }: StepProps) {
  const {
    register,
    formState: { errors },
  } = form;

  const categoryOptions = (
    businessCategoryOptions && businessCategoryOptions.length > 0
      ? businessCategoryOptions
      : Object.values(BusinessCategory)
  ).map((c) => ({ value: c, label: formatEnumLabel(c) }));

  return (
    <div>
      <h2 className="mb-1 text-xl font-semibold text-gray-900 dark:text-white">Tell us about your business</h2>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        This information helps customers find and trust you on Kentexa.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Owner Name"
          required
          placeholder="e.g. Amina Juma"
          error={errors.ownerName?.message}
          {...register('ownerName')}
        />
        <Input
          label="Business Name"
          required
          placeholder="e.g. Amina Fashions"
          error={errors.businessName?.message}
          {...register('businessName')}
        />
        <div className="flex flex-col gap-2">
          <Input
            label="Phone Number"
            required
            placeholder="e.g. 0712 345 678"
            error={errors.phone?.message}
            {...register('phone')}
          />
          {REQUIRE_PHONE_VERIFICATION && <PhoneOtpVerification form={form} />}
        </div>
        <Input
          label="WhatsApp Number"
          placeholder="If different from phone"
          error={errors.whatsapp?.message}
          {...register('whatsapp')}
        />
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register('email')}
        />
        <Select
          label="Business Category"
          required
          placeholder="Select a category"
          options={categoryOptions}
          error={errors.businessCategory?.message}
          {...register('businessCategory')}
        />
        <Input
          label="Years in Business"
          type="number"
          min={0}
          placeholder="e.g. 3"
          error={errors.yearsInBusiness?.message}
          {...register('yearsInBusiness', { valueAsNumber: true })}
        />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4">
        <TextArea
          label="Business Description"
          required
          placeholder="Briefly describe what your business does"
          error={errors.businessDescription?.message}
          {...register('businessDescription')}
        />
        <TextArea
          label="Products or Services"
          required
          placeholder="List the main products or services you offer"
          error={errors.productsOrServices?.message}
          {...register('productsOrServices')}
        />
      </div>
    </div>
  );
}
