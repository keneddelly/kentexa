import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Parcel } from '../../super-agents/entities/parcel.entity';

/**
 * DeliveryJob — a job posted by seller after paying TZS 1,000 tracking fee.
 *
 * Visible to all online agents in the origin city who can handle the weight.
 * Agent types that can see it are filtered by parcelWeightKg vs agent.maxWeightKg.
 *
 * Flow:
 *   created (broadcast) → claimed (agent accepted) → collected (agent has parcel)
 *   → delivered (same city) OR handed_to_hub (intercity)
 *
 * For same city: agent delivers directly to buyer.
 * For intercity: agent collects from seller and brings to Super Agent hub.
 */
export enum JobStatus {
  OPEN = 'open', // broadcast — any online agent can claim
  CLAIMED = 'claimed', // agent accepted — locked to them
  COLLECTED = 'collected', // agent picked up from seller
  DELIVERED = 'delivered', // delivered to buyer (same city)
  HANDED_TO_HUB = 'handed_to_hub', // delivered to Super Agent hub (intercity)
  CANCELLED = 'cancelled',
  EXPIRED = 'expired', // no agent claimed within 30 mins
}

export enum JobType {
  LOCAL_DELIVERY = 'local_delivery', // same city — seller to buyer directly
  HUB_COLLECTION = 'hub_collection', // intercity — seller to nearest Super Agent hub
}

@Entity('delivery_job')
export class DeliveryJob {
  @PrimaryGeneratedColumn()
  id: number;

  // Linked parcel — the item being moved
  @ManyToOne(() => Parcel, {
    eager: false,
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  parcel: Parcel;

  // Seller who posted the job
  @ManyToOne(() => User, { eager: true, nullable: false, onDelete: 'CASCADE' })
  @JoinColumn()
  seller: User;

  // Agent who claimed it — null until claimed
  @ManyToOne(() => User, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  agent: User | null;

  @Column({ type: 'enum', enum: JobStatus, default: JobStatus.OPEN })
  status: JobStatus;

  @Column({ type: 'enum', enum: JobType })
  jobType: JobType;

  // Pickup details
  @Column({ type: 'varchar' })
  pickupCity: string;

  @Column({ type: 'text' })
  pickupAddress: string; // seller's location

  @Column({ type: 'varchar', nullable: true })
  pickupPhone: string | null; // seller's phone for agent to call on arrival

  // Dropoff details
  @Column({ type: 'varchar' })
  dropoffCity: string; // buyer city (local) or hub city (intercity)

  @Column({ type: 'text', nullable: true })
  dropoffAddress: string | null; // buyer address (local) or hub name (intercity)

  // Parcel details — what agent is picking up
  @Column({ type: 'varchar' })
  itemDescription: string;

  @Column({ type: 'decimal', precision: 8, scale: 1, nullable: true })
  weightKg: number | null;

  @Column({ type: 'varchar', nullable: true })
  parcelSize: string | null; // small | medium | large | cargo

  // Estimated fee — from rate card, shown to agent before claiming
  // Not binding — actual fee agreed between seller and agent
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  estimatedFee: number | null;

  // Actual fee agreed after claim (agent can update)
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  agreedFee: number | null;

  // Agent type filter — which agent types can see this job
  // 'any' = all types | 'boda' = boda only | etc.
  @Column({ type: 'varchar', default: 'any' })
  requiredAgentType: string;

  // Timestamps
  @Column({ type: 'timestamp', nullable: true })
  claimedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  collectedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  // Auto-expire if no agent claims within 30 minutes
  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
