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
import { Business } from './business.entity';
import { User } from '../../users/entities/user.entity';

export enum BusinessMembershipRoleTemplate {
  OWNER = 'owner',
  MANAGER = 'manager',
  STAFF = 'staff',
}

export enum BusinessMembershipStatus {
  ACTIVE = 'active',
  REVOKED = 'revoked',
}

// Business-First Stage 1 foundation. The authoritative human -> Business
// relationship. Business.user is kept unchanged as compatibility metadata
// (see business.entity.ts) -- this table is the new authority for "who may
// claim authority over this Business." roleTemplate is provenance/an
// administrative marker only (who founded it, and the source of the
// one-active-owner-per-Business invariant below) -- it is NEVER read as an
// authorization shortcut. Active operating authority always resolves
// through a real, explicit WorkspaceAssignment row (see
// workspace-assignment.entity.ts's own doc comment); "being the Owner" of a
// Business never implicitly grants access to a workspace without one.
@Entity('business_membership')
@Unique('UQ_business_membership_user_business', ['userId', 'businessId'])
@Index('IDX_business_membership_user_status', ['userId', 'status'])
@Index('IDX_business_membership_business_status', ['businessId', 'status'])
@Index('UQ_business_membership_one_owner', ['businessId'], {
  unique: true,
  where: `"roleTemplate" = 'owner' AND status = 'active'`,
})
export class BusinessMembership {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({ type: 'int' })
  businessId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'enum', enum: BusinessMembershipRoleTemplate })
  roleTemplate: BusinessMembershipRoleTemplate;

  @Column({
    type: 'enum',
    enum: BusinessMembershipStatus,
    default: BusinessMembershipStatus.ACTIVE,
  })
  status: BusinessMembershipStatus;

  @Column({ type: 'timestamp', default: () => 'now()' })
  joinedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt: Date | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'revokedByUserId' })
  revokedByUser: User | null;

  @Column({ type: 'int', nullable: true })
  revokedByUserId: number | null;

  @Column({ type: 'text', nullable: true })
  statusReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
