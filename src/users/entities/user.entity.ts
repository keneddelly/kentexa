import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { AccountRole } from '../../role-context/entities/account-role.entity';
import { ActiveRoleSession } from '../../role-context/entities/active-role-session.entity';

export enum UserRole {
  USER = 'user',
  SELLER = 'seller',
  AGENT = 'agent',
  SUPER_AGENT = 'super_agent',
  TRANSPORT_PROVIDER = 'transport_provider',
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

  // Personal profile photo — deliberately separate from `logo` (store/
  // seller branding, a different concept). Collected once, mandatorily,
  // right after OTP verification during registration; editable afterward
  // via the normal profile-edit path.
  @Column({ type: 'varchar', nullable: true })
  avatarUrl: string | null;

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

  @OneToMany(() => AccountRole, (accountRole) => accountRole.user)
  accountRoles: AccountRole[];

  @OneToMany(() => ActiveRoleSession, (session) => session.user)
  activeRoleSessions: ActiveRoleSession[];

  @Column({ type: 'varchar', nullable: true })
  kycLevel: string | null; // 'none' | 'phone' | 'id_document' | 'business'

  // ── Referral program (Phase 4) ─────────────────────────────────────────
  // Set exactly once, at registration (see AuthService.registerWithPhone/
  // Email) — never mutated by any other code path, which is what makes it
  // "locked after registration" per the referral spec, without needing a
  // separate immutability check anywhere.
  @Column({ type: 'int', nullable: true })
  referredBySuperAgentId: number | null;

  // Which Terms of Service version was active when this account signed up
  // (see src/policies/). Null only for accounts created before this field
  // existed — never backfilled, since we have no record of what version,
  // if any, actually applied to them.
  @Column({ type: 'varchar', nullable: true })
  termsAcceptedVersion: string | null;

  @Column({ type: 'timestamp', nullable: true })
  termsAcceptedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  bio: string | null; // short commerce bio

  @Column({ type: 'varchar', nullable: true })
  city: string | null; // primary city

  @Column({ type: 'boolean', default: false })
  onboardingCompleted: boolean; // guided setup done

  // Richer onboarding state than the single boolean above — which use case
  // the user picked in the Setup Wizard, per-journey step completion, and
  // per-feature tour completion/skip status. Additive: onboardingCompleted
  // keeps its existing meaning ("initial wizard done") and every existing
  // consumer of it (JWT payload, login response) is untouched.
  @Column({ type: 'jsonb', nullable: true })
  onboardingState: {
    selectedUseCase: string | null;
    startedAt: string | null;
    completedAt: string | null;
    journeySteps: Record<string, string[]>; // journeyKey -> completed step ids
    tours: Record<string, { status: 'completed' | 'skipped'; at: string }>;
  } | null;

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

  // Not a column — derived from id, e.g. id=4821 -> "KTX-U-004821". A
  // getter rather than a stored column (unlike Agent.agentCode) because it
  // needs to exist the instant `id` is assigned; there's no "approval"
  // moment for a base user to generate it at. NOTE: this is a prototype
  // getter, not an own enumerable property — plain object destructuring
  // (e.g. UsersService.exclude()) silently drops it, so anywhere that
  // spreads/destructures a User must re-add it explicitly.
  get kentexaId(): string {
    return `KTX-U-${String(this.id).padStart(6, '0')}`;
  }
}
