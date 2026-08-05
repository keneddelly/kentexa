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
