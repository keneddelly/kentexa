import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('analytics_sessions')
export class AnalyticsSession {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  sessionId: string;

  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @Column({ nullable: true })
  browser: string;

  @Column({ nullable: true })
  browserVersion: string;

  @Column({ nullable: true })
  os: string;

  @Column({ nullable: true })
  device: string;

  @Column({ type: 'int', nullable: true })
  screenWidth: number | null;

  @Column({ type: 'int', nullable: true })
  screenHeight: number | null;

  @Column({ nullable: true })
  language: string;

  @Column({ nullable: true })
  timezone: string;

  @Column({ nullable: true })
  ipAddress: string;

  @Column({ nullable: true })
  country: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  region: string;

  @Column({ nullable: true })
  referrer: string;

  @Column({ nullable: true })
  utmSource: string;

  @Column({ nullable: true })
  utmMedium: string;

  @Column({ nullable: true })
  utmCampaign: string;

  @Column({ nullable: true })
  utmContent: string;

  @Column({ type: 'int', default: 0 })
  pageViews: number;

  @Column({ type: 'int', default: 0 })
  events: number;

  @Column({ nullable: true })
  lastSeenAt: Date;

  @Column({ nullable: true })
  exitPage: string;

  @Column({ default: false })
  converted: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
