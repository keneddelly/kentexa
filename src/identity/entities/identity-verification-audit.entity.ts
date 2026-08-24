import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

// One generic audit trail for every verification type (identity today;
// business/super_agent in later phases reuse this same table instead of
// each inventing their own log) — verificationType is a plain string, not
// a closed enum, so adding a new type never needs a migration.
@Entity()
export class IdentityVerificationAudit {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { eager: false, onDelete: 'CASCADE' })
  user: User;

  @Column({ type: 'varchar' })
  verificationType: string; // 'identity' | 'business' | 'super_agent' | ...

  @Column({ type: 'varchar' })
  previousStatus: string;

  @Column({ type: 'varchar' })
  newStatus: string;

  @Column({ type: 'int', nullable: true })
  reviewedBy: number | null; // admin User id, null when system/self-service

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
