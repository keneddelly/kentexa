import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { BusinessBrandAuthorization } from './business-brand-authorization.entity';

// Mirrors IdentityVerificationAudit's shape exactly (previousStatus/
// newStatus/reviewedBy/reason/createdAt) but keyed to the authorization
// row instead of a User — IdentityVerificationAudit's own FK is a single
// required User, which can't disambiguate between several brand
// authorizations the same business might hold (LG, Samsung, Hisense...).
// Every status transition on BusinessBrandAuthorization writes exactly one
// row here; never silently overwritten or skipped.
@Entity()
export class BrandAuthorizationAuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => BusinessBrandAuthorization, { onDelete: 'CASCADE' })
  @JoinColumn()
  authorization: BusinessBrandAuthorization;

  @Column({ type: 'varchar' })
  previousStatus: string;

  @Column({ type: 'varchar' })
  newStatus: string;

  // Null for the system/cron auto-expiry transition.
  @Column({ type: 'int', nullable: true })
  actorUserId: number | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
