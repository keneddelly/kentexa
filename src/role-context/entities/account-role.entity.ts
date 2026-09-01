import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ActiveRoleSession } from './active-role-session.entity';

export enum AccountRoleType {
  BUYER = 'buyer',
  SELLER = 'seller',
  AGENT = 'agent',
  SUPER_AGENT = 'super_agent',
  TRANSPORT_PROVIDER = 'transport_provider',
  SERVICE_PROVIDER = 'service_provider',
  CUSTOMER_CARE = 'customer_care',
  MANAGER = 'manager',
  ADMIN = 'admin',
  ARBITRATOR = 'arbitrator',
}

export enum AccountRoleStatus {
  ACTIVE = 'active',
  PENDING = 'pending',
  SUSPENDED = 'suspended',
  REJECTED = 'rejected',
  REVOKED = 'revoked',
}

export enum RoleProfileType {
  USER = 'user',
  SELLER_PROFILE = 'seller_profile',
  AGENT = 'agent',
  SUPER_AGENT = 'super_agent',
  TRANSPORT_PROVIDER = 'transport_provider',
}

/**
 * A durable role membership. This is additive in Phase A: existing User.role
 * remains the legacy runtime authorization source until Phase B/F migration.
 */
@Entity('account_role')
@Unique('UQ_account_role_user_role', ['userId', 'roleType'])
@Index('IDX_account_role_user_status', ['userId', 'status'])
@Index('IDX_account_role_role_status', ['roleType', 'status'])
@Index('IDX_account_role_profile', ['profileType', 'profileId'])
@Index('UQ_account_role_operational_profile', ['profileType', 'profileId'], {
  unique: true,
  where: '"profileId" IS NOT NULL AND "profileType" <> \'user\'',
})
export class AccountRole {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'enum', enum: AccountRoleType })
  roleType: AccountRoleType;

  @Column({ type: 'enum', enum: AccountRoleStatus })
  status: AccountRoleStatus;

  @Column({ type: 'enum', enum: RoleProfileType, nullable: true })
  profileType: RoleProfileType | null;

  /** Generic profile reference; its concrete table is determined by profileType. */
  @Column({ type: 'int', nullable: true })
  profileId: number | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  capabilities: Record<string, boolean>;

  @Column({ type: 'int', default: 1 })
  contextVersion: number;

  @Column({ type: 'timestamp', nullable: true })
  approvedAt: Date | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approvedByUserId' })
  approvedByUser: User | null;

  @Column({ type: 'int', nullable: true })
  approvedByUserId: number | null;

  @Column({ type: 'timestamp', nullable: true })
  suspendedAt: Date | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'suspendedByUserId' })
  suspendedByUser: User | null;

  @Column({ type: 'int', nullable: true })
  suspendedByUserId: number | null;

  @Column({ type: 'text', nullable: true })
  statusReason: string | null;

  @OneToMany(() => ActiveRoleSession, (session) => session.accountRole)
  activeRoleSessions: ActiveRoleSession[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
