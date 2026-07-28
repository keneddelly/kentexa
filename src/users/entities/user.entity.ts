import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';

export enum UserRole {
  USER = 'user',
  SELLER = 'seller',
  AGENT = 'agent',
  SUPER_AGENT = 'super_agent',
  CUSTOMER_CARE = 'customer_care',
  MANAGER = 'manager',
  ADMIN = 'admin',
  ARBITRATOR = 'arbitrator', // dispute resolver — assigned by admin per dispute
}

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', unique: true, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', unique: true, nullable: true })
  email: string | null;

  @Exclude()
  @Column({ type: 'varchar' })
  password: string;

  @Column({ type: 'varchar', nullable: true })
  name: string | null;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Exclude()
  @Column({ type: 'varchar', nullable: true })
  otp: string | null;

  @Exclude()
  @Column({ type: 'timestamp', nullable: true })
  otpExpiry: Date | null;

  @Column({ type: 'boolean', default: false })
  isVerified: boolean;

  @Exclude()
  @Column({ type: 'int', default: 0 })
  otpAttempts: number;

  // ───────────────────────────────────────────────
  // ✅ SELLER STORE PROFILE FIELDS
  // ───────────────────────────────────────────────
  @Column({ type: 'varchar', nullable: true })
  storeName: string | null;

  @Column({ type: 'varchar', nullable: true })
  storeWhatsApp: string | null; // e.g. 255788075633 — used for wa.me tracking links

  // ── Seller payout details — how KenteXa sends the seller their money ─────
  // Shown in the admin Payouts page so admin knows exactly where to send
  // funds, and required before a seller's first payout can be released.
  @Column({ type: 'varchar', nullable: true })
  payoutMethod: string | null; // 'mpesa' | 'airtel_money' | 'tigo_pesa' | 'halotel' | 'bank'

  @Column({ type: 'varchar', nullable: true })
  payoutAccountName: string | null; // name on the account/wallet — must match for verification

  @Column({ type: 'varchar', nullable: true })
  payoutAccountNumber: string | null; // mobile money number OR bank account number

  @Column({ type: 'varchar', nullable: true })
  payoutBankName: string | null; // only used when payoutMethod === 'bank'

  @Column({ type: 'varchar', nullable: true })
  payoutBranchName: string | null; // optional, bank only

  @Column({ type: 'varchar', nullable: true })
  storeTagline: string | null;

  @Column({ type: 'text', nullable: true })
  storeDescription: string | null;

  @Column({ type: 'varchar', nullable: true })
  logo: string | null;

  @Column({ type: 'varchar', nullable: true })
  coverImage: string | null;

  @Column({ type: 'varchar', nullable: true })
  businessLocation: string | null;

  // Exact pickup address for agent collection — separate from general businessLocation
  // Agent uses this to find the seller when collecting a parcel for intercity shipping
  @Column({ type: 'text', nullable: true })
  sellerPickupAddress: string | null;

  @Column({ type: 'varchar', nullable: true })
  businessHours: string | null;

  @Column({ type: 'boolean', default: false })
  pickupAvailable: boolean;

  @Column({ type: 'boolean', default: false })
  freeDelivery: boolean;

  @Column({ type: 'boolean', default: false })
  fastShipping: boolean;

  @Column({ type: 'boolean', default: false })
  isOfficialStore: boolean;

  // ✅ Store stats (denormalized for fast reads — updated by triggers/jobs)
  @Column({ type: 'int', default: 0 })
  followersCount: number;

  @Column({ type: 'int', default: 0 })
  completedOrders: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  rating: number;

  @Column({ type: 'int', default: 0 })
  reviewsCount: number;

  // ── Commerce Identity ─────────────────────────────────────────────────────
  @Column({ type: 'int', default: 0 })
  reputationScore: number; // 0–1000, grows with activity

  @Column({ type: 'simple-array', nullable: true })
  activeRoles: string[] | null; // ['buyer','seller','agent'] — activated roles

  @Column({ type: 'varchar', nullable: true })
  kycLevel: string | null; // 'none' | 'phone' | 'id_document' | 'business'

  @Column({ type: 'varchar', nullable: true })
  bio: string | null; // short commerce bio

  @Column({ type: 'varchar', nullable: true })
  city: string | null; // primary city

  @Column({ type: 'boolean', default: false })
  onboardingCompleted: boolean; // guided setup done

  @Column({ type: 'simple-array', nullable: true })
  interests: string[] | null; // ['electronics','fashion','food'...]

  @Column({ type: 'int', default: 95 })
  responseRate: number;

  // ✅ Gallery images (JSON array of URLs)
  @Column({ type: 'jsonb', nullable: true, default: () => "'[]'" })
  galleryImages: string[];

  // ✅ Active promotion (JSON object)
  @Column({ type: 'jsonb', nullable: true })
  activePromotion: {
    title: string;
    description: string;
    expiresAt?: string;
  } | null;

  @CreateDateColumn()
  createdAt: Date;
}
