/**
 * TransportProvider — Unified entity for all transport providers
 * Place at: src/transport/entities/transport-provider.entity.ts
 *
 * Serves two purposes (both in same table):
 *
 * Phase 1 — Self-service registration (NEW):
 *   Providers register via BecomeTransportProvider.js
 *   Admin verifies → they appear to Super Agents
 *   Publish availability, receive assignments
 *
 * Phase 2 — API integration (EXISTING, preserved):
 *   Webhook-enabled companies push status updates via API
 *   apiKey, webhookEnabled, outboundWebhookUrl still work
 *   webhook.controller.ts and intercity-route.entity.ts unaffected
 */
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

export enum ProviderType {
  BUS = 'bus',
  COURIER = 'courier',
  VAN = 'van',
  TRUCK = 'truck',
  BODA = 'boda',
  RAIL = 'rail',
  AIR = 'air',
  BOAT = 'boat',
}

// Phase 1: Registration status (self-service providers)
export enum ProviderStatus {
  PENDING = 'pending', // just registered
  VERIFIED = 'verified', // admin approved, visible to Super Agents
  ACTIVE = 'active', // legacy: used by Phase 2 API-integrated providers
  INACTIVE = 'inactive', // legacy: disabled
  SUSPENDED = 'suspended',
  REJECTED = 'rejected',
  TESTING = 'testing', // legacy: integration in progress
}

export enum ContractType {
  FREE = 'free',
  PER_PARCEL = 'per_parcel',
  MONTHLY = 'monthly',
  REVENUE_SHARE = 'revenue_share',
}

// Phase 1: How assignments are confirmed
export enum ConfirmMode {
  AUTO = 'auto', // large providers — auto-confirm if capacity available
  MANUAL = 'manual', // small providers — must accept/decline each job
}

@Entity('transport_provider')
export class TransportProvider {
  @PrimaryGeneratedColumn()
  id: number;

  // ── Phase 1: Linked KenteXa user (self-registered) ─────────────────────
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn()
  user: User | null;

  @Column({ type: 'int', nullable: true })
  userId: number | null;

  // ── Identity (both phases) ───────────────────────────────────────────────
  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', nullable: true })
  shortCode: string | null; // "SCAN" — used in ticket number detection (Phase 2)

  @Column({ type: 'enum', enum: ProviderType })
  type: ProviderType;

  @Column({
    type: 'enum',
    enum: ProviderStatus,
    default: ProviderStatus.PENDING,
  })
  status: ProviderStatus;

  // Phase 1: confirmation mode
  @Column({ type: 'enum', enum: ConfirmMode, default: ConfirmMode.MANUAL })
  confirmMode: ConfirmMode;

  // ── Contact ──────────────────────────────────────────────────────────────
  @Column({ type: 'varchar', nullable: true })
  contactName: string | null;

  @Column({ type: 'varchar', nullable: true })
  contactPhone: string | null;

  @Column({ type: 'varchar', nullable: true })
  whatsappPhone: string | null; // Phase 1 addition

  @Column({ type: 'varchar', nullable: true })
  contactEmail: string | null;

  @Column({ type: 'varchar', nullable: true })
  website: string | null;

  // ── Business details (Phase 1) ───────────────────────────────────────────
  @Column({ type: 'varchar', nullable: true })
  registrationNumber: string | null;

  @Column({ type: 'varchar', nullable: true })
  licenseUrl: string | null;

  @Column({ type: 'varchar', nullable: true })
  logoUrl: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  // ── Capacity defaults (Phase 1) ──────────────────────────────────────────
  @Column({ type: 'int', default: 0 })
  defaultParcelCapacity: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  defaultMaxWeightKg: number;

  // ── Coverage (Phase 2: simple array, Phase 1: use TransportRoute entity) ─
  @Column({ type: 'simple-array', nullable: true })
  cities: string[] | null;

  // ── API Integration (Phase 2, preserved) ────────────────────────────────
  @Column({ type: 'varchar', unique: true, nullable: true })
  apiKey: string | null;

  @Column({ type: 'boolean', default: false })
  webhookEnabled: boolean;

  @Column({ type: 'varchar', nullable: true })
  outboundWebhookUrl: string | null;

  // ── Contract (Phase 2) ───────────────────────────────────────────────────
  @Column({ type: 'enum', enum: ContractType, default: ContractType.FREE })
  contractType: ContractType;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  monthlyFee: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  perParcelFee: number;

  // ── Stats ────────────────────────────────────────────────────────────────
  @Column({ type: 'int', default: 0 })
  totalParcelsTracked: number; // Phase 2: via webhook

  @Column({ type: 'int', default: 0 })
  totalApiCalls: number; // Phase 2

  @Column({ type: 'timestamp', nullable: true })
  lastApiCallAt: Date | null; // Phase 2

  @Column({ type: 'int', default: 0 })
  totalAssignments: number; // Phase 1: via Super Agent assignment

  @Column({ type: 'int', default: 0 })
  completedAssignments: number; // Phase 1

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  rating: number; // Phase 1

  @Column({ type: 'int', default: 0 })
  totalRatings: number; // how many buyer ratings contributed to `rating` above

  // ── Verification (Phase 1) ───────────────────────────────────────────────
  @Column({ type: 'timestamp', nullable: true })
  verifiedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  rejectionReason: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'text', nullable: true })
  adminNotes: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
