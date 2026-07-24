/**
 * ServiceAd entity — Service marketplace listings
 * Place at: src/services/entities/service-ad.entity.ts
 *
 * A ServiceAd is NOT a product. It's a skill or service a person offers.
 * Examples: electrician, wedding chef, home tutor, photographer, driver
 */
import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum ServiceCategory {
  UFUNDI        = 'ufundi',        // Plumbing, electrical, carpentry, masonry
  USAFI         = 'usafi',         // Cleaning, laundry, pest control
  ELIMU         = 'elimu',         // Tutoring, training, coaching
  UPISHI        = 'upishi',        // Cooking, catering, baking
  USAFIRISHAJI  = 'usafirishaji',  // Driving, delivery, moving
  AFYA          = 'afya',          // Nursing, physiotherapy, home care
  UBUNIFU       = 'ubunifu',       // Design, photography, video, music
  MATENGENEZO   = 'matengenezo',   // Repairs — phones, appliances, vehicles
  BIASHARA      = 'biashara',      // Accounting, legal, consulting
  KILIMO        = 'kilimo',        // Farming, landscaping, pest spraying
  NYUMBANI      = 'nyumbani',      // Babysitting, elderly care, housekeeping
  MENGINEYO     = 'mengineyo',     // Other
}

export enum PriceType {
  PER_HOUR  = 'per_hour',
  PER_JOB   = 'per_job',
  PER_DAY   = 'per_day',
  NEGOTIATE = 'negotiate',
  FREE_QUOTE = 'free_quote',
}

export enum ServiceStatus {
  ACTIVE    = 'active',
  PAUSED    = 'paused',
  INACTIVE  = 'inactive',
}

@Entity('service_ad')
export class ServiceAd {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn()
  provider: User;

  @Column({ type: 'int' })
  providerId: number;

  // Core info
  @Column({ type: 'varchar' })
  title: string;                    // "Fundi wa Umeme — Dar es Salaam"

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'enum', enum: ServiceCategory })
  category: ServiceCategory;

  @Column({ type: 'varchar', nullable: true })
  subcategory: string | null;       // e.g. "Umeme", "Mabomba", "Seremala"

  // Pricing
  @Column({ type: 'enum', enum: PriceType, default: PriceType.NEGOTIATE })
  priceType: PriceType;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  price: number;                    // 0 if free_quote or negotiate

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  priceMax: number | null;          // for ranges e.g. 5,000 – 15,000

  // Coverage
  @Column({ type: 'varchar' })
  coverageCity: string;             // "Dar es Salaam"

  @Column({ type: 'simple-array', nullable: true })
  coverageWards: string[] | null;   // ["Kariakoo", "Kinondoni", "Mbezi"]

  // Availability
  @Column({ type: 'simple-array', nullable: true })
  workingDays: string[] | null;     // ["Mon","Tue","Wed","Thu","Fri"]

  @Column({ type: 'varchar', nullable: true })
  workingHours: string | null;      // "08:00 - 18:00"

  @Column({ type: 'boolean', default: true })
  isAvailableNow: boolean;

  // Media
  @Column({ type: 'simple-array', nullable: true })
  images: string[] | null;          // portfolio photos

  // Stats
  @Column({ type: 'int', default: 0 })
  totalJobs: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  rating: number;

  @Column({ type: 'int', default: 0 })
  totalRatings: number;

  @Column({ type: 'int', default: 0 })
  views: number;

  // Contact
  @Column({ type: 'varchar', nullable: true })
  whatsappPhone: string | null;

  // Status
  @Column({ type: 'enum', enum: ServiceStatus, default: ServiceStatus.ACTIVE })
  status: ServiceStatus;

  @Column({ type: 'boolean', default: false })
  isVerified: boolean;              // KenteXa verified the provider

  @Column({ type: 'boolean', default: true })
  isAvailableForBooking: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}