/**
 * SuperAgentSettlementEarningMember — Stage 3S-C7 Part A: which
 * SuperAgentHandlingEarning rows one settlement proposal claims.
 *
 * `UQ_super_agent_settlement_earning_member` on `earningId` ALONE, global
 * (not scoped per settlement) -- this is the actual "no double counting"
 * authority: a real earning row can be a member of at most one settlement,
 * ever, across all time. Because of this, when
 * SuperAgentSettlementService selects CANDIDATE earnings for a new
 * settlement (those with no existing membership row), the result is
 * exactly "earnings not yet claimed by any settlement" -- which is also
 * exactly "unpaid" for this gate's purposes, since the only way an earning
 * becomes payable is by first being a settlement member (see
 * SuperAgentHandlingEarningPayoutAllocation's own header comment). There
 * is deliberately no separate `settled`/`paid` flag on
 * SuperAgentHandlingEarning itself -- that table is immutable, and
 * "uniqueness as the financial authority" is the whole point.
 *
 * Immutable via the same trigger as its own parent settlement -- a
 * membership row is never re-pointed or removed.
 */
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { SuperAgentSettlementProposal } from './super-agent-settlement-proposal.entity';
import { SuperAgentHandlingEarning } from './super-agent-handling-earning.entity';

@Entity('super_agent_settlement_earning_member')
@Index('UQ_super_agent_settlement_earning_member', ['earningId'], { unique: true })
export class SuperAgentSettlementEarningMember {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => SuperAgentSettlementProposal, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'settlementProposalId' })
  settlementProposal: SuperAgentSettlementProposal;

  @Column({ type: 'int' })
  settlementProposalId: number;

  @ManyToOne(() => SuperAgentHandlingEarning, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'earningId' })
  earning: SuperAgentHandlingEarning;

  @Column({ type: 'int' })
  earningId: number;
}
