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
import { OperationalWorkspace } from './operational-workspace.entity';
import { User } from '../../users/entities/user.entity';

export enum BusinessCapabilityCode {
  COMMERCE = 'commerce',
  TRANSPORT = 'transport',
  CARGO = 'cargo',
  SUPER_AGENT = 'super_agent',
}

export enum BusinessCapabilityStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  REVOKED = 'revoked',
}

// Business-First Stage 1 foundation. What a specific OperationalWorkspace is
// authorized to operate -- deliberately scoped to the workspace, not the
// Business, so one workspace's suspension-for-cause never has to be
// specially carved out to avoid affecting sibling workspaces under the same
// Business. Distinct from SellingCapability (src/selling-capability/),
// which remains a narrower, per-CommerceProfile selling-specific grant --
// Stage 1 does not merge or bridge the two. Distinct from
// WorkspaceAssignment.permissions, which answers "what may this HUMAN do
// here," never "what may this WORKSPACE do." CARGO exists in the enum for
// type stability but Stage 1 grants none (no deterministic source exists
// yet -- see the Business-First backfill tool).
@Entity('business_capability')
@Unique('UQ_business_capability_workspace_code', ['workspaceId', 'capabilityCode'])
@Index('IDX_business_capability_workspace_status', ['workspaceId', 'status'])
export class BusinessCapability {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => OperationalWorkspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: OperationalWorkspace;

  @Column({ type: 'int' })
  workspaceId: number;

  @Column({ type: 'enum', enum: BusinessCapabilityCode })
  capabilityCode: BusinessCapabilityCode;

  @Column({
    type: 'enum',
    enum: BusinessCapabilityStatus,
    default: BusinessCapabilityStatus.ACTIVE,
  })
  status: BusinessCapabilityStatus;

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

  @Column({ type: 'timestamp', nullable: true })
  reactivatedAt: Date | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reactivatedByUserId' })
  reactivatedByUser: User | null;

  @Column({ type: 'int', nullable: true })
  reactivatedByUserId: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
