import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { Referral } from './referral.entity';
import { SuperAgent } from '../../super-agents/entities/super-agent.entity';

// One row per successful referral reward — doubles as the ledger entry
// for why a SuperAgent's freeOrdersGranted balance changed, so a separate
// FreeOrderLedger table would only duplicate the same fact.
@Entity()
export class ReferralReward {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Referral, { eager: true, onDelete: 'CASCADE' })
  referral: Referral;

  @ManyToOne(() => SuperAgent, { eager: false, onDelete: 'CASCADE' })
  superAgent: SuperAgent;

  @Column({ type: 'int', default: 10 })
  freeOrdersGranted: number;

  @CreateDateColumn()
  createdAt: Date;
}
