import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WarrantyRegistration } from './warranty-registration.entity';

export enum WarrantyClaimStatus {
  SUBMITTED = 'submitted',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  RESOLVED = 'resolved',
}

// A buyer's claim against their own WarrantyRegistration. Deliberately a
// fully separate lifecycle from Order.raiseDispute()/resolveDispute() —
// that flow is wired directly into escrow/payout release and only makes
// sense in the narrow post-delivery, pre-settlement window. A warranty
// claim happens long after settlement (weeks/months later) and must
// never touch escrow/payment state at all.
@Entity('warranty_claim')
export class WarrantyClaim {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => WarrantyRegistration, { onDelete: 'CASCADE' })
  @JoinColumn()
  registration: WarrantyRegistration;

  @Column()
  registrationId: number;

  @Column({ type: 'text' })
  reason: string;

  // Plain public Cloudinary URLs via the existing /upload/images endpoint
  // — claim photos aren't sensitive enough to warrant the private-
  // evidence machinery Phase A built for brand authorization certificates.
  @Column({ type: 'simple-array', nullable: true })
  evidenceImages: string[] | null;

  @Column({
    type: 'enum',
    enum: WarrantyClaimStatus,
    default: WarrantyClaimStatus.SUBMITTED,
  })
  status: WarrantyClaimStatus;

  @Column()
  submittedBy: number;

  @Column({ type: 'int', nullable: true })
  reviewedBy: number | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  resolution: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
