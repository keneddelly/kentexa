import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { AccountRole } from './account-role.entity';

/**
 * Validated on every RoleContextGuard-protected request by
 * RoleContextService.resolveContext (revocation, expiry, contextVersion).
 */
@Entity('active_role_session')
@Index('IDX_active_role_session_user_revoked', ['userId', 'revokedAt'])
@Index('IDX_active_role_session_role_revoked', ['accountRoleId', 'revokedAt'])
@Index('IDX_active_role_session_expires_at', ['expiresAt'])
export class ActiveRoleSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'int' })
  userId: number;

  @ManyToOne(() => AccountRole, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'accountRoleId' })
  accountRole: AccountRole;

  @Column({ type: 'int' })
  accountRoleId: number;

  @Column({ type: 'int' })
  contextVersion: number;

  @Column({ type: 'varchar', nullable: true })
  deviceId: string | null;

  @Column({ type: 'varchar', nullable: true })
  userAgentHash: string | null;

  @Column({ type: 'varchar', nullable: true })
  ipHash: string | null;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  revokeReason: string | null;

  @Column({ type: 'timestamp', nullable: true })
  lastSeenAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
