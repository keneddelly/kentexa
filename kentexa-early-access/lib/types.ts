// Types mirroring the Kentexa Early Access backend contract exactly.
// Keep in sync with the NestJS DTOs in the main backend (src/early-access/*).

export enum AccountType {
  BUSINESS = 'business',
  SELLER = 'seller',
  SERVICE_PROVIDER = 'service_provider',
  TRANSPORTER = 'transporter',
  AGENT = 'agent',
}

export enum BusinessCategory {
  ELECTRONICS = 'electronics',
  FASHION = 'fashion',
  AGRICULTURE = 'agriculture',
  FOOD = 'food',
  CONSTRUCTION = 'construction',
  CLEANING = 'cleaning',
  HEALTH = 'health',
  BEAUTY = 'beauty',
  REPAIR = 'repair',
  SECURITY = 'security',
  AUTOMOTIVE = 'automotive',
  EDUCATION = 'education',
  TECHNOLOGY = 'technology',
  REAL_ESTATE = 'real_estate',
  HOME_SERVICES = 'home_services',
  PROFESSIONAL_SERVICES = 'professional_services',
  OTHER = 'other',
}

export enum RegistrationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

/** Title-cases an enum value, e.g. "service_provider" -> "Service Provider". */
export function formatEnumLabel(value: string): string {
  return value
    .split('_')
    .map((word) => (word.length ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

export const ONLINE_PLATFORM_OPTIONS = [
  'Facebook',
  'Instagram',
  'WhatsApp',
  'Google',
  'Word of mouth',
  'TikTok',
  'None',
] as const;

export interface RegistrationPayload {
  accountType: AccountType;
  ownerName: string;
  businessName: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  region: string;
  district: string;
  ward?: string;
  businessCategory: BusinessCategory;
  businessDescription: string;
  productsOrServices: string;
  yearsInBusiness?: number;
  website?: string;
  facebook?: string;
  instagram?: string;
  tiktok?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  photoUrls?: string[];
  latitude?: number;
  longitude?: number;
  consentToContact: boolean;
  biggestChallenge?: string;
  howCustomersFindYou?: string;
  onlinePlatformsUsed?: string[];
  desiredKentexaFeature?: string;
  wouldUseAi?: boolean;
}

export interface Registration extends RegistrationPayload {
  id: number;
  earlyAccessId: string;
  status: RegistrationStatus;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedRegistrations {
  data: Registration[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CategoriesResponse {
  accountTypes: string[];
  businessCategories: string[];
}

export interface PublicStats {
  businessesRegistered: number;
  serviceProviders: number;
  transporters: number;
  regionsCovered: number;
}

export interface AdminStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  byAccountType: { accountType: string; count: string }[];
  byRegion: { region: string; count: string }[];
  byCategory: { category: string; count: string }[];
  registrationsPerDay: { date: string; count: string }[];
}

export interface RegistrationListFilters {
  page?: number;
  limit?: number;
  accountType?: string;
  region?: string;
  businessCategory?: string;
  status?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface UploadResponse {
  urls: string[];
}

export interface AdminUser {
  id: number;
  phone: string | null;
  email: string | null;
  name: string | null;
  role: string;
  onboardingCompleted: boolean;
}

export interface LoginResponse {
  access_token: string;
  user: AdminUser;
}

export interface NestErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}
