'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  defaultRegistrationFormValues,
  registrationFormSchema,
  type RegistrationFormValues,
} from '@/lib/formSchema';

// Translation keys (see lib/i18n.ts), not display text — FormProgressBar
// resolves the actual label via t(key) so it follows the current language.
export const STEP_LABELS = [
  'step_label_account_type',
  'step_label_business_info',
  'step_label_location',
  'step_label_online_presence',
  'step_label_media',
  'step_label_tell_us_more',
  'step_label_review',
] as const;

export const TOTAL_STEPS = STEP_LABELS.length;

// Fields to validate per step before allowing "Next".
const STEP_FIELDS: (keyof RegistrationFormValues)[][] = [
  ['accountType'],
  [
    'ownerName',
    'businessName',
    'phone',
    'whatsapp',
    'email',
    'businessCategory',
    'businessDescription',
    'productsOrServices',
    'yearsInBusiness',
  ],
  ['region', 'district', 'ward', 'latitude', 'longitude'],
  ['website', 'facebook', 'instagram', 'tiktok'],
  ['logoUrl', 'coverImageUrl', 'photoUrls'],
  [
    'biggestChallenge',
    'vehicleType',
    'hasLicense',
    'coverageAreas',
    'cargoCapacity',
    'routeType',
    'currentSellingChannels',
    'readyProductCount',
    'priceRange',
    'travelsToCustomer',
    'currentBookingMethod',
    'pricingModel',
    'hasPhysicalLocation',
    'operatingHours',
    'canHandleCashCollection',
    'agentType',
    'dailyCapacity',
    'coverageRegions',
    'needsDeliverySupport',
    'employeeCount',
  ],
  ['consentToContact'],
];

interface UseRegistrationFormOptions {
  // Prefills fields already known before this form loads (e.g. accountType/
  // ownerName/phone from a prior quick-register) — merged over the plain
  // defaults, not replacing them.
  initialValues?: Partial<RegistrationFormValues>;
  // Starting step, and the floor goBack/goToStep won't cross — used by the
  // "tell us more" flow to skip the Account Type step (already answered)
  // without letting Back navigate into it.
  minStep?: number;
}

export function useRegistrationForm(options: UseRegistrationFormOptions = {}) {
  const { initialValues, minStep = 0 } = options;
  const [step, setStep] = useState(minStep);

  const form = useForm<RegistrationFormValues>({
    resolver: zodResolver(registrationFormSchema),
    defaultValues: { ...defaultRegistrationFormValues, ...initialValues },
    mode: 'onBlur',
  });

  const isLastStep = step === TOTAL_STEPS - 1;
  const isFirstStep = step === minStep;

  const goNext = async () => {
    const fieldsToValidate = STEP_FIELDS[step];
    const valid = await form.trigger(fieldsToValidate as (keyof RegistrationFormValues)[]);
    if (valid) {
      setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    return valid;
  };

  const goBack = () => {
    setStep((s) => Math.max(s - 1, minStep));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goToStep = (index: number) => {
    setStep(Math.max(minStep, Math.min(index, TOTAL_STEPS - 1)));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const progress = useMemo(() => Math.round(((step + 1) / TOTAL_STEPS) * 100), [step]);

  return {
    form,
    step,
    setStep,
    goNext,
    goBack,
    goToStep,
    isFirstStep,
    isLastStep,
    progress,
  };
}
