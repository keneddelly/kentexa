import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Business } from '../../business/entities/business.entity';
import { ServiceCategory } from '../../services/entities/service-ad.entity';

export enum ServiceProviderStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

// Business Capability Activation Stage B6B. ServiceProvider's canonical
// organizational identity is the Business, not a per-location hub --
// mirroring TransportProvider's own precedent (Migration 10): a single
// service company offers MANY services (CCTV/electrical/network/repair/
// consulting) as ONE identity, never one ServiceProvider row per service.
// Unlike TransportProvider, `user`/`userId` here is NOT made nullable --
// this relation has always been a required FK, so a Business-bound row
// still always carries the applying user's real id; only `businessId` is
// new and optional. Legacy self-registered rows keep businessId = null
// indefinitely; nothing backfills them from businessName/city/address.
@Entity('service_provider')
@Index('UQ_service_provider_business', ['businessId'], {
  unique: true,
  where: '"businessId" IS NOT NULL',
})
@Index('UQ_service_provider_unbound_user', ['userId'], {
  unique: true,
  where: '"businessId" IS NULL',
})
export class ServiceProvider {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  user: User;

  // Was implicit (TypeORM's default join-column name for the `user`
  // relation above is already "userId") -- made explicit only so the new
  // partial unique index above and the capability-application service can
  // reference it directly. Schema-neutral: same physical column, not a
  // new one (same treatment Migration 10 gave SuperAgent.userId).
  @Column({ type: 'int' })
  userId: number;

  // ── Business Capability Activation Stage B6B: optional Business binding ──
  @ManyToOne(() => Business, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'businessId' })
  business: Business | null;

  @Column({ type: 'int', nullable: true })
  businessId: number | null;

  // ── Profile ───────────────────────────────────────────────────────────────
  @Column()
  businessName: string;

  @Column({ type: 'text', nullable: true })
  businessDescription: string | null;

  // Directory badge only — each ServiceAd keeps its own category
  @Column({ type: 'enum', enum: ServiceCategory, nullable: true })
  primaryCategory: ServiceCategory | null;

  @Column({ type: 'varchar', nullable: true })
  city: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', nullable: true })
  contactPhone: string | null;

  @Column({ type: 'varchar', nullable: true })
  whatsappPhone: string | null;

  @Column({ type: 'varchar', nullable: true })
  website: string | null;

  @Column({ type: 'text', nullable: true })
  logoUrl: string | null;

  // ── Identity ──────────────────────────────────────────────────────────────
  @Column({ type: 'varchar', nullable: true })
  idType: string | null;

  @Column({ type: 'varchar', nullable: true })
  idNumber: string | null;

  @Column({ type: 'text', nullable: true })
  idPhotoUrl: string | null;

  @Column({ type: 'varchar', nullable: true })
  registrationNumber: string | null;

  // ── Status ────────────────────────────────────────────────────────────────
  @Column({
    type: 'enum',
    enum: ServiceProviderStatus,
    default: ServiceProviderStatus.PENDING,
  })
  status: ServiceProviderStatus;

  @Column({ type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ type: 'timestamp', nullable: true })
  verifiedAt: Date | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
