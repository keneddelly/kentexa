'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useRegistrationForm, TOTAL_STEPS } from '@/hooks/useRegistrationForm';
import type { RegistrationFormValues } from '@/lib/formSchema';
import type { RegistrationPayload } from '@/lib/types';
import { ApiError, getCategories, registerBusiness } from '@/lib/apiClient';
import Button from '@/components/ui/Button';
import FormProgressBar from '@/components/form/FormProgressBar';
import StepAccountType from '@/components/form/StepAccountType';
import StepBusinessInfo from '@/components/form/StepBusinessInfo';
import StepLocation from '@/components/form/StepLocation';
import StepOnlinePresence from '@/components/form/StepOnlinePresence';
import StepMedia from '@/components/form/StepMedia';
import StepAiQuestions from '@/components/form/StepAiQuestions';
import StepReview from '@/components/form/StepReview';

function toPayload(values: RegistrationFormValues): RegistrationPayload {
  const emptyToUndefined = (v?: string) => (v && v.trim() !== '' ? v : undefined);

  return {
    accountType: values.accountType,
    ownerName: values.ownerName.trim(),
    businessName: values.businessName.trim(),
    phone: values.phone.trim(),
    whatsapp: emptyToUndefined(values.whatsapp),
    email: emptyToUndefined(values.email),
    region: values.region.trim(),
    district: values.district.trim(),
    ward: emptyToUndefined(values.ward),
    businessCategory: values.businessCategory,
    businessDescription: values.businessDescription.trim(),
    productsOrServices: values.productsOrServices.trim(),
    yearsInBusiness: values.yearsInBusiness,
    website: emptyToUndefined(values.website),
    facebook: emptyToUndefined(values.facebook),
    instagram: emptyToUndefined(values.instagram),
    tiktok: emptyToUndefined(values.tiktok),
    logoUrl: emptyToUndefined(values.logoUrl),
    coverImageUrl: emptyToUndefined(values.coverImageUrl),
    photoUrls: values.photoUrls && values.photoUrls.length > 0 ? values.photoUrls : undefined,
    latitude: values.latitude,
    longitude: values.longitude,
    consentToContact: values.consentToContact,
    biggestChallenge: emptyToUndefined(values.biggestChallenge),
    howCustomersFindYou: emptyToUndefined(values.howCustomersFindYou),
    onlinePlatformsUsed:
      values.onlinePlatformsUsed && values.onlinePlatformsUsed.length > 0
        ? values.onlinePlatformsUsed
        : undefined,
    desiredKentexaFeature: emptyToUndefined(values.desiredKentexaFeature),
    wouldUseAi: values.wouldUseAi,
  };
}

export default function RegisterPage() {
  const router = useRouter();
  const { form, step, goNext, goBack, goToStep, isFirstStep, isLastStep } = useRegistrationForm();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [accountTypeOptions, setAccountTypeOptions] = useState<string[]>([]);
  const [businessCategoryOptions, setBusinessCategoryOptions] = useState<string[]>([]);

  useEffect(() => {
    getCategories()
      .then((data) => {
        setAccountTypeOptions(data.accountTypes ?? []);
        setBusinessCategoryOptions(data.businessCategories ?? []);
      })
      .catch(() => {
        // Fall back silently to the hardcoded enum values used by each step.
      });
  }, []);

  const handleSubmit = async () => {
    const valid = await form.trigger();
    if (!valid) {
      toast.error('Please review the highlighted fields before submitting.');
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = toPayload(form.getValues());
      const result = await registerBusiness(payload);
      router.push(`/success/${result.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 429) {
          toast.error('Too many registration attempts. Please try again later.');
        } else {
          err.messages.forEach((m) => toast.error(m));
        }
      } else {
        toast.error('Something went wrong. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 py-10 dark:bg-gray-900">
      <div className="mx-auto max-w-2xl px-4">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary dark:text-gray-400 dark:hover:text-primary-light"
        >
          ← Back to home
        </Link>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-8">
          <FormProgressBar step={step} onStepClick={goToStep} />

          {step === 0 && <StepAccountType form={form} accountTypeOptions={accountTypeOptions} />}
          {step === 1 && (
            <StepBusinessInfo form={form} businessCategoryOptions={businessCategoryOptions} />
          )}
          {step === 2 && <StepLocation form={form} />}
          {step === 3 && <StepOnlinePresence form={form} />}
          {step === 4 && <StepMedia form={form} />}
          {step === 5 && <StepAiQuestions form={form} />}
          {step === 6 && <StepReview form={form} onSubmit={handleSubmit} isSubmitting={isSubmitting} />}

          {!isLastStep && (
            <div className="mt-8 flex justify-between">
              <Button type="button" variant="outline" onClick={goBack} disabled={isFirstStep}>
                Back
              </Button>
              <Button type="button" onClick={goNext}>
                Next
              </Button>
            </div>
          )}
          {isLastStep && (
            <div className="mt-4 flex justify-start">
              <Button type="button" variant="outline" onClick={goBack} disabled={isSubmitting}>
                Back
              </Button>
            </div>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-gray-400 dark:text-gray-500">
          {step + 1} of {TOTAL_STEPS} steps
        </p>
      </div>
    </main>
  );
}
