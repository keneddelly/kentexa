import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { User }   from '../../users/entities/user.entity';
import { Order }  from '../../orders/entities/order.entity';
import { Parcel } from '../../super-agents/entities/parcel.entity';

export enum CollectionStatus {
  REQUESTED   = 'requested',     // Seller requested pickup — no agent yet
  CLAIMED     = 'claimed',       // Agent claimed — on their way to seller
  COLLECTED   = 'collected',     // Agent has the parcel — heading to hub
  HANDED_OVER = 'handed_over',   // Delivered to Super Agent hub — job done
  CANCELLED   = 'cancelled',     // No agent available / seller cancelled
}

/**
 * ParcelCollection — a local agent collects a parcel from the seller
 * and brings it to the origin Super Agent hub.
 *
 * This is the "reverse last-mile": instead of hub → agent → buyer,
 * it goes seller → agent → hub.
 *
 * Created automatically when a seller requests pickup at order creation.
 * The agent earns a flat collection fee (set per city, configurable by admin).
 *
 * Status flow:
 *   requested → claimed → collected → handed_over
 *               (agent assigned)   (at seller)    (at hub)
 *
 * Cancellation path:
 *   requested → cancelled  (if no agent claims within window, or seller cancels)
 */
@Entity('parcel_collection')
export class ParcelCollection {
  @PrimaryGeneratedColumn()
  id: number;

  // ── Linked records ────────────────────────────────────────────────────────
  @ManyToOne(() => Order, { eager: false, nullable: false, onDelete: 'CASCADE' })
  @JoinColumn()
  order: Order;

  @ManyToOne(() => Parcel, { eager: false, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  parcel: Parcel | null;

  @ManyToOne(() => User, { eager: true, nullable: false, onDelete: 'CASCADE' })
  @JoinColumn()
  seller: User;

  // Assigned once an agent claims the job (null = unclaimed)
  @ManyToOne(() => User, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  agent: User | null;

  // ── Location ──────────────────────────────────────────────────────────────
  @Column({ type: 'text' })
  pickupAddress: string;          // seller's exact pickup location

  @Column()
  city: string;                   // city where collection happens (e.g. 'Geita')

  @Column({ type: 'boolean', default: false })
  isRural: boolean;               // rural = higher collection fee

  // ── Status ────────────────────────────────────────────────────────────────
  @Column({
    type: 'enum',
    enum: CollectionStatus,
    default: CollectionStatus.REQUESTED,
  })
  status: CollectionStatus;

  // ── Fee ───────────────────────────────────────────────────────────────────
  // Set at creation from city config (admin-managed).
  // Urban default: 1,500. Rural: up to 5,000.
  // Added to buyer's order total — seller not penalised for rural location.
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 1500 })
  collectionFee: number;

  @Column({ type: 'boolean', default: false })
  agentPaidOut: boolean;          // admin has released fee to agent

  // ── Timestamps ────────────────────────────────────────────────────────────
  @Column({ type: 'timestamp', nullable: true })
  claimedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  collectedAt: Date | null;       // agent confirms pickup from seller

  @Column({ type: 'timestamp', nullable: true })
  handedOverAt: Date | null;      // agent confirms handover at Super Agent hub

  // ── Notes ─────────────────────────────────────────────────────────────────
  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'text', nullable: true })
  cancellationReason: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}