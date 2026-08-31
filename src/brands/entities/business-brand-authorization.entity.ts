import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Brand } from './brand.entity';
import { Distributor } from './distributor.entity';

export enum BrandAuthorizationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SUSPENDED = 'suspended',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
}

// The one, explicit, verifiable relationship the whole feature exists to
// model: "this business may sell this brand." NEVER a boolean on Business/
// CommerceProfile — see brands.module.ts's top comment. commerceProfileId
// is a plain nullable-free int (not a relation), matching the zero-
// import-coupling convention every CommerceProfile-adjacent entity in this
// codebase already uses (Product.commerceProfileId, Classified.
// commerceProfileId, etc).
@Entity()
export class BusinessBrandAuthorization {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  commerceProfileId: number;

  @ManyToOne(() => Brand, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  brand: Brand;

  // Who verified it, if not Kentexa/brand-direct — nullable, most
  // authorizations won't have one.
  @ManyToOne(() => Distributor, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  distributor: Distributor | null;

  // ── Scope — all nullable; null means "unscoped" (covers everything at
  // that dimension), never a magic string like 'all'. ─────────────────────
  @Column({ type: 'varchar', nullable: true })
  categoryScope: string | null;

  @Column({ type: 'jsonb', nullable: true })
  modelScope: string[] | null;

  @Column({ type: 'jsonb', nullable: true })
  geographicScope: string[] | null;

  @Column({ type: 'varchar', nullable: true })
  authorizationNumber: string | null;

  @Column({ type: 'date', nullable: true })
  issuedDate: Date | null;

  // Null = no expiry.
  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  // Free-form, expected to grow (e.g. 'api_verification' once a real
  // brand API integration exists) — never a hard enum.
  @Column({ type: 'varchar' })
  verificationSource: string;
  // 'brand_direct' | 'distributor_verified' | 'document_review' |
  // 'manual_admin' | 'api_verification' | 'other'

  // Collapsed from the spec's 10-state suggestion — DRAFT/SUBMITTED/
  // UNDER_REVIEW/VERIFIED/AUTHORIZED all collapse to PENDING->APPROVED,
  // matching how BusinessDocument/IdentityProfile already model this exact
  // submit -> review -> decide shape with no extra intermediate states.
  @Column({ type: 'enum', enum: BrandAuthorizationStatus, default: BrandAuthorizationStatus.PENDING })
  status: BrandAuthorizationStatus;

  @Column({ type: 'int' })
  submittedBy: number; // User id

  @Column({ type: 'int', nullable: true })
  reviewedBy: number | null; // admin User id

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  statusReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
