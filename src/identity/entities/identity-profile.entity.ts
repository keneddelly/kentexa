import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum IdentityVerificationStatus {
  NOT_SUBMITTED = 'not_submitted',
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}

// The one centralized place a person's real-world identity lives on
// Kentexa — SuperAgent.governmentId/governmentIdImage predate this and
// duplicate the same concept scoped to just that entity; this is the
// migration target for that data, not a parallel system (see Phase 2+).
@Entity()
export class IdentityProfile {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @Column({ type: 'varchar', nullable: true })
  legalName: string | null;

  @Column({ type: 'date', nullable: true })
  dateOfBirth: string | null;

  // Nullable + unique: Postgres treats multiple NULLs as distinct, so every
  // not-yet-submitted user coexists fine while any real number that IS
  // submitted is hard-enforced unique at the DB level — "one verified NIDA
  // = one Kentexa account" never relies on frontend/service-layer checks
  // alone.
  @Column({ type: 'varchar', unique: true, nullable: true })
  nidaNumber: string | null;

  @Column({ type: 'varchar', nullable: true })
  idDocumentImageUrl: string | null;

  @Column({
    type: 'enum',
    enum: IdentityVerificationStatus,
    default: IdentityVerificationStatus.NOT_SUBMITTED,
  })
  status: IdentityVerificationStatus;

  @Column({ type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ type: 'int', nullable: true })
  reviewedBy: number | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
