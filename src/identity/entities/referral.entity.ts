import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { SuperAgent } from '../../super-agents/entities/super-agent.entity';

export enum ReferralStatus {
  REGISTERED = 'registered',
  QUALIFIED = 'qualified',
  REJECTED_FRAUD = 'rejected_fraud',
}

// One row per referred person — referredUser is unique so a person can
// only ever be referred once, closing the "duplicate reward" and
// "referral reassignment" vectors at the DB level rather than relying on
// application logic alone.
@Entity()
@Index(['referredUser'], { unique: true })
export class Referral {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => SuperAgent, { eager: true, onDelete: 'CASCADE' })
  referrerSuperAgent: SuperAgent;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn()
  referredUser: User;

  @Column({ type: 'varchar' })
  referralCodeUsed: string;

  @Column({
    type: 'enum',
    enum: ReferralStatus,
    default: ReferralStatus.REGISTERED,
  })
  status: ReferralStatus;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  qualifiedAt: Date | null;
}
