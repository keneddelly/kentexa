import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Business } from './business.entity';
import { OperationalWorkspace } from './operational-workspace.entity';
import { WorkspaceAssignment } from './workspace-assignment.entity';
import { BusinessCapabilityCode } from './business-capability.entity';
import { User } from '../../users/entities/user.entity';
import { RoleProfileType } from '../../role-context/entities/account-role.entity';

export enum BusinessCapabilityApplicationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

// Business Capability Activation Stage B1. The request/review/audit
// lifecycle for a workspace obtaining a BusinessCapability -- deliberately
// a SEPARATE entity from BusinessCapability itself (see that entity's own
// doc comment: it represents entitlement, never the request that led to
// it). Submitting an application never creates or activates a
// BusinessCapability row; only the future Stage B3 approval transaction
// does that. SUSPENDED is deliberately NOT a status here -- suspending an
// already-granted entitlement is BusinessCapability's own concern (Stage
// B architecture discovery §16), never something this table's rows
// transition through. Rows are append-only history: a rejected/cancelled
// application is never mutated back to pending -- reapplication creates a
// new row (Stage B discovery §14), so PENDING/APPROVED/REJECTED/CANCELLED
// rows for the same (workspaceId, capabilityCode) coexist by design; only
// ONE row may be PENDING at a time (see the partial unique index in
// Migration 9).
@Entity('business_capability_application')
@Index('IDX_bca_business_status', ['businessId', 'status'])
@Index('IDX_bca_workspace_code_status', ['workspaceId', 'capabilityCode', 'status'])
@Index('IDX_bca_requested_by_user', ['requestedByUserId'])
export class BusinessCapabilityApplication {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({ type: 'int' })
  businessId: number;

  @ManyToOne(() => OperationalWorkspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: OperationalWorkspace;

  @Column({ type: 'int' })
  workspaceId: number;

  @Column({ type: 'enum', enum: BusinessCapabilityCode })
  capabilityCode: BusinessCapabilityCode;

  @Column({
    type: 'enum',
    enum: BusinessCapabilityApplicationStatus,
    default: BusinessCapabilityApplicationStatus.PENDING,
  })
  status: BusinessCapabilityApplicationStatus;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requestedByUserId' })
  requestedByUser: User;

  @Column({ type: 'int' })
  requestedByUserId: number;

  // The exact WorkspaceAssignment the applicant's own authority was
  // resolved through at submission time (Stage B discovery §7/§9) --
  // never admin-supplied, never re-derived by "lowest id" or any other
  // heuristic at approval time. This is what lets the future approval
  // transaction bind the exact right AccountRole without re-resolving
  // (and potentially re-litigating) organizational authority days or
  // weeks after submission.
  @ManyToOne(() => WorkspaceAssignment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requestedByWorkspaceAssignmentId' })
  requestedByWorkspaceAssignment: WorkspaceAssignment;

  @Column({ type: 'int' })
  requestedByWorkspaceAssignmentId: number;

  // Polymorphic reference to the operational profile this application is
  // paired with (e.g. RoleProfileType.SELLER_PROFILE / SellerProfile.id
  // for COMMERCE) -- reuses AccountRole.profileType/profileId's own
  // established polymorphic-by-two-plain-columns convention (see
  // account-role.entity.ts) rather than introducing a new polymorphic
  // framework. Nullable because a future capability may have no
  // profile-shaped configuration at all.
  @Column({ type: 'enum', enum: RoleProfileType, nullable: true })
  operationalProfileType: RoleProfileType | null;

  @Column({ type: 'int', nullable: true })
  operationalProfileId: number | null;

  // Free-form capability-specific submission fields (e.g. business
  // documents for COMMERCE) -- deliberately untyped at this layer; each
  // capability's own application service interprets its own shape.
  @Column({ type: 'jsonb', nullable: true })
  applicationData: Record<string, unknown> | null;

  @Column({ type: 'timestamp', default: () => 'now()' })
  submittedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewedByUserId' })
  reviewedByUser: User | null;

  @Column({ type: 'int', nullable: true })
  reviewedByUserId: number | null;

  @Column({ type: 'text', nullable: true })
  rejectionReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
