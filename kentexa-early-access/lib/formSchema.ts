import { z } from 'zod';
import { AccountType, BusinessCategory } from './types';

// Mirrors CreateRegistrationDto's validation rules on the backend exactly.

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

export const registrationFormSchema = z.object({
  accountType: z.nativeEnum(AccountType, { required_error: 'Please select an account type' }),
  ownerName: z.string().trim().min(2, 'Owner name must be at least 2 characters'),
  businessName: z.string().trim().min(2, 'Business name must be at least 2 characters'),
  phone: z.string().trim().min(7, 'Phone number must be at least 7 characters'),
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
  howCustomersFindYou: z.string().trim().optional().or(z.literal('')),
  onlinePlatformsUsed: z.array(z.string()).optional(),
  desiredKentexaFeature: z.string().trim().optional().or(z.literal('')),
  wouldUseAi: z.boolean().optional(),
  consentToContact: z.literal(true, {
    errorMap: () => ({ message: 'You must agree to be contacted before your profile is published' }),
  }),
});

export type RegistrationFormValues = z.infer<typeof registrationFormSchema>;

export const defaultRegistrationFormValues: Partial<RegistrationFormValues> = {
  ownerName: '',
  businessName: '',
  phone: '',
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
  howCustomersFindYou: '',
  onlinePlatformsUsed: [],
  desiredKentexaFeature: '',
  consentToContact: undefined as unknown as true,
};
