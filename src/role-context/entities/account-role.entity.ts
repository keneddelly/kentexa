import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
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
 *
 * Multi-Business Authority Stage 1: the single blanket UQ_account_role_user_role
 * (userId, roleType) constraint was replaced (migration
 * AddAccountRoleWorkspaceMultiplicity1788261000000) with three partial unique
 * indexes, split by role scope -- see that migration's own doc comment for
 * the full rationale. Decorators below mirror the migration exactly so a
 * fresh `synchronize` build matches the migrated schema byte-for-byte:
 *
 *  - buyer/admin/manager/customer_care/arbitrator/agent: unique per
 *    (userId, roleType), unconditionally -- unchanged from before this stage.
 *  - seller/super_agent/transport_provider/service_provider: unique per
 *    (userId, roleType, workspaceAssignmentId) when bound to a workspace, OR
 *    per (userId, roleType) when NOT YET bound (at most one unbound
 *    placeholder) -- these two rows are what let the same human hold, e.g.,
 *    a Seller AccountRole for Business A AND a separate one for Business B.
 */
@Entity('account_role')
@Index('IDX_account_role_user_status', ['userId', 'status'])
@Index('IDX_account_role_role_status', ['roleType', 'status'])
@Index('IDX_account_role_profile', ['profileType', 'profileId'])
@Index('UQ_account_role_operational_profile', ['profileType', 'profileId'], {
  unique: true,
  where: '"profileId" IS NOT NULL AND "profileType" <> \'user\'',
})
@Index('UQ_account_role_singular', ['userId', 'roleType'], {
  unique: true,
  where: `"roleType" IN ('buyer','admin','manager','customer_care','arbitrator','agent')`,
})
@Index('UQ_account_role_workspace_bound', ['userId', 'roleType', 'workspaceAssignmentId'], {
  unique: true,
  where: `"roleType" IN ('seller','super_agent','transport_provider','service_provider') AND "workspaceAssignmentId" IS NOT NULL`,
})
@Index('UQ_account_role_unbound', ['userId', 'roleType'], {
  unique: true,
  where: `"roleType" IN ('seller','super_agent','transport_provider','service_provider') AND "workspaceAssignmentId" IS NULL`,
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

  // Business-First Stage 1 foundation (additive, nullable). Points directly
  // at a WorkspaceAssignment -- never at Business/OperationalWorkspace/
  // BusinessMembership directly -- so the authoritative operating chain is
  // always AccountRole -> WorkspaceAssignment -> BusinessMembership ->
  // OperationalWorkspace -> Business (see workspace-assignment.entity.ts).
  // NULL for every role that is legitimately non-organizational (Buyer,
  // Agent, every platform role, and any not-yet-migrated Seller/Transport
  // Provider/Super Agent/Service Provider role) -- that is an expected,
  // permanent state for most roles, not a migration gap to eventually
  // close for all of them. When set, RoleContextService's organizational
  // resolution requires the ENTIRE chain to be active and consistent or it
  // fails closed (throws) rather than silently resolving businessId/
  // workspaceId to null -- see RoleContextService.resolveOrganizationalContext().
  //
  // Deliberately a PLAIN column, not a decorated @ManyToOne relation --
  // matching ConversationParticipant.workspaceId's own precedent (a plain
  // nullable int, no relation object) rather than AccountRole's own
  // `user`/`approvedByUser` pattern. A real @ManyToOne(() => WorkspaceAssignment)
  // here would force every OTHER DataSource in the codebase that already
  // registers AccountRole (every Stage 2 backfill tool's disposable-DB
  // test, every standalone CLI's entity list) to also register
  // WorkspaceAssignment/BusinessMembership/OperationalWorkspace/Business
  // just to satisfy TypeORM's metadata builder, for a relation nothing
  // outside this module currently navigates as a loaded object -- every
  // caller only ever reads/writes the raw id.
  @Column({ type: 'int', nullable: true })
  workspaceAssignmentId: number | null;

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
