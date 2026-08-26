import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum ActivityCategory {
  AUTH = 'auth',
  IDENTITY = 'identity',
  BUSINESS = 'business',
  SOCIAL = 'social',
  CONTENT = 'content',
  SEARCH = 'search',
  MESSAGING = 'messaging',
  COMMERCE = 'commerce',
  PAYMENT = 'payment',
  INVOICE = 'invoice',
  LOGISTICS = 'logistics',
  AGENT = 'agent',
  TRANSPORT = 'transport',
  VERIFICATION = 'verification',
  REPUTATION = 'reputation',
  SECURITY = 'security',
  SYSTEM = 'system',
  AI = 'ai',
}

export enum ActivitySeverity {
  INFO = 'info',
  NOTICE = 'notice',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

export enum ActivityVisibility {
  PUBLIC = 'public',
  BUSINESS = 'business',
  ADMIN = 'admin',
}

export enum ActorType {
  USER = 'user',
  SYSTEM = 'system',
  AI = 'ai',
}

// Immutable — insert-only. Never update/delete a row; AI interpretation of an
// event is a separate, mutable layer built on top, not a rewrite of this record.
@Entity('activity_event')
@Index(['businessId', 'timestamp'])
@Index(['eventCategory', 'timestamp'])
@Index(['actorId', 'timestamp'])
@Index(['targetType', 'targetId'])
export class ActivityEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  @Index()
  eventType: string;

  @Column({ type: 'enum', enum: ActivityCategory })
  eventCategory: ActivityCategory;

  @Column({ type: 'int', nullable: true })
  actorId: number | null;

  @Column({ type: 'enum', enum: ActorType, default: ActorType.USER })
  actorType: ActorType;

  // The seller's User.id — this codebase has no separate Business entity.
  @Column({ type: 'int', nullable: true })
  businessId: number | null;

  @Column({ type: 'varchar', nullable: true })
  targetType: string | null;

  @Column({ type: 'int', nullable: true })
  targetId: number | null;

  @Column({ type: 'int', nullable: true })
  relatedUserId: number | null;

  @Column({ type: 'int', nullable: true })
  relatedBusinessId: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  timestamp: Date;

  @Column({ type: 'jsonb', nullable: true })
  location: Record<string, any> | null;

  @Column({ type: 'varchar' })
  source: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @Column({ type: 'varchar', nullable: true })
  sessionId: string | null;

  @Column({ type: 'varchar', nullable: true })
  requestId: string | null;

  @Column({
    type: 'enum',
    enum: ActivitySeverity,
    default: ActivitySeverity.INFO,
  })
  severity: ActivitySeverity;

  @Column({
    type: 'enum',
    enum: ActivityVisibility,
    default: ActivityVisibility.BUSINESS,
  })
  visibility: ActivityVisibility;
}
