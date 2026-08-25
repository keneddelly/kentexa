import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { IdentityVerificationStatus } from '../../identity/entities/identity-profile.entity';

export enum SellerStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  SUSPENDED = 'suspended',
  REJECTED = 'rejected',
}

// Progressive trust tiers, set by admin at/after approval — deliberately
// separate from SellerStatus (which only tracks the application lifecycle).
// A seller can be APPROVED and still sit at REGISTERED until they add more
// verifiable business info; suspension/rejection are unaffected by tier.
export enum SellerVerificationTier {
  REGISTERED = 'registered',
  VERIFIED_SELLER = 'verified_seller',
  VERIFIED_BUSINESS = 'verified_business',
}

@Entity()
export class SellerProfile {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @Column()
  businessName: string;

  @Column({ type: 'text', nullable: true })
  businessDescription: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'text', nullable: true })
  phone: string | null;

  @Column({ type: 'text', nullable: true })
  logo: string | null;

  @Column({ type: 'enum', enum: SellerStatus, default: SellerStatus.PENDING })
  status: SellerStatus;

  @Column({ type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({
    type: 'enum',
    enum: SellerVerificationTier,
    default: SellerVerificationTier.REGISTERED,
  })
  verificationTier: SellerVerificationTier;

  // Matches the category keys Stores.js's filter chips already send/expect
  // (electronics/fashion/food/hardware/beauty/furniture/wholesale/services)
  // — that UI has been filtering on this field since before it existed here.
  @Column({ type: 'varchar', nullable: true })
  businessCategory: string | null;

  // Structured location, resolved through the existing tz-location hierarchy
  // (same LocationPicker component/convention as Shipment/TransportRoute).
  // Name columns are kept alongside the FK ids because seller.service.ts's
  // public-facing responses (Stores.js, CommerceProfile.js) already read
  // businessCity/businessDistrict/businessRegion as plain display strings.
  @Column({ type: 'int', nullable: true })
  regionId: number | null;

  @Column({ type: 'varchar', nullable: true })
  businessRegion: string | null;

  @Column({ type: 'int', nullable: true })
  districtId: number | null;

  @Column({ type: 'varchar', nullable: true })
  businessDistrict: string | null;

  @Column({ type: 'int', nullable: true })
  wardId: number | null;

  @Column({ type: 'varchar', nullable: true })
  businessCity: string | null;

  @Column({ type: 'varchar', nullable: true })
  registrationNumber: string | null; // BRELA registration number

  // ── Multi-role architecture ─────────────────────────────────────────────
  // Points at the real Business entity when this seller is backed by one
  // (a company that activated Seller) -- null for an individual seller
  // with no registered business (spec: don't require BRELA for someone
  // selling a personal item). businessName/businessDescription/etc. below
  // stay populated as denormalized display copies either way, so nothing
  // already reading them breaks; new code should prefer Business's own
  // fields once businessId is set.
  @Column({ type: 'int', nullable: true })
  businessId: number | null;

  // ── Business verification (Phase 2) ────────────────────────────────────
  // Set once at application time — determines whether the extra business
  // document flow (TIN/license/BRELA docs) applies at all. Individual
  // sellers never touch businessDocumentsStatus; it stays NOT_SUBMITTED.
  @Column({ type: 'varchar', nullable: true })
  sellerType: 'individual' | 'business' | null;

  @Column({ type: 'varchar', nullable: true })
  tinNumber: string | null;

  @Column({ type: 'varchar', nullable: true })
  businessLicenseNumber: string | null;

  @Column({
    type: 'enum',
    enum: IdentityVerificationStatus,
    default: IdentityVerificationStatus.NOT_SUBMITTED,
  })
  businessDocumentsStatus: IdentityVerificationStatus;

  // ── Manual-shipment platform-fee billing ──────────────────────────────
  // Same model as SuperAgent's founding-pilot billing: every new seller
  // starts with a free-order allowance; past it, each manual shipment
  // (super-agents.service.ts createSellerShipment()) accrues a real flat
  // fee onto outstandingBalance instead of requiring an upfront per-order
  // payment before the shipment can proceed. Per-seller columns (not
  // hardcoded) so terms can be adjusted per account without code changes.
  @Column({ type: 'int', default: 50 })
  freeOrdersGranted: number;

  @Column({ type: 'int', default: 0 })
  freeOrdersUsed: number;

  @Column({ type: 'int', default: 0 })
  paidOrders: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 1000 })
  platformFeePerOrder: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 10000 })
  billingThreshold: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  outstandingBalance: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
