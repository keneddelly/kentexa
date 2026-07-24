import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm';
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