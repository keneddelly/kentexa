import { z } from 'zod';
import { AccountType, BusinessCategory } from './types';

// Mirrors CreateRegistrationDto's validation rules on the backend exactly.

// Flip to true once SMS delivery is reliable again (currently blocked pending
// Tanzania Sender ID / TCRA registration — Africa's Talking accepts sends but
// the carrier drops them silently). Must match REQUIRE_PHONE_VERIFICATION on
// the backend (src/early-access/early-access.service.ts).
export const REQUIRE_PHONE_VERIFICATION = false;

// Values here are translation KEYS (see lib/i18n.ts), not display text — each
// component resolves the actual message via t(errors.field?.message) at
// render time, so validation text follows the current language.

const optionalEmail = z
  .string()
  .trim()
  .email('err_email')
  .optional()
  .or(z.literal(''));

const optionalUrl = z
  .string()
  .trim()
  .url('err_url')
  .optional()
  .or(z.literal(''));

export const registrationFormSchema = z
  .object({
    accountType: z.nativeEnum(AccountType, { required_error: 'err_account_type' }),
    ownerName: z.string().trim().min(2, 'err_owner_name'),
    businessName: z.string().trim().min(2, 'err_business_name'),
    phone: z.string().trim().min(7, 'err_phone'),
    phoneVerified: REQUIRE_PHONE_VERIFICATION
      ? z.boolean().refine((v) => v === true, { message: 'err_phone_verify' })
      : z.boolean().optional(),
    whatsapp: z.string().trim().optional().or(z.literal('')),
    email: optionalEmail,
    region: z.string().trim().min(1, 'err_region'),
    district: z.string().trim().min(1, 'err_district'),
    ward: z.string().trim().optional().or(z.literal('')),
    businessCategory: z.nativeEnum(BusinessCategory, { required_error: 'err_business_category' }),
    businessDescription: z.string().trim().min(10, 'err_business_description'),
    productsOrServices: z.string().trim().min(3, 'err_products_services'),
    yearsInBusiness: z
      .union([z.number().int().min(0, 'err_must_be_zero_or_more'), z.nan()])
      .optional()
      .transform((v) => (v === undefined || Number.isNaN(v) ? undefined : v)),
    website: optionalUrl,
    facebook: z.string().trim().optional().or(z.literal('')),
    instagram: z.string().trim().optional().or(z.literal('')),
    tiktok: z.string().trim().optional().or(z.literal('')),
    logoUrl: z.string().optional().or(z.literal('')),
    coverImageUrl: z.string().optional().or(z.literal('')),
    photoUrls: z.array(z.string()).optional(),
    latitude: z
      .union([z.number(), z.nan()])
      .optional()
      .transform((v) => (v === undefined || Number.isNaN(v) ? undefined : v)),
    longitude: z
      .union([z.number(), z.nan()])
      .optional()
      .transform((v) => (v === undefined || Number.isNaN(v) ? undefined : v)),
    biggestChallenge: z.string().trim().optional().or(z.literal('')),
    // transporter
    vehicleType: z.string().trim().optional().or(z.literal('')),
    hasLicense: z.boolean().optional(),
    coverageAreas: z.string().trim().optional().or(z.literal('')),
    // seller
    currentSellingChannels: z.array(z.string()).optional(),
    readyProductCount: z
      .union([z.number().int().min(0, 'err_must_be_zero_or_more'), z.nan()])
      .optional()
      .transform((v) => (v === undefined || Number.isNaN(v) ? undefined : v)),
    // service_provider
    travelsToCustomer: z.boolean().optional(),
    currentBookingMethod: z.string().trim().optional().or(z.literal('')),
    // agent
    hasPhysicalLocation: z.boolean().optional(),
    operatingHours: z.string().trim().optional().or(z.literal('')),
    canHandleCashCollection: z.boolean().optional(),
    consentToContact: z.literal(true, {
      errorMap: () => ({ message: 'err_consent' }),
    }),
  })
  // Soft-required category-specific nudges — mirrors the backend's @ValidateIf,
  // but never hard-blocks: these fields are shown per account type without
  // adding a new mandatory hurdle before we see real completion data.
  .superRefine((data, ctx) => {
    if (data.accountType === AccountType.TRANSPORTER && !data.vehicleType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['vehicleType'],
        message: 'err_vehicle_type',
      });
    }
    if (data.accountType === AccountType.SERVICE_PROVIDER && !data.currentBookingMethod) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['currentBookingMethod'],
        message: 'err_booking_method',
      });
    }
  });

export type RegistrationFormValues = z.infer<typeof registrationFormSchema>;

export const defaultRegistrationFormValues: Partial<RegistrationFormValues> = {
  ownerName: '',
  businessName: '',
  phone: '',
  phoneVerified: false,
  whatsapp: '',
  email: '',
  region: '',
  district: '',
  ward: '',
  businessDescription: '',
  productsOrServices: '',
  website: '',
  facebook: '',
  instagram: '',
  tiktok: '',
  logoUrl: '',
  coverImageUrl: '',
  photoUrls: [],
  biggestChallenge: '',
  vehicleType: '',
  coverageAreas: '',
  currentSellingChannels: [],
  currentBookingMethod: '',
  operatingHours: '',
  consentToContact: undefined as unknown as true,
};
