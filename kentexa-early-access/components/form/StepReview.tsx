'use client';

import { Controller, type UseFormReturn } from 'react-hook-form';
import Checkbox from '@/components/ui/Checkbox';
import Button from '@/components/ui/Button';
import type { RegistrationFormValues } from '@/lib/formSchema';
import { formatEnumLabel } from '@/lib/types';

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
  const {
    watch,
    control,
    formState: { errors },
  } = form;
  const values = watch();

  return (
    <div>
      <h2 className="mb-1 text-xl font-semibold text-gray-900 dark:text-white">Review your details</h2>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        Please check everything looks right before submitting.
      </p>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
        <ReviewRow label="Account Type" value={values.accountType && formatEnumLabel(values.accountType)} />
        <ReviewRow label="Owner Name" value={values.ownerName} />
        <ReviewRow label="Business Name" value={values.businessName} />
        <ReviewRow
          label="Phone"
          value={values.phone ? `${values.phone} ${values.phoneVerified ? '✅ Verified' : '⚠️ Not verified yet'}` : undefined}
        />
        <ReviewRow label="WhatsApp" value={values.whatsapp} />
        <ReviewRow label="Email" value={values.email} />
        <ReviewRow
          label="Category"
          value={values.businessCategory && formatEnumLabel(values.businessCategory)}
        />
        <ReviewRow label="Description" value={values.businessDescription} />
        <ReviewRow label="Products / Services" value={values.productsOrServices} />
        <ReviewRow label="Years in Business" value={values.yearsInBusiness} />
        <ReviewRow
          label="Location"
          value={[values.ward, values.district, values.region].filter(Boolean).join(', ')}
        />
        <ReviewRow label="Website" value={values.website} />
        <ReviewRow label="Facebook" value={values.facebook} />
        <ReviewRow label="Instagram" value={values.instagram} />
        <ReviewRow label="TikTok" value={values.tiktok} />
        <ReviewRow label="Logo" value={values.logoUrl ? 'Uploaded' : undefined} />
        <ReviewRow label="Cover Image" value={values.coverImageUrl ? 'Uploaded' : undefined} />
        <ReviewRow
          label="Photos"
          value={values.photoUrls?.length ? `${values.photoUrls.length} uploaded` : undefined}
        />
        <ReviewRow label="Biggest Challenge" value={values.biggestChallenge} />
        <ReviewRow label="Vehicle Type" value={values.vehicleType} />
        <ReviewRow
          label="Has License"
          value={values.hasLicense === true ? 'Yes' : values.hasLicense === false ? 'No' : undefined}
        />
        <ReviewRow label="Coverage Areas" value={values.coverageAreas} />
        <ReviewRow label="Selling Channels" value={values.currentSellingChannels?.join(', ')} />
        <ReviewRow label="Ready Product Count" value={values.readyProductCount} />
        <ReviewRow
          label="Travels To Customer"
          value={values.travelsToCustomer === true ? 'Yes' : values.travelsToCustomer === false ? 'No' : undefined}
        />
        <ReviewRow label="Booking Method" value={values.currentBookingMethod} />
        <ReviewRow
          label="Has Physical Location"
          value={values.hasPhysicalLocation === true ? 'Yes' : values.hasPhysicalLocation === false ? 'No' : undefined}
        />
        <ReviewRow label="Operating Hours" value={values.operatingHours} />
        <ReviewRow
          label="Can Handle Cash Collection"
          value={
            values.canHandleCashCollection === true
              ? 'Yes'
              : values.canHandleCashCollection === false
                ? 'No'
                : undefined
          }
        />
      </div>

      <div className="mt-6">
        <Controller
          name="consentToContact"
          control={control}
          render={({ field }) => (
            <Checkbox
              label="I agree to be contacted before my profile is published."
              checked={field.value === true}
              onChange={(e) => field.onChange(e.target.checked)}
              error={errors.consentToContact?.message as string | undefined}
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
        Submit Registration
      </Button>
    </div>
  );
}
