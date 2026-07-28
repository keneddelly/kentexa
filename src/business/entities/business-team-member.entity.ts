import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum TeamMemberRole {
  OWNER = 'owner',
  SALES = 'sales',
  SUPPORT = 'customer_support',
  INVENTORY = 'inventory',
  DELIVERY = 'delivery',
}

@Entity('business_team_member')
export class BusinessTeamMember {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'seller_id' })
  seller: User;

  @Column({ name: 'seller_id' })
  sellerId: number;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: number;

  @Column({ type: 'varchar', default: TeamMemberRole.SALES })
  role: string;

  // Granular permissions
  @Column({ type: 'jsonb', default: {} })
  permissions: {
    canViewOrders?: boolean;
    canCreateOrders?: boolean;
    canViewCustomers?: boolean;
    canSendMessages?: boolean;
    canViewRevenue?: boolean;
    canManageProducts?: boolean;
    canManageTeam?: boolean;
  };

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  joinedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
