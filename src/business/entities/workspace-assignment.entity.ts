import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';
import { BusinessMembership } from './business-membership.entity';
import { OperationalWorkspace } from './operational-workspace.entity';

export enum WorkspaceAssignmentStatus {
  ACTIVE = 'active',
  REVOKED = 'revoked',
}

// Business-First Stage 1 foundation. The explicit, real grant of active
// operating authority over one specific workspace to one specific
// BusinessMembership. This is the ONLY mechanism that grants workspace
// access -- there is no "Owner implicitly has every workspace" shortcut
// anywhere in this design. An Owner who needs to operate a second workspace
// gets a second real row here, exactly like a Manager or Cashier would;
// roleTemplate on BusinessMembership is never consulted for this decision.
// AccountRole.workspaceAssignmentId (see account-role.entity.ts) points
// directly at a row in this table -- never at BusinessMembership or
// OperationalWorkspace directly -- so the authoritative operating chain is
// always AccountRole -> WorkspaceAssignment -> BusinessMembership ->
// OperationalWorkspace -> Business, resolved live (never cached) so a
// revoked/suspended link anywhere in that chain is visible on the very
// next request (see RoleContextService's organizational resolution join).
@Entity('workspace_assignment')
@Unique('UQ_workspace_assignment_membership_workspace', ['businessMembershipId', 'workspaceId'])
@Index('IDX_workspace_assignment_membership_status', ['businessMembershipId', 'status'])
@Index('IDX_workspace_assignment_workspace_status', ['workspaceId', 'status'])
export class WorkspaceAssignment {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => BusinessMembership, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'businessMembershipId' })
  businessMembership: BusinessMembership;

  @Column({ type: 'int' })
  businessMembershipId: number;

  @ManyToOne(() => OperationalWorkspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: OperationalWorkspace;

  @Column({ type: 'int' })
  workspaceId: number;

  @Column({
    type: 'enum',
    enum: WorkspaceAssignmentStatus,
    default: WorkspaceAssignmentStatus.ACTIVE,
  })
  status: WorkspaceAssignmentStatus;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  permissions: Record<string, boolean>;

  @Column({ type: 'timestamp', default: () => 'now()' })
  assignedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
