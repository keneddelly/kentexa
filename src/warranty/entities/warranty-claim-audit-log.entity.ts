import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { WarrantyClaim } from './warranty-claim.entity';

// Mirrors BrandAuthorizationAuditLog's shape exactly (previousStatus/
// newStatus/actorUserId/reason/createdAt) — every status transition on
// WarrantyClaim writes exactly one row here; never silently overwritten
// or skipped.
@Entity()
export class WarrantyClaimAuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => WarrantyClaim, { onDelete: 'CASCADE' })
  @JoinColumn()
  claim: WarrantyClaim;

  @Column({ type: 'varchar' })
  previousStatus: string;

  @Column({ type: 'varchar' })
  newStatus: string;

  @Column({ type: 'int', nullable: true })
  actorUserId: number | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
