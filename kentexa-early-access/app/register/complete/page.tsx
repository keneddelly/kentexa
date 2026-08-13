'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useRegistrationForm } from '@/hooks/useRegistrationForm';
import type { RegistrationFormValues } from '@/lib/formSchema';
import type { CompleteRegistrationPayload, Registration } from '@/lib/types';
import {
  ApiError,
  EDIT_TOKEN_ID_KEY,
  EDIT_TOKEN_KEY,
  completeRegistrationByToken,
  getCategories,
  getRegistrationByToken,
} from '@/lib/apiClient';
import Button from '@/components/ui/Button';
import FormProgressBar from '@/components/form/FormProgressBar';
import StepBusinessInfo from '@/components/form/StepBusinessInfo';
import StepLocation from '@/components/form/StepLocation';
import StepOnlinePresence from '@/components/form/StepOnlinePresence';
import StepMedia from '@/components/form/StepMedia';
import StepAiQuestions from '@/components/form/StepAiQuestions';
import StepReview from '@/components/form/StepReview';
import LanguageToggle from '@/components/LanguageToggle';
import { useLanguage } from '@/lib/i18n';

const MIN_STEP = 1; // skip Account Type — already answered at quick-register

function toCompletePayload(values: RegistrationFormValues): CompleteRegistrationPayload {
  const emptyToUndefined = (v?: string) => (v && v.trim() !== '' ? v : undefined);

  return {
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
    vehicleType: emptyToUndefined(values.vehicleType),
    hasLicense: values.hasLicense,
    coverageAreas: emptyToUndefined(values.coverageAreas),
    cargoCapacity: emptyToUndefined(values.cargoCapacity),
    routeType: emptyToUndefined(values.routeType),
    currentSellingChannels:
      values.currentSellingChannels && values.currentSellingChannels.length > 0
        ? values.currentSellingChannels
        : undefined,
    readyProductCount: values.readyProductCount,
    priceRange: emptyToUndefined(values.priceRange),
    travelsToCustomer: values.travelsToCustomer,
    currentBookingMethod: emptyToUndefined(values.currentBookingMethod),
    pricingModel: emptyToUndefined(values.pricingModel),
    hasPhysicalLocation: values.hasPhysicalLocation,
    operatingHours: emptyToUndefined(values.operatingHours),
    canHandleCashCollection: values.canHandleCashCollection,
    agentType: emptyToUndefined(values.agentType),
    dailyCapacity: emptyToUndefined(values.dailyCapacity),
    coverageRegions:
      values.coverageRegions && values.coverageRegions.length > 0 ? values.coverageRegions : undefined,
    needsDeliverySupport: values.needsDeliverySupport,
    employeeCount: emptyToUndefined(values.employeeCount),
  };
}

export default function CompleteRegistrationPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [token, setToken] = useState<string | null | undefined>(undefined); // undefined = still checking
  const [existing, setExisting] = useState<Registration | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [businessCategoryOptions, setBusinessCategoryOptions] = useState<string[]>([]);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.sessionStorage.getItem(EDIT_TOKEN_KEY);
    } catch {
      // sessionStorage unavailable
    }
    setToken(stored);
    if (!stored) return;

    getRegistrationByToken(stored)
      .then((data) => setExisting(data))
      .catch(() => setLoadError(true));

    getCategories()
      .then((data) => setBusinessCategoryOptions(data.businessCategories ?? []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (token === undefined || (token && !existing && !loadError)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <p className="text-sm text-gray-400">{t('loading') || '...'}</p>
      </main>
    );
  }

  if (!token || loadError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 px-4 text-center dark:bg-gray-900">
        <p className="text-gray-600 dark:text-gray-300">{t('complete_link_invalid')}</p>
        <Link href="/">
          <Button variant="outline">{t('success_back_home')}</Button>
        </Link>
      </main>
    );
  }

  return (
    <CompleteRegistrationForm
      token={token}
      existing={existing!}
      businessCategoryOptions={businessCategoryOptions}
      onDone={(id) => {
        try {
          window.sessionStorage.removeItem(EDIT_TOKEN_KEY);
          window.sessionStorage.removeItem(EDIT_TOKEN_ID_KEY);
        } catch {
          // ignore
        }
        router.push(`/success/${id}?stage=completed`);
      }}
    />
  );
}

function CompleteRegistrationForm({
  token,
  existing,
  businessCategoryOptions,
  onDone,
}: {
  token: string;
  existing: Registration;
  businessCategoryOptions: string[];
  onDone: (id: number) => void;
}) {
  const { t } = useLanguage();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { form, step, goNext, goBack, goToStep, isLastStep } = useRegistrationForm({
    minStep: MIN_STEP,
    initialValues: {
      accountType: existing.accountType,
      ownerName: existing.ownerName,
      phone: existing.phone,
      whatsapp: existing.whatsapp || existing.phone,
    },
  });

  const handleSubmit = async () => {
    const valid = await form.trigger();
    if (!valid) {
      toast.error(t('toast_review_fields'));
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = toCompletePayload(form.getValues());
      const result = await completeRegistrationByToken(token, payload);
      onDone(result.id);
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
    <main className="min-h-screen bg-gray-50 py-10 dark:bg-gray-900">
      <div className="mx-auto max-w-2xl px-4">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary dark:text-gray-400 dark:hover:text-primary-light"
          >
            {t('back_to_home')}
          </Link>
          <LanguageToggle />
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-8">
          <FormProgressBar step={step} onStepClick={goToStep} minStep={MIN_STEP} />

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
              <Button type="button" variant="outline" onClick={goBack} disabled={step === MIN_STEP}>
                {t('back')}
              </Button>
              <Button type="button" onClick={goNext}>
                {t('next')}
              </Button>
            </div>
          )}
          {isLastStep && (
            <div className="mt-4 flex justify-start">
              <Button type="button" variant="outline" onClick={goBack} disabled={isSubmitting}>
                {t('back')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
