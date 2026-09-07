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

export enum OperationalWorkspaceStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}

// Business-First Stage 1 foundation. The operational ownership boundary
// beneath Business -- every Business has exactly one default workspace
// (enforced by the partial unique index below); additional workspaces are
// optional (e.g. Kennedy Group Ltd -> BIS Electronics / Kennedy Furniture /
// Fashion TZ, each its own OperationalWorkspace under one Business). Never
// itself the authorization boundary for "may operate this workspace" --
// that's WorkspaceAssignment's job; a workspace existing says nothing about
// who may act on its behalf.
@Entity('operational_workspace')
@Index('IDX_operational_workspace_business', ['businessId'])
@Index('UQ_operational_workspace_default_per_business', ['businessId'], {
  unique: true,
  where: '"isDefault" = true',
})
export class OperationalWorkspace {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({ type: 'int' })
  businessId: number;

  @Column()
  name: string;

  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  @Column({
    type: 'enum',
    enum: OperationalWorkspaceStatus,
    default: OperationalWorkspaceStatus.ACTIVE,
  })
  status: OperationalWorkspaceStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
