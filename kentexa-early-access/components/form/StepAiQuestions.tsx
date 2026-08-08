'use client';

import { useState } from 'react';
import { Controller, type UseFormReturn } from 'react-hook-form';
import Input, { TextArea } from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import type { RegistrationFormValues } from '@/lib/formSchema';
import { AccountType, ONLINE_PLATFORM_OPTIONS, VEHICLE_TYPE_OPTIONS } from '@/lib/types';
import { useLanguage } from '@/lib/i18n';

interface StepProps {
  form: UseFormReturn<RegistrationFormValues>;
}

const OTHER_PREFIX = 'Other: ';

const PLATFORM_KEYS: Record<(typeof ONLINE_PLATFORM_OPTIONS)[number], string> = {
  Facebook: 'platform_facebook',
  Instagram: 'platform_instagram',
  WhatsApp: 'platform_whatsapp',
  Google: 'platform_google',
  'Word of mouth': 'platform_word_of_mouth',
  TikTok: 'platform_tiktok',
  None: 'platform_none',
};

const VEHICLE_KEYS: Record<(typeof VEHICLE_TYPE_OPTIONS)[number], string> = {
  'Boda (motorcycle)': 'vehicle_boda',
  Bajaji: 'vehicle_bajaji',
  Car: 'vehicle_car',
  'Van / Pickup': 'vehicle_van_pickup',
  Truck: 'vehicle_truck',
};

function YesNoToggle({
  value,
  onChange,
}: {
  value: boolean | undefined;
  onChange: (v: boolean) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="flex gap-2">
      {[
        { key: true, label: t('yes') },
        { key: false, label: t('no') },
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
  const { t } = useLanguage();
  const { register, control, watch, formState: { errors } } = form;
  const [otherText, setOtherText] = useState('');
  const accountType = watch('accountType');

  return (
    <div>
      <h2 className="mb-1 text-xl font-semibold text-gray-900 dark:text-white">
        {t('tell_us_more_heading')}
      </h2>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">{t('tell_us_more_subtitle')}</p>

      <div className="flex flex-col gap-6">
        <TextArea label={t('biggest_challenge_label')} rows={3} {...register('biggestChallenge')} />

        {accountType === AccountType.TRANSPORTER && (
          <>
            <Select
              label={t('vehicle_type_label')}
              placeholder={t('vehicle_type_placeholder')}
              options={VEHICLE_TYPE_OPTIONS.map((v) => ({ value: v, label: t(VEHICLE_KEYS[v]) }))}
              error={errors.vehicleType?.message ? t(errors.vehicleType.message) : undefined}
              {...register('vehicleType')}
            />
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                {t('has_license_label')}
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
              label={t('coverage_areas_label')}
              placeholder={t('coverage_areas_placeholder')}
              rows={2}
              {...register('coverageAreas')}
            />
          </>
        )}

        {accountType === AccountType.SELLER && (
          <>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                {t('selling_channels_label')}
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
                            {t(PLATFORM_KEYS[option])}
                          </label>
                        ))}
                      </div>
                      <Input
                        label={t('other_optional_label')}
                        placeholder={t('other_channel_placeholder')}
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
              label={t('ready_product_count_label')}
              type="number"
              min={0}
              placeholder={t('ready_product_count_placeholder')}
              error={errors.readyProductCount?.message ? t(errors.readyProductCount.message) : undefined}
              {...register('readyProductCount', { valueAsNumber: true })}
            />
          </>
        )}

        {accountType === AccountType.SERVICE_PROVIDER && (
          <>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                {t('travels_to_customer_label')}
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
              label={t('booking_method_label')}
              placeholder={t('booking_method_placeholder')}
              error={errors.currentBookingMethod?.message ? t(errors.currentBookingMethod.message) : undefined}
              {...register('currentBookingMethod')}
            />
          </>
        )}

        {accountType === AccountType.AGENT && (
          <>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                {t('has_physical_location_label')}
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
              label={t('operating_hours_label')}
              placeholder={t('operating_hours_placeholder')}
              {...register('operatingHours')}
            />
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                {t('cash_collection_label')}
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
