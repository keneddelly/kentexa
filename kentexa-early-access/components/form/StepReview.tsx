'use client';

import { Controller, type UseFormReturn } from 'react-hook-form';
import Checkbox from '@/components/ui/Checkbox';
import Button from '@/components/ui/Button';
import type { RegistrationFormValues } from '@/lib/formSchema';
import { useLanguage } from '@/lib/i18n';

interface StepProps {
  form: UseFormReturn<RegistrationFormValues>;
  onSubmit: () => void;
  isSubmitting: boolean;
}

function ReviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="flex justify-between gap-4 border-b border-gray-100 py-2 text-sm last:border-b-0 dark:border-gray-700">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-right font-medium text-gray-800 dark:text-gray-100">{value}</span>
    </div>
  );
}

export default function StepReview({ form, onSubmit, isSubmitting }: StepProps) {
  const { t } = useLanguage();
  const {
    watch,
    control,
    formState: { errors },
  } = form;
  const values = watch();

  const yesNo = (v: boolean | undefined) => (v === true ? t('yes') : v === false ? t('no') : undefined);

  return (
    <div>
      <h2 className="mb-1 text-xl font-semibold text-gray-900 dark:text-white">{t('review_heading')}</h2>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">{t('review_subtitle')}</p>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
        <ReviewRow
          label={t('review_account_type')}
          value={values.accountType && t(`account_type_${values.accountType}`)}
        />
        <ReviewRow label={t('review_owner_name')} value={values.ownerName} />
        <ReviewRow label={t('review_business_name')} value={values.businessName} />
        <ReviewRow label={t('review_phone')} value={values.phone} />
        <ReviewRow label={t('review_whatsapp')} value={values.whatsapp} />
        <ReviewRow label={t('review_email')} value={values.email} />
        <ReviewRow
          label={t('review_category')}
          value={values.businessCategory && t(`business_category_${values.businessCategory}`)}
        />
        <ReviewRow label={t('review_description')} value={values.businessDescription} />
        <ReviewRow label={t('review_products_services')} value={values.productsOrServices} />
        <ReviewRow label={t('review_years_in_business')} value={values.yearsInBusiness} />
        <ReviewRow
          label={t('review_location')}
          value={[values.ward, values.district, values.region].filter(Boolean).join(', ')}
        />
        <ReviewRow label={t('review_website')} value={values.website} />
        <ReviewRow label={t('review_facebook')} value={values.facebook} />
        <ReviewRow label={t('review_instagram')} value={values.instagram} />
        <ReviewRow label={t('review_tiktok')} value={values.tiktok} />
        <ReviewRow label={t('review_logo')} value={values.logoUrl ? t('review_uploaded') : undefined} />
        <ReviewRow
          label={t('review_cover_image')}
          value={values.coverImageUrl ? t('review_uploaded') : undefined}
        />
        <ReviewRow
          label={t('review_photos')}
          value={
            values.photoUrls?.length ? t('review_n_uploaded', { n: values.photoUrls.length }) : undefined
          }
        />
        <ReviewRow label={t('review_biggest_challenge')} value={values.biggestChallenge} />
        <ReviewRow label={t('review_vehicle_type')} value={values.vehicleType} />
        <ReviewRow
          label={t('review_cargo_capacity')}
          value={values.cargoCapacity ? t(`cargo_capacity_${values.cargoCapacity}`) : undefined}
        />
        <ReviewRow
          label={t('review_route_type')}
          value={values.routeType ? t(`route_type_${values.routeType}`) : undefined}
        />
        <ReviewRow label={t('review_has_license')} value={yesNo(values.hasLicense)} />
        <ReviewRow label={t('review_coverage_regions')} value={values.coverageRegions?.join(', ')} />
        <ReviewRow label={t('review_coverage_areas')} value={values.coverageAreas} />
        <ReviewRow label={t('review_selling_channels')} value={values.currentSellingChannels?.join(', ')} />
        <ReviewRow label={t('review_ready_product_count')} value={values.readyProductCount} />
        <ReviewRow
          label={t('review_price_range')}
          value={values.priceRange ? t(`price_range_${values.priceRange}`) : undefined}
        />
        <ReviewRow label={t('review_travels_to_customer')} value={yesNo(values.travelsToCustomer)} />
        <ReviewRow label={t('review_booking_method')} value={values.currentBookingMethod} />
        <ReviewRow
          label={t('review_pricing_model')}
          value={values.pricingModel ? t(`pricing_model_${values.pricingModel}`) : undefined}
        />
        <ReviewRow
          label={t('review_has_physical_location')}
          value={yesNo(values.hasPhysicalLocation)}
        />
        <ReviewRow label={t('review_operating_hours')} value={values.operatingHours} />
        <ReviewRow
          label={t('review_agent_type')}
          value={values.agentType ? t(`agent_type_${values.agentType}`) : undefined}
        />
        <ReviewRow
          label={t('review_daily_capacity')}
          value={values.dailyCapacity ? t(`daily_capacity_${values.dailyCapacity}`) : undefined}
        />
        <ReviewRow
          label={t('review_cash_collection')}
          value={yesNo(values.canHandleCashCollection)}
        />
        <ReviewRow
          label={t('review_employee_count')}
          value={values.employeeCount ? t(`employee_count_${values.employeeCount}`) : undefined}
        />
        <ReviewRow
          label={t('review_needs_delivery_support')}
          value={yesNo(values.needsDeliverySupport)}
        />
      </div>

      <div className="mt-6">
        <Controller
          name="consentToContact"
          control={control}
          render={({ field }) => (
            <Checkbox
              label={t('consent_label')}
              checked={field.value === true}
              onChange={(e) => field.onChange(e.target.checked)}
              error={errors.consentToContact?.message ? t(errors.consentToContact.message as string) : undefined}
              required
            />
          )}
        />
      </div>

      <Button
        type="button"
        size="lg"
        fullWidth
        className="mt-6"
        onClick={onSubmit}
        isLoading={isSubmitting}
      >
        {t('submit_registration')}
      </Button>
    </div>
  );
}
