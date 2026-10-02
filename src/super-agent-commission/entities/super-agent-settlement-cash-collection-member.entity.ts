/**
 * SuperAgentSettlementCashCollectionMember — Stage 3S-C7 Part A: which
 * SuperAgentCashCollection rows one settlement proposal claims. Same
 * global-uniqueness "no double counting" authority as
 * SuperAgentSettlementEarningMember's own header comment describes, applied
 * to the cash-collection side instead. Independent of remittance: a
 * collection's settlement membership and its remittance-allocation status
 * (SuperAgentCashRemittanceAllocation) are two separate facts that can
 * happen in either order.
 */
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { SuperAgentSettlementProposal } from './super-agent-settlement-proposal.entity';
import { SuperAgentCashCollection } from './super-agent-cash-collection.entity';

@Entity('super_agent_settlement_cash_collection_member')
@Index('UQ_super_agent_settlement_cash_collection_member', ['cashCollectionId'], { unique: true })
export class SuperAgentSettlementCashCollectionMember {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => SuperAgentSettlementProposal, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'settlementProposalId' })
  settlementProposal: SuperAgentSettlementProposal;

  @Column({ type: 'int' })
  settlementProposalId: number;

  @ManyToOne(() => SuperAgentCashCollection, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cashCollectionId' })
  cashCollection: SuperAgentCashCollection;

  @Column({ type: 'int' })
  cashCollectionId: number;
}
