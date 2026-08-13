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

export const VEHICLE_TYPE_OPTIONS = [
  'Boda (motorcycle)',
  'Bajaji',
  'Car',
  'Van / Pickup',
  'Truck',
  'Boat / Ferry',
] as const;

export const CARGO_CAPACITY_OPTIONS = [
  'up_to_50kg',
  '50_500kg',
  '500kg_2t',
  '2t_10t',
  '10t_plus',
] as const;

export const ROUTE_TYPE_OPTIONS = ['intra_city', 'intercity', 'both'] as const;

export const PRICE_RANGE_OPTIONS = ['budget', 'mid_range', 'premium'] as const;

export const PRICING_MODEL_OPTIONS = ['fixed', 'hourly', 'quote'] as const;

export const AGENT_TYPE_OPTIONS = ['pickup_point', 'dropoff_hub', 'both'] as const;

export const DAILY_CAPACITY_OPTIONS = ['up_to_10', '10_50', '50_200', '200_plus'] as const;

export const EMPLOYEE_COUNT_OPTIONS = ['just_me', '2_5', '6_20', '20_plus'] as const;

export const BOOKING_METHOD_OPTIONS = [
  'Phone call',
  'WhatsApp',
  'Walk-in',
  'Social media',
  'Booking app',
] as const;

export interface RegionOption {
  id: number;
  name: string;
  nameSw: string;
}

// Short-funnel payload — accountType, name, WhatsApp only. Mirrors
// CreateQuickRegistrationDto on the backend (src/early-access/dto/
// create-quick-registration.dto.ts).
export interface QuickRegistrationPayload {
  accountType: AccountType;
  ownerName: string;
  whatsapp: string;
}

// Same shape as RegistrationPayload minus accountType — mirrors
// CompleteRegistrationDto (src/early-access/dto/complete-registration.dto.ts).
export type CompleteRegistrationPayload = Omit<RegistrationPayload, 'accountType'>;

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
  // transporter
  vehicleType?: string;
  hasLicense?: boolean;
  coverageAreas?: string;
  cargoCapacity?: string;
  routeType?: string;
  // seller
  currentSellingChannels?: string[];
  readyProductCount?: number;
  priceRange?: string;
  // service_provider
  travelsToCustomer?: boolean;
  currentBookingMethod?: string;
  pricingModel?: string;
  // agent
  hasPhysicalLocation?: boolean;
  operatingHours?: string;
  canHandleCashCollection?: boolean;
  agentType?: string;
  dailyCapacity?: string;
  // shared: transporter / service_provider / agent
  coverageRegions?: string[];
  // shared: business / seller
  needsDeliverySupport?: boolean;
  employeeCount?: string;
}

/** A single result from GET /locations/search — ward, district, or region level. */
export interface LocationSearchResult {
  type: 'ward' | 'district' | 'region';
  regionId?: number;
  region?: string;
  districtId?: number;
  district?: string;
  wardId?: number;
  ward?: string;
  // Backend decimal columns can serialize as numeric strings — accept both.
  lat: number | string | null;
  lng: number | string | null;
  fullAddress: string;
}

export interface Registration extends RegistrationPayload {
  id: number;
  isQuickSignup?: boolean;
  // Only ever present right after quick-register — never re-fetched or
  // shown elsewhere. See editToken on the backend entity.
  editToken?: string | null;
  // Legacy fields from the old generic "Quick Questions" step — no longer
  // collected by the current form, but may still be present on older rows.
  howCustomersFindYou?: string;
  onlinePlatformsUsed?: string[];
  desiredKentexaFeature?: string;
  wouldUseAi?: boolean;
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
