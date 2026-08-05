import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ServiceCategory } from '../../services/entities/service-ad.entity';

export enum ServiceProviderStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('service_provider')
export class ServiceProvider {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  user: User;

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
