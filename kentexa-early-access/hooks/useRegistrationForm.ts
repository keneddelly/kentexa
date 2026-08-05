'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  defaultRegistrationFormValues,
  registrationFormSchema,
  type RegistrationFormValues,
} from '@/lib/formSchema';

export const STEP_LABELS = [
  'Account Type',
  'Business Info',
  'Location',
  'Online Presence',
  'Media',
  'Quick Questions',
  'Review & Submit',
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
  ['biggestChallenge', 'howCustomersFindYou', 'onlinePlatformsUsed', 'desiredKentexaFeature', 'wouldUseAi'],
  ['consentToContact'],
];

export function useRegistrationForm() {
  const [step, setStep] = useState(0);

  const form = useForm<RegistrationFormValues>({
    resolver: zodResolver(registrationFormSchema),
    defaultValues: defaultRegistrationFormValues,
    mode: 'onBlur',
  });

  const isLastStep = step === TOTAL_STEPS - 1;
  const isFirstStep = step === 0;

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
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goToStep = (index: number) => {
    setStep(Math.max(0, Math.min(index, TOTAL_STEPS - 1)));
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
