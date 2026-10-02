/**
 * SuperAgentHandlingEarningPayoutAllocation — Stage 3S-C7 Part B-B: which
 * SuperAgentHandlingEarning rows one payout covers.
 *
 * `UQ_super_agent_handling_earning_payout_allocation_earning` on
 * `earningId` ALONE, global -- an earning can be paid at most once, ever.
 * This is the real "use payout/allocation uniqueness as the financial
 * authority" -- there is deliberately no mutable `payoutStatus` column
 * anywhere (SuperAgentHandlingEarning is immutable and could not support
 * one anyway): whether an earning has been paid is always answered by
 * checking for a row here, which by construction can never diverge from
 * the truth.
 *
 * Immutable via the same trigger as its own parent payout.
 */
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { SuperAgentHandlingEarningPayout } from './super-agent-handling-earning-payout.entity';
import { SuperAgentHandlingEarning } from './super-agent-handling-earning.entity';

@Entity('super_agent_handling_earning_payout_allocation')
@Index('UQ_super_agent_handling_earning_payout_allocation_earning', ['earningId'], { unique: true })
export class SuperAgentHandlingEarningPayoutAllocation {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => SuperAgentHandlingEarningPayout, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'payoutId' })
  payout: SuperAgentHandlingEarningPayout;

  @Column({ type: 'int' })
  payoutId: number;

  @ManyToOne(() => SuperAgentHandlingEarning, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'earningId' })
  earning: SuperAgentHandlingEarning;

  @Column({ type: 'int' })
  earningId: number;

  @CreateDateColumn() createdAt: Date;
}
