/**
 * JobRequest entity — Buyer requests a service from a provider
 * Place at: src/services/entities/job-request.entity.ts
 *
 * Flow: Buyer submits request → Provider accepts/declines
 *       → Job in progress → Completed → Review
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum JobStatus {
  PENDING = 'pending', // sent, waiting for provider
  ACCEPTED = 'accepted', // provider accepted
  DECLINED = 'declined', // provider declined
  IN_PROGRESS = 'in_progress', // work started
  COMPLETED = 'completed', // job done
  CANCELLED = 'cancelled', // buyer cancelled
  DISPUTED = 'disputed', // raised a dispute
}

@Entity('job_request')
export class JobRequest {
  @PrimaryGeneratedColumn()
  id: number;

  // Who requested
  @ManyToOne(() => User)
  @JoinColumn()
  buyer: User;

  @Column({ type: 'int' })
  buyerId: number;

  // Which service (plain column — no relation to avoid cross-module metadata issues)
  @Column({ type: 'int' })
  serviceAdId: number;

  // Provider (denormalized for easy querying)
  @Column({ type: 'int' })
  providerId: number;

  // Job details
  @Column({ type: 'text' })
  description: string; // what exactly the buyer needs

  @Column({ type: 'varchar', nullable: true })
  preferredDate: string | null; // "2025-07-20"

  @Column({ type: 'varchar', nullable: true })
  preferredTime: string | null; // "10:00"

  @Column({ type: 'varchar' })
  jobLocation: string; // where the job will be done

  @Column({ type: 'varchar', nullable: true })
  buyerPhone: string | null;

  // Agreed price (set when provider accepts)
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  agreedPrice: number | null;

  // Status flow
  @Column({ type: 'enum', enum: JobStatus, default: JobStatus.PENDING })
  status: JobStatus;

  @Column({ type: 'text', nullable: true })
  providerNote: string | null; // reason for decline / progress note

  @Column({ type: 'text', nullable: true })
  buyerNote: string | null;

  // Completion
  @Column({ type: 'timestamp', nullable: true })
  acceptedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  // Review (after completion)
  @Column({ type: 'int', nullable: true })
  rating: number | null; // 1-5

  @Column({ type: 'text', nullable: true })
  review: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
