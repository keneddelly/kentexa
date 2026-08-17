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
  registrationNumber: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
