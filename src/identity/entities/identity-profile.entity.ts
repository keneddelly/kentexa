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

// Which document a user chose to verify with — NIDA was the only option
// originally hardcoded; Kentexa now accepts any government-issued ID a
// Tanzanian resident is realistically likely to hold. Adding a new
// accepted type later is a one-line enum addition, nothing else in this
// module (submission, admin review, the manual-review provider) branches
// on which type was chosen — verification is manual review of whatever
// document + number + photo the user provides, not automated per-type.
export enum IdentityDocumentType {
  NIDA = 'nida',
  DRIVERS_LICENSE = 'drivers_license',
  PASSPORT = 'passport',
  VOTER_ID = 'voter_id',
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

  @Column({
    type: 'enum',
    enum: IdentityDocumentType,
    nullable: true,
  })
  idType: IdentityDocumentType | null;

  // Nullable + unique: Postgres treats multiple NULLs as distinct, so every
  // not-yet-submitted user coexists fine while any real number that IS
  // submitted is hard-enforced unique at the DB level — "one verified ID
  // document = one Kentexa account" never relies on frontend/service-layer
  // checks alone. Unique GLOBALLY across every idType, not per-type: the
  // point is one real document can't back two accounts, and a genuine
  // collision between (say) someone's passport number and an unrelated
  // person's driver's license number is not a real-world risk worth a
  // weaker composite constraint for.
  @Column({ type: 'varchar', unique: true, nullable: true })
  idNumber: string | null;

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
