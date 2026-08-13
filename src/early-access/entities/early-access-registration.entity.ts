import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

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

@Entity('early_access_registration')
@Index(['isDeleted', 'status'])
export class EarlyAccessRegistration {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'varchar', length: 30, enum: AccountType })
  accountType: AccountType;

  @Column({ type: 'varchar', length: 150 })
  ownerName: string;

  @Column({ type: 'varchar', length: 150 })
  businessName: string;

  @Column({ type: 'varchar', length: 30 })
  phone: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  whatsapp: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email: string | null;

  @Index()
  @Column({ type: 'varchar', length: 100 })
  region: string;

  @Column({ type: 'varchar', length: 100 })
  district: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  ward: string | null;

  @Index()
  @Column({ type: 'varchar', length: 40, enum: BusinessCategory })
  businessCategory: BusinessCategory;

  @Column({ type: 'text' })
  businessDescription: string;

  @Column({ type: 'text' })
  productsOrServices: string;

  @Column({ type: 'int', nullable: true })
  yearsInBusiness: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  website: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  facebook: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  instagram: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  tiktok: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  logoUrl: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  coverImageUrl: string | null;

  @Column({ type: 'simple-array', nullable: true })
  photoUrls: string[] | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude: number | null;

  @Column({ type: 'boolean', default: false })
  consentToContact: boolean;

  // True for rows created via the short 2-field funnel (quick-register) —
  // region/businessCategory/businessDescription/productsOrServices are
  // placeholder values on these until the person is followed up with, not
  // real data. Lets admin exports tell "hasn't filled in details yet" apart
  // from "genuinely has no description".
  @Column({ type: 'boolean', default: false })
  isQuickSignup: boolean;

  // ── AI research questions ─────────────────────────────────────────────
  @Column({ type: 'text', nullable: true })
  biggestChallenge: string | null;

  @Column({ type: 'text', nullable: true })
  howCustomersFindYou: string | null;

  @Column({ type: 'simple-array', nullable: true })
  onlinePlatformsUsed: string[] | null;

  @Column({ type: 'text', nullable: true })
  desiredKentexaFeature: string | null;

  @Column({ type: 'boolean', nullable: true })
  wouldUseAi: boolean | null;

  // ── Category-specific ─────────────────────────────────────────────────
  // transporter — cargo capacity and route type are what actually
  // differentiate a boda from a truck from a boat, not the vehicle label
  // alone; coverageRegions ties into the same tz-location region list used
  // elsewhere in the app instead of a free-text description.
  @Column({ type: 'varchar', length: 50, nullable: true })
  vehicleType: string | null;

  @Column({ type: 'boolean', nullable: true })
  hasLicense: boolean | null;

  @Column({ type: 'text', nullable: true })
  coverageAreas: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  cargoCapacity: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  routeType: string | null;

  // seller
  @Column({ type: 'simple-array', nullable: true })
  currentSellingChannels: string[] | null;

  @Column({ type: 'int', nullable: true })
  readyProductCount: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  priceRange: string | null;

  // service_provider
  @Column({ type: 'boolean', nullable: true })
  travelsToCustomer: boolean | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  currentBookingMethod: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  pricingModel: string | null;

  // agent
  @Column({ type: 'boolean', nullable: true })
  hasPhysicalLocation: boolean | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  operatingHours: string | null;

  @Column({ type: 'boolean', nullable: true })
  canHandleCashCollection: boolean | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  agentType: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  dailyCapacity: string | null;

  // shared across transporter / service_provider / agent
  @Column({ type: 'simple-array', nullable: true })
  coverageRegions: string[] | null;

  // shared across business / seller
  @Column({ type: 'boolean', nullable: true })
  needsDeliverySupport: boolean | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  employeeCount: string | null;

  // ── Admin workflow ────────────────────────────────────────────────────
  @Index()
  @Column({
    type: 'varchar',
    length: 20,
    enum: RegistrationStatus,
    default: RegistrationStatus.PENDING,
  })
  status: RegistrationStatus;

  @Column({ type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ type: 'boolean', default: false })
  isDeleted: boolean;

  @Index()
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Not a column — derived from id, e.g. id=123 -> "KTX-EA-000123"
  get earlyAccessId(): string {
    return `KTX-EA-${String(this.id).padStart(6, '0')}`;
  }
}
