/**
 * SuperAgentHandlingEarningPayout — Stage 3S-C7 Part B-B: an immutable
 * record of one real wallet-crediting commission payout, scoped to exactly
 * one settlement proposal.
 *
 * `UQ_super_agent_handling_earning_payout_settlement` on
 * `settlementProposalId` ALONE -- a settlement can be paid out at most
 * once, ever. This is deliberate: payout always acts on a whole
 * settlement's own frozen scope, never an ad-hoc set of earnings, so "has
 * this settlement already been paid" is the natural idempotency key
 * (simpler than a caller-supplied one, and impossible to desync from it).
 *
 * `walletTransactionId` is the REAL WalletTransaction row this payout
 * credited -- both are written in the SAME database transaction
 * (SuperAgentHandlingEarningPayoutService.payoutSettlement), so a payout
 * row can never exist without a corresponding, already-committed wallet
 * credit, and vice versa.
 *
 * Immutable via the same BEFORE UPDATE/DELETE trigger technique this
 * lineage already established.
 */
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index, Check } from 'typeorm';
import { SuperAgentSettlementProposal } from './super-agent-settlement-proposal.entity';

@Entity('super_agent_handling_earning_payout')
@Index('UQ_super_agent_handling_earning_payout_settlement', ['settlementProposalId'], { unique: true })
@Check('CHK_super_agent_handling_earning_payout_amount_positive', 'amount > 0')
export class SuperAgentHandlingEarningPayout {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => SuperAgentSettlementProposal, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'settlementProposalId' })
  settlementProposal: SuperAgentSettlementProposal;

  @Column({ type: 'int' })
  settlementProposalId: number;

  @Column({ type: 'int' })
  superAgentId: number;

  @Column({ type: 'varchar', length: 8 })
  currency: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'int' })
  walletTransactionId: number;

  @Column({ type: 'int', nullable: true })
  actorUserId: number | null;

  @CreateDateColumn() createdAt: Date;
}
