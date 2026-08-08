'use client';

import { useState } from 'react';
import { Controller, type UseFormReturn } from 'react-hook-form';
import Input, { TextArea } from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import RegionMultiSelect from './RegionMultiSelect';
import type { RegistrationFormValues } from '@/lib/formSchema';
import {
  AccountType,
  AGENT_TYPE_OPTIONS,
  BOOKING_METHOD_OPTIONS,
  CARGO_CAPACITY_OPTIONS,
  DAILY_CAPACITY_OPTIONS,
  EMPLOYEE_COUNT_OPTIONS,
  ONLINE_PLATFORM_OPTIONS,
  PRICE_RANGE_OPTIONS,
  PRICING_MODEL_OPTIONS,
  ROUTE_TYPE_OPTIONS,
  VEHICLE_TYPE_OPTIONS,
} from '@/lib/types';
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
  'Boat / Ferry': 'vehicle_boat_ferry',
};

const CARGO_CAPACITY_KEYS: Record<(typeof CARGO_CAPACITY_OPTIONS)[number], string> = {
  up_to_50kg: 'cargo_capacity_up_to_50kg',
  '50_500kg': 'cargo_capacity_50_500kg',
  '500kg_2t': 'cargo_capacity_500kg_2t',
  '2t_10t': 'cargo_capacity_2t_10t',
  '10t_plus': 'cargo_capacity_10t_plus',
};

const ROUTE_TYPE_KEYS: Record<(typeof ROUTE_TYPE_OPTIONS)[number], string> = {
  intra_city: 'route_type_intra_city',
  intercity: 'route_type_intercity',
  both: 'route_type_both',
};

const PRICE_RANGE_KEYS: Record<(typeof PRICE_RANGE_OPTIONS)[number], string> = {
  budget: 'price_range_budget',
  mid_range: 'price_range_mid_range',
  premium: 'price_range_premium',
};

const EMPLOYEE_COUNT_KEYS: Record<(typeof EMPLOYEE_COUNT_OPTIONS)[number], string> = {
  just_me: 'employee_count_just_me',
  '2_5': 'employee_count_2_5',
  '6_20': 'employee_count_6_20',
  '20_plus': 'employee_count_20_plus',
};

const BOOKING_METHOD_KEYS: Record<(typeof BOOKING_METHOD_OPTIONS)[number], string> = {
  'Phone call': 'booking_method_phone_call',
  WhatsApp: 'booking_method_whatsapp',
  'Walk-in': 'booking_method_walk_in',
  'Social media': 'booking_method_social_media',
  'Booking app': 'booking_method_booking_app',
};

const PRICING_MODEL_KEYS: Record<(typeof PRICING_MODEL_OPTIONS)[number], string> = {
  fixed: 'pricing_model_fixed',
  hourly: 'pricing_model_hourly',
  quote: 'pricing_model_quote',
};

const AGENT_TYPE_KEYS: Record<(typeof AGENT_TYPE_OPTIONS)[number], string> = {
  pickup_point: 'agent_type_pickup_point',
  dropoff_hub: 'agent_type_dropoff_hub',
  both: 'agent_type_both',
};

const DAILY_CAPACITY_KEYS: Record<(typeof DAILY_CAPACITY_OPTIONS)[number], string> = {
  up_to_10: 'daily_capacity_up_to_10',
  '10_50': 'daily_capacity_10_50',
  '50_200': 'daily_capacity_50_200',
  '200_plus': 'daily_capacity_200_plus',
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

  const needsDeliverySupport =
    accountType === AccountType.BUSINESS || accountType === AccountType.SELLER;

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
            <Select
              label={t('cargo_capacity_label')}
              placeholder={t('cargo_capacity_placeholder')}
              options={CARGO_CAPACITY_OPTIONS.map((v) => ({ value: v, label: t(CARGO_CAPACITY_KEYS[v]) }))}
              error={errors.cargoCapacity?.message ? t(errors.cargoCapacity.message) : undefined}
              {...register('cargoCapacity')}
            />
            <Select
              label={t('route_type_label')}
              placeholder={t('route_type_placeholder')}
              options={ROUTE_TYPE_OPTIONS.map((v) => ({ value: v, label: t(ROUTE_TYPE_KEYS[v]) }))}
              error={errors.routeType?.message ? t(errors.routeType.message) : undefined}
              {...register('routeType')}
            />
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                {t('has_license_label')}
              </label>
              <Controller
                name="hasLicense"
                control={control}
                render={({ field }) => <YesNoToggle value={field.value} onChange={field.onChange} />}
              />
            </div>
            <Controller
              name="coverageRegions"
              control={control}
              render={({ field }) => (
                <RegionMultiSelect
                  label={t('coverage_regions_label')}
                  value={field.value ?? []}
                  onChange={field.onChange}
                />
              )}
            />
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
            <Select
              label={t('price_range_label')}
              placeholder={t('price_range_placeholder')}
              options={PRICE_RANGE_OPTIONS.map((v) => ({ value: v, label: t(PRICE_RANGE_KEYS[v]) }))}
              {...register('priceRange')}
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
                render={({ field }) => <YesNoToggle value={field.value} onChange={field.onChange} />}
              />
            </div>
            <Select
              label={t('booking_method_label')}
              placeholder={t('booking_method_select_placeholder')}
              options={BOOKING_METHOD_OPTIONS.map((v) => ({ value: v, label: t(BOOKING_METHOD_KEYS[v]) }))}
              error={
                errors.currentBookingMethod?.message ? t(errors.currentBookingMethod.message) : undefined
              }
              {...register('currentBookingMethod')}
            />
            <Select
              label={t('pricing_model_label')}
              placeholder={t('pricing_model_placeholder')}
              options={PRICING_MODEL_OPTIONS.map((v) => ({ value: v, label: t(PRICING_MODEL_KEYS[v]) }))}
              {...register('pricingModel')}
            />
            <Controller
              name="coverageRegions"
              control={control}
              render={({ field }) => (
                <RegionMultiSelect
                  label={t('coverage_regions_label')}
                  value={field.value ?? []}
                  onChange={field.onChange}
                />
              )}
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
                render={({ field }) => <YesNoToggle value={field.value} onChange={field.onChange} />}
              />
            </div>
            <Select
              label={t('agent_type_label')}
              placeholder={t('agent_type_placeholder')}
              options={AGENT_TYPE_OPTIONS.map((v) => ({ value: v, label: t(AGENT_TYPE_KEYS[v]) }))}
              {...register('agentType')}
            />
            <Input
              label={t('operating_hours_label')}
              placeholder={t('operating_hours_placeholder')}
              {...register('operatingHours')}
            />
            <Select
              label={t('daily_capacity_label')}
              placeholder={t('daily_capacity_placeholder')}
              options={DAILY_CAPACITY_OPTIONS.map((v) => ({ value: v, label: t(DAILY_CAPACITY_KEYS[v]) }))}
              {...register('dailyCapacity')}
            />
            <Controller
              name="coverageRegions"
              control={control}
              render={({ field }) => (
                <RegionMultiSelect
                  label={t('coverage_regions_label')}
                  value={field.value ?? []}
                  onChange={field.onChange}
                />
              )}
            />
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                {t('cash_collection_label')}
              </label>
              <Controller
                name="canHandleCashCollection"
                control={control}
                render={({ field }) => <YesNoToggle value={field.value} onChange={field.onChange} />}
              />
            </div>
          </>
        )}

        {needsDeliverySupport && (
          <>
            <Select
              label={t('employee_count_label')}
              placeholder={t('employee_count_placeholder')}
              options={EMPLOYEE_COUNT_OPTIONS.map((v) => ({ value: v, label: t(EMPLOYEE_COUNT_KEYS[v]) }))}
              {...register('employeeCount')}
            />
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                {t('needs_delivery_support_label')}
              </label>
              <Controller
                name="needsDeliverySupport"
                control={control}
                render={({ field }) => <YesNoToggle value={field.value} onChange={field.onChange} />}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
