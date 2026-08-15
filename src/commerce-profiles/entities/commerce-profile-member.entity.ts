import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { CommerceProfile } from './commerce-profile.entity';
import { User } from '../../users/entities/user.entity';

// Generalizes BusinessTeamMember (src/business/entities/business-team-member.entity.ts)
// from "staff member of a seller" to "staff member of any commerce profile" —
// same shape, wider scope. BusinessTeamMember itself is left untouched for
// now (existing seller team features keep working unchanged); this is the
// version new profile types (transport company staff, hub staff) build on.
@Entity('commerce_profile_member')
export class CommerceProfileMember {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => CommerceProfile, { eager: false })
  @JoinColumn()
  profile: CommerceProfile;

  @Column()
  commerceProfileId: number;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn()
  user: User;

  @Column()
  userId: number;

  @Column({ type: 'varchar', default: 'staff' })
  role: string; // 'owner' | 'sales' | 'support' | 'inventory' | 'delivery' | ...

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

  @CreateDateColumn()
  createdAt: Date;
}
