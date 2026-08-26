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
import { CommerceProfile } from '../../commerce-profiles/entities/commerce-profile.entity';

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

// The real "may THIS PROFILE sell X kind of thing" grant — replaces the
// implicit user.role === SELLER coupling that today's SellerScopeService
// relies on for every seller/product/payment code path. Not yet wired as
// the actual gate (see the Layer 1 audit's migration plan) -- this phase
// only builds and backfills the grant itself.
//
// Scoped to the CommerceProfile that's acting, not the account —
// eligibility (is this person verified/allowed to sell at all) and
// capability (is THIS specific profile currently granted the ability to
// sell) are deliberately separate questions (profile-architecture-audit-
// 2026-08). Eligibility stays user-level: VerificationService.getLevel()
// and SellerProfile.status answer "is this person allowed to sell."
// Capability answers "is this exact profile — Personal, Business A,
// Business B — currently allowed to," and is granted independently per
// profile even when the same eligible account runs several. `user` is
// kept for accountability/audit (whose account this profile belongs to),
// never as the scoping key. One row per (commerceProfile, capabilityType)
// -- a profile can hold more than one capability type (physical + digital
// + food), each independently verified/restricted.
@Entity('selling_capabilities')
@Index(['commerceProfile', 'capabilityType'], { unique: true })
export class SellingCapability {
  @PrimaryGeneratedColumn()
  id: number;

  // The profile this capability actually belongs to — the real scoping
  // key. Nullable only for the 2 pre-migration rows that predate this
  // column (created before profile-architecture-audit-2026-08, back when
  // this table was still keyed by user alone) — re-running
  // SellingCapabilityBackfillService creates correctly profile-linked
  // replacements for those; new grants must always set it.
  @ManyToOne(() => CommerceProfile, { eager: true, onDelete: 'CASCADE', nullable: true })
  @JoinColumn()
  commerceProfile: CommerceProfile | null;

  // Whose account this profile belongs to — accountability/audit only,
  // never used to resolve "does this profile have capability X."
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
