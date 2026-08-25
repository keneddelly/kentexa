import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { IdentityVerificationStatus } from '../../identity/entities/identity-profile.entity';

export enum BusinessStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}

// The Business identity itself -- brand/company presence, independent of
// whether the account also sells physical products. Previously this data
// lived only on SellerProfile (businessName/businessDescription/etc.),
// which meant "Business" and "Seller" were structurally the same row.
// SellerProfile.businessId now points here when a Business has activated
// Seller; a Business with no Seller (a manufacturer that only wants a
// profile) simply has no SellerProfile at all.
@Entity()
export class Business {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @Column()
  legalName: string;

  @Column({ type: 'varchar', nullable: true })
  tradingName: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', nullable: true })
  category: string | null;

  @Column({ type: 'varchar', nullable: true })
  logo: string | null;

  @Column({ type: 'varchar', nullable: true })
  coverImage: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  // Structured location -- same tz-location hierarchy convention as
  // SellerProfile's own region/district/ward columns.
  @Column({ type: 'int', nullable: true })
  regionId: number | null;

  @Column({ type: 'varchar', nullable: true })
  region: string | null;

  @Column({ type: 'int', nullable: true })
  districtId: number | null;

  @Column({ type: 'varchar', nullable: true })
  district: string | null;

  @Column({ type: 'int', nullable: true })
  wardId: number | null;

  @Column({ type: 'varchar', nullable: true })
  ward: string | null;

  @Column({
    type: 'enum',
    enum: BusinessStatus,
    default: BusinessStatus.ACTIVE,
  })
  status: BusinessStatus;

  // Independent of any Seller/Transporter/etc. verification -- a Business
  // can be verified while never activating Seller at all.
  @Column({
    type: 'enum',
    enum: IdentityVerificationStatus,
    default: IdentityVerificationStatus.NOT_SUBMITTED,
  })
  businessVerificationStatus: IdentityVerificationStatus;

  @Column({ type: 'varchar', nullable: true })
  responsiblePersonName: string | null;

  @Column({ type: 'varchar', nullable: true })
  tinNumber: string | null;

  @Column({ type: 'varchar', nullable: true })
  registrationNumber: string | null; // BRELA

  @Column({ type: 'varchar', nullable: true })
  businessLicenseNumber: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
