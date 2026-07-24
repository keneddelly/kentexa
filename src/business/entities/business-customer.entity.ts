import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * BusinessCustomer — Seller's private customer database
 *
 * Every seller builds their own customer list.
 * A customer can be:
 *   - A registered KenteXa user (userId set)
 *   - A WhatsApp/manual buyer (userId null, phone required)
 *
 * Auto-populated when:
 *   - Seller creates a manual order (SellerShipment)
 *   - Online order is placed with this seller
 *   - Seller manually adds a customer
 *   - Invoice is paid
 */
@Entity('business_customer')
export class BusinessCustomer {
  @PrimaryGeneratedColumn()
  id: number;

  // ── Seller relationship ───────────────────────────────────────────────────
  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'seller_id' })
  seller: User;

  @Column({ name: 'seller_id' })
  sellerId: number;

  // ── Customer identity (optional KenteXa account link) ────────────────────
  @ManyToOne(() => User, { nullable: true, eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ name: 'user_id', nullable: true })
  userId: number | null;

  // ── Contact info ──────────────────────────────────────────────────────────
  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ type: 'varchar', nullable: true })
  address: string | null;

  // ── Location (from location engine) ──────────────────────────────────────
  @Column({ type: 'int', nullable: true })
  wardId: number | null;

  @Column({ type: 'varchar', nullable: true })
  ward: string | null;

  @Column({ type: 'varchar', nullable: true })
  district: string | null;

  @Column({ type: 'varchar', nullable: true })
  region: string | null;

  // ── CRM data ──────────────────────────────────────────────────────────────
  @Column({ type: 'int', default: 0 })
  totalOrders: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalSpent: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  averageOrderValue: number;

  @Column({ type: 'timestamp', nullable: true })
  firstOrderAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lastOrderAt: Date | null;

  // ── Segmentation ──────────────────────────────────────────────────────────
  @Column({ type: 'varchar', default: 'regular' })
  segment: string; // 'vip' | 'regular' | 'wholesale' | 'inactive' | 'new'

  @Column({ type: 'simple-array', nullable: true })
  tags: string[] | null; // custom tags seller adds

  @Column({ type: 'text', nullable: true })
  notes: string | null; // seller private notes about customer

  // ── Communication channel ─────────────────────────────────────────────────
  @Column({ type: 'varchar', default: 'kentexa' })
  channel: string; // 'kentexa' | 'whatsapp' | 'instagram' | 'manual' | 'walk_in'

  // ── Status ────────────────────────────────────────────────────────────────
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'boolean', default: false })
  isBlocked: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}