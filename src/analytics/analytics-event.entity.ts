import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { AnalyticsSession } from './analytics-session.entity';

@Entity('analytics_events')
export class AnalyticsEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => AnalyticsSession, { onDelete: 'CASCADE' })
  session: AnalyticsSession;

  @Column()
  @Index()
  sessionId: string;

  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @Column()
  @Index()
  eventType: string;

  @Column({ nullable: true })
  eventCategory: string;

  @Column({ nullable: true })
  eventLabel: string;

  @Column({ nullable: true })
  page: string;

  @Column({ nullable: true })
  pageUrl: string;

  @Column({ nullable: true })
  targetId: string;

  @Column({ nullable: true })
  targetType: string;

  @Column({ nullable: true })
  targetName: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ type: 'int', nullable: true })
  scrollDepth: number | null;

  @Column({ type: 'int', nullable: true })
  timeOnPage: number | null;

  @Column({ type: 'int', nullable: true })
  clickX: number | null;

  @Column({ type: 'int', nullable: true })
  clickY: number | null;

  @CreateDateColumn()
  @Index()
  createdAt: Date;
}
