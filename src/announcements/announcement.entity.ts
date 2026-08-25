import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from 'typeorm';
import { User } from '../users/entities/user.entity';

@Entity('announcements')
export class Announcement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'varchar', default: 'all' })
  audience: string;

  // When set, this announcement is scoped to exactly this one account
  // instead of a role-wide audience bucket -- e.g. "you posted this
  // listing in the wrong category, please fix it." `audience` is ignored
  // when this is set. targetUserName is denormalized purely for the
  // admin's own sent-history list, so it never needs a join/lookup.
  @Column({ type: 'int', nullable: true })
  targetUserId: number | null;

  @Column({ type: 'varchar', nullable: true })
  targetUserName: string | null;

  // Dynamic balance-threshold targeting -- e.g. "every seller who owes
  // more than 10,000 TZS." Ignored when targetUserId is set. Evaluated
  // live (both at send time and whenever a recipient's feed is read), so
  // an account that later pays down its balance naturally stops seeing
  // it -- the same "recompute fresh, never freeze a snapshot" approach
  // the plain audience buckets already use.
  @Column({ type: 'varchar', nullable: true })
  thresholdEntity: 'seller' | 'super_agent' | null;

  @Column({ type: 'varchar', nullable: true })
  thresholdOperator: 'gte' | 'lte' | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  thresholdAmount: number | null;

  @Column({ type: 'varchar', default: 'info' })
  priority: string;

  @Column({ type: 'varchar', nullable: true })
  linkUrl: string | null;

  @Column({ type: 'varchar', nullable: true })
  linkLabel: string | null;

  @Column({ type: 'boolean', default: false })
  sendSms: boolean;

  @Column({ type: 'boolean', default: false })
  smsSent: boolean;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  createdBy: User;

  @Column({ type: 'jsonb', default: [] })
  readByUserIds: number[];

  @CreateDateColumn()
  createdAt: Date;
}
