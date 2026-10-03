/**
 * SuperAgentCashRemittanceAllocation — Stage 3S-C7 Part B-A: which
 * SuperAgentCashCollection rows one remittance covers.
 *
 * Deliberately FULL-collection-only allocation: SuperAgentCashCollection
 * has no "remaining unallocated amount" tracking, so a partial allocation
 * cannot be safely represented without redesigning that table -- out of
 * this gate's own authorized scope, which explicitly permits constraining
 * to full-collection allocation and enforcing it rather than pretending
 * partial exists. `allocatedAmount` is therefore always exactly equal to
 * the covered collection's own `collectedAmount`, validated by
 * SuperAgentCashRemittanceService before the insert, not caller-supplied
 * independently.
 *
 * `UQ_super_agent_cash_remittance_allocation_collection` on
 * `cashCollectionId` ALONE, global -- a collection can be remitted at most
 * once, ever. This is the real "a cash collection becomes reconciled only
 * through a real remittance allocation trail" authority:
 * SuperAgentCashCollection.reconciliationStatus can never be updated (the
 * table is immutable), so "is this collection reconciled" is always
 * answered by checking for a row here, never by reading that column.
 *
 * Immutable via the same trigger as its own parent remittance.
 */
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index, Check } from 'typeorm';
import { SuperAgentCashRemittance } from './super-agent-cash-remittance.entity';
import { SuperAgentCashCollection } from './super-agent-cash-collection.entity';

@Entity('super_agent_cash_remittance_allocation')
@Index('UQ_super_agent_cash_remittance_allocation_collection', ['cashCollectionId'], { unique: true })
@Check('CHK_super_agent_cash_remittance_allocation_amount_positive', '"allocatedAmount" > 0')
export class SuperAgentCashRemittanceAllocation {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => SuperAgentCashRemittance, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'remittanceId' })
  remittance: SuperAgentCashRemittance;

  @Column({ type: 'int' })
  remittanceId: number;

  @ManyToOne(() => SuperAgentCashCollection, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cashCollectionId' })
  cashCollection: SuperAgentCashCollection;

  @Column({ type: 'int' })
  cashCollectionId: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  allocatedAmount: number;

  @CreateDateColumn() createdAt: Date;
}
