import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum ShippingMethod {
  DIRECT = 'direct',
  AGENT = 'agent',
}

@Entity()
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  seller: User | null;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  // ── Pricing ──
  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  basePrice: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  deliveryFee: number;

  // Boda boda fee for intra-city (Dar es Salaam) deliveries
  // Set by seller — used when buyer and seller are in same city
  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  bodaFee: number;

  // City where seller is located — used for same-city detection
  @Column({ type: 'text', nullable: true, default: 'Dar es Salaam' })
  sellerCity: string | null;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  displayPrice: number;

  @Column({ type: 'int', default: 0 })
  stock: number;

  // ── Category & Subcategory ──
  @Column({ type: 'text', nullable: true })
  category: string | null;

  @Column({ type: 'text', nullable: true })
  subcategory: string | null;

  // ── Product Specs (JSON: { "Resolution": "1080P", "Battery": "2hrs" }) ──
  @Column({ type: 'json', nullable: true })
  specs: Record<string, string> | null;

  // ── Product Features (JSON array: ["WiFi Live View", "Night Vision"]) ──
  @Column({ type: 'json', nullable: true })
  features: string[] | null;

  @Column({ type: 'simple-array', nullable: true })
  images: string[];

  @Column({ default: true })
  isAvailable: boolean;

  @Column({ default: true })
  isActive: boolean;

  // ── Shipping ──
  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  weightKg: number | null;

  @Column({
    type: 'enum',
    enum: ShippingMethod,
    default: ShippingMethod.AGENT,
  })
  shippingMethod: ShippingMethod;

  @Column({ type: 'text', nullable: true })
  estimatedDelivery: string | null;

  @Column({ type: 'text', nullable: true })
  shippingNotes: string | null;

  // ── Store badges ──
  @Column({ default: false })
  isFeatured: boolean;

  @Column({ default: false })
  isBestSeller: boolean;

  @Column({ default: false })
  isNewArrival: boolean;

  @Column({ default: false })
  isRecommended: boolean;

  @Column({ type: 'int', default: 0 })
  salesCount: number;

  // ── Social proof tracking (resets daily) ──
  @Column({ type: 'int', default: 0 })
  viewsToday: number;

  @Column({ type: 'date', nullable: true })
  viewsResetDate: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
