import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum AgentStatus {
  PENDING   = 'pending',
  APPROVED  = 'approved',
  REJECTED  = 'rejected',
  SUSPENDED = 'suspended',
}

export enum AgentTier {
  BASIC  = 'basic',   // 0-50 deliveries
  SILVER = 'silver',  // 51-200
  GOLD   = 'gold',    // 200+
}

@Entity('agent')
export class Agent {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  user: User;

  // ── Profile ───────────────────────────────────────────────────────────────
  @Column()
  fullName: string;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', nullable: true })
  address: string | null;

  // Standardised city — must match TANZANIA_CITIES list
  // Previously only district/region existed, making city lookups unreliable.
  @Column({ type: 'varchar', nullable: true })
  city: string | null;

  @Column({ type: 'varchar', nullable: true })
  district: string | null;

  @Column({ type: 'varchar', nullable: true })
  region: string | null;

  // Specific neighbourhoods/zones this agent covers within their city
  // e.g. ['Bunju A', 'Bunju B', 'Mbweni'] — used to match to delivery addresses
  @Column({ type: 'simple-array', nullable: true })
  coverageAreas: string[] | null;

  // ── Identity ──────────────────────────────────────────────────────────────
  @Column({ type: 'varchar', nullable: true })
  idNumber: string | null;

  @Column({ type: 'varchar', nullable: true })
  idType: string | null;

  @Column({ type: 'varchar', nullable: true })
  idPhotoUrl: string | null;

  // ── Status ────────────────────────────────────────────────────────────────
  @Column({ type: 'enum', enum: AgentStatus, default: AgentStatus.PENDING })
  status: AgentStatus;

  @Column({ type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ type: 'varchar', nullable: true })
  agentCode: string | null;    // e.g. KTX-AGT-001

  // ── Tier & Commission ──────────────────────────────────────────────────────
  @Column({ type: 'enum', enum: AgentTier, default: AgentTier.BASIC })
  tier: AgentTier;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 2.5 })
  commissionRate: number;       // % of platform fee earned per payment collection

  // Separate delivery commission — earned for each parcel delivered
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 500 })
  deliveryCommission: number;   // flat TZS per delivery (default 500)

  // ── Earnings ──────────────────────────────────────────────────────────────
  // Cumulative totals — updated after each transaction/delivery
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalEarningsPayments: number;   // from payment collection

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalEarningsDeliveries: number; // from last-mile deliveries

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  pendingEarnings: number;         // earned but not yet released to agent

  // ── Performance ───────────────────────────────────────────────────────────
  @Column({ type: 'int', default: 0 })
  totalDeliveriesCompleted: number;

  @Column({ type: 'int', default: 0 })
  totalDeliveriesFailed: number;   // failed/returned

  @Column({ type: 'int', default: 0 })
  totalPaymentsProcessed: number;

  @Column({ type: 'int', default: 0 })
  totalTransactions: number;          // alias used by agents.service and payments.service

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalEarnings: number;              // total across payments + deliveries + collections

  // ── Collection stats ──────────────────────────────────────────────────────
  @Column({ type: 'int', default: 0 })
  totalCollectionsCompleted: number;   // parcels collected from sellers

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalEarningsCollections: number;    // earnings from collection jobs

  // Default fee this agent charges for collection in their area
  // Admin can override per job, but this is the agent's baseline
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 1500 })
  collectionFeeUrban: number;         // TZS for urban pickups

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 3000 })
  collectionFeeRural: number;         // TZS for rural pickups

  @Column({ type: 'int', default: 0 })
  totalComplaints: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 5.00 })
  rating: number;                  // 1.00 – 5.00

  @Column({ type: 'int', default: 0 })
  totalRatings: number;

  // ── Agent type & availability ─────────────────────────────────────────────
  // Agent type determines what jobs they can take and what delivery time to show
  // boda: fast, small (<20kg) | car: medium (<100kg) | van: large (<500kg) | truck: cargo (500kg+)
  @Column({ type: 'varchar', default: 'boda' })
  agentType: string;    // 'boda' | 'car' | 'van' | 'truck' | 'foot'

  // Max weight this agent can carry per trip (kg)
  @Column({ type: 'decimal', precision: 8, scale: 1, default: 20 })
  maxWeightKg: number;

  // Agent's vehicle description — shown to seller when picking
  // e.g. "Toyota HiAce — Reg T123ABC" or "Boda Honda CG125"
  @Column({ type: 'varchar', nullable: true })
  vehicleDescription: string | null;

  // Online/offline toggle — only online agents receive job broadcasts and appear in listings
  // Agent switches this from their dashboard like Uber driver going online
  @Column({ type: 'boolean', default: false })
  isOnline: boolean;

  // Last time agent went online — for admin monitoring
  @Column({ type: 'timestamp', nullable: true })
  lastOnlineAt: Date | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}