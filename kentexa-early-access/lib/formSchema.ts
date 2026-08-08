import { z } from 'zod';
import { AccountType, BusinessCategory } from './types';

// Mirrors CreateRegistrationDto's validation rules on the backend exactly.

// Flip to true once SMS delivery is reliable again (currently blocked pending
// Tanzania Sender ID / TCRA registration — Africa's Talking accepts sends but
// the carrier drops them silently). Must match REQUIRE_PHONE_VERIFICATION on
// the backend (src/early-access/early-access.service.ts).
export const REQUIRE_PHONE_VERIFICATION = false;

const optionalEmail = z
  .string()
  .trim()
  .email('Please enter a valid email address')
  .optional()
  .or(z.literal(''));

const optionalUrl = z
  .string()
  .trim()
  .url('Please enter a valid URL (include https://)')
  .optional()
  .or(z.literal(''));

export const registrationFormSchema = z
  .object({
    accountType: z.nativeEnum(AccountType, { required_error: 'Please select an account type' }),
    ownerName: z.string().trim().min(2, 'Owner name must be at least 2 characters'),
    businessName: z.string().trim().min(2, 'Business name must be at least 2 characters'),
    phone: z.string().trim().min(7, 'Phone number must be at least 7 characters'),
    phoneVerified: REQUIRE_PHONE_VERIFICATION
      ? z.boolean().refine((v) => v === true, { message: 'Please verify your phone number' })
      : z.boolean().optional(),
    whatsapp: z.string().trim().optional().or(z.literal('')),
    email: optionalEmail,
    region: z.string().trim().min(1, 'Region is required'),
    district: z.string().trim().min(1, 'District is required'),
    ward: z.string().trim().optional().or(z.literal('')),
    businessCategory: z.nativeEnum(BusinessCategory, { required_error: 'Please select a business category' }),
    businessDescription: z.string().trim().min(10, 'Please describe your business in at least 10 characters'),
    productsOrServices: z.string().trim().min(3, 'Please list your products or services (min 3 characters)'),
    yearsInBusiness: z
      .union([z.number().int().min(0, 'Must be 0 or more'), z.nan()])
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
      .union([z.number().int().min(0, 'Must be 0 or more'), z.nan()])
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
      errorMap: () => ({ message: 'You must agree to be contacted before your profile is published' }),
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
        message: 'Please select your vehicle type',
      });
    }
    if (data.accountType === AccountType.SERVICE_PROVIDER && !data.currentBookingMethod) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['currentBookingMethod'],
        message: 'Please tell us how customers currently book you',
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
