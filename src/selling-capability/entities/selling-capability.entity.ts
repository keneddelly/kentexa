import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum SellingCapabilityType {
  SELL_PHYSICAL = 'SELL_PHYSICAL',
  SELL_DIGITAL = 'SELL_DIGITAL',
  SELL_FOOD = 'SELL_FOOD',
  SELL_SERVICE = 'SELL_SERVICE',
}

export enum SellingCapabilityVerificationLevel {
  INDIVIDUAL = 'INDIVIDUAL',
  BUSINESS = 'BUSINESS',
  REGULATED = 'REGULATED',
}

export enum SellingCapabilityStatus {
  ACTIVE = 'ACTIVE',
  RESTRICTED = 'RESTRICTED',
  SUSPENDED = 'SUSPENDED',
  REVOKED = 'REVOKED',
}

// The real "may this account sell X kind of thing" grant — replaces the
// implicit user.role === SELLER coupling that today's SellerScopeService
// relies on for every seller/product/payment code path, with zero
// dependency on identity verification. Not yet wired as the actual gate
// (see the Layer 1 audit's migration plan) -- this phase only builds and
// backfills the grant itself. One row per (user, capabilityType) -- a
// seller can hold more than one capability type (physical + digital +
// food), each independently verified/restricted.
@Entity('selling_capabilities')
@Index(['user', 'capabilityType'], { unique: true })
export class SellingCapability {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @Column({ type: 'enum', enum: SellingCapabilityType })
  capabilityType: SellingCapabilityType;

  @Column({ type: 'enum', enum: SellingCapabilityVerificationLevel })
  verificationLevel: SellingCapabilityVerificationLevel;

  @Column({
    type: 'enum',
    enum: SellingCapabilityStatus,
    default: SellingCapabilityStatus.ACTIVE,
  })
  status: SellingCapabilityStatus;

  @Column({ type: 'timestamp' })
  grantedAt: Date;

  // Null = system/backfill-granted, not a specific admin's decision.
  @Column({ type: 'int', nullable: true })
  grantedBy: number | null;

  @Column({ type: 'text', nullable: true })
  restrictedReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
