/**
 * SuperAgentSettlementProposal — Stage 3S-C7 Part A: a frozen, auditable
 * snapshot of one Super Agent's commission/cash position over an explicit
 * period, computed and persisted in a single step by
 * SuperAgentSettlementService.createSettlementProposal(). No money moves
 * when this is created -- it is pure reconciliation/validation.
 *
 * Deliberately reports FIVE separate numbers rather than one netted
 * figure, per the C7 authorization's own scope decision: commission earned
 * and cash collected/remitted are SEPARATE ledgers, never silently
 * subtracted into one opaque balance.
 *   totalEarningsAmount/Count        -- qualifying handling earnings newly
 *                                       claimed by this settlement (always
 *                                       unpaid at creation time -- see
 *                                       SuperAgentSettlementEarningMember's
 *                                       own header comment for why "newly
 *                                       claimed" and "unpaid" are the same
 *                                       set).
 *   totalCashCollectedAmount/Count   -- cash collections newly claimed by
 *                                       this settlement.
 *   totalCashRemittedAmount         -- of those SAME claimed collections,
 *                                       how much is already covered by a
 *                                       real SuperAgentCashRemittanceAllocation
 *                                       (remittance is independent of
 *                                       settlement membership -- a
 *                                       collection can be remitted before,
 *                                       during, or after being claimed by
 *                                       a settlement).
 *   totalCashOutstandingAmount      -- totalCashCollectedAmount minus
 *                                       totalCashRemittedAmount. Payout
 *                                       (Part B-B) fails closed whenever
 *                                       this is nonzero for the settlement
 *                                       being paid out.
 *
 * `hasDiscrepancy`/`discrepancyNote` are set when candidate rows for this
 * Super Agent/period existed in a DIFFERENT currency than requested and
 * were therefore excluded -- "validate... currency consistency" rather
 * than silently filtering them out with no trace.
 *
 * Immutable via the same BEFORE UPDATE/DELETE trigger technique this
 * lineage already established (ensureSuperAgentSettlementLedgersImmutable)
 * -- "frozen... cannot be changed except through a new adjustment/version."
 * There is no edit/approve workflow in this gate: a settlement is created
 * already in its final, frozen state (`status = 'finalized'`) in one step;
 * a correction is always a brand-new settlement, never a mutation of this
 * one.
 */
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Check } from 'typeorm';

@Entity('super_agent_settlement_proposal')
@Check('CHK_super_agent_settlement_proposal_status', `status IN ('finalized')`)
@Check('CHK_super_agent_settlement_proposal_period', '"periodEnd" > "periodStart"')
@Check(
  'CHK_super_agent_settlement_proposal_nonnegative',
  '"totalEarningsAmount" >= 0 AND "totalCashCollectedAmount" >= 0 AND "totalCashRemittedAmount" >= 0 AND "totalCashOutstandingAmount" >= 0',
)
export class SuperAgentSettlementProposal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  superAgentId: number;

  @Column({ type: 'varchar', length: 8 })
  currency: string;

  @Column({ type: 'timestamp without time zone' })
  periodStart: Date;

  @Column({ type: 'timestamp without time zone' })
  periodEnd: Date;

  @Column({ type: 'varchar', length: 24, default: 'finalized' })
  status: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalEarningsAmount: number;

  @Column({ type: 'int', default: 0 })
  totalEarningsCount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalCashCollectedAmount: number;

  @Column({ type: 'int', default: 0 })
  totalCashCollectedCount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalCashRemittedAmount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalCashOutstandingAmount: number;

  @Column({ type: 'boolean', default: false })
  hasDiscrepancy: boolean;

  @Column({ type: 'text', nullable: true })
  discrepancyNote: string | null;

  @Column({ type: 'int', nullable: true })
  actorUserId: number | null;

  @CreateDateColumn() createdAt: Date;
}
